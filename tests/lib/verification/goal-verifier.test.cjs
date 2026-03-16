'use strict';

/**
 * Tests for goal-verifier.cjs
 * RED phase: all tests should fail (module does not exist yet)
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const MODULE_PATH = path.resolve(__dirname, '../../../.claude/lib/verification/goal-verifier.cjs');

// ------------------------------------------------------------------
// checkTruths
// ------------------------------------------------------------------
describe('checkTruths', () => {
  let checkTruths;

  beforeEach(() => {
    // Fresh require each time so mocks don't bleed
    delete require.cache[require.resolve(MODULE_PATH)];
    checkTruths = require(MODULE_PATH).checkTruths;
  });

  test('returns all passed when all commands exit 0', () => {
    // We mock child_process.execSync in the module
    // For this test, we rely on the implementation using our injected exec
    const fakeExec = () => {
      // any command succeeds
      return Buffer.from('ok');
    };
    const truths = [
      { description: 'node is installed', command: 'node --version' },
      { description: 'git is installed', command: 'git --version' },
    ];
    const result = checkTruths(truths, { exec: fakeExec });
    assert.equal(result.passed, 2);
    assert.equal(result.failed, 0);
    assert.equal(result.errors.length, 0);
  });

  test('returns failure when a command throws', () => {
    const fakeExec = () => {
      throw new Error('command not found');
    };
    const truths = [{ description: 'missing binary', command: 'no-such-cmd' }];
    const result = checkTruths(truths, { exec: fakeExec });
    assert.equal(result.passed, 0);
    assert.equal(result.failed, 1);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /missing binary/);
  });

  test('returns empty result for empty truths array', () => {
    const result = checkTruths([], {});
    assert.equal(result.passed, 0);
    assert.equal(result.failed, 0);
    assert.equal(result.errors.length, 0);
  });

  test('includes description in error message on failure', () => {
    const fakeExec = () => {
      throw new Error('boom');
    };
    const result = checkTruths([{ description: 'my-check', command: 'foo' }], { exec: fakeExec });
    assert.match(result.errors[0], /my-check/);
  });
});

// ------------------------------------------------------------------
// checkArtifacts
// ------------------------------------------------------------------
describe('checkArtifacts', () => {
  let checkArtifacts;

  beforeEach(() => {
    delete require.cache[require.resolve(MODULE_PATH)];
    checkArtifacts = require(MODULE_PATH).checkArtifacts;
  });

  test('returns all passed when all paths exist', () => {
    const fakeExists = () => true;
    const artifacts = ['/some/path/file.js', '/another/path/other.cjs'];
    const result = checkArtifacts(artifacts, { exists: fakeExists });
    assert.equal(result.passed, 2);
    assert.equal(result.failed, 0);
    assert.equal(result.missing.length, 0);
  });

  test('returns failure when a path does not exist', () => {
    const fakeExists = p => p !== '/missing/file.js';
    const artifacts = ['/exists/file.js', '/missing/file.js'];
    const result = checkArtifacts(artifacts, { exists: fakeExists });
    assert.equal(result.passed, 1);
    assert.equal(result.failed, 1);
    assert.deepEqual(result.missing, ['/missing/file.js']);
  });

  test('returns empty result for empty artifacts array', () => {
    const result = checkArtifacts([], {});
    assert.equal(result.passed, 0);
    assert.equal(result.failed, 0);
    assert.equal(result.missing.length, 0);
  });

  test('normalizes Windows backslash paths before checking', () => {
    const seen = [];
    const fakeExists = p => {
      seen.push(p);
      return true;
    };
    const artifacts = ['C:\\some\\win\\path.js'];
    checkArtifacts(artifacts, { exists: fakeExists });
    // Should have been normalized to forward slashes
    assert.ok(
      seen.some(p => p.includes('/')),
      'Expected normalized forward-slash path'
    );
  });
});

// ------------------------------------------------------------------
// checkWiring
// ------------------------------------------------------------------
describe('checkWiring', () => {
  let checkWiring;

  beforeEach(() => {
    delete require.cache[require.resolve(MODULE_PATH)];
    checkWiring = require(MODULE_PATH).checkWiring;
  });

  test('returns all passed when all patterns found in target files', () => {
    const fakeReadFile = () => 'require("./goal-verifier.cjs");\nconst x = 1;';
    const keyLinks = [
      { description: 'goal-verifier imported', pattern: 'goal-verifier', file: '/some/file.cjs' },
    ];
    const result = checkWiring(keyLinks, { readFile: fakeReadFile });
    assert.equal(result.passed, 1);
    assert.equal(result.failed, 0);
    assert.equal(result.missing.length, 0);
  });

  test('returns failure when pattern not found in file', () => {
    const fakeReadFile = () => 'const x = 1;';
    const keyLinks = [
      { description: 'missing import', pattern: 'goal-verifier', file: '/some/file.cjs' },
    ];
    const result = checkWiring(keyLinks, { readFile: fakeReadFile });
    assert.equal(result.passed, 0);
    assert.equal(result.failed, 1);
    assert.equal(result.missing.length, 1);
    assert.match(result.missing[0], /missing import/);
  });

  test('returns failure when file cannot be read', () => {
    const fakeReadFile = () => {
      throw new Error('ENOENT');
    };
    const keyLinks = [
      { description: 'broken file', pattern: 'anything', file: '/nonexistent.cjs' },
    ];
    const result = checkWiring(keyLinks, { readFile: fakeReadFile });
    assert.equal(result.failed, 1);
  });

  test('returns empty result for empty keyLinks array', () => {
    const result = checkWiring([], {});
    assert.equal(result.passed, 0);
    assert.equal(result.failed, 0);
    assert.equal(result.missing.length, 0);
  });
});

// ------------------------------------------------------------------
// detectStubs
// ------------------------------------------------------------------
describe('detectStubs', () => {
  let detectStubs;

  beforeEach(() => {
    delete require.cache[require.resolve(MODULE_PATH)];
    detectStubs = require(MODULE_PATH).detectStubs;
  });

  test('returns no findings for clean code', () => {
    const fakeReadFile = () => `
'use strict';
function add(a, b) {
  return a + b;
}
module.exports = { add };
`;
    const result = detectStubs(['/clean/file.cjs'], { readFile: fakeReadFile });
    assert.equal(result.length, 0);
  });

  test('detects TODO comment in .cjs file', () => {
    const fakeReadFile = () => `
function foo() {
  // TODO: implement this
  return null;
}
`;
    const result = detectStubs(['/stub/file.cjs'], { readFile: fakeReadFile });
    assert.ok(result.length > 0, 'Expected at least one finding');
    assert.ok(result.some(f => f.type === 'TODO' || f.pattern === 'TODO'));
  });

  test('detects FIXME comment in .cjs file', () => {
    const fakeReadFile = () => `
// FIXME: broken logic here
function bar() { return 1; }
`;
    const result = detectStubs(['/file.cjs'], { readFile: fakeReadFile });
    assert.ok(result.some(f => (f.type || f.pattern || '').includes('FIXME')));
  });

  test('detects throw new Error not implemented', () => {
    const fakeReadFile = () => `
function notDone() {
  throw new Error('not implemented');
}
`;
    const result = detectStubs(['/file.cjs'], { readFile: fakeReadFile });
    assert.ok(result.length > 0, 'Expected stub detection');
  });

  test('detects empty function body arrow function', () => {
    const fakeReadFile = () => `const fn = () => {};`;
    const result = detectStubs(['/file.cjs'], { readFile: fakeReadFile });
    assert.ok(result.length > 0, 'Expected empty function body detection');
  });

  test('detects placeholder return value', () => {
    const fakeReadFile = () => `
function getResult() {
  return 'placeholder';
}
`;
    const result = detectStubs(['/file.cjs'], { readFile: fakeReadFile });
    assert.ok(result.length > 0, 'Expected placeholder return detection');
  });

  test('skips .md files (no false positives on docs)', () => {
    const fakeReadFile = () => `
# My Docs
TODO: add more examples
FIXME: broken link
throw new Error('not implemented')
`;
    const result = detectStubs(['/readme.md'], { readFile: fakeReadFile });
    assert.equal(result.length, 0, 'Should not flag .md files');
  });

  test('does not flag legitimate Error throws with real messages', () => {
    const fakeReadFile = () => `
function validate(x) {
  if (x === null) throw new Error('Value must not be null');
  return x;
}
`;
    const result = detectStubs(['/validator.cjs'], { readFile: fakeReadFile });
    // "Value must not be null" is NOT a stub — only "not implemented" variants are
    assert.equal(result.length, 0, 'Should not flag legitimate error throws');
  });

  test('includes file path and line number in findings', () => {
    const fakeReadFile = () => `// TODO: fix this\n`;
    const result = detectStubs(['/some/file.cjs'], { readFile: fakeReadFile });
    assert.ok(result.length > 0);
    const finding = result[0];
    assert.ok(finding.file, 'Finding should include file path');
    assert.ok(typeof finding.line === 'number', 'Finding should include line number');
  });

  test('handles file read error gracefully', () => {
    const fakeReadFile = () => {
      throw new Error('ENOENT');
    };
    // Should not throw, should return empty array or error entry
    let result;
    assert.doesNotThrow(() => {
      result = detectStubs(['/missing.cjs'], { readFile: fakeReadFile });
    });
    assert.ok(Array.isArray(result));
  });
});

// ------------------------------------------------------------------
// parseMustHaves
// ------------------------------------------------------------------
describe('parseMustHaves', () => {
  let parseMustHaves;

  beforeEach(() => {
    delete require.cache[require.resolve(MODULE_PATH)];
    parseMustHaves = require(MODULE_PATH).parseMustHaves;
  });

  test('extracts must_haves block from markdown plan content', () => {
    const planContent = `
# My Plan

## must_haves
- [ ] checkTruths function exported
- [ ] detectStubs handles .md exclusion
- [x] already done

## other section
- irrelevant
`;
    const result = parseMustHaves(planContent);
    assert.ok(Array.isArray(result));
    assert.ok(result.length >= 2, 'Should extract must_have items');
  });

  test('returns empty array when no must_haves section', () => {
    const planContent = `
# My Plan

## tasks
- do something
`;
    const result = parseMustHaves(planContent);
    assert.deepEqual(result, []);
  });

  test('returns empty array for empty string input', () => {
    const result = parseMustHaves('');
    assert.deepEqual(result, []);
  });

  test('each item has text and checked properties', () => {
    const planContent = `
## must_haves
- [ ] unchecked item
- [x] checked item
`;
    const result = parseMustHaves(planContent);
    const unchecked = result.find(r => r.text === 'unchecked item');
    const checked = result.find(r => r.text === 'checked item');
    assert.ok(unchecked, 'Should find unchecked item');
    assert.equal(unchecked.checked, false);
    assert.ok(checked, 'Should find checked item');
    assert.equal(checked.checked, true);
  });

  test('is case-insensitive for must_haves header', () => {
    const planContent = `
## Must_Haves
- [ ] some requirement
`;
    const result = parseMustHaves(planContent);
    assert.ok(result.length >= 1);
  });

  test('handles null/undefined input safely', () => {
    assert.doesNotThrow(() => parseMustHaves(null));
    assert.doesNotThrow(() => parseMustHaves(undefined));
    const r1 = parseMustHaves(null);
    const r2 = parseMustHaves(undefined);
    assert.deepEqual(r1, []);
    assert.deepEqual(r2, []);
  });
});
