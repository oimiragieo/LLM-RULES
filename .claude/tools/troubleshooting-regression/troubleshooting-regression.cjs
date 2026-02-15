'use strict';

const { main } = require('../../skills/troubleshooting-regression/scripts/main.cjs');

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    const hasValue = next && !next.startsWith('--');
    options[key] = hasValue ? next : true;
    if (hasValue) i++;
  }
  return options;
}

function run() {
  const options = parseArgs(process.argv.slice(2));
  const result = main({
    prompt: options.prompt,
    logPath: options['log-path'] || options.logPath,
    strict: options.strict === true || options.strict === 'true',
    mode: options.mode,
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
  } catch (error) {
    process.stderr.write(String(error && error.message ? error.message : error) + '\n');
    process.exit(1);
  }
}

module.exports = { run, parseArgs };
