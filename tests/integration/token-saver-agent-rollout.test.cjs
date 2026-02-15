#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const TARGET_DIRS = [
  path.join(PROJECT_ROOT, '.claude', 'agents', 'domain'),
  path.join(PROJECT_ROOT, '.claude', 'agents', 'specialized'),
];

function collectMarkdownFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectMarkdownFiles(full));
    else if (entry.isFile() && full.endsWith('.md')) out.push(full);
  }
  return out;
}

test('phase-2 rollout: search-heavy domain/specialized agents include token-saver skill and rule', () => {
  const files = TARGET_DIRS.flatMap(collectMarkdownFiles);
  const failures = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const isSearchHeavy = /code-semantic-search|ripgrep|pnpm search:code/.test(content);
    if (!isSearchHeavy) continue;

    if (!/token-saver-context-compression/.test(content)) {
      failures.push(`${path.relative(PROJECT_ROOT, file)} missing token-saver skill`);
      continue;
    }

    if (!/## Token Saver Invocation Rule/.test(content)) {
      failures.push(`${path.relative(PROJECT_ROOT, file)} missing Token Saver Invocation Rule`);
    }
  }

  assert.deepEqual(failures, []);
});
