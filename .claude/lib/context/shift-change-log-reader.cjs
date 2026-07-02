const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../utils/safe-json.cjs');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');

const DEFAULT_RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
const DEFAULT_CLAIMING_STALE_MS = 5 * 60 * 1000;

// Supported schema versions (must match SCHEMA_VERSION in shift-change-log-writer.cjs)
// v1.0.0: Legacy string resumeInstructions format
// v2.0.0: Structured resumeInstructions format (objective, nextStep, openTasks, etc.)
const SUPPORTED_SCHEMA_VERSIONS = ['1.0.0', '2.0.0'];

function getClaimingStaleMs() {
  const value = Number(process.env.SHIFT_CHANGE_CLAIMING_STALE_MS);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_CLAIMING_STALE_MS;
}

function recoverStaleClaimingLog(runtimeDir = DEFAULT_RUNTIME_DIR, staleMs = getClaimingStaleMs()) {
  const logPath = path.join(runtimeDir, 'shift-change-log.json');
  if (fs.existsSync(logPath) || !fs.existsSync(runtimeDir)) return false;

  const now = Date.now();
  const candidates = fs
    .readdirSync(runtimeDir)
    .filter(file => /^shift-change-log\.claiming-.+\.json$/.test(file))
    .map(file => {
      const filePath = path.join(runtimeDir, file);
      try {
        const stats = fs.statSync(filePath);
        return { filePath, mtimeMs: stats.mtimeMs };
      } catch (_e) {
        return null;
      }
    })
    .filter(Boolean)
    .filter(candidate => now - candidate.mtimeMs >= staleMs)
    .sort((a, b) => a.mtimeMs - b.mtimeMs);

  for (const candidate of candidates) {
    try {
      fs.renameSync(candidate.filePath, logPath);
      return true;
    } catch (_e) {
      // Another process may have restored or claimed it first.
      if (fs.existsSync(logPath)) return true;
    }
  }

  return false;
}

function readHandoverLog(runtimeDir = DEFAULT_RUNTIME_DIR) {
  recoverStaleClaimingLog(runtimeDir);

  const logPath = path.join(runtimeDir, 'shift-change-log.json');

  if (!fs.existsSync(logPath)) {
    return null;
  }

  const content = fs.readFileSync(logPath, 'utf8');
  const log = safeParseJSON(content);

  if (!log) {
    return null;
  }

  if (log.status !== 'READY') {
    return null;
  }

  if (!log.schemaVersion) {
    return null;
  }

  // Reject log with unsupported schemaVersion (forward/backward compatibility guard)
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(log.schemaVersion)) {
    return null;
  }

  return log;
}

function claimHandoverLog(runtimeDir, sessionId) {
  const logPath = path.join(runtimeDir, 'shift-change-log.json');
  const claimingPath = path.join(
    runtimeDir,
    `shift-change-log.claiming-${sessionId || Date.now()}.json`
  );

  // Step 1: Atomic acquire via rename
  try {
    fs.renameSync(logPath, claimingPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // Log was already claimed by another session or doesn't exist
      return false;
    }
    console.warn(`[shift-change-log-reader] error locking log:`, error.message);
    return false;
  }

  // Step 2: Read, Validate, Update
  let success = false;
  try {
    const content = fs.readFileSync(claimingPath, 'utf8');
    const log = safeParseJSON(content);

    if (log && log.status === 'READY') {
      log.status = 'CLAIMED';
      // Write updated status back
      fs.writeFileSync(claimingPath, JSON.stringify(log, null, 2), 'utf8');

      // Step 3: Atomic commit via rename back to original
      fs.renameSync(claimingPath, logPath);
      success = true;
    } else {
      // If invalid or not READY, just rename it back
      fs.renameSync(claimingPath, logPath);
    }
  } catch (error) {
    console.warn(`[shift-change-log-reader] error processing claimed log:`, error.message);
    // Best-effort rollback
    if (fs.existsSync(claimingPath) && !fs.existsSync(logPath)) {
      try {
        fs.renameSync(claimingPath, logPath);
      } catch (_e) {
        /* ignore */
      }
    }
  }

  return success;
}

module.exports = {
  readHandoverLog,
  claimHandoverLog,
  recoverStaleClaimingLog,
};
