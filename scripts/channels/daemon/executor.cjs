/**
 * executor.cjs — Task executor for the channel daemon
 *
 * Supports:
 *   - Single-shot task execution (executeTask)
 *   - Ralph loop execution (executeRalphLoop) — persistent verify/fix cycles
 *   - A2A router delegation (sendToRouter)
 */
'use strict';

const { execSync } = require('child_process');
const http = require('http');
const path = require('path');
const { claudeSync, claudeAsync } = require('./claude-cli.cjs');

// Task executor system prompt — overrides router CLAUDE.md for headless sessions
const TASK_EXECUTOR_PROMPT = path.join(__dirname, 'task-executor-prompt.txt');

class TaskExecutor {
  constructor(config, log) {
    this.model = config.model || 'sonnet';
    this.projectRoot = config.projectRoot || process.cwd();
    // Track whether cwd was explicitly provided vs system-defaulted.
    // Used by sendToRouter to decide whether to forward cwd in JSON-RPC
    // payloads — omitting it lets the remote host use its own default,
    // which avoids cross-platform path mismatches (WSL↔Windows, Docker,
    // remote). See OpenClaw #58977 pattern: explicit-vs-default CWD.
    this._cwdExplicit = config.projectRoot != null;
    this.a2aPort = config.a2aPort || 3100;
    this.log = log || console.log;
  }

  /**
   * Single-shot task execution via headless claude -p.
   * Uses --append-system-prompt-file to override router CLAUDE.md
   * and give the headless session access to MCP tools.
   */
  executeTask(task, context = '') {
    const prompt = context ? `Context: ${context}\n\nTask: ${task}` : task;

    try {
      const result = claudeSync(prompt, {
        model: this.model,
        maxTurns: 10,
        timeout: 300000,
        useWorkspace: true,
        projectRoot: this.projectRoot,
        appendSystemPromptFile: TASK_EXECUTOR_PROMPT,
      });

      return result || 'Task completed but produced no output.';
    } catch (err) {
      const stderr = err.stderr?.toString()?.trim() || '';
      const stdout = err.stdout?.toString()?.trim() || '';
      return stdout || stderr || `Task failed: ${err.message?.slice(0, 200)}`;
    }
  }

  /**
   * Ralph loop — persistent verify/fix execution.
   * Runs task repeatedly until completion criteria are met or max iterations reached.
   *
   * Based on the Ralph Wiggum technique (oh-my-claudecode) and OMC's PRD-driven loops.
   * Each iteration feeds the previous result as context so Claude can build on prior work.
   *
   * @param {string} task — the task to complete
   * @param {object} opts — { maxIterations, verifyCommand, onProgress }
   * @returns {string} — final result with iteration count
   */
  executeRalphLoop(task, opts = {}) {
    const maxIterations = opts.maxIterations || 5;
    const verifyCommand = opts.verifyCommand || null;
    const onProgress = opts.onProgress || (() => {});

    let context = '';
    let lastResult = '';
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;
      onProgress(`🔄 Ralph iteration ${iteration}/${maxIterations}...`);
      this.log(`[executor] Ralph iteration ${iteration}: ${task.slice(0, 60)}`);

      // Build prompt — first iteration is clean, subsequent get prior context
      const prompt =
        iteration === 1
          ? task
          : `Previous iteration result:\n${lastResult.slice(0, 2000)}\n\nContinue working on: ${task}\n\nFix any remaining issues. If everything passes, say RALPH_COMPLETE.`;

      lastResult = this.executeTask(prompt, context);

      // Check for explicit completion signal
      if (lastResult.includes('RALPH_COMPLETE') || lastResult.includes('All tests pass')) {
        this.log(`[executor] Ralph completed at iteration ${iteration}`);
        break;
      }

      // If verify command provided, run it to check completion
      if (verifyCommand) {
        try {
          const env = { ...process.env };
          delete env.ANTHROPIC_API_KEY;
          const verifyResult = execSync(verifyCommand, {
            cwd: this.projectRoot,
            encoding: 'utf8',
            timeout: 60000,
            env,
            windowsHide: true,
            shell: true,
            stdio: ['pipe', 'pipe', 'pipe'],
          }).trim();

          if (
            verifyResult.includes('PASS') ||
            verifyResult.includes('0 fail') ||
            verifyResult.includes(' 0 errors')
          ) {
            this.log(`[executor] Ralph verify passed at iteration ${iteration}`);
            lastResult += `\n\nVerification: ${verifyResult.slice(0, 500)}`;
            break;
          }
          context = `Verification output (failed):\n${verifyResult.slice(0, 1000)}`;
        } catch (err) {
          context = `Verification error: ${(err.stderr?.toString() || err.message || '').slice(0, 500)}`;
        }
      } else {
        // No verify command — accumulate context for next iteration
        context = `Previous result:\n${lastResult.slice(0, 1500)}`;
      }
    }

