'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  hasAdvancedRegex,
  isTargetedSingleFile,
  hasUnsupportedTypeAlias,
  decide,
  getMode,
} = require('../../.claude/hooks/safety/hybrid-search-enforcer.cjs');

test('hasAdvancedRegex detects lookahead and backref patterns', () => {
  assert.equal(hasAdvancedRegex('foo(?=bar)'), true);
  assert.equal(hasAdvancedRegex('(foo)\\1'), true);
  assert.equal(hasAdvancedRegex('plain-token'), false);
});

test('isTargetedSingleFile allows concrete file paths only', () => {
  assert.equal(isTargetedSingleFile({ path: 'src/app.ts' }), true);
  assert.equal(isTargetedSingleFile({ path: '**/*.ts' }), false);
  assert.equal(isTargetedSingleFile({}), false);
});

test('decide allows advanced regex and blocks broad grep', () => {
  assert.equal(decide({ pattern: 'foo(?=bar)' }).allow, true);
  assert.equal(decide({ pattern: 'TaskUpdate', path: 'src/app.ts' }).allow, true);
  assert.equal(decide({ pattern: 'TaskUpdate' }).allow, false);
});

test('hasUnsupportedTypeAlias detects unsupported cjs type aliases', () => {
  assert.equal(hasUnsupportedTypeAlias({ type: 'cjs' }), true);
  assert.equal(hasUnsupportedTypeAlias({ file_type: 'CJS' }), true);
  assert.equal(hasUnsupportedTypeAlias({ fileType: 'js' }), false);
});

test('decide blocks unsupported cjs type alias before search execution', () => {
  const decision = decide({ pattern: 'TaskUpdate', type: 'cjs' });
  assert.equal(decision.allow, false);
  assert.equal(decision.reason, 'unsupported_type_alias');
});

test('getMode defaults to block and validates values', () => {
  const original = process.env.HYBRID_GREP_ENFORCEMENT;

  delete process.env.HYBRID_GREP_ENFORCEMENT;
  assert.equal(getMode(), 'block');

  process.env.HYBRID_GREP_ENFORCEMENT = 'warn';
  assert.equal(getMode(), 'warn');

  process.env.HYBRID_GREP_ENFORCEMENT = 'invalid';
  assert.equal(getMode(), 'block');

  if (original === undefined) delete process.env.HYBRID_GREP_ENFORCEMENT;
  else process.env.HYBRID_GREP_ENFORCEMENT = original;
});
