'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('user-prompt-unified contains overdue weekly maintenance fallback logic', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), '.claude', 'hooks', 'routing', 'user-prompt-unified.core.cjs'),
    'utf8'
  );

  assert.match(source, /maintenance-status\.json/);
  assert.match(source, /lastWeekly/);
  assert.match(source, /Weekly maintenance triggered/i);
  assert.match(source, /MEMORY_WEEKLY_FALLBACK_TIMEOUT_MS/);
});

test('MEMORY_SYSTEM documents headless weekly maintenance scheduling', () => {
  const doc = fs.readFileSync(
    path.join(process.cwd(), '.claude', 'docs', 'MEMORY_SYSTEM.md'),
    'utf8'
  );

  assert.match(doc, /Headless|headless/);
  assert.match(doc, /pnpm run memory:weekly/);
});
