'use strict';

function main() {
  process.stdout.write(
    JSON.stringify({ ok: true, tool: 'design-and-user-experience-guidelines' }) + '\n'
  );
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
