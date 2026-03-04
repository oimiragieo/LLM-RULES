'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const LIB_DIR = path.join(PROJECT_ROOT, '.claude', 'lib');

function libRequire(mod) {
  return require(path.join(LIB_DIR, mod));
}

const { safeParseJSON } = libRequire(path.join('utils', 'safe-json.cjs'));
const { atomicWriteJSONSync } = libRequire(path.join('utils', 'atomic-write.cjs'));
const findingsRegistry = libRequire(path.join('memory', 'findings-registry.cjs'));

let STATE_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'findings-snapshot-state.json'
);

function shouldRecordFindingsSnapshot(nowMs) {
  const intervalRaw = Number(process.env.FINDINGS_TREND_SNAPSHOT_INTERVAL_MS);
  const intervalMs = Number.isFinite(intervalRaw) && intervalRaw > 0 ? intervalRaw : 15 * 60 * 1000;
  try {
    if (!fs.existsSync(STATE_FILE)) return true;
    const payload = safeParseJSON(fs.readFileSync(STATE_FILE, 'utf8'), 'findings-snapshot-state');
    const lastRecordedMs = Number(payload?.lastRecordedMs || 0);
    if (!Number.isFinite(lastRecordedMs)) return true;
    return nowMs - lastRecordedMs >= intervalMs;
  } catch (_err) {
    return true;
  }
}

function recordPeriodicFindingsSnapshot() {
  const nowMs = Date.now();
  if (!shouldRecordFindingsSnapshot(nowMs)) return { recorded: false, reason: 'cooldown' };
  try {
    findingsRegistry.recordFindingsTrendSnapshot(PROJECT_ROOT, 'post-tool-metrics-unified');
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    atomicWriteJSONSync(STATE_FILE, {
      lastRecordedMs: nowMs,
      lastRecordedAt: new Date(nowMs).toISOString(),
    });
    return { recorded: true };
  } catch (err) {
    return { recorded: false, error: err?.message || String(err) };
  }
}

module.exports = {
  get FINDINGS_SNAPSHOT_STATE_FILE() {
    return STATE_FILE;
  },
  setFindingsSnapshotStateFile(f) {
    STATE_FILE = f;
  },
  shouldRecordFindingsSnapshot,
  recordPeriodicFindingsSnapshot,
};
