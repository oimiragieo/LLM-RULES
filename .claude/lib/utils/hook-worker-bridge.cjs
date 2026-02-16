'use strict';

const { parentPort } = require('worker_threads');

/**
 * Hook Worker Bridge (Persistent)
 * Stays alive to handle multiple hook execution requests.
 */

parentPort.on('message', async request => {
  if (request.type === 'run') {
    const { scriptPath, hookArgs, env } = request.data;

    try {
      // Update process.argv for the hook
      const originalArgv = process.argv;
      process.argv = [process.execPath, scriptPath, ...hookArgs];

      // Update process.env (best effort)
      Object.assign(process.env, env);

      // Clear cache for the hook
      delete require.cache[require.resolve(scriptPath)];

      // Execute the hook
      // We wrap it in a try-catch because many hooks use process.exit
      // In a worker, process.exit terminates the thread.
      // For a pool, we might want to prevent the thread from exiting.
      // However, shimming process.exit is complex.
      // For the prototype, we'll let it exit and the pool will replenish.
      require(scriptPath);

      // Reset argv/env
      process.argv = originalArgv;

      parentPort.postMessage({ type: 'success', code: 0 });
    } catch (error) {
      parentPort.postMessage({
        type: 'error',
        message: error.message,
        stack: error.stack,
        code: error.code || 1,
      });
    }
  } else if (request.type === 'ping') {
    parentPort.postMessage({ type: 'pong' });
  }
});
