#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const SEARCH_DIRS = ['.claude/lib', '.claude/hooks'];

function walkFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!fs.existsSync(current)) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '_archive') continue;
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && fullPath.endsWith('.cjs')) {
        out.push(fullPath);
      }
    }
  }
  return out;
}

test('no active file mixes withWorkflowStateLock and withFileLock in the same implementation file', () => {
  const violations = [];
  for (const relDir of SEARCH_DIRS) {
    const dir = path.join(PROJECT_ROOT, relDir);
    for (const filePath of walkFiles(dir)) {
      const source = fs.readFileSync(filePath, 'utf8');
      const hasWorkflowLock = source.includes('withWorkflowStateLock(');
      const hasMemoryLock = source.includes('withFileLock(');
      if (hasWorkflowLock && hasMemoryLock) {
        violations.push(path.relative(PROJECT_ROOT, filePath));
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Nested lock usage detected; enforce LOCK_ORDER by separating lock domains: ${violations.join(', ')}`
  );
});
