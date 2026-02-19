'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('checkBinaryAvailable timeout kill is guarded for exited process', () => {
  const filePath = path.join(
    process.cwd(),
    '.claude',
    'lib',
    'memory',
    'contextual-memory-search-fallback.cjs'
  );
  const content = fs.readFileSync(filePath, 'utf8');

  assert.match(
    content,
    /if\s*\(proc\.exitCode\s*===\s*null\s*&&\s*!proc\.killed\)\s*\{\s*proc\.kill\(\);\s*\}/,
    'timeout callback should guard kill() behind exitCode/killed checks'
  );
});
