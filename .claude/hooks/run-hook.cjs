'use strict';

/**
 * Hook runner re-export for test compatibility.
 * The actual implementation lives in .claude/tools/cli/run-hook.cjs.
 */
const {
  main,
  detectProjectRoot,
  resolveHookScriptPath,
  buildHookEnv,
} = require('../tools/cli/run-hook.cjs');

module.exports = { main, detectProjectRoot, resolveHookScriptPath, buildHookEnv };

if (require.main === module) {
  main();
}
