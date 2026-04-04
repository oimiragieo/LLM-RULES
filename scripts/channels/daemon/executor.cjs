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

class TaskExecutor {
  constructor(config, log) {
    this.model = config.model || 'sonnet';
    this.projectRoot = config.projectRoot || process.cwd();
    this.a2aPort = config.a2aPort || 3100;
    this.log = log || console.log;
  }

  /**
   * Single-shot task execution via headless claude -p.
   */
  executeTask(task, context = '') {
    const prompt = context ? `Context: ${context}\n\nTask: ${task}` : task;
    const safePrompt = prompt.replace(/"/g, '\\"').replace(/\n/g, ' ').slice(0, 4000);

    try {
      const env = { ...process.env };
      delete env.ANTHROPIC_API_KEY;

      const result = execSync(
        `claude -p "${safePrompt}" --dangerously-skip-permissions --model ${this.model} --max-turns 10`,
        {
          cwd: this.projectRoot,
          encoding: 'utf8',
          timeout: 300000,
          env,
          windowsHide: true,
          shell: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      ).trim();

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
      const prompt = iteration === 1
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
            cwd: this.projectRoot, encoding: 'utf8', timeout: 60000,
            env, windowsHide: true, shell: true, stdio: ['pipe', 'pipe', 'pipe'],
          }).trim();

          if (verifyResult.includes('PASS') || verifyResult.includes('0 fail') || verifyResult.includes(' 0 errors')) {
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

    const status = iteration >= maxIterations ? '⚠️ Max iterations reached' : `✅ Completed in ${iteration} iteration(s)`;
    return `${status}\n\n${lastResult}`;
  }

  /**
   * Check if output indicates a rate limit error.
   */
  _isRateLimitError(output) {
    return /rate.limit|429|too many requests|overloaded|Extra usage is required/i.test(output || '');
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
        this.log(`[executor] Rate limited, waiting ${delaySec}s before retry ${attempt + 2}/${maxRetries + 1}...`);
        const start = Date.now();
        while (Date.now() - start < delaySec * 1000) {} // Sync wait
      }
    }
    return 'Rate limit exceeded after retries. Try again later.';
  }

  /**
   * Send a task to the A2A server (router) for agent-based execution.
   */
  async sendToRouter(prompt, agentType = 'developer') {
    return new Promise((resolve) => {
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

      const req = http.request({
        hostname: '127.0.0.1',
        port: this.a2aPort,
        path: '/a2a',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 10000,
      }, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve({ error: data }); }
        });
      });

      req.on('error', err => resolve({ error: `A2A server not available: ${err.message}` }));
      req.on('timeout', () => { req.destroy(); resolve({ error: 'A2A server timeout' }); });
      req.write(body);
      req.end();
    });
  }

  /**
   * Check if the A2A server is available.
   */
  async isRouterAvailable() {
    return new Promise(resolve => {
      const req = http.get(`http://127.0.0.1:${this.a2aPort}/.well-known/agent.json`, res => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(2000, () => { req.destroy(); resolve(false); });
    });
  }
}

module.exports = { TaskExecutor };
