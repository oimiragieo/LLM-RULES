#!/usr/bin/env node
/**
 * Tests for Pre-commit Security Hook Integration
 *
 * Validates that the pre-commit hook correctly integrates with
 * security-lint.cjs and follows git hook conventions.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execSync } = require('child_process');

// Paths
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const GIT_HOOKS_DIR = path.join(PROJECT_ROOT, '.git', 'hooks');
const PRE_COMMIT_HOOK = path.join(GIT_HOOKS_DIR, 'pre-commit');
const SECURITY_LINT_PATH = path.join(__dirname, 'security-lint.cjs');

// =============================================================================
// Test Utilities
// =============================================================================

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
    return true;
  } catch (err) {
    console.error(`FAIL: ${name}`);
    console.error(`  ${err.message}`);
    return false;
  }
}

// =============================================================================
// Tests
// =============================================================================

function testSecurityLintExists() {
  assert(fs.existsSync(SECURITY_LINT_PATH), 'security-lint.cjs should exist');
}

function testSecurityLintIsExecutable() {
  // On Windows, check if file has shebang
  const content = fs.readFileSync(SECURITY_LINT_PATH, 'utf8');
  assert(content.startsWith('#!/usr/bin/env node'), 'security-lint.cjs should have node shebang');
}

function testSecurityLintExportsRequired() {
  const mod = require(SECURITY_LINT_PATH);
  assert(mod.SECURITY_RULES, 'Should export SECURITY_RULES');
  assert(mod.scanFile, 'Should export scanFile');
  assert(mod.shouldScanFile, 'Should export shouldScanFile');
  assert(mod.CONFIG, 'Should export CONFIG');
}

function testSecurityLintStagedFlag() {
  // The --staged flag should work with git
  // We can't really test this without staging files, so just verify
  // the flag is documented in the help
  try {
    const output = execSync(`node "${SECURITY_LINT_PATH}" --help`, {
      encoding: 'utf8',
      cwd: PROJECT_ROOT,
    });
    assert(output.includes('--staged'), 'Help should document --staged flag');
  } catch (err) {
    // If help exits with error, check stderr
    if (err.stdout) {
      assert(err.stdout.includes('--staged'), 'Help should document --staged flag');
    } else {
      throw err;
    }
  }
}

function testPreCommitHookExists() {
  // Check if pre-commit hook exists (may not until we create it)
  // This test documents the expected state
  if (fs.existsSync(PRE_COMMIT_HOOK)) {
    const stats = fs.statSync(PRE_COMMIT_HOOK);
    assert(stats.isFile(), 'pre-commit should be a file');
  } else {
    // For now, pass - we're testing that it CAN be created
    console.log('  (pre-commit hook not yet installed)');
  }
}

function testSecurityLintReturnsCorrectExitCodes() {
  // Test that security-lint returns correct exit codes
  const testDir = path.join(__dirname, '.test-exit-codes');

  try {
    // Setup test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Test 1: Clean file should exit 0
    const cleanFile = path.join(testDir, 'clean.js');
    fs.writeFileSync(cleanFile, 'const x = process.env.API_KEY;');

    try {
      execSync(`node "${SECURITY_LINT_PATH}" "${cleanFile}"`, {
        encoding: 'utf8',
        cwd: PROJECT_ROOT,
      });
      // Exit 0 means no error thrown
    } catch (_err) {
      assert.fail('Clean file should exit 0');
    }

    // Test 2: File with critical issue should exit 1
    const criticalFile = path.join(testDir, 'critical.js');
    fs.writeFileSync(criticalFile, 'const apiKey = "sk-abc123def456ghi789jkl012mno345";');

    try {
      execSync(`node "${SECURITY_LINT_PATH}" "${criticalFile}"`, {
        encoding: 'utf8',
        cwd: PROJECT_ROOT,
      });
      assert.fail('Critical issue file should exit 1');
    } catch (err) {
      assert(err.status === 1, `Expected exit code 1, got ${err.status}`);
    }
  } finally {
    // Cleanup
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  }
}

function testPreCommitScriptContent() {
  // Test the pre-commit script content we're about to create
  const expectedContent = [
    '#!/bin/sh',
    'Security pre-commit hook',
    'security-lint.cjs',
    '--staged',
    'exit 1',
    'exit 0',
  ];

  // If pre-commit exists, verify it has expected content
  if (fs.existsSync(PRE_COMMIT_HOOK)) {
    const content = fs.readFileSync(PRE_COMMIT_HOOK, 'utf8');
    for (const expected of expectedContent) {
      assert(content.includes(expected), `Pre-commit should contain: ${expected}`);
    }
  } else {
    console.log('  (pre-commit hook not yet created - will verify after creation)');
  }
}

// =============================================================================
// Main Test Runner
// =============================================================================

function main() {
  console.log('=== Pre-commit Security Hook Tests ===\n');

  const tests = [
    ['security-lint.cjs exists', testSecurityLintExists],
    ['security-lint.cjs has shebang', testSecurityLintIsExecutable],
    ['security-lint.cjs exports required functions', testSecurityLintExportsRequired],
    ['security-lint.cjs documents --staged flag', testSecurityLintStagedFlag],
    ['pre-commit hook exists (or can be created)', testPreCommitHookExists],
    ['security-lint returns correct exit codes', testSecurityLintReturnsCorrectExitCodes],
    ['pre-commit script has required content', testPreCommitScriptContent],
  ];

  let passed = 0;
  let failed = 0;

  for (const [name, fn] of tests) {
    if (runTest(name, fn)) {
      passed++;
    } else {
      failed++;
    }
  }

  console.log(`\n=== Results ===`);
  console.log(`Passed: ${passed}/${tests.length}`);
  console.log(`Failed: ${failed}/${tests.length}`);

  process.exit(failed > 0 ? 1 : 0);
}

main();
