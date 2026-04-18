#!/usr/bin/env node
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_ROOT = process.cwd();

test('package.json should not reference missing boot files', () => {
  const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));

  // These scripts should not exist (they reference archived boot files)
  assert.strictEqual(
    pkg.scripts['agent:production'],
    undefined,
    'agent:production script should be removed (boot file archived)'
  );

  assert.strictEqual(
    pkg.scripts['agent:worker'],
    undefined,
    'agent:worker script should be removed (boot file archived)'
  );
});

test('test script should run actual tests and fail if 0 tests found', () => {
  // The test script should match actual test files
  const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
  const testScript = pkg.scripts['test'];

  assert.ok(testScript, 'test script should exist');
  assert.ok(
    testScript.includes('scripts/testing/run-node-tests.cjs'),
    'test script should use the cross-platform test runner wrapper'
  );
  assert.ok(
    testScript.includes('--pattern=tests/**/*.test.{mjs,cjs}'),
    'test script should target the recursive .mjs/.cjs test glob via the wrapper'
  );
});

test('framework test scripts should use the cross-platform test runner wrapper', () => {
  const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
  const frameworkScript = pkg.scripts['test:framework'] || '';
  const hooksScript = pkg.scripts['test:framework:hooks'] || '';
  const libScript = pkg.scripts['test:framework:lib'] || '';

  assert.ok(
    frameworkScript.includes('scripts/testing/run-node-tests.cjs'),
    'test:framework should use the cross-platform test runner wrapper'
  );
  assert.ok(
    hooksScript.includes('scripts/testing/run-node-tests.cjs'),
    'test:framework:hooks should use the cross-platform test runner wrapper'
  );
  assert.ok(
    libScript.includes('scripts/testing/run-node-tests.cjs'),
    'test:framework:lib should use the cross-platform test runner wrapper'
  );
  assert.ok(
    frameworkScript.includes('--pattern=tests/hooks/*.test.cjs') &&
      frameworkScript.includes('--pattern=tests/lib/**/*.test.cjs') &&
      frameworkScript.includes('--pattern=tests/cli/*.test.cjs'),
    'test:framework should target the actual framework test globs via the wrapper'
  );
  assert.ok(
    hooksScript.includes('--pattern=tests/hooks/*.test.cjs'),
    'test:framework:hooks should target the hook tests glob via the wrapper'
  );
  assert.ok(
    libScript.includes('--pattern=tests/lib/**/*.test.cjs') &&
      libScript.includes('--pattern=tests/cli/*.test.cjs'),
    'test:framework:lib should target the library and cli test globs via the wrapper'
  );
});

test('CI-facing node test scripts should avoid shell-quoted globs', () => {
  const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));

  for (const scriptName of [
    'test',
    'test:framework',
    'test:framework:hooks',
    'test:framework:lib',
    'test:ci',
  ]) {
    const script = pkg.scripts[scriptName] || '';

    assert.ok(
      !script.includes('"tests/') && !script.includes("'tests/"),
      `${scriptName} should not pass shell-quoted tests globs directly to node --test`
    );
  }
});

test('count-all-tests.mjs should report failed test files, not hide them', () => {
  const scriptPath = join(PROJECT_ROOT, 'scripts', 'testing', 'count-all-tests.mjs');
  const script = readFileSync(scriptPath, 'utf-8');

  // Should NOT just catch errors and continue silently
  // The catch block at line 43-44 should log the failure AND count it
  const catchBlock = script.match(/catch\s*\([^)]+\)\s*{([^}]+)}/s);

  assert.ok(catchBlock, 'Script should have error handling');

  // The catch block should log the error (not just to console.error)
  // AND it should affect the final summary (not just skip the file)
  const catchContent = catchBlock[1];

  // Should log the error
  assert.ok(catchContent.includes('console.error'), 'Should log test file failures');

  // After fix, it should track failed files in the summary
  // For now, this will fail because the current code doesn't do this
  const hasFailedFileTracking =
    script.includes('failedFiles') ||
    script.includes('failed:') ||
    script.includes('Total failed files');

  assert.ok(
    hasFailedFileTracking,
    'Script should track and report the number of test files that failed to run'
  );
});

test('validate:sync script should work on Windows without bash', () => {
  const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
  const syncScript = pkg.scripts['validate:sync'];

  // Should not start with "bash"
  assert.ok(
    !syncScript.startsWith('bash '),
    'validate:sync should not require bash (not available on Windows by default)'
  );

  // Should use node
  assert.ok(
    syncScript.startsWith('node '),
    'validate:sync should use node for cross-platform compatibility'
  );
});

test('validate:full should include agent skill reference validation', () => {
  const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
  const fullScript = pkg.scripts['validate:full'] || '';

  assert.ok(
    fullScript.includes('pnpm validate:agent-skill-refs'),
    'validate:full should run validate:agent-skill-refs to catch broken Skill() references'
  );
});

test('validate:status-check-governance script should exist', () => {
  const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
  const script = pkg.scripts['validate:status-check-governance'] || '';

  assert.ok(script.length > 0, 'validate:status-check-governance script should be defined');
  assert.ok(
    script.includes('tests/workflows/branch-protection-audit.test.cjs'),
    'validate:status-check-governance should run branch protection governance tests'
  );
  assert.ok(
    script.includes('tests/workflows/required-status-checks-config.test.cjs'),
    'validate:status-check-governance should validate required status checks config'
  );
});

test('validate:full should include status check governance validation', () => {
  const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
  const fullScript = pkg.scripts['validate:full'] || '';

  assert.ok(
    fullScript.includes('pnpm validate:status-check-governance'),
    'validate:full should run status check governance validation'
  );
});

test('better-sqlite3 should be listed in onlyBuiltDependencies for CI native builds', () => {
  const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
  const builtDeps = pkg?.pnpm?.onlyBuiltDependencies || [];

  assert.ok(
    Array.isArray(builtDeps) && builtDeps.includes('better-sqlite3'),
    'pnpm.onlyBuiltDependencies should include better-sqlite3 so CI builds its native binding'
  );
});
