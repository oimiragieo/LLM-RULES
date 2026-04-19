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

const PROJECT_ROOT = resolve(__dirname, '../..');
const TEST_DIR = join(PROJECT_ROOT, 'tests/fixtures/install-security-test');
const INSTALL_VALIDATION_MODULE = '../../scripts/installation/install-target-validation.mjs';

async function loadValidationHelper() {
  return import(INSTALL_VALIDATION_MODULE);
}

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

  it('should reject path traversal with ".." in target directory', async () => {
    const traversalPath = '../../../etc';
    const { validateInstallTarget } = await loadValidationHelper();

    assert.throws(
      () =>
        validateInstallTarget({
          targetArg: traversalPath,
          cwd: PROJECT_ROOT,
          force: false,
        }),
      /path traversal|cannot contain/i
    );
  });

  it('should reject target directory outside project when no --force flag', async () => {
    const outsideDir = resolve(PROJECT_ROOT, '../outside-project');
    const { validateInstallTarget } = await loadValidationHelper();

    // Create the directory so it exists (to avoid "does not exist" error)
    if (!existsSync(outsideDir)) {
      mkdirSync(outsideDir, { recursive: true });
    }

    try {
      assert.throws(
        () =>
          validateInstallTarget({
            targetArg: outsideDir,
            cwd: PROJECT_ROOT,
            force: false,
          }),
        /outside current working directory|--force/i
      );
    } finally {
      // Cleanup
      if (existsSync(outsideDir)) {
        rmSync(outsideDir, { recursive: true, force: true });
      }
    }
  });

  it('should allow target directory within project root', async () => {
    const safeTarget = join(TEST_DIR, 'safe-target');
    mkdirSync(safeTarget, { recursive: true });

    const { validateInstallTarget } = await loadValidationHelper();

    assert.doesNotThrow(() =>
      validateInstallTarget({
        targetArg: safeTarget,
        cwd: PROJECT_ROOT,
        force: false,
      })
    );
  });

  it('should allow absolute paths that resolve to subdirectories', async () => {
    const absoluteTarget = resolve(TEST_DIR, 'absolute-target');
    mkdirSync(absoluteTarget, { recursive: true });

    const { validateInstallTarget } = await loadValidationHelper();

    assert.doesNotThrow(() =>
      validateInstallTarget({
        targetArg: absoluteTarget,
        cwd: PROJECT_ROOT,
        force: false,
      })
    );
  });
});
