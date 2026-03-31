#!/usr/bin/env node
/**
 * Session Start WatchPaths Hook (SessionStart)
 * =============================================
 * Advisory hook that fires at the start of each Claude Code session.
 *
 * Returns a `watchPaths` array that Claude Code should monitor for changes.
 * When any of these files changes, Claude Code will reload them automatically
 * without requiring a session restart.
 *
 * Paths watched:
 *   - .claude/config/agent-registry.json  (agent routing configuration)
 *   - .claude/settings.json               (session and hook settings)
 *   - .claude/context/runtime/            (runtime state directory)
 *
 * Behaviour:
 *   - Validates each candidate path exists via fs.existsSync() before including.
 *   - Omits missing paths with a warning to stderr (never blocks for missing paths).
 *   - Deduplicates paths — each absolute path appears at most once.
 *   - Uses consistent forward-slash separators (safe on Windows).
 *   - Wraps all logic in try/catch — any error yields {allow:true, watchPaths:[]}.
 *   - ALWAYS exits 0 and returns allow:true (fail-open advisory hook).
 *
 * Security compliance:
 *   SE-01: 'use strict' at top
 *   SE-02: parseHookInputAsync (uses safeParseJSON internally) — no raw JSON.parse
 *   SE-03: Always exits 0 (fail-open advisory hook)
 *   SE-04: project-root.cjs used for path resolution (not process-cwd)
 *
 * Registration: settings.json SessionStart matcher ""
 * Fulfills: VAL-NE-005, VAL-NE-006, VAL-NE-007, VAL-NE-008
 *
 * @module session-start-watchpaths
 */

'use strict';

const path = require('path');
const fs = require('fs');

const { PROJECT_ROOT } = require(
  path.join(__dirname, '..', '..', 'lib', 'utils', 'project-root.cjs')
);

const { parseHookInputAsync, formatResult } = require(
  path.join(__dirname, '..', '..', 'lib', 'utils', 'hook-input.cjs')
);

const HOOK_NAME = 'session-start-watchpaths';

/**
 * Candidate watch paths relative to the project root.
 * Paths are validated for existence before being returned.
 */
const WATCH_PATHS_RELATIVE = [
  '.claude/config/agent-registry.json',
  '.claude/settings.json',
  '.claude/context/runtime',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Normalize path separators to consistent forward slashes.
 * This ensures cross-platform safety on Windows where path.resolve()
 * may return backslash-separated paths.
 *
 * @param {string} p - Path string to normalize
 * @returns {string} Path with all backslashes replaced by forward slashes
 */
function normalizeSep(p) {
  if (typeof p !== 'string') return p;
  return p.replace(/\\/g, '/');
}

/**
 * Build the watchPaths array.
 *
 * For each candidate relative path:
 *   1. Resolves to an absolute path using the project root.
 *   2. Normalizes path separators to forward slashes.
 *   3. Validates that the path exists on disk via fs.existsSync().
 *   4. If it exists, adds to the result (deduplicated via Set).
 *   5. If it does not exist, emits a stderr warning and skips it.
 *
 * @param {string|null} [projectRoot] - Override project root for testing.
 *   Falls back to PROJECT_ROOT when null/undefined.
 * @returns {string[]} Array of valid, absolute, deduplicated watch paths.
 */
function buildWatchPaths(projectRoot) {
  const root = projectRoot || PROJECT_ROOT;
  const watchPaths = [];
  const seen = new Set();

  for (const relPath of WATCH_PATHS_RELATIVE) {
    const absPath = normalizeSep(path.resolve(root, relPath));

    // Deduplicate before existsSync for efficiency
    if (seen.has(absPath)) {
      continue;
    }
    seen.add(absPath);

    if (fs.existsSync(absPath)) {
      watchPaths.push(absPath);
    } else {
      process.stderr.write(
        `[${HOOK_NAME}] Warning: watch path does not exist, omitting: ${absPath}\n`
      );
    }
  }

  return watchPaths;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

/**
 * Hook entrypoint — reads stdin (via parseHookInputAsync which uses safeParseJSON),
 * builds watchPaths, outputs result. Always exits 0 (advisory hook).
 *
 * On any unexpected error, falls back to {allow:true, watchPaths:[]} so that
 * Claude Code session start is never blocked.
 */
async function main() {
  try {
    // Parse input via hook-input.cjs (which uses safeParseJSON internally)
    // Session start hooks may or may not send input — this is best-effort.
    await parseHookInputAsync();

    const watchPaths = buildWatchPaths();

    console.log(formatResult({ allow: true, watchPaths }));
    process.exit(0);
  } catch (err) {
    // SE-03: Fail-open — never block session start on any error.
    process.stderr.write(
      `[${HOOK_NAME}] Error (fail-open, returning empty watchPaths): ${err.message}\n`
    );
    console.log(formatResult({ allow: true, watchPaths: [] }));
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildWatchPaths,
  normalizeSep,
  HOOK_NAME,
  WATCH_PATHS_RELATIVE,
};
