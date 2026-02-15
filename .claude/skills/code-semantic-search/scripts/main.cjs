'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function findProjectRoot(start = __dirname) {
  let dir = start;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.claude', 'CLAUDE.md'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

function parseArgs(argv) {
  const args = [];
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      args.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    const hasValue = next && !next.startsWith('--');
    options[key] = hasValue ? argv[++i] : true;
  }
  return { args, options };
}

function runCli(rawArgs, projectRoot = findProjectRoot()) {
  const cliPath = path.join(projectRoot, '.claude', 'tools', 'cli', 'hybrid-search.cjs');
  if (!fs.existsSync(cliPath)) {
    throw new Error(`hybrid-search CLI missing at ${cliPath}`);
  }
  const child = spawn(process.execPath, [cliPath, ...rawArgs], {
    cwd: projectRoot,
    stdio: 'inherit',
    windowsHide: true,
  });
  child.on('close', code => process.exit(code ?? 1));
}

function main(input = {}) {
  const query = String(input.query || '').trim();
  const mode = String(input.mode || 'hybrid').toLowerCase();
  const args = [];

  if (!query && mode !== 'structure' && mode !== 'file') {
    return {
      ok: false,
      error: 'query is required unless mode is structure or file',
      usage: 'node main.cjs --query "auth middleware"',
    };
  }

  if (mode === 'structure') {
    args.push('--structure');
  } else if (mode === 'file') {
    if (!input.filePath) {
      return { ok: false, error: 'filePath is required for mode=file' };
    }
    args.push('--file', String(input.filePath));
    if (input.start !== undefined) args.push(String(input.start));
    if (input.end !== undefined) args.push(String(input.end));
  } else {
    args.push(query);
  }

  return {
    ok: true,
    delegated: 'hybrid-search',
    args,
    command: `node .claude/tools/cli/hybrid-search.cjs ${args.join(' ')}`.trim(),
  };
}

if (require.main === module) {
  const { args, options } = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(`
code-semantic-search

Usage:
  node main.cjs --query "<text>"
  node main.cjs --mode structure
  node main.cjs --mode file --filePath "src/index.ts" --start 1 --end 40
`);
    process.exit(0);
  }
  const result = main({
    query: options.query || args.join(' '),
    mode: options.mode || 'hybrid',
    filePath: options.filePath,
    start: options.start,
    end: options.end,
  });
  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }
  runCli(result.args);
}

module.exports = { main, parseArgs, runCli, findProjectRoot };
