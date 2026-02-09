import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const HOOK_PATH = path.join(PROJECT_ROOT, '.claude', 'hooks', 'session', 'pre-compact.cjs');
const RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
const SNAPSHOT_FILE = path.join(RUNTIME_DIR, 'pre-compact-snapshot.json');

// Test source files
const EDIT_COUNTER_FILE = path.join(RUNTIME_DIR, 'edit-counter.json');
const SESSION_METRICS_FILE = path.join(RUNTIME_DIR, 'session-metrics.json');
const DRIFT_STATE_FILE = path.join(RUNTIME_DIR, 'drift-state.json');

describe('PreCompact Hook', () => {
  before(() => {
    // Ensure runtime dir exists
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  });

  after(() => {
    // Clean up test files
    [SNAPSHOT_FILE, EDIT_COUNTER_FILE, SESSION_METRICS_FILE, DRIFT_STATE_FILE].forEach(file => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    });
  });

  it('should create snapshot file with correct structure', () => {
    // Setup: Create source files
    fs.writeFileSync(EDIT_COUNTER_FILE, JSON.stringify({ count: 15 }));
    fs.writeFileSync(
      SESSION_METRICS_FILE,
      JSON.stringify({
        corrections_count: 3,
        prompt_count: 20,
      })
    );
    fs.writeFileSync(
      DRIFT_STATE_FILE,
      JSON.stringify({
        originalIntent: 'Fix auth bug',
        editCount: 8,
      })
    );

    // Run hook
    const result = spawnSync('node', [HOOK_PATH], {
      input: JSON.stringify({ tool: 'Test', args: {} }),
      encoding: 'utf8',
    });

    // Verify exit code
    assert.equal(result.status, 0, 'Hook should exit 0');

    // Verify snapshot file exists
    assert.ok(fs.existsSync(SNAPSHOT_FILE), 'Snapshot file should exist');

    // Verify snapshot structure
    const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'));
    assert.ok(snapshot.timestamp, 'Snapshot should have timestamp');
    assert.equal(snapshot.editCount, 15, 'Snapshot should have editCount from edit-counter');
    assert.equal(
      snapshot.correctionCount,
      3,
      'Snapshot should have correctionCount from session-metrics'
    );
    assert.equal(snapshot.promptCount, 20, 'Snapshot should have promptCount from session-metrics');
    assert.equal(
      snapshot.originalIntent,
      'Fix auth bug',
      'Snapshot should have originalIntent from drift-state'
    );
    assert.equal(
      snapshot.driftEditCount,
      8,
      'Snapshot should have driftEditCount from drift-state'
    );

    // Clean up source files
    fs.unlinkSync(EDIT_COUNTER_FILE);
    fs.unlinkSync(SESSION_METRICS_FILE);
    fs.unlinkSync(DRIFT_STATE_FILE);
  });

  it('should handle missing source files gracefully', () => {
    // Ensure no source files exist
    [EDIT_COUNTER_FILE, SESSION_METRICS_FILE, DRIFT_STATE_FILE].forEach(file => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    });

    // Run hook
    const result = spawnSync('node', [HOOK_PATH], {
      input: JSON.stringify({ tool: 'Test', args: {} }),
      encoding: 'utf8',
    });

    // Verify exit code (should not crash)
    assert.equal(result.status, 0, 'Hook should exit 0 even with missing files');

    // Verify snapshot file exists with defaults
    assert.ok(fs.existsSync(SNAPSHOT_FILE), 'Snapshot file should exist');

    const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'));
    assert.equal(snapshot.editCount, 0, 'Missing edit-counter should default to 0');
    assert.equal(snapshot.correctionCount, 0, 'Missing session-metrics should default to 0');
    assert.equal(snapshot.promptCount, 0, 'Missing prompt_count should default to 0');
    assert.equal(snapshot.originalIntent, '', 'Missing drift-state should default to empty string');
    assert.equal(snapshot.driftEditCount, 0, 'Missing driftEditCount should default to 0');
  });

  it('should overwrite existing snapshot (not append)', () => {
    // Create initial snapshot
    const initialSnapshot = {
      timestamp: '2020-01-01T00:00:00.000Z',
      editCount: 5,
      correctionCount: 1,
      promptCount: 10,
      originalIntent: 'Old intent',
      driftEditCount: 2,
    };
    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(initialSnapshot));

    // Create new source files
    fs.writeFileSync(EDIT_COUNTER_FILE, JSON.stringify({ count: 20 }));
    fs.writeFileSync(
      SESSION_METRICS_FILE,
      JSON.stringify({
        corrections_count: 5,
        prompt_count: 30,
      })
    );
    fs.writeFileSync(
      DRIFT_STATE_FILE,
      JSON.stringify({
        originalIntent: 'New intent',
        editCount: 12,
      })
    );

    // Run hook
    const result = spawnSync('node', [HOOK_PATH], {
      input: JSON.stringify({ tool: 'Test', args: {} }),
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);

    // Verify snapshot was overwritten
    const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'));
    assert.notEqual(snapshot.timestamp, '2020-01-01T00:00:00.000Z', 'Timestamp should be updated');
    assert.equal(snapshot.editCount, 20, 'Edit count should be overwritten');
    assert.equal(snapshot.correctionCount, 5, 'Correction count should be overwritten');
    assert.equal(snapshot.originalIntent, 'New intent', 'Intent should be overwritten');

    // Clean up
    fs.unlinkSync(EDIT_COUNTER_FILE);
    fs.unlinkSync(SESSION_METRICS_FILE);
    fs.unlinkSync(DRIFT_STATE_FILE);
  });

  it('should always exit 0 (non-blocking)', () => {
    // Test with valid input
    const result1 = spawnSync('node', [HOOK_PATH], {
      input: JSON.stringify({ tool: 'Test', args: {} }),
      encoding: 'utf8',
    });
    assert.equal(result1.status, 0, 'Should exit 0 with valid input');

    // Test with malformed input (should still exit 0)
    const result2 = spawnSync('node', [HOOK_PATH], {
      input: 'not json',
      encoding: 'utf8',
    });
    assert.equal(result2.status, 0, 'Should exit 0 even with malformed input');
  });

  it('should passthrough stdin to stdout', () => {
    const input = JSON.stringify({ tool: 'Test', args: { foo: 'bar' } });

    const result = spawnSync('node', [HOOK_PATH], {
      input: input,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), input, 'Should passthrough original input to stdout');
  });

  it('should handle malformed JSON in source files', () => {
    // Write malformed JSON to source files
    fs.writeFileSync(EDIT_COUNTER_FILE, 'not json');
    fs.writeFileSync(SESSION_METRICS_FILE, '{ invalid }');
    fs.writeFileSync(DRIFT_STATE_FILE, '{ "originalIntent": ');

    // Run hook
    const result = spawnSync('node', [HOOK_PATH], {
      input: JSON.stringify({ tool: 'Test', args: {} }),
      encoding: 'utf8',
    });

    // Should not crash
    assert.equal(result.status, 0, 'Should exit 0 even with malformed source files');

    // Should have defaults
    const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'));
    assert.equal(snapshot.editCount, 0, 'Should default to 0 with malformed edit-counter');
    assert.equal(snapshot.correctionCount, 0, 'Should default to 0 with malformed session-metrics');

    // Clean up
    fs.unlinkSync(EDIT_COUNTER_FILE);
    fs.unlinkSync(SESSION_METRICS_FILE);
    fs.unlinkSync(DRIFT_STATE_FILE);
  });

  it('should log to stderr (not stdout)', () => {
    // Create source files
    fs.writeFileSync(EDIT_COUNTER_FILE, JSON.stringify({ count: 10 }));
    fs.writeFileSync(
      SESSION_METRICS_FILE,
      JSON.stringify({
        corrections_count: 2,
        prompt_count: 15,
      })
    );

    const result = spawnSync('node', [HOOK_PATH], {
      input: JSON.stringify({ tool: 'Test', args: {} }),
      encoding: 'utf8',
    });

    // Verify stderr contains log message
    assert.ok(result.stderr.includes('[PreCompact]'), 'Should log to stderr');
    assert.ok(result.stderr.includes('10 edits'), 'Should include edit count in log');
    assert.ok(result.stderr.includes('2 corrections'), 'Should include correction count in log');

    // Clean up
    fs.unlinkSync(EDIT_COUNTER_FILE);
    fs.unlinkSync(SESSION_METRICS_FILE);
  });

  it('should use atomic writes (tmp + rename)', () => {
    // This test verifies atomic write by checking that tmp file is cleaned up
    fs.writeFileSync(EDIT_COUNTER_FILE, JSON.stringify({ count: 5 }));

    const result = spawnSync('node', [HOOK_PATH], {
      input: JSON.stringify({ tool: 'Test', args: {} }),
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);

    // Verify snapshot exists
    assert.ok(fs.existsSync(SNAPSHOT_FILE), 'Final snapshot should exist');

    // Verify tmp file is cleaned up
    const tmpFile = SNAPSHOT_FILE + '.tmp';
    assert.ok(!fs.existsSync(tmpFile), 'Tmp file should be cleaned up after atomic write');

    // Clean up
    fs.unlinkSync(EDIT_COUNTER_FILE);
  });
});
