const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../utils/safe-json.cjs');

function readHandoverLog(runtimeDir = path.join(process.cwd(), '.claude/context/runtime')) {
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
};
