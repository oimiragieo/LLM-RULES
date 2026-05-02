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

function removeWorkerFromPool(worker) {
  globalPool.busy.delete(worker);
  const index = globalPool.workers.indexOf(worker);
  if (index > -1) {
    globalPool.workers.splice(index, 1);
  }
}

class HookRunner {
  constructor(options = {}) {
    this.projectRoot = options.projectRoot;
    this.mode = options.mode || process.env.HOOK_RUNNER_MODE || 'process';
    this.maxWorkers = options.maxWorkers || Number(process.env.HOOK_WORKER_POOL_SIZE || 4);
    this.workerRunTimeoutMs =
      options.workerRunTimeoutMs || Number(process.env.HOOK_WORKER_RUN_TIMEOUT_MS || 30000);
    this.baseEnv = options.env || process.env;
  }

  /**
   * Run a hook
   * @param {string} scriptPath - Absolute path to hook script
   * @param {string[]} hookArgs - Arguments for the hook
   * @param {object} [options] - Runner options passed to process mode
   * @returns {Promise<number|{code:number,stderr:string}>} Exit code or process-mode result
   */
  async run(scriptPath, hookArgs = [], options = {}) {
    const ext = path.extname(scriptPath);

    // Non-JS hooks always use process mode
    if (ext === '.sh' || this.mode === 'process') {
      return this.runProcess(scriptPath, hookArgs, options);
    }

    return this.runWorker(scriptPath, hookArgs);
  }

  /**
   * Run hook in a separate process (classic mode)
   * @param {string} scriptPath
   * @param {string[]} hookArgs
   * @param {object} [options]
   * @param {boolean} [options.captureStderr=false] - If true, return { code, stderr } instead of code
   * @returns {Promise<number|{code:number,stderr:string}>}
   */
  async runProcess(scriptPath, hookArgs, options = {}) {
    const ext = path.extname(scriptPath);
    let cmd, cmdArgs;

    if (ext === '.sh') {
      cmd = 'bash';
      cmdArgs = [scriptPath, ...hookArgs];
    } else {
      cmd = process.execPath;
      cmdArgs = [scriptPath, ...hookArgs];
    }

    const captureStderr = Boolean(options.captureStderr);

    return new Promise(resolve => {
      const stderrChunks = [];
      const stdio = captureStderr ? ['inherit', 'inherit', 'pipe'] : 'inherit';

      const child = spawn(cmd, cmdArgs, {
        stdio,
        env: this.baseEnv,
        windowsHide: true,
      });

      if (captureStderr && child.stderr) {
        child.stderr.on('data', chunk => {
          stderrChunks.push(chunk);
          // Forward to parent stderr so the output is still visible
          process.stderr.write(chunk);
        });
      }

      child.on('close', code => {
        const exitCode = code || 0;
        if (captureStderr) {
          resolve({ code: exitCode, stderr: Buffer.concat(stderrChunks).toString('utf8') });
        } else {
          resolve(exitCode);
        }
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
      let settled = false;
      let timeoutHandle = null;

      const finalize = (exitCode, options = {}) => {
        if (settled) return;
        settled = true;

        const { removeWorker = false, terminateWorker = false } = options;

        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
        }

        worker.removeListener('message', onMessage);
        worker.removeListener('error', onError);
        worker.removeListener('exit', onExit);
        globalPool.busy.delete(worker);

        if (removeWorker || worker.threadId === -1) {
          removeWorkerFromPool(worker);
        }

        if (terminateWorker && typeof worker.terminate === 'function') {
          Promise.resolve(worker.terminate()).catch(() => {
            // best effort
          });
        }

        resolve(exitCode);
        this._processQueue();
      };

      const onMessage = msg => {
        if (msg.type === 'success' || msg.type === 'error') {
          if (msg.type === 'error') {
            console.error(`[Hook Worker Error] ${msg.message}\n${msg.stack}`);
          }
          finalize(msg.code || (msg.type === 'success' ? 0 : 1));
        }
      };

      const onError = err => {
        console.error(`[Worker Thread Crash] ${err.message}`);
        finalize(1, { removeWorker: true });
      };

      const onExit = code => {
        finalize(code || 1, { removeWorker: true });
      };

      worker.on('message', onMessage);
      worker.on('error', onError);
      worker.on('exit', onExit);

      if (Number.isFinite(this.workerRunTimeoutMs) && this.workerRunTimeoutMs > 0) {
        timeoutHandle = setTimeout(() => {
          console.error(
            `[Hook Worker Timeout] ${this.workerRunTimeoutMs}ms exceeded for ${scriptPath}`
          );
          finalize(1, { removeWorker: true, terminateWorker: true });
        }, this.workerRunTimeoutMs);
      }

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
module.exports.__getPoolState = function __getPoolState() {
  return {
    workers: globalPool.workers,
    busy: globalPool.busy,
    queue: globalPool.queue,
  };
};
module.exports.__resetPoolForTests = function __resetPoolForTests() {
  for (const worker of globalPool.workers) {
    try {
      if (worker && typeof worker.terminate === 'function') {
        worker.terminate();
      }
    } catch (_err) {
      // best effort
    }
  }
  globalPool.workers.length = 0;
  globalPool.busy.clear();
  globalPool.queue.length = 0;
};
