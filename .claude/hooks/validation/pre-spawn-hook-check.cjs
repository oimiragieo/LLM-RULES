#!/usr/bin/env node
'use strict';

/**
 * Pre-Spawn Hook Check
 * ====================
 * PreToolUse(Agent) — validates all hook files are committed before spawning.
 * Prevents MODULE_NOT_FOUND in worktree subagents caused by untracked hooks.
 *
 * Advisory only (exit 0) — warns but never blocks agent spawns.
 *
 * @see .claude/docs/TROUBLESHOOTING.md Section 1
 * @see .claude/lib/utils/hook-file-validator.cjs
 */

const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

let _input = '';
process.stdin.on('data', chunk => {
  _input += chunk;
});

process.stdin.on('end', () => {
  try {
    const validatorPath = path.join(
      PROJECT_ROOT,
      '.claude',
      'lib',
      'utils',
      'hook-file-validator.cjs'
    );
    const { validateHookFiles } = require(validatorPath);
    const result = validateHookFiles(PROJECT_ROOT);

    if (result.missing.length > 0) {
      process.stderr.write(
        `[HOOK_DOCTOR] ${result.missing.length} hook(s) MISSING from disk: ${result.missing.join(', ')}\n` +
          'Worktree agents WILL crash with MODULE_NOT_FOUND.\n'
      );
    }

    if (result.untracked.length > 0) {
      process.stderr.write(
        `[HOOK_DOCTOR] ${result.untracked.length} hook(s) NOT tracked by git: ${result.untracked.join(', ')}\n` +
          'Fix: git add ' +
          result.untracked.join(' ') +
          '\n'
      );
    }
  } catch (err) {
    process.stderr.write(`[HOOK_DOCTOR] Error: ${err.message}\n`);
  }

  // Always allow — advisory only
  process.exit(0);
});
