'use strict';

/**
 * Tests for stub-patterns.cjs
 * RED phase: all tests should fail (module does not exist yet)
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const MODULE_PATH = path.resolve(__dirname, '../../../.claude/lib/verification/stub-patterns.cjs');

describe('STUB_PATTERNS array', () => {
  let STUB_PATTERNS;

  beforeEach(() => {
    delete require.cache[require.resolve(MODULE_PATH)];
    STUB_PATTERNS = require(MODULE_PATH).STUB_PATTERNS;
  });

  test('exports STUB_PATTERNS as an array', () => {
    assert.ok(Array.isArray(STUB_PATTERNS), 'STUB_PATTERNS should be an array');
  });

  test('each pattern has a name and regex', () => {
    assert.ok(STUB_PATTERNS.length > 0, 'Should have at least one pattern');
    for (const p of STUB_PATTERNS) {
      assert.ok(typeof p.name === 'string', `Pattern missing name: ${JSON.stringify(p)}`);
      assert.ok(p.regex instanceof RegExp, `Pattern missing regex: ${JSON.stringify(p)}`);
    }
  });

  test('TODO pattern matches // TODO: ...', () => {
    const todoPattern = STUB_PATTERNS.find(p => p.name === 'TODO');
    assert.ok(todoPattern, 'Should have a TODO pattern');
    assert.ok(todoPattern.regex.test('// TODO: implement this'), 'Should match // TODO comment');
    assert.ok(todoPattern.regex.test('  // TODO some note'), 'Should match indented TODO');
  });

  test('FIXME pattern matches // FIXME: ...', () => {
    const fixmePattern = STUB_PATTERNS.find(p => p.name === 'FIXME');
    assert.ok(fixmePattern, 'Should have a FIXME pattern');
    assert.ok(fixmePattern.regex.test('// FIXME: broken'), 'Should match FIXME comment');
  });

  test('HACK pattern matches // HACK: ...', () => {
    const hackPattern = STUB_PATTERNS.find(p => p.name === 'HACK');
    assert.ok(hackPattern, 'Should have a HACK pattern');
    assert.ok(hackPattern.regex.test('// HACK: ugly workaround'), 'Should match HACK comment');
  });

  test('XXX pattern matches // XXX: ...', () => {
    const xxxPattern = STUB_PATTERNS.find(p => p.name === 'XXX');
    assert.ok(xxxPattern, 'Should have an XXX pattern');
    assert.ok(xxxPattern.regex.test('// XXX: needs review'), 'Should match XXX comment');
  });

  test('not-implemented pattern matches throw new Error not implemented', () => {
    const notImplPattern = STUB_PATTERNS.find(p => p.name === 'NOT_IMPLEMENTED');
    assert.ok(notImplPattern, 'Should have a NOT_IMPLEMENTED pattern');
    assert.ok(
      notImplPattern.regex.test("throw new Error('not implemented')"),
      'Should match not implemented throw'
    );
    assert.ok(
      notImplPattern.regex.test('throw new Error("Not Implemented")'),
      'Should match case-insensitive variant'
    );
  });

  test('empty-function pattern matches () => {}', () => {
    const emptyFnPattern = STUB_PATTERNS.find(p => p.name === 'EMPTY_FUNCTION');
    assert.ok(emptyFnPattern, 'Should have an EMPTY_FUNCTION pattern');
    assert.ok(
      emptyFnPattern.regex.test('const fn = () => {};'),
      'Should match empty arrow function'
    );
    assert.ok(emptyFnPattern.regex.test('function foo() {}'), 'Should match empty named function');
  });

  test('placeholder-return pattern matches return "placeholder"', () => {
    const placeholderPattern = STUB_PATTERNS.find(p => p.name === 'PLACEHOLDER_RETURN');
    assert.ok(placeholderPattern, 'Should have a PLACEHOLDER_RETURN pattern');
    assert.ok(
      placeholderPattern.regex.test("return 'placeholder';"),
      'Should match single-quoted placeholder'
    );
    assert.ok(
      placeholderPattern.regex.test('return "placeholder";'),
      'Should match double-quoted placeholder'
    );
  });
});

describe('isStub function', () => {
  let isStub;

  beforeEach(() => {
    delete require.cache[require.resolve(MODULE_PATH)];
    isStub = require(MODULE_PATH).isStub;
  });

  test('exports isStub as a function', () => {
    assert.equal(typeof isStub, 'function');
  });

  test('returns true for a line with TODO comment in .cjs file', () => {
    assert.equal(isStub('// TODO: implement this', '/some/file.cjs'), true);
  });

  test('returns true for a line with FIXME comment in .cjs file', () => {
    assert.equal(isStub('// FIXME: broken logic', '/file.cjs'), true);
  });

  test('returns true for throw not implemented', () => {
    assert.equal(isStub("throw new Error('not implemented')", '/file.cjs'), true);
  });

  test('returns true for empty arrow function body', () => {
    assert.equal(isStub('const handler = () => {};', '/file.cjs'), true);
  });

  test('returns true for placeholder return', () => {
    assert.equal(isStub("return 'placeholder';", '/file.cjs'), true);
  });

  test('returns false for .md files regardless of content', () => {
    assert.equal(isStub('// TODO: implement this', '/docs/readme.md'), false);
    assert.equal(isStub('// FIXME: broken', '/NOTES.md'), false);
    assert.equal(isStub("throw new Error('not implemented')", '/guide.md'), false);
  });

  test('returns false for legitimate code in .cjs file', () => {
    assert.equal(isStub('const x = add(1, 2);', '/file.cjs'), false);
    assert.equal(isStub("throw new Error('Value must not be null');", '/file.cjs'), false);
    assert.equal(isStub('return result;', '/file.cjs'), false);
  });

  test('returns false for multi-char throw that is not not-implemented', () => {
    assert.equal(isStub("throw new Error('database connection failed');", '/file.cjs'), false);
  });

  test('returns false for empty string', () => {
    assert.equal(isStub('', '/file.cjs'), false);
  });

  test('handles .js extension the same as .cjs', () => {
    assert.equal(isStub('// TODO: fix', '/file.js'), true);
  });

  test('handles .mjs extension the same as .cjs', () => {
    assert.equal(isStub('// TODO: fix', '/file.mjs'), true);
  });
});

describe('No false positives', () => {
  let isStub;

  beforeEach(() => {
    delete require.cache[require.resolve(MODULE_PATH)];
    ({ isStub } = require(MODULE_PATH));
  });

  test('TODO in markdown heading does not flag', () => {
    // .md file — always skipped
    assert.equal(isStub('## TODO items', '/plan.md'), false);
  });

  test('legitimate function with meaningful body is not flagged', () => {
    const lines = ['function calculate(a, b) {', '  const sum = a + b;', '  return sum;', '}'];
    for (const line of lines) {
      assert.equal(isStub(line, '/math.cjs'), false, `Line should not be stub: ${line}`);
    }
  });

  test('error throw with real description is not flagged', () => {
    const notStubs = [
      "throw new Error('Invalid argument: expected string');",
      "throw new Error('File not found: ' + path);",
      "throw new TypeError('Expected number');",
    ];
    for (const line of notStubs) {
      assert.equal(isStub(line, '/file.cjs'), false, `Should not flag: ${line}`);
    }
  });
});
