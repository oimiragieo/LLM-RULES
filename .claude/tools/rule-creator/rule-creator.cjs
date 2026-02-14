'use strict';

async function main() {
  process.stdout.write(JSON.stringify({ ok: true, tool: 'rule-creator' }) + '\n');
}

if (require.main === module) {
  main().catch(err => {
    process.stderr.write(String(err && err.message ? err.message : err) + '\n');
    process.exit(1);
  });
}

module.exports = { main };
