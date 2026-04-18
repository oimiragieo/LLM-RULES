#!/usr/bin/env node
'use strict';

/**
 * Session compatibility wrapper for startup worktree pruning.
 *
 * Historical tests and some tooling still expect a session-scoped hook at this
 * path. The actual registration lives in startup/worktree-prune-on-start.cjs,
 * so this wrapper preserves the older contract:
 * - fail-open on malformed stdin or git errors
 * - emit { allow: true } to stdout
 * - only run the startup prune once per session/runtime dir
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const STARTUP_HOOK = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'startup',
  'worktree-prune-on-start.cjs'
);
const DEFAULT_RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
const FLAG_NAME = 'worktree-pruned-this-session.flag';

function getRuntimeDir() {
  return process.env.WORKTREE_PRUNE_RUNTIME_DIR || DEFAULT_RUNTIME_DIR;
}

function getFlagPath() {
  return path.join(getRuntimeDir(), FLAG_NAME);
}

function emitAllowAndExit() {
  process.stdout.write(JSON.stringify({ allow: true }) + '\n');
  process.exit(0);
}

function hasValidHookInput(stdinRaw) {
  if (!stdinRaw || !stdinRaw.trim()) return true;
  const parsed = safeParseJSON(stdinRaw, null, null, null);
  return parsed === null || typeof parsed === 'object';
}

function markPrunedThisSession(flagPath) {
  const runtimeDir = path.dirname(flagPath);
  fs.mkdirSync(runtimeDir, { recursive: true });
  const tmpPath = `${flagPath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, new Date().toISOString(), 'utf8');
  fs.renameSync(tmpPath, flagPath);
}

function runStartupPrune() {
  execFileSync(process.execPath, [STARTUP_HOOK], {
    cwd: PROJECT_ROOT,
    stdio: 'ignore',
    windowsHide: true,
    timeout: 16000,
  });
}

function main() {
  try {
    const stdinRaw = fs.readFileSync(0, 'utf8');
    if (!hasValidHookInput(stdinRaw)) {
      return emitAllowAndExit();
    }

    const flagPath = getFlagPath();
    if (!fs.existsSync(flagPath)) {
      try {
        runStartupPrune();
      } catch (_err) {
        // Fail-open: startup prune errors must never block prompt handling.
      }
      markPrunedThisSession(flagPath);
    }
  } catch (_err) {
    // Fail-open: malformed stdin, missing files, or runtime-dir issues should
    // never block the session.
  }

  emitAllowAndExit();
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_RUNTIME_DIR,
  FLAG_NAME,
  STARTUP_HOOK,
  getFlagPath,
  getRuntimeDir,
  hasValidHookInput,
  main,
  markPrunedThisSession,
  runStartupPrune,
};
