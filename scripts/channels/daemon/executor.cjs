/**
 * executor.cjs — Task executor for the channel daemon
 *
 * When the user asks the bot to DO something (run code, edit files, check status),
 * the executor spawns a headless claude -p session to handle it and returns the result.
 * Can also talk to the A2A server (router) on port 3100 to delegate to specialized agents.
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
   * Execute a coding/file task via headless claude -p (has tool access).
   * Returns the result text.
   */
  executeTask(task, context = '') {
    const prompt = context
      ? `Context: ${context}\n\nTask: ${task}`
      : task;

    const safePrompt = prompt.replace(/"/g, '\\"').replace(/\n/g, ' ').slice(0, 4000);

    try {
      const env = { ...process.env };
      delete env.ANTHROPIC_API_KEY;

      const result = execSync(
        `claude -p "${safePrompt}" --dangerously-skip-permissions --model ${this.model} --max-turns 10`,
        {
          cwd: this.projectRoot,
          encoding: 'utf8',
          timeout: 300000, // 5 min for real tasks
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
   * Send a task to the A2A server (router) for agent-based execution.
   * Returns a promise with the task result.
   */
  async sendToRouter(prompt, agentType = 'developer') {
    return new Promise((resolve, reject) => {
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
          try {
            const result = JSON.parse(data);
            resolve(result);
          } catch {
            resolve({ error: data });
          }
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
