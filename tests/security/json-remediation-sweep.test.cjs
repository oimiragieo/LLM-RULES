'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../../.claude/lib/utils/safe-json.cjs');
const { normalizePath } = require('../../.claude/lib/utils/path-utils.cjs');

const TARGET_FILES = [
  '.claude/scripts/quick-status.cjs',
  '.claude/scripts/validate-routing-consistency.cjs',
  '.claude/scripts/verify-hook-modules.cjs',
  '.claude/lib/utils/package-manager.cjs',
  '.claude/lib/utils/state-cache.cjs',
  '.claude/lib/utils/hook-resolver.cjs',
  '.claude/lib/utils/schema-validator.cjs',
];

describe('JSON remediation sweep', () => {
  test('safeParseJSON strips prototype pollution keys and survives malformed JSON', () => {
    const poisoned = safeParseJSON('{"__proto__":{"polluted":true},"ok":1}', null);
    assert.equal(poisoned.ok, 1);
    assert.equal(poisoned.polluted, undefined);
    assert.equal(Object.prototype.polluted, undefined);

    const malformed = safeParseJSON('{"unterminated":', null);
    assert.equal(typeof malformed, 'object');
  });

  test('targeted utility files must use safeParseJSON and avoid raw JSON.parse', () => {
    for (const relativePath of TARGET_FILES) {
      const filePath = path.join(process.cwd(), relativePath);
      const source = fs.readFileSync(filePath, 'utf8');
      const normalizedPath = normalizePath(relativePath);

      assert.match(
        source,
        /safeParseJSON/,
        `Expected safeParseJSON usage in ${normalizedPath}`
      );
      assert.doesNotMatch(
        source,
        /\bJSON\.parse\s*\(/,
        `Expected no raw JSON.parse in ${normalizedPath}`
      );
    }
  });
});
