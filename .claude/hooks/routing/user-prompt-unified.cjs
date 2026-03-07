#!/usr/bin/env node
'use strict';

// Top-level try/catch: wrap require() to prevent uncaught synchronous
// exceptions from producing exit code 1 (SE-03 violation).
// Advisory hooks must fail-open (exit 0) on ALL errors including module load.
let core;
try {
  core = require('./user-prompt-unified.core.cjs');
} catch (loadErr) {
  process.stderr.write(
    JSON.stringify({
      level: 'error',
      hook: 'user-prompt-unified',
      event: 'module_load_failed',
      message: loadErr && loadErr.message ? loadErr.message : String(loadErr),
      stack: loadErr && loadErr.stack ? loadErr.stack.split('\n').slice(0, 5).join(' | ') : '',
      timestamp: new Date().toISOString(),
    }) + '\n'
  );
  process.exit(0);
}

if (require.main === module) {
  core.main().catch(err => {
    process.stderr.write(
      JSON.stringify({
        level: 'error',
        hook: 'user-prompt-unified',
        event: 'main_rejected',
        message: err && err.message ? err.message : String(err),
        timestamp: new Date().toISOString(),
      }) + '\n'
    );
    process.exit(0);
  });
}

const { main: _main, ...exportsForTesting } = core;
module.exports = exportsForTesting;
