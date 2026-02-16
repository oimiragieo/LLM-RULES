'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const TARGET_TESTS = [
  'tests/lib/utils/path-helpers.test.cjs',
  'tests/lib/utils/path-utils.test.cjs',
  'tests/security/json-remediation-sweep.test.cjs',
];

test('filesystem-related assertions use normalizePath checks in targeted suites', () => {
  for (const relativePath of TARGET_TESTS) {
    const fullPath = path.join(process.cwd(), relativePath);
    const source = fs.readFileSync(fullPath, 'utf8');
    assert.match(source, /normalizePath\s*\(/, `${relativePath} must use normalizePath()`);
  }
});
