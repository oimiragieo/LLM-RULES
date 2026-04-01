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

      // Append session summary to daily log (fail-open — separate try/catch so daily log
      // failure never prevents STM→MTM promotion from completing).
      try {
        const { appendDailyLog } = require(path.join(LIB_DIR, 'memory', 'memory-daily-log.cjs'));

        // Build summary: entry count from stmData.entries array if present, else 1
        const entryCount = stmData && Array.isArray(stmData.entries) ? stmData.entries.length : 1;
        let summary = `Session ended - ${entryCount} memory entr${entryCount === 1 ? 'y' : 'ies'} promoted to MTM`;

        // Include session duration if start_time is available in STM data
        if (stmData && stmData.start_time) {
          const startMs = new Date(stmData.start_time).getTime();
          if (!isNaN(startMs)) {
            const durationMs = Date.now() - startMs;
            const durationMin = Math.round(durationMs / 60000);
            summary += ` (duration: ~${durationMin}min)`;
          }
        }

        appendDailyLog(summary);
        process.stderr.write(
          `[session-end-memory-promotion] Appended session summary to daily log.\n`
        );
      } catch (dailyLogErr) {
        // Daily log is non-critical — log the error and continue
        process.stderr.write(
          `[session-end-memory-promotion] Daily log write failed (ignored): ${dailyLogErr.message}\n`
        );
      }

      // Trigger background LanceDB re-index of the promoted MTM file.
      // Skip when running in BM25-only mode (no embedding vectors to update).
      if (process.env.LANCEDB_EMBEDDING_MODE !== 'off') {
        const { spawn } = require('child_process');
        const child = spawn(
          'node',
          [
            path.join(PROJECT_ROOT, '.claude', 'lib', 'code-indexing', 'generate-embeddings.cjs'),
            '--memory-only',
          ],
          { stdio: 'ignore', detached: true, shell: false, windowsHide: true }
        );
        child.on('error', err => {
          process.stderr.write(
            `[session-end-memory-promotion] Spawn error (ignored): ${err.message}\n`
          );
        });
        child.unref();
        process.stderr.write(
          '[session-end-memory-promotion] Triggered background memory re-index.\n'
        );
      } else {
        process.stderr.write(
          '[session-end-memory-promotion] Skipping re-index (LANCEDB_EMBEDDING_MODE=off).\n'
        );
      }
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
