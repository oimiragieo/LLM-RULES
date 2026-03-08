'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

function executeGh(args) {
  const result = spawnSync('gh', args, {
    shell: false,
    encoding: 'utf8',
    windowsHide: true,
  });

  if (result.error) {
    return { ok: false, error: result.error.message };
  }

  if (result.status !== 0) {
    return { ok: false, error: result.stderr, status: result.status };
  }

  return { ok: true, output: result.stdout };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('GitHub Ops CLI - Structured Reconnaissance');
    console.log('Usage: node main.cjs <gh-command> [gh-args]');
    return;
  }

  const result = executeGh(args);
  if (result.ok) {
    process.stdout.write(result.output);
  } else {
    process.stderr.write(`Error (${result.status}): ${result.error}\n`);
    process.exit(result.status || 1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { executeGh };
