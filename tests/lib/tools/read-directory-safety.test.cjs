'use strict';

const {
  checkReadSafety,
} = require('../../../.claude/hooks/routing/pre-tool-unified.read-safety.cjs');
const assert = require('node:assert');
const test = require('node:test');
const path = require('path');
const fs = require('fs');

test('Read tool directory safety', async t => {
  await t.test('Rewriting directory read with listing file', () => {
    const toolInput = { file_path: '.claude' };
    const result = checkReadSafety('Read', toolInput, { permission_mode: 'normal' });

    assert.strictEqual(result.checked, true);
    assert.strictEqual(result.action, 'rewrite');
    assert.ok(String(result.bypassWarning || result.message || '').includes('is a directory'));
  });

  await t.test('Bypass mode rewrites directory read to listing', () => {
    const toolInput = { file_path: '.claude' };
    const result = checkReadSafety('Read', toolInput, { permission_mode: 'bypassPermissions' });

    assert.strictEqual(result.checked, true);
    assert.strictEqual(result.action, 'rewrite');
    assert.match(result.rewrittenToolInput.file_path, /read-safety-dir-listing/);
  });
});
