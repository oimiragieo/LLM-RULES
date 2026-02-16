'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function collectFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '_archive' || e.name === 'node_modules') continue;
      out.push(...collectFiles(full));
    } else if (e.isFile() && (full.endsWith('.cjs') || full.endsWith('.js') || full.endsWith('.mjs'))) {
      out.push(full);
    }
  }
  return out;
}

test('no active source file nests both workflow and memory lock helpers', () => {
  const roots = [
    path.join(process.cwd(), '.claude', 'hooks'),
    path.join(process.cwd(), '.claude', 'lib'),
  ];

  const violations = [];
  for (const root of roots) {
    for (const file of collectFiles(root)) {
      const src = fs.readFileSync(file, 'utf8');
      const hasWorkflowLock = /withWorkflowStateLock\s*\(/.test(src);
      const hasMemoryLock = /withFileLock\s*\(/.test(src);
      if (hasWorkflowLock && hasMemoryLock) {
        violations.push(path.relative(process.cwd(), file).replace(/\\/g, '/'));
      }
    }
  }

  assert.deepEqual(violations, []);
});
