'use strict';
// Regression test for SE-05: glob-to-regex must escape regex metacharacters before
// converting glob wildcards (H-08 audit finding).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { MerkleTree } = require('../../../.claude/lib/code-indexing/merkle-tree.cjs');

function globToRegExp(glob) {
  const tree = new MerkleTree('/tmp', { ignore: [] });
  return tree._globToRegExp(glob);
}

describe('MerkleTree._globToRegExp — SE-05 regex metachar escape', () => {
  it('basic glob: src/*.js matches src/foo.js', () => {
    const re = globToRegExp('src/*.js');
    assert.ok(re.test('src/foo.js'), 'should match src/foo.js');
    assert.ok(!re.test('src/nested/foo.js'), 'should not match nested path');
  });

  it('double-star: src/**/*.cjs matches src/file.cjs and src/sub/file.cjs', () => {
    const re = globToRegExp('src/**/*.cjs');
    // The double-star pattern enables matching within the src/ subtree.
    assert.ok(re.test('src/file.cjs'), 'should match src/file.cjs');
    assert.ok(re.test('src/sub/file.cjs'), 'should match one-level deep src/sub/file.cjs');
    assert.ok(!re.test('other/file.cjs'), 'should not match other directory');
  });

  it('adversarial alternation: a(b|c)*d treated as literal, does NOT match abcd via regex', () => {
    // Without the SE-05 fix, `a(b|c)*d` as a glob would be treated as a
    // regex pattern and match strings like `abcd` via alternation. With the fix,
    // parentheses and pipe are escaped first so the pattern is treated literally.
    // The `(` and `|` and `)` are escaped; the `*` remains a glob wildcard converting to [^/]*.
    // Result: this matches strings starting with literal `a(b|c)` followed by any path chars then `d`.
    const re = globToRegExp('a(b|c)*d');
    assert.ok(
      !re.test('abcd'),
      'alternation must be escaped; should not match abcd via regex alternation'
    );
    assert.ok(!re.test('acbd'), 'alternation must be escaped; should not match acbd');
  });

  it('adversarial: glob with regex metacharacters is treated as literal', () => {
    // Without the SE-05 fix, `foo(.*)+bar` as a glob would be treated as a
    // regex pattern and match strings like `fooXXXbar`. With the fix, the
    // metacharacters are escaped first so the pattern is treated literally.
    const re = globToRegExp('foo(.*)+bar');
    // The literal string `foo(.*)+bar` — cannot be a filename in practice, but
    // proves the fix: the resulting regex must NOT match `fooXXXbar`.
    assert.ok(
      !re.test('fooXXXbar'),
      'regex metacharacters must be escaped; should not match fooXXXbar'
    );
    // It should only match the literal string itself (if such a file existed).
    assert.ok(re.test('foo(.*)+bar'), 'should match the literal string foo(.*)+bar');
  });

  it('literal dot: file.js glob does NOT match fileXjs', () => {
    const re = globToRegExp('file.js');
    assert.ok(re.test('file.js'), 'should match file.js exactly');
    assert.ok(!re.test('fileXjs'), 'dot must be literal, not a regex wildcard');
    assert.ok(!re.test('file.ts'), 'should not match file.ts');
  });
});
