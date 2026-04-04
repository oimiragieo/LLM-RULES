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
const { claudeSync } = require('./claude-cli.cjs');

// Task executor system prompt — overrides router CLAUDE.md for headless sessions
const TASK_EXECUTOR_PROMPT = path.join(__dirname, 'task-executor-prompt.txt');

class TaskExecutor {
  constructor(config, log) {
    this.model = config.model || 'sonnet';
    this.projectRoot = config.projectRoot || process.cwd();
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
      const body = JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now().toString(),
        method: 'tasks/send',
        params: {
          message: {
            role: 'user',
            parts: [{ type: 'text', text: prompt }],
          },
          metadata: { agentType },
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
