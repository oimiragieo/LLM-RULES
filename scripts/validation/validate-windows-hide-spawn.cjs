#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '_archive') continue;
      walk(full, acc);
    } else if (entry.isFile() && full.endsWith('.cjs')) {
      acc.push(full);
    }
  }
  return acc;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  return {
    roots: [path.join(PROJECT_ROOT, '.claude', 'hooks'), path.join(PROJECT_ROOT, '.claude', 'lib')],
    strict: args.includes('--strict'),
    json: args.includes('--json'),
  };
}

function isProcessCallStart(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) return false;
  if (/(^|[^\w.])(spawn|spawnSync|exec|execSync|execFile|execFileSync)\s*\(/.test(line)) {
    return true;
  }
  return /\bcp\.(spawn|spawnSync|exec|execSync|execFile|execFileSync)\s*\(/.test(line);
}

function hasWindowsHide(lines, startIdx) {
  const maxLookahead = 24;
  const end = Math.min(lines.length - 1, startIdx + maxLookahead);
  for (let i = startIdx; i <= end; i++) {
    if (/windowsHide\s*:\s*true\b/.test(lines[i])) {
      return true;
    }
    if (
      /\b(build[A-Za-z0-9_]*SpawnOptions|buildHiddenSpawnSyncOptions|buildVersionProbeSpawnOptions)\s*\(/.test(
        lines[i]
      )
    ) {
      return true;
    }
    if (/\)\s*;?\s*$/.test(lines[i]) && i > startIdx) {
      break;
    }
  }
  return false;
}

function scanFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  const issues = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!isProcessCallStart(line)) continue;
    if (!hasWindowsHide(lines, i)) {
      issues.push({
        file: path.relative(PROJECT_ROOT, filePath),
        line: i + 1,
        snippet: line.trim(),
      });
    }
  }

  return issues;
}

function main(argv = process.argv) {
  const opts = parseArgs(argv);
  const files = opts.roots.flatMap(root => walk(root));
  const issues = files.flatMap(scanFile);

  const result = {
    checkedFiles: files.length,
    issueCount: issues.length,
    issues,
    strict: opts.strict,
  };

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (issues.length === 0) {
    process.stdout.write('windows-hide-spawn: PASS\n');
  } else {
    process.stdout.write(`windows-hide-spawn: ${opts.strict ? 'FAIL' : 'WARN'} (${issues.length})\n`);
    for (const issue of issues) {
      process.stdout.write(` - ${issue.file}:${issue.line} ${issue.snippet}\n`);
    }
  }

  if (opts.strict && issues.length > 0) {
    process.exitCode = 1;
  }
  return result;
}

if (require.main === module) {
  main();
}

module.exports = { main };
