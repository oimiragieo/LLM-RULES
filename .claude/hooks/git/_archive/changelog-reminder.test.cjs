'use strict';

/**
 * Tests for changelog-reminder.cjs
 *
 * Run with: node .claude/hooks/git/changelog-reminder.test.cjs
 */

const { validate, isCodeFile } = require('./changelog-reminder.cjs');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.error(`  FAIL: ${message}`);
    failed++;
  }
}

// ── isCodeFile tests ──────────────────────────────────────────────────────────

console.log('\nisCodeFile()');

assert(isCodeFile('src/index.ts'), 'recognises .ts files as code');
assert(isCodeFile('src/index.js'), 'recognises .js files as code');
assert(isCodeFile('hooks/my-hook.cjs'), 'recognises .cjs files as code');
assert(isCodeFile('tools/util.mjs'), 'recognises .mjs files as code');
assert(isCodeFile('package.json'), 'recognises .json files as code');
assert(!isCodeFile('package-lock.json'), 'excludes package-lock.json');
assert(!isCodeFile('pnpm-lock.yaml'), 'excludes pnpm-lock.yaml');
assert(!isCodeFile('README.md'), 'ignores .md files');
assert(!isCodeFile('CHANGELOG.md'), 'ignores CHANGELOG.md (not code)');
assert(!isCodeFile('.env'), 'ignores .env files');

// ── validate() — no code staged ──────────────────────────────────────────────

console.log('\nvalidate() — no code files staged');

{
  const result = validate(['CHANGELOG.md', 'README.md']);
  assert(!result.hasCodeFiles, 'no code files: hasCodeFiles is false');
  assert(result.hasChangelog, 'CHANGELOG.md staged: hasChangelog is true');
  assert(!result.shouldWarn, 'no code staged: should not warn');
}

{
  const result = validate([]);
  assert(!result.shouldWarn, 'empty staged list: should not warn');
}

// ── validate() — code staged without CHANGELOG ───────────────────────────────

console.log('\nvalidate() — code staged WITHOUT CHANGELOG.md');

{
  const result = validate(['src/auth.ts', 'src/index.ts']);
  assert(result.hasCodeFiles, 'has code files');
  assert(!result.hasChangelog, 'no changelog');
  assert(result.shouldWarn, 'should warn when code staged without changelog');
}

{
  const result = validate(['hooks/my-hook.cjs', 'tools/util.mjs']);
  assert(result.shouldWarn, 'warns for .cjs and .mjs files without changelog');
}

// ── validate() — code staged WITH CHANGELOG ──────────────────────────────────

console.log('\nvalidate() — code staged WITH CHANGELOG.md');

{
  const result = validate(['src/auth.ts', 'CHANGELOG.md']);
  assert(result.hasCodeFiles, 'has code files');
  assert(result.hasChangelog, 'changelog is staged');
  assert(!result.shouldWarn, 'should NOT warn when changelog is also staged');
}

{
  const result = validate(['package.json', 'CHANGELOG.md', 'src/index.js']);
  assert(!result.shouldWarn, 'no warn when changelog accompanies mixed staged files');
}

// ── validate() — excluded lock files ─────────────────────────────────────────

console.log('\nvalidate() — lock files excluded from code detection');

{
  const result = validate(['package-lock.json', 'pnpm-lock.yaml']);
  assert(!result.hasCodeFiles, 'lock files not counted as code');
  assert(!result.shouldWarn, 'should not warn for lock-file-only commits');
}

{
  const result = validate(['package-lock.json', 'CHANGELOG.md']);
  assert(!result.shouldWarn, 'no warn: lock file + changelog, no real code');
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(2);
} else {
  process.exit(0);
}
