#!/usr/bin/env node
'use strict';

/**
 * Changelog Reminder Hook
 *
 * Type: git pre-commit (called from .git/hooks/pre-commit)
 * Purpose: Warn when code files are staged for commit but CHANGELOG.md
 *          [Unreleased] section was NOT also staged.
 * Mode: warn only — always exits 0 (non-blocking)
 *
 * ADR context: ADR-2026-02-21-004 and ADR-2026-02-21-006 require CHANGELOG
 * updates inline with code commits. This hook enforces it at warn level.
 *
 * Exit codes:
 * - 0: Always (non-blocking warn mode)
 *
 * Environment:
 *   CHANGELOG_REMINDER_MODE=warn|off (default: warn)
 */

'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Find the project root by locating the .claude directory
 * @returns {string} Absolute path to project root
 */
function findProjectRoot() {
  let dir = __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.claude'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const ENFORCEMENT_MODE = process.env.CHANGELOG_REMINDER_MODE || 'warn';

/** Code file extensions that trigger the CHANGELOG check */
const CODE_EXTENSIONS = ['.ts', '.js', '.cjs', '.mjs', '.json'];

/** Files to exclude from code detection even if they match a code extension */
const EXCLUDED_FILES = new Set(['package-lock.json', 'pnpm-lock.yaml']);

/**
 * Get the list of staged file names from git
 * @returns {string[]} List of staged file basenames and relative paths
 */
function getStagedFiles() {
  const result = spawnSync('git', ['diff', '--cached', '--name-only'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  if (result.status !== 0 || result.error) {
    return [];
  }
  return result.stdout
    .split('\n')
    .map(f => f.trim())
    .filter(Boolean);
}

/**
 * Determine whether a staged file path counts as a "code" file
 * @param {string} filePath - Relative path from git root
 * @returns {boolean}
 */
function isCodeFile(filePath) {
  const basename = path.basename(filePath);
  if (EXCLUDED_FILES.has(basename)) {
    return false;
  }
  const ext = path.extname(filePath);
  return CODE_EXTENSIONS.includes(ext);
}

/**
 * Core validation logic — can be called programmatically for testing
 * @param {string[]} stagedFiles - List of staged relative file paths
 * @returns {{ hasCodeFiles: boolean, hasChangelog: boolean, shouldWarn: boolean }}
 */
function validate(stagedFiles) {
  const hasCodeFiles = stagedFiles.some(isCodeFile);
  const hasChangelog = stagedFiles.some(f => path.basename(f) === 'CHANGELOG.md');
  const shouldWarn = hasCodeFiles && !hasChangelog;
  return { hasCodeFiles, hasChangelog, shouldWarn };
}

/**
 * Main execution entry point
 */
function main() {
  if (ENFORCEMENT_MODE === 'off') {
    process.exit(0);
  }

  const stagedFiles = getStagedFiles();
  const { shouldWarn } = validate(stagedFiles);

  if (shouldWarn) {
    process.stderr.write(
      [
        '\u26A0 [changelog-reminder] Code changes staged but CHANGELOG.md not updated.',
        '  Consider updating the [Unreleased] section before committing.',
        '  (ADR-2026-02-21-004/006 \u2014 warn mode, not blocking)',
        '',
      ].join('\n')
    );
  }

  // Always exit 0 — non-blocking
  process.exit(0);
}

// Run main only when executed directly
if (require.main === module) {
  main();
}

module.exports = {
  validate,
  isCodeFile,
  getStagedFiles,
  findProjectRoot,
  PROJECT_ROOT,
};
