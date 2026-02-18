'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('profile-hooks does not use hardcoded /tmp/test.js path', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), '.claude', 'tools', 'cli', 'profile-hooks.cjs'),
    'utf8'
  );
  assert.equal(source.includes('/tmp/test.js'), false);
});
