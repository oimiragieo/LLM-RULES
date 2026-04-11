'use strict';

/**
 * Hook runner re-export for test compatibility.
 * The actual implementation lives in .claude/tools/cli/run-hook.cjs.
 */
const {
  detectProjectRoot,
  resolveHookScriptPath,
  buildHookEnv,
} = require('../tools/cli/run-hook.cjs');

module.exports = { detectProjectRoot, resolveHookScriptPath, buildHookEnv };
