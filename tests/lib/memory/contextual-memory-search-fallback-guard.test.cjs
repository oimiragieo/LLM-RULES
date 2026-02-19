'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('ripgrep candidate guard treats base arg length as no-file case', () => {
  const filePath = path.join(
    process.cwd(),
    '.claude',
    'lib',
    'memory',
    'contextual-memory-search-fallback.cjs'
  );
  const content = fs.readFileSync(filePath, 'utf8');
  assert.match(content, /if\s*\(args\.length\s*<=\s*5\)\s*return\s*\[\]/);
});
