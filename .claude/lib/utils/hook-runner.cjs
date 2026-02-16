'use strict';

const { Worker } = require('worker_threads');
const path = require('path');
const { spawn } = require('child_process');

// Global pool to persist across instances in the same process
const globalPool = {
  workers: [],
  busy: new Set(),
  queue: [],
};

class HookRunner {
  constructor(options = {}) {
    this.projectRoot = options.projectRoot;
    this.mode = options.mode || process.env.HOOK_RUNNER_MODE || 'process';
    this.maxWorkers = options.maxWorkers || Number(process.env.HOOK_WORKER_POOL_SIZE || 4);
    this.baseEnv = options.env || process.env;
  }

  /**
   * Run a hook
   * @param {string} scriptPath - Absolute path to hook script
   * @param {string[]} hookArgs - Arguments for the hook
   * @returns {Promise<number>} Exit code
   */
  async run(scriptPath, hookArgs = []) {
    const ext = path.extname(scriptPath);

    // Non-JS hooks always use process mode
    if (ext === '.sh' || this.mode === 'process') {
      return this.runProcess(scriptPath, hookArgs);
    }

    return this.runWorker(scriptPath, hookArgs);
  }

  /**
   * Run hook in a separate process (classic mode)
   */
  async runProcess(scriptPath, hookArgs) {
    const ext = path.extname(scriptPath);
    let cmd, cmdArgs;

    if (ext === '.sh') {
      cmd = 'bash';
      cmdArgs = [scriptPath, ...hookArgs];
    } else {
      cmd = process.execPath;
      cmdArgs = [scriptPath, ...hookArgs];
    }

    return new Promise(resolve => {
      const child = spawn(cmd, cmdArgs, {
        stdio: 'inherit',
        env: this.baseEnv,
        windowsHide: true,
      });

      child.on('close', code => {
        resolve(code || 0);
      });
    });
  }

  /**
   * Run hook in a worker thread (high performance mode)
   */
  async runWorker(scriptPath, hookArgs) {
    const worker = await this._getAvailableWorker();
    globalPool.busy.add(worker);

    return new Promise(resolve => {
      const onMessage = msg => {
        if (msg.type === 'success' || msg.type === 'error') {
          if (msg.type === 'error') {
            console.error(`[Hook Worker Error] ${msg.message}\n${msg.stack}`);
          }
          cleanup(msg.code || (msg.type === 'success' ? 0 : 1));
        }
      };

      const onError = err => {
        console.error(`[Worker Thread Crash] ${err.message}`);
        cleanup(1);
      };

      const onExit = code => {
        cleanup(code || 1);
      };

      const cleanup = exitCode => {
        worker.removeListener('message', onMessage);
        worker.removeListener('error', onError);
        worker.removeListener('exit', onExit);
        globalPool.busy.delete(worker);

        // If the worker exited, remove from pool
        const index = globalPool.workers.indexOf(worker);
        if (index > -1 && worker.threadId === -1) {
          globalPool.workers.splice(index, 1);
        }

        resolve(exitCode);
        this._processQueue();
      };

      worker.on('message', onMessage);
      worker.on('error', onError);
      worker.on('exit', onExit);

      worker.postMessage({
        type: 'run',
        data: {
          scriptPath,
          hookArgs,
          env: this.baseEnv,
        },
      });
    });
  }

  async _getAvailableWorker() {
    // Look for idle worker
    for (const worker of globalPool.workers) {
      if (!globalPool.busy.has(worker) && worker.threadId !== -1) {
        return worker;
      }
    }

    // Spawn new worker if under limit
    if (globalPool.workers.length < this.maxWorkers) {
      const workerPath = path.join(__dirname, 'hook-worker-bridge.cjs');
      const worker = new Worker(workerPath);
      globalPool.workers.push(worker);
      return worker;
    }

    // Wait for worker to become available
    return new Promise(resolve => {
      globalPool.queue.push(resolve);
    });
  }

  _processQueue() {
    if (globalPool.queue.length > 0) {
      const nextRequest = globalPool.queue.shift();
      this._getAvailableWorker().then(nextRequest);
    }
  }
}

module.exports = HookRunner;