    const status =
      iteration >= maxIterations
        ? '⚠️ Max iterations reached'
        : `✅ Completed in ${iteration} iteration(s)`;
    return `${status}\n\n${lastResult}`;
  }

  // ========================================================================
  // ASYNC METHODS — non-blocking versions for the task pool
  // ========================================================================

  /**
   * Internal async Claude wrapper — mockable for tests.
   * @private
   */
  _claudeAsync(prompt, opts = {}) {
    return claudeAsync(prompt, opts);
  }

  /**
   * Non-blocking single-shot task execution.
   * Returns { promise, cancel } — does NOT block the event loop.
   */
  executeTaskAsync(task, context = '') {
    const prompt = context ? `Context: ${context}\n\nTask: ${task}` : task;

    const handle = this._claudeAsync(prompt, {
      model: this.model,
      maxTurns: 10,
      timeout: 300000,
      useWorkspace: true,
      projectRoot: this.projectRoot,
      appendSystemPromptFile: TASK_EXECUTOR_PROMPT,
    });

    return {
      promise: handle.promise.then(
        result => (result || 'Task completed but produced no output.').trim(),
        err => {
          throw err;
        }
      ),
      cancel: handle.cancel,
      child: handle.child,
    };
  }

  /**
   * Non-blocking Ralph loop — iterative verify/fix.
   * Returns { promise, cancel }.
   */
  executeRalphLoopAsync(task, opts = {}) {
    const maxIterations = opts.maxIterations || 5;
    const onProgress = opts.onProgress || (() => {});

    let cancelled = false;
    let currentHandle = null;

    const cancel = () => {
      cancelled = true;
      if (currentHandle && currentHandle.cancel) currentHandle.cancel();
    };

    const promise = (async () => {
      let lastResult = '';

      for (let iteration = 1; iteration <= maxIterations; iteration++) {
        if (cancelled) throw new Error('cancelled');

        onProgress(`\u{1f504} Ralph iteration ${iteration}/${maxIterations}...`);
        this.log(`[executor] Ralph async iteration ${iteration}: ${task.slice(0, 60)}`);

        const prompt =
          iteration === 1
            ? task
            : `Previous iteration result:\n${lastResult.slice(0, 2000)}\n\nContinue working on: ${task}\n\nFix any remaining issues. If everything passes, say RALPH_COMPLETE.`;

        currentHandle = this._claudeAsync(prompt, {
          model: this.model,
          maxTurns: 10,
          timeout: 300000,
          useWorkspace: true,
          projectRoot: this.projectRoot,
          appendSystemPromptFile: TASK_EXECUTOR_PROMPT,
        });

        lastResult = await currentHandle.promise;

        if (lastResult.includes('RALPH_COMPLETE') || lastResult.includes('All tests pass')) {
          this.log(`[executor] Ralph async completed at iteration ${iteration}`);
          return `\u{2705} Completed in ${iteration} iteration(s)\n\n${lastResult}`;
        }
      }

      return `\u{26a0}\u{fe0f} Max iterations reached\n\n${lastResult}`;
    })();

    return { promise, cancel };
  }

  /**
   * Non-blocking task execution with async retry on rate limits.
   * @param {string} task
   * @param {string} context
   * @param {number} maxRetries
   * @param {number} baseDelayMs — base delay for exponential backoff (default 30000)
   * @returns {Promise<string>}
   */
  async executeTaskWithRetryAsync(task, context = '', maxRetries = 3, baseDelayMs = 30000) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const handle = this.executeTaskAsync(task, context);
      let result;
      try {
        result = await handle.promise;
      } catch (err) {
        result = err.message || String(err);
      }
      if (!this._isRateLimitError(result)) return result;
      if (attempt < maxRetries) {
        const delaySec = (baseDelayMs / 1000) * Math.pow(2, attempt);
        this.log(
          `[executor] Rate limited, async wait ${delaySec}s before retry ${attempt + 2}/${maxRetries + 1}...`
        );
        await new Promise(r => setTimeout(r, delaySec * 1000));
      }
    }
    return 'Rate limit exceeded after retries. Try again later.';
  }

  /**
   * Non-blocking parallel task execution (ultrawork).
   */
  async executeParallelAsync(task, opts = {}) {
    const maxParallel = opts.maxParallel || 3;
    const onProgress = opts.onProgress || (() => {});

    // Step 1: Split task into subtasks
    onProgress('\u{1f500} Splitting task into parallel subtasks...');
    const splitHandle = this._claudeAsync(
      `Split this task into ${maxParallel} independent subtasks that can run in parallel. Return ONLY a JSON array of task description strings. Task: ${task.slice(0, 500)}`,
      {
        model: this.model,
        maxTurns: 3,
        timeout: 60000,
        useWorkspace: true,
        projectRoot: this.projectRoot,
      }
    );
    const splitResult = await splitHandle.promise;

    let subtasks;
    try {
      const match = splitResult.match(/\[[\s\S]*\]/);
      subtasks = match ? JSON.parse(match[0]) : null;
    } catch {
      /* ignored */
    }

    if (!subtasks || subtasks.length <= 1) {
      onProgress('\u{1f4dd} Task not parallelizable, running sequentially');
      const handle = this.executeTaskAsync(task);
      return handle.promise;
    }

    // Step 2: Run subtasks concurrently
    onProgress(`\u{26a1} Running ${subtasks.length} subtasks in parallel...`);
    this.log(`[executor] Ultrawork async: ${subtasks.length} parallel subtasks`);

    const results = await Promise.allSettled(
      subtasks.slice(0, maxParallel).map(st => {
        const handle = this.executeTaskAsync(st);
        return handle.promise.then(
          result => ({ subtask: st, result }),
          err => ({ subtask: st, result: `FAILED: ${err.message}` })
        );
      })
    );

    // Step 3: Merge results
    const merged = results
      .map((r, i) => {
        const data =
          r.status === 'fulfilled' ? r.value : { subtask: subtasks[i], result: 'FAILED' };
        return `### Subtask ${i + 1}: ${data.subtask?.slice(0, 80)}\n${data.result?.slice(0, 800)}`;
      })
      .join('\n\n');

    const succeeded = results.filter(
      r => r.status === 'fulfilled' && !r.value?.result?.startsWith('FAILED')
    ).length;
    return `\u{26a1} Ultrawork: ${succeeded}/${subtasks.length} subtasks completed\n\n${merged}`;
  }

  /**
   * Check if output indicates a rate limit error.
   */
  _isRateLimitError(output) {
    return /rate.limit|429|too many requests|overloaded|Extra usage is required/i.test(
      output || ''
    );
  }

  /**
   * Execute task with automatic retry on rate limits.
   */
  executeTaskWithRetry(task, context = '', maxRetries = 3) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const result = this.executeTask(task, context);
      if (!this._isRateLimitError(result)) return result;
      if (attempt < maxRetries) {
        const delaySec = 30 * Math.pow(2, attempt); // 30s, 60s, 120s
        this.log(
          `[executor] Rate limited, waiting ${delaySec}s before retry ${attempt + 2}/${maxRetries + 1}...`
        );
        const start = Date.now();
        while (Date.now() - start < delaySec * 1000) {
          /* sync wait */
        }
      }
    }
    return 'Rate limit exceeded after retries. Try again later.';
  }

  /**
   * Ultrawork — parallel task execution.
   * Splits task into independent subtasks via haiku, runs them concurrently.
   */
  async executeParallel(task, opts = {}) {
    const maxParallel = opts.maxParallel || 3;
    const onProgress = opts.onProgress || (() => {});

    // Step 1: Split task into subtasks using haiku
    onProgress('🔀 Splitting task into parallel subtasks...');
    const splitPrompt = `Split this task into ${maxParallel} independent subtasks that can run in parallel. Return ONLY a JSON array of task description strings. Task: ${task.slice(0, 500)}`;
    const splitResult = this.executeTask(splitPrompt.replace(/"/g, "'"));

    let subtasks;
    try {
      const match = splitResult.match(/\[[\s\S]*\]/);
      subtasks = match ? JSON.parse(match[0]) : null;
    } catch {
      /* ignored */
    }

    if (!subtasks || subtasks.length <= 1) {
      onProgress('📝 Task not parallelizable, running sequentially');
      return this.executeTask(task);
    }

    // Step 2: Run subtasks concurrently
    onProgress(`⚡ Running ${subtasks.length} subtasks in parallel...`);
    this.log(`[executor] Ultrawork: ${subtasks.length} parallel subtasks`);

    const results = await Promise.allSettled(
      subtasks.slice(0, maxParallel).map(
        (st, _i) =>
          new Promise(resolve => {
            try {
              const result = this.executeTask(st);
              resolve({ subtask: st, result });
            } catch (err) {
              resolve({ subtask: st, result: `FAILED: ${err.message}` });
            }
          })
      )
    );

    // Step 3: Merge results
    const merged = results
      .map((r, i) => {
        const data =
          r.status === 'fulfilled' ? r.value : { subtask: subtasks[i], result: 'FAILED' };
        return `### Subtask ${i + 1}: ${data.subtask?.slice(0, 80)}\n${data.result?.slice(0, 800)}`;
      })
      .join('\n\n');

    const succeeded = results.filter(
      r => r.status === 'fulfilled' && !r.value?.result?.startsWith('FAILED')
    ).length;
    return `⚡ Ultrawork: ${succeeded}/${subtasks.length} subtasks completed\n\n${merged}`;
  }

  /**
   * Send a task to the A2A server (router) for agent-based execution.
   */
  // eslint-disable-next-line require-await
  async sendToRouter(prompt, agentType = 'developer') {
    return new Promise(resolve => {
      // Only forward cwd to the A2A router when it was explicitly provided.
      // If cwd was system-defaulted (process.cwd()), omit it so the remote
      // host uses its own default — prevents cross-platform path mismatches
      // (WSL↔Windows, Docker, remote). See OpenClaw #58977.
      const metadata = { agentType };
      if (this._cwdExplicit) {
        metadata.cwd = this.projectRoot;
      }

      const body = JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now().toString(),
        method: 'tasks/send',
        params: {
          message: {
            role: 'user',
            parts: [{ type: 'text', text: prompt }],
          },
          metadata,
        },
      });

      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: this.a2aPort,
          path: '/a2a',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
          timeout: 10000,
        },
        res => {
          let data = '';
          res.on('data', c => (data += c));
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve({ error: data });
            }
          });
        }
      );

      req.on('error', err => resolve({ error: `A2A server not available: ${err.message}` }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ error: 'A2A server timeout' });
      });
      req.write(body);
      req.end();
    });
  }

  /**
   * Check if the A2A server is available.
   */
  // eslint-disable-next-line require-await
  async isRouterAvailable() {
    return new Promise(resolve => {
      const req = http.get(`http://127.0.0.1:${this.a2aPort}/.well-known/agent.json`, res => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(2000, () => {
        req.destroy();
        resolve(false);
      });
    });
  }
}

module.exports = { TaskExecutor };
