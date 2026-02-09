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

  // Should not match 0 files
  assert.ok(testScript, 'test script should exist');

  // Verify the script uses a glob pattern that will match test files
  // The old pattern "tests/*.test.mjs" only matches files directly in tests/
  // The new pattern "tests/**/*.test.{mjs,cjs}" matches files in subdirectories too
  assert.ok(
    testScript.includes('tests/**/*.test'),
    'Test script should use recursive glob pattern (tests/**/*.test) to match test files in subdirectories'
  );

  assert.ok(
    testScript.includes('{mjs,cjs}') || testScript.includes('.mjs') || testScript.includes('.cjs'),
    'Test script should match both .mjs and .cjs test files'
  );
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
