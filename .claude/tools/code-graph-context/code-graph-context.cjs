'use strict';

const { runSkillToolCli } = require('../_shared/skill-wrapper.cjs');

function main() {
  runSkillToolCli('code-graph-context', 'code-graph-context');
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    process.stderr.write(String(err && err.message ? err.message : err) + '\n');
    process.exit(1);
  }
}

module.exports = { main };
