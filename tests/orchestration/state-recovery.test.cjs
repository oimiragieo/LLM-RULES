'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Module under test
const { saveState, recoverState } = require('../../.claude/lib/orchestration/state-recovery.cjs');

describe('State Recovery', () => {
  let tempDir;
  let workspacePath;
  let featuresPath;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-recovery-test-'));
  });

  after(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Create a fresh workspace per test to avoid collisions
    workspacePath = fs.mkdtempSync(path.join(tempDir, 'ws-'));
    featuresPath = path.join(workspacePath, 'features.json');
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Write a features.json with the given feature objects */
  function writeFeatures(features) {
    fs.writeFileSync(featuresPath, JSON.stringify({ features }, null, 2), 'utf8');
  }

  /** Write a state.json with the given state object */
  function writeState(state) {
    const statePath = path.join(workspacePath, 'state.json');
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
  }

  /** Read state.json from the workspace */
  function readState() {
    const statePath = path.join(workspacePath, 'state.json');
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  }

  /** Read features.json from the workspace */
  function readFeatures() {
    return JSON.parse(fs.readFileSync(featuresPath, 'utf8')).features;
  }

  // ---------------------------------------------------------------------------
  // saveState
  // ---------------------------------------------------------------------------

  describe('saveState', () => {
    it('creates state.json if it does not exist', () => {
      const statePath = path.join(workspacePath, 'state.json');
      assert.ok(!fs.existsSync(statePath), 'state.json should not exist before saveState');

      saveState(workspacePath, { state: 'running', completedFeatures: 0 });

      assert.ok(fs.existsSync(statePath), 'state.json should be created by saveState');
    });

    it('writes stateUpdate fields to state.json', () => {
      saveState(workspacePath, { state: 'running', missionId: 'test-123', completedFeatures: 0 });

      const written = readState();
      assert.strictEqual(written.state, 'running', 'state field written correctly');
      assert.strictEqual(written.missionId, 'test-123', 'missionId field written correctly');
      assert.strictEqual(written.completedFeatures, 0, 'completedFeatures field written correctly');
    });

    it('merges stateUpdate into existing state without losing unmentioned fields', () => {
      writeState({
        missionId: 'abc',
        state: 'running',
        totalFeatures: 5,
        completedFeatures: 0,
        workerSessionIds: [],
      });

      saveState(workspacePath, { completedFeatures: 3 });

      const updated = readState();
      assert.strictEqual(updated.missionId, 'abc', 'missionId preserved from existing state');
      assert.strictEqual(updated.totalFeatures, 5, 'totalFeatures preserved');
      assert.strictEqual(updated.state, 'running', 'state preserved');
      assert.strictEqual(updated.completedFeatures, 3, 'completedFeatures updated by stateUpdate');
    });

    it('overwrites conflicting fields with stateUpdate values', () => {
      writeState({ state: 'running', completedFeatures: 0 });

      saveState(workspacePath, { state: 'paused' });

      const updated = readState();
      assert.strictEqual(updated.state, 'paused', 'state field overwritten by stateUpdate');
    });

    it('returns the updated state object', () => {
      const result = saveState(workspacePath, { state: 'running', completedFeatures: 2 });

      assert.ok(result, 'saveState should return the updated state');
      assert.strictEqual(result.state, 'running', 'returned state has correct state field');
      assert.strictEqual(
        result.completedFeatures,
        2,
        'returned state has correct completedFeatures'
      );
    });

    it('written state.json matches returned state', () => {
      const result = saveState(workspacePath, { missionId: 'xyz', state: 'running' });

      const onDisk = readState();
      assert.deepEqual(result, onDisk, 'returned state should match what was written to disk');
    });

    it('writes atomically - no .tmp file left behind', () => {
      saveState(workspacePath, { state: 'running' });

      const tmpPath = path.join(workspacePath, 'state.json.tmp');
      assert.ok(!fs.existsSync(tmpPath), 'No .tmp file should remain after saveState');
    });

    it('successive saveState calls accumulate changes correctly', () => {
      saveState(workspacePath, { missionId: 'abc', state: 'running', totalFeatures: 5 });
      saveState(workspacePath, { completedFeatures: 1 });
      saveState(workspacePath, { completedFeatures: 2 });

      const final = readState();
      assert.strictEqual(final.missionId, 'abc', 'missionId preserved across multiple saves');
      assert.strictEqual(final.state, 'running', 'state preserved');
      assert.strictEqual(final.totalFeatures, 5, 'totalFeatures preserved');
      assert.strictEqual(final.completedFeatures, 2, 'completedFeatures reflects latest save');
    });
  });

  // ---------------------------------------------------------------------------
  // recoverState
  // ---------------------------------------------------------------------------

  describe('recoverState', () => {
    it('loads existing state.json correctly', () => {
      writeState({ missionId: 'abc', state: 'running', completedFeatures: 1, totalFeatures: 3 });
      writeFeatures([
        { id: 'f1', description: 'F1', status: 'completed' },
        { id: 'f2', description: 'F2', status: 'pending' },
        { id: 'f3', description: 'F3', status: 'pending' },
      ]);

      const recovered = recoverState(workspacePath);

      assert.strictEqual(recovered.missionId, 'abc', 'missionId loaded from state.json');
      assert.strictEqual(recovered.state, 'running', 'state loaded from state.json');
    });

    it('transitions in_progress features to pending for re-dispatch', () => {
      writeState({ missionId: 'abc', state: 'running', completedFeatures: 0, totalFeatures: 3 });
      writeFeatures([
        { id: 'f1', description: 'F1', status: 'pending' },
        { id: 'f2', description: 'F2', status: 'in_progress' },
        { id: 'f3', description: 'F3', status: 'pending' },
      ]);

      recoverState(workspacePath);

      const features = readFeatures();
      const f2 = features.find(f => f.id === 'f2');
      assert.strictEqual(
        f2.status,
        'pending',
        'in_progress feature should be recovered to pending'
      );
    });

    it('does not re-dispatch completed features', () => {
      writeState({ missionId: 'abc', state: 'running', completedFeatures: 1, totalFeatures: 3 });
      writeFeatures([
        { id: 'f1', description: 'F1', status: 'completed' },
        { id: 'f2', description: 'F2', status: 'in_progress' },
        { id: 'f3', description: 'F3', status: 'pending' },
      ]);

      recoverState(workspacePath);

      const features = readFeatures();
      const f1 = features.find(f => f.id === 'f1');
      assert.strictEqual(f1.status, 'completed', 'Completed feature should remain completed');
    });

    it('updates completedFeatures count accurately in state.json', () => {
      // Start with stale completedFeatures value
      writeState({ missionId: 'abc', state: 'running', completedFeatures: 99, totalFeatures: 4 });
      writeFeatures([
        { id: 'f1', description: 'F1', status: 'completed' },
        { id: 'f2', description: 'F2', status: 'completed' },
        { id: 'f3', description: 'F3', status: 'in_progress' },
        { id: 'f4', description: 'F4', status: 'pending' },
      ]);

      const recovered = recoverState(workspacePath);

      // f1 + f2 completed, f3 recovered to pending, f4 stays pending
      assert.strictEqual(recovered.completedFeatures, 2, 'completedFeatures should be 2');
    });

    it('persists updated completedFeatures to disk', () => {
      writeState({ missionId: 'abc', state: 'running', completedFeatures: 0, totalFeatures: 2 });
      writeFeatures([
        { id: 'f1', description: 'F1', status: 'completed' },
        { id: 'f2', description: 'F2', status: 'in_progress' },
      ]);

      recoverState(workspacePath);

      const onDisk = readState();
      assert.strictEqual(
        onDisk.completedFeatures,
        1,
        'Recovered completedFeatures persisted to state.json'
      );
    });

    it('handles multiple orphaned in_progress features', () => {
      writeState({ missionId: 'abc', state: 'running', completedFeatures: 0, totalFeatures: 3 });
      writeFeatures([
        { id: 'f1', description: 'F1', status: 'in_progress' },
        { id: 'f2', description: 'F2', status: 'in_progress' },
        { id: 'f3', description: 'F3', status: 'in_progress' },
      ]);

      recoverState(workspacePath);

      const features = readFeatures();
      for (const feature of features) {
        assert.strictEqual(
          feature.status,
          'pending',
          `Feature ${feature.id} should be recovered to pending`
        );
      }
    });

    it('handles no orphaned features gracefully (all pending)', () => {
      writeState({ missionId: 'abc', state: 'running', completedFeatures: 0, totalFeatures: 2 });
      writeFeatures([
        { id: 'f1', description: 'F1', status: 'pending' },
        { id: 'f2', description: 'F2', status: 'pending' },
      ]);

      const recovered = recoverState(workspacePath);

      assert.ok(recovered, 'Should return state even when no orphaned features');
      assert.strictEqual(recovered.completedFeatures, 0, 'completedFeatures should be 0');

      const features = readFeatures();
      assert.ok(
        features.every(f => f.status === 'pending'),
        'All pending features remain pending'
      );
    });

    it('handles all features completed gracefully', () => {
      writeState({ missionId: 'abc', state: 'running', completedFeatures: 2, totalFeatures: 2 });
      writeFeatures([
        { id: 'f1', description: 'F1', status: 'completed' },
        { id: 'f2', description: 'F2', status: 'completed' },
      ]);

      const recovered = recoverState(workspacePath);

      assert.strictEqual(recovered.completedFeatures, 2, 'completedFeatures stays 2');
    });

    it('increments retryCount through the in_progress -> failed transition', () => {
      writeState({ missionId: 'abc', state: 'running', completedFeatures: 0, totalFeatures: 2 });
      writeFeatures([
        { id: 'f1', description: 'F1', status: 'in_progress', retryCount: 0 },
        { id: 'f2', description: 'F2', status: 'pending' },
      ]);

      recoverState(workspacePath);

      const features = readFeatures();
      const f1 = features.find(f => f.id === 'f1');
      assert.strictEqual(f1.status, 'pending', 'f1 should be pending after recovery');
      assert.strictEqual(
        f1.retryCount,
        1,
        'retryCount should be incremented by the failed transition'
      );
    });

    it('returns the fully recovered state object', () => {
      writeState({ missionId: 'test', state: 'running', completedFeatures: 0, totalFeatures: 3 });
      writeFeatures([
        { id: 'f1', description: 'F1', status: 'completed' },
        { id: 'f2', description: 'F2', status: 'in_progress' },
        { id: 'f3', description: 'F3', status: 'pending' },
      ]);

      const recovered = recoverState(workspacePath);

      assert.ok(recovered.missionId, 'returned state has missionId');
      assert.strictEqual(
        recovered.completedFeatures,
        1,
        'returned state has correct completedFeatures'
      );
      assert.strictEqual(recovered.state, 'running', 'returned state preserves state field');
    });

    it('throws if state.json does not exist', () => {
      // No state.json written to workspace
      assert.throws(
        () => recoverState(workspacePath),
        err => {
          assert.ok(err instanceof Error, 'Should throw an Error');
          return true;
        },
        'Should throw when state.json is missing'
      );
    });

    it('works when features.json does not exist in workspace', () => {
      // Only state.json exists, no features.json
      writeState({
        missionId: 'abc',
        state: 'running',
        completedFeatures: 0,
        totalFeatures: 0,
      });
      // Don't write features.json

      const recovered = recoverState(workspacePath);

      assert.ok(recovered, 'Should return state even without features.json');
      assert.strictEqual(recovered.missionId, 'abc', 'missionId correct');
    });

    it('no .tmp file left behind after recoverState', () => {
      writeState({ missionId: 'abc', state: 'running', completedFeatures: 0, totalFeatures: 1 });
      writeFeatures([{ id: 'f1', description: 'F1', status: 'in_progress' }]);

      recoverState(workspacePath);

      const tmpPath = path.join(workspacePath, 'state.json.tmp');
      assert.ok(!fs.existsSync(tmpPath), 'No .tmp file should remain after recoverState');
    });
  });
});
