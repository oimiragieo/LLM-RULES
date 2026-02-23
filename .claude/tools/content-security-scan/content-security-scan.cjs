'use strict';

const { runSkillToolCli } = require('../_shared/skill-wrapper.cjs');

async function main() {
  runSkillToolCli('content-security-scan', 'content-security-scan');
}

if (require.main === module) {
  main().catch(err => {
    process.stderr.write(String(err && err.message ? err.message : err) + '\n');
    process.exit(1);
  });
}

module.exports = { main };
