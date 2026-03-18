'use strict';

const { main } = require('../../skills/context-compressor/scripts/main.cjs');

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    const hasValue = next && !next.startsWith('--');
    options[key] = hasValue ? argv[++i] : true;
  }
  return options;
}

function run() {
  const options = parseArgs(process.argv.slice(2));
  const result = main({
    query: options.query,
    mode: options.mode,
    limit: options.limit,
    failOnInsufficientEvidence: options.failOnInsufficientEvidence !== 'false',
    persistFiles: options.persistFiles === 'true',
  });
  if (!result.ok) {
    process.stderr.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(1);
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

if (require.main === module) {
  try {
    run();
  } catch (err) {
    process.stderr.write(String(err && err.message ? err.message : err) + '\n');
    process.exit(1);
  }
}

module.exports = { run, parseArgs };
