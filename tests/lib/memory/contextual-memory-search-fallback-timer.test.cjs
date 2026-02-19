'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('checkBinaryAvailable clears timeout after process resolves', () => {
  const filePath = path.join(
    process.cwd(),
    '.claude',
    'lib',
    'memory',
    'contextual-memory-search-fallback.cjs'
  );
  const content = fs.readFileSync(filePath, 'utf8');

  assert.match(content, /const timeout = setTimeout\(/);
  assert.match(content, /clearTimeout\(timeout\)/);
});
