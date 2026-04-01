'use strict';

// Hook: pre-compact.cjs
// Event: Notification (non-blocking, always exit 0)
// Purpose: Save session state before context compaction

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
const SNAPSHOT_FILE = path.join(RUNTIME_DIR, 'pre-compact-snapshot.json');

// Source state files
const EDIT_COUNTER_FILE = path.join(RUNTIME_DIR, 'edit-counter.json');
const SESSION_METRICS_FILE = path.join(RUNTIME_DIR, 'session-metrics.json');
const DRIFT_STATE_FILE = path.join(RUNTIME_DIR, 'drift-state.json');

// Reflection log rotation
const MEMORY_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'memory');
const REFLECTION_LOG = path.join(MEMORY_DIR, 'reflection-log.jsonl');
const ARCHIVE_DIR = path.join(MEMORY_DIR, 'archive');
const REFLECTION_LOG_MAX_BYTES = 50 * 1024; // 50KB — reduced from 500KB to prevent spawn-prompt context overflow

/**
 * Safely read and parse a JSON file, returning defaults on error
 * @param {string} filePath - Path to JSON file
 * @param {object} defaults - Default object if file missing/malformed
 * @returns {object} Parsed JSON or defaults
 */
function safeReadJSON(filePath, defaults) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = safeParseJSON(content, null);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (_err) {
    // File missing or malformed JSON - return defaults
  }
  return defaults;
}

/**
 * Atomically write data to a file (tmp + rename)
 * @param {string} filePath - Target file path
 * @param {string} data - Data to write
 */
function atomicWrite(filePath, data) {
  const tmpFile = filePath + '.tmp';
  fs.writeFileSync(tmpFile, data, 'utf8');
  fs.renameSync(tmpFile, filePath);
}

/**
 * Main hook execution
 */
function main() {
  let input = '';

  try {
    // Ensure runtime directory exists
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });

    // Read current state from various session files
    const editCounter = safeReadJSON(EDIT_COUNTER_FILE, { count: 0 });
    const sessionMetrics = safeReadJSON(SESSION_METRICS_FILE, {
      corrections_count: 0,
      prompt_count: 0,
    });
    const driftState = safeReadJSON(DRIFT_STATE_FILE, {
      originalIntent: '',
      editCount: 0,
    });

    // Extract active files list from edit counter (files field added by post-tool-metrics)
    const activeFiles = Array.isArray(editCounter.files) ? editCounter.files : [];

    // Build snapshot
    const snapshot = {
      timestamp: new Date().toISOString(),
      editCount: editCounter.count || 0,
      correctionCount: sessionMetrics.corrections_count || 0,
      promptCount: sessionMetrics.prompt_count || 0,
      originalIntent: driftState.originalIntent || '',
      driftEditCount: driftState.editCount || 0,
      activeFiles,
    };

    // Atomic write
    atomicWrite(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2));

    // Rotate reflection-log.jsonl if over threshold
    try {
      if (fs.existsSync(REFLECTION_LOG)) {
        const stats = fs.statSync(REFLECTION_LOG);
        if (stats.size > REFLECTION_LOG_MAX_BYTES) {
          fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
          const lines = fs.readFileSync(REFLECTION_LOG, 'utf8').split('\n').filter(Boolean);
          const half = Math.ceil(lines.length / 2);
          const archiveLines = lines.slice(0, half);
          const keepLines = lines.slice(half);
          const dateStr = new Date().toISOString().slice(0, 10);
          const archivePath = path.join(ARCHIVE_DIR, `reflection-log-${dateStr}.jsonl`);
          fs.appendFileSync(archivePath, archiveLines.join('\n') + '\n');
          fs.writeFileSync(REFLECTION_LOG, keepLines.join('\n') + '\n');
          process.stderr.write(
            `[PreCompact] Rotated ${archiveLines.length} reflection-log entries to ${archivePath}\n`
          );
        }
      }
    } catch (rotateErr) {
      process.stderr.write(`[PreCompact] Reflection log rotation error: ${rotateErr.message}\n`);
    }

    // Log to stderr (non-blocking, informational)
    process.stderr.write(
      `[PreCompact] State snapshot saved: ${snapshot.editCount} edits, ${snapshot.correctionCount} corrections\n`
    );
  } catch (err) {
    // Fail-open: log error but don't block
    process.stderr.write(`[PreCompact] Error: ${err.message}\n`);
  }

  // Read and passthrough stdin (hook protocol compliance)
  try {
    input = fs.readFileSync(0, 'utf8');
  } catch (_err) {
    // stdin read failed - use empty object as fallback
    input = '{}';
  }

  // Passthrough original input to stdout (unchanged)
  process.stdout.write(input);

  // Always exit 0 (non-blocking)
  process.exit(0);
}

// Execute only when run directly (not when imported in tests)
if (require.main === module) {
  main();
}
