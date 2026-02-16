'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('MEMORY_SYSTEM documents sync I/O behind async memory context API', () => {
  const doc = fs.readFileSync(
    path.join(process.cwd(), '.claude', 'docs', 'MEMORY_SYSTEM.md'),
    'utf8'
  );
  assert.match(doc, /sync(?:hronous)?\s+I\/O\s+behind\s+an\s+async\s+API/i);
});
