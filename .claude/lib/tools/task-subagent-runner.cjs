'use strict';

// Backward-compatible shim: moved to task-subagent-telemetry.cjs.
const { main } = require('./task-subagent-telemetry.cjs');

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(String(error?.message || error));
    process.exit(1);
  });
}

module.exports = { main };
