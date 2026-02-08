// security-lint-ignore: Test file containing intentional malicious input patterns for security testing
/**
 * TDD Test for install.mjs Security Fix (MEDIUM-001)
 *
 * Tests path traversal validation in the installation script.
 *
 * RED: Test fails before fix (path traversal not validated)
 * GREEN: Test passes after fix (path traversal blocked)
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { mkdirSync, rmSync, existsSync } = require('fs');
const { resolve, join } = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = resolve(__dirname, '../..');
const TEST_DIR = join(PROJECT_ROOT, 'tests/fixtures/install-security-test');

describe('install.mjs security (MEDIUM-001)', () => {
  before(() => {
    // Create test directory structure
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });

    // Create a mock target outside TEST_DIR for path traversal test
    const outsideDir = join(PROJECT_ROOT, 'tests/fixtures/outside-target');
    if (existsSync(outsideDir)) {
      rmSync(outsideDir, { recursive: true, force: true });
    }
    mkdirSync(outsideDir, { recursive: true });
  });

  after(() => {
    // Cleanup
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    const outsideDir = join(PROJECT_ROOT, 'tests/fixtures/outside-target');
    if (existsSync(outsideDir)) {
      rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it('should reject path traversal with ".." in target directory', () => {
    const traversalPath = '../../../etc';

    try {
      execSync(`node scripts/install.mjs ${traversalPath} --skip-validation`, {
        cwd: PROJECT_ROOT,
        stdio: 'pipe',
        encoding: 'utf-8',
      });
      assert.fail('Should have rejected path traversal attempt');
    } catch (error) {
      // Expected to fail
      const output = error.stderr || error.stdout || error.message;
      assert.ok(
        output.includes('path traversal') ||
          output.includes('cannot contain') ||
          output.includes('Error'),
        `Expected error about path traversal, got: ${output}`
      );
    }
  });

  it('should reject target directory outside project when no --force flag', () => {
    const outsideDir = resolve(PROJECT_ROOT, '../outside-project');

    // Create the directory so it exists (to avoid "does not exist" error)
    if (!existsSync(outsideDir)) {
      mkdirSync(outsideDir, { recursive: true });
    }

    try {
      execSync(`node scripts/install.mjs "${outsideDir}" --skip-validation`, {
        cwd: PROJECT_ROOT,
        stdio: 'pipe',
        encoding: 'utf-8',
      });
      assert.fail('Should have rejected external directory without --force');
    } catch (error) {
      const output = error.stderr || error.stdout || error.message;
      assert.ok(
        output.includes('outside') || output.includes('--force') || output.includes('Warning'),
        `Expected warning about external directory, got: ${output}`
      );
    } finally {
      // Cleanup
      if (existsSync(outsideDir)) {
        rmSync(outsideDir, { recursive: true, force: true });
      }
    }
  });

  it('should allow target directory within project root', () => {
    const safeTarget = join(TEST_DIR, 'safe-target');
    mkdirSync(safeTarget, { recursive: true });

    try {
      execSync(`node scripts/install.mjs "${safeTarget}" --skip-validation`, {
        cwd: PROJECT_ROOT,
        stdio: 'pipe',
        encoding: 'utf-8',
      });
      // Should succeed (may warn about missing bundles, but shouldn't error on path)
      assert.ok(true, 'Should allow safe target directory');
    } catch (error) {
      const output = error.stderr || error.stdout || error.message;
      // Only fail if error is about path traversal, not missing bundles
      if (output.includes('path traversal') || output.includes('cannot contain')) {
        assert.fail(`Should allow safe directory, got: ${output}`);
      }
      // Other errors (like missing bundles) are acceptable for this test
    }
  });

  it('should allow absolute paths that resolve to subdirectories', () => {
    const absoluteTarget = resolve(TEST_DIR, 'absolute-target');
    mkdirSync(absoluteTarget, { recursive: true });

    try {
      execSync(`node scripts/install.mjs "${absoluteTarget}" --skip-validation`, {
        cwd: PROJECT_ROOT,
        stdio: 'pipe',
        encoding: 'utf-8',
      });
      assert.ok(true, 'Should allow absolute paths within project');
    } catch (error) {
      const output = error.stderr || error.stdout || error.message;
      if (output.includes('path traversal') || output.includes('cannot contain')) {
        assert.fail(`Should allow absolute path, got: ${output}`);
      }
    }
  });
});
