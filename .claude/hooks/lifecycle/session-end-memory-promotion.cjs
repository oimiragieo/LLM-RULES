'use strict';
/**
 * Session-End STM→MTM Promotion Hook (M3)
 * =========================================
 * Fires on SessionEnd to promote the current STM session to MTM.
 * This ensures that session context (tool calls, task summaries, discoveries)
 * is not lost when the Claude Code session terminates.
 *
 * Security compliance:
 *   SE-01: Windows paths normalised before use
 *   SE-02: safeParseJSON used — no raw JSON.parse on untrusted input
 *   SE-03: Exits 0 on all errors (fail-open advisory hook)
 *
 * Registration: settings.json SessionEnd matcher ""
 */

const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const LIB_DIR = path.join(PROJECT_ROOT, '.claude', 'lib');

function main() {
  try {
    const stmDir = path.join(PROJECT_ROOT, '.claude', 'context', 'memory', 'stm');
    const currentFile = path.join(stmDir, 'session_current.json');

    // If no active STM session file, nothing to promote — exit cleanly
    if (!fs.existsSync(currentFile)) {
      process.stderr.write(
        '[session-end-memory-promotion] No STM session file found — skipping.\n'
      );
      return;
    }

    // Read the STM file using safeParseJSON (SE-02: no raw JSON.parse)
    const { safeParseJSON } = require(path.join(LIB_DIR, 'utils', 'safe-json.cjs'));
    const rawContent = fs.readFileSync(currentFile, 'utf8');
    const stmData = safeParseJSON(rawContent, null);

    // Extract session_id from parsed STM data
    const sessionId = stmData && stmData.session_id;
    if (!sessionId) {
      process.stderr.write(
        '[session-end-memory-promotion] STM file exists but has no session_id — skipping.\n'
      );
      return;
    }

    // Call consolidateSession to promote STM → MTM
    const { consolidateSession } = require(path.join(LIB_DIR, 'memory', 'memory-tiers.cjs'));
    const result = consolidateSession(sessionId, PROJECT_ROOT);

    if (result && result.success) {
      process.stderr.write(
        `[session-end-memory-promotion] Promoted session ${sessionId} STM -> MTM: ${result.mtmPath.replace(/\\/g, '/')}\n`
      );
    } else {
      const reason = (result && result.error) || 'unknown error';
      process.stderr.write(
        `[session-end-memory-promotion] consolidateSession returned failure for ${sessionId}: ${reason}\n`
      );
    }
  } catch (err) {
    // SE-03: Lifecycle hooks must be fail-open — log and exit 0
    process.stderr.write(`[session-end-memory-promotion] Error (ignored): ${err.message}\n`);
  }
}

main();
