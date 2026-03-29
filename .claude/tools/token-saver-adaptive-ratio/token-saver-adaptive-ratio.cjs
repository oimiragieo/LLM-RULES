'use strict';

const { runSkillToolCli } = require('../_shared/skill-wrapper.cjs');

function main() {
  runSkillToolCli('token-saver-adaptive-ratio', 'token-saver-adaptive-ratio');
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
