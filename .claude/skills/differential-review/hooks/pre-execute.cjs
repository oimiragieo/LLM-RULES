#!/usr/bin/env node
'use strict';

/**
 * differential-review - Pre-Execute Hook
 * Validates prerequisites before the differential-review skill executes.
 *
 * Checks:
 *   1. Git is accessible in PATH
 *   2. The current directory (or provided repo path) is a git repository
 *   3. Input context shape is valid
 */

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');

// ─── Input parsing ─────────────────────────────────────────────────────────────

function parseInput() {
  const raw = process.argv.length > 2 ? process.argv.slice(2).join(' ') : '{}';
  try {
    return safeParseJSON(raw) || {};
  } catch (_err) {
    return {};
  }
}

// ─── Validation ────────────────────────────────────────────────────────────────

function validateInput(input) {
  const errors = [];
  const warnings = [];

  // Check that git is available
  const gitCheck = spawnSync('git', ['--version'], { encoding: 'utf8', windowsHide: true });
  if (gitCheck.error || gitCheck.status !== 0) {
    errors.push('git is not available in PATH; differential-review requires git');
    return { errors, warnings };
  }

  // Check for a git repository if repo path is provided or cwd
  const repoPath = (input && input.repoPath) || process.cwd();
  const gitRevParse = spawnSync('git', ['-C', repoPath, 'rev-parse', '--git-dir'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (gitRevParse.status !== 0) {
    warnings.push(`No git repository found at ${repoPath}; ensure you are reviewing a git repo`);
  }

  // Validate prNumber if provided
  if (input && input.prNumber !== undefined) {
    const pr = Number(input.prNumber);
    if (!Number.isInteger(pr) || pr < 1) {
      errors.push('prNumber must be a positive integer');
    }
  }

  // Validate baseBranch if provided
  if (input && input.baseBranch !== undefined && typeof input.baseBranch !== 'string') {
    errors.push('baseBranch must be a string');
  }

  return { errors, warnings };
}

// ─── Main ──────────────────────────────────────────────────────────────────────

const input = parseInput();
const { errors, warnings } = validateInput(input);

console.log('[DIFFERENTIAL-REVIEW] Pre-execute validation...');

if (warnings.length > 0) {
  for (const w of warnings) {
    console.warn(`[DIFFERENTIAL-REVIEW] Warning: ${w}`);
  }
}

if (errors.length > 0) {
  console.error('[DIFFERENTIAL-REVIEW] Validation failed:');
  for (const e of errors) {
    console.error(`  - ${e}`);
  }
  process.exit(1);
}

console.log('[DIFFERENTIAL-REVIEW] Validation passed');
process.exit(0);
