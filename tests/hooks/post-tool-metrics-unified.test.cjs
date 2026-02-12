'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const metricsHook = require('../../.claude/hooks/metrics/post-tool-metrics-unified.cjs');

function withEnv(envMap, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(envMap)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('recordPeriodicFindingsSnapshot records once then respects cooldown', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'post-tool-metrics-'));
  const snapshotState = path.join(tempRoot, 'findings-snapshot-state.json');

  try {
    metricsHook.setFindingsSnapshotStateFile(snapshotState);

    const first = withEnv({ FINDINGS_TREND_SNAPSHOT_INTERVAL_MS: 3600000 }, () =>
      metricsHook.recordPeriodicFindingsSnapshot()
    );
    assert.equal(first.recorded, true);

    const second = withEnv({ FINDINGS_TREND_SNAPSHOT_INTERVAL_MS: 3600000 }, () =>
      metricsHook.recordPeriodicFindingsSnapshot()
    );
    assert.equal(second.recorded, false);
    assert.equal(second.reason, 'cooldown');
  } finally {
    metricsHook.setFindingsSnapshotStateFile(
      path.join(process.cwd(), '.claude', 'context', 'runtime', 'findings-snapshot-state.json')
    );
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
