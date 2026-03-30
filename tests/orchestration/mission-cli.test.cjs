'use strict';

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Module under test
const {
  startMission,
  getMissionStatus,
  pauseMission,
  resumeMission,
} = require('../../.claude/lib/orchestration/mission-cli.cjs');

describe('Mission CLI Entry Point', () => {
  let tempDir;
  let featuresPath;
  let missionPath;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mission-cli-test-'));
  });

  after(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Create a temp sub-directory per test to avoid collisions
    const testDir = fs.mkdtempSync(path.join(tempDir, 'test-'));
    featuresPath = path.join(testDir, 'features.json');
    missionPath = path.join(testDir, 'mission.md');

    // Write a minimal features.json
    const features = {
      features: [
        { id: 'feat-a', description: 'Feature A', status: 'pending', preconditions: [] },
        { id: 'feat-b', description: 'Feature B', status: 'pending', preconditions: ['feat-a'] },
        { id: 'feat-c', description: 'Feature C', status: 'pending', preconditions: [] },
      ],
    };
    fs.writeFileSync(featuresPath, JSON.stringify(features, null, 2), 'utf8');

    // Write a minimal mission.md
    fs.writeFileSync(missionPath, '# Test Mission\n\nA test mission.', 'utf8');
  });

  describe('startMission', () => {
    it('provisions workspace and returns missionId, workspacePath, state', () => {
      const result = startMission({
        featuresPath,
        missionPath,
        workingDirectory: tempDir,
      });

      assert.ok(result.missionId, 'Should return missionId');
      assert.ok(result.workspacePath, 'Should return workspacePath');
      assert.ok(result.state, 'Should return state object');
      assert.ok(typeof result.missionId === 'string', 'missionId should be a string');
      assert.ok(fs.existsSync(result.workspacePath), 'workspacePath should exist on disk');
    });

    it('creates handoffs/ subdirectory in workspace', () => {
      const result = startMission({
        featuresPath,
        missionPath,
        workingDirectory: tempDir,
      });

      const handoffsPath = path.join(result.workspacePath, 'handoffs');
      assert.ok(fs.existsSync(handoffsPath), 'handoffs/ subdirectory should exist');
      assert.ok(fs.statSync(handoffsPath).isDirectory(), 'handoffs/ should be a directory');
    });

    it('creates progress/ subdirectory in workspace', () => {
      const result = startMission({
        featuresPath,
        missionPath,
        workingDirectory: tempDir,
      });

      const progressPath = path.join(result.workspacePath, 'progress');
      assert.ok(fs.existsSync(progressPath), 'progress/ subdirectory should exist');
      assert.ok(fs.statSync(progressPath).isDirectory(), 'progress/ should be a directory');
    });

    it('copies features.json into workspace', () => {
      const result = startMission({
        featuresPath,
        missionPath,
        workingDirectory: tempDir,
      });

      const copiedFeaturesPath = path.join(result.workspacePath, 'features.json');
      assert.ok(fs.existsSync(copiedFeaturesPath), 'features.json should be copied into workspace');

      const original = JSON.parse(fs.readFileSync(featuresPath, 'utf8'));
      const copied = JSON.parse(fs.readFileSync(copiedFeaturesPath, 'utf8'));
      assert.deepEqual(copied, original, 'Copied features.json should match original');
    });

    it('creates state.json with running status', () => {
      const result = startMission({
        featuresPath,
        missionPath,
        workingDirectory: tempDir,
      });

      const statePath = path.join(result.workspacePath, 'state.json');
      assert.ok(fs.existsSync(statePath), 'state.json should exist in workspace');

      const stateContent = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      assert.strictEqual(stateContent.state, 'running', 'state should be "running"');
    });

    it('state.json contains correct missionId', () => {
      const result = startMission({
        featuresPath,
        missionPath,
        workingDirectory: tempDir,
      });

      const statePath = path.join(result.workspacePath, 'state.json');
      const stateContent = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      assert.strictEqual(stateContent.missionId, result.missionId, 'state.missionId should match');
    });

    it('state.json contains correct workingDirectory', () => {
      const result = startMission({
        featuresPath,
        missionPath,
        workingDirectory: tempDir,
      });

      const statePath = path.join(result.workspacePath, 'state.json');
      const stateContent = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      assert.strictEqual(
        stateContent.workingDirectory,
        tempDir,
        'state.workingDirectory should match'
      );
    });

    it('state.json contains empty workerSessionIds array', () => {
      const result = startMission({
        featuresPath,
        missionPath,
        workingDirectory: tempDir,
      });

      const statePath = path.join(result.workspacePath, 'state.json');
      const stateContent = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      assert.ok(Array.isArray(stateContent.workerSessionIds), 'workerSessionIds should be array');
      assert.strictEqual(
        stateContent.workerSessionIds.length,
        0,
        'workerSessionIds should be empty'
      );
    });

    it('state.json completedFeatures starts at 0', () => {
      const result = startMission({
        featuresPath,
        missionPath,
        workingDirectory: tempDir,
      });

      const statePath = path.join(result.workspacePath, 'state.json');
      const stateContent = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      assert.strictEqual(stateContent.completedFeatures, 0, 'completedFeatures should be 0');
    });

    it('state.json totalFeatures equals number of features in features.json', () => {
      const result = startMission({
        featuresPath,
        missionPath,
        workingDirectory: tempDir,
      });

      const statePath = path.join(result.workspacePath, 'state.json');
      const stateContent = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      assert.strictEqual(stateContent.totalFeatures, 3, 'totalFeatures should be 3');
    });

    it('returned state object matches state.json contents', () => {
      const result = startMission({
        featuresPath,
        missionPath,
        workingDirectory: tempDir,
      });

      const statePath = path.join(result.workspacePath, 'state.json');
      const stateContent = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      assert.deepEqual(result.state, stateContent, 'Returned state should match state.json');
    });

    it('generates unique missionId for each call', () => {
      const result1 = startMission({
        featuresPath,
        missionPath,
        workingDirectory: tempDir,
      });
      const result2 = startMission({
        featuresPath,
        missionPath,
        workingDirectory: tempDir,
      });

      assert.notStrictEqual(result1.missionId, result2.missionId, 'missionIds should be unique');
    });

    it('state.json written atomically (no .tmp file left behind)', () => {
      const result = startMission({
        featuresPath,
        missionPath,
        workingDirectory: tempDir,
      });

      const tmpPath = path.join(result.workspacePath, 'state.json.tmp');
      assert.ok(!fs.existsSync(tmpPath), 'No .tmp file should remain after atomic write');
    });
  });

  describe('getMissionStatus', () => {
    it('reads and returns state.json contents', () => {
      const result = startMission({
        featuresPath,
        missionPath,
        workingDirectory: tempDir,
      });

      const status = getMissionStatus(result.workspacePath);
      assert.strictEqual(status.missionId, result.missionId, 'Should return correct missionId');
      assert.strictEqual(status.state, 'running', 'Should return running state');
    });

    it('returns correct totalFeatures', () => {
      const result = startMission({
        featuresPath,
        missionPath,
        workingDirectory: tempDir,
      });

      const status = getMissionStatus(result.workspacePath);
      assert.strictEqual(status.totalFeatures, 3, 'totalFeatures should be 3');
    });

    it('reflects current state after pause', () => {
      const result = startMission({
        featuresPath,
        missionPath,
        workingDirectory: tempDir,
      });

      pauseMission(result.workspacePath);
      const status = getMissionStatus(result.workspacePath);
      assert.strictEqual(status.state, 'paused', 'State should be paused after pauseMission');
    });
  });

  describe('pauseMission', () => {
    it('sets state to paused', () => {
      const result = startMission({
        featuresPath,
        missionPath,
        workingDirectory: tempDir,
      });

      pauseMission(result.workspacePath);

      const statePath = path.join(result.workspacePath, 'state.json');
      const stateContent = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      assert.strictEqual(stateContent.state, 'paused', 'State should be paused');
    });

    it('preserves other fields when pausing', () => {
      const result = startMission({
        featuresPath,
        missionPath,
        workingDirectory: tempDir,
      });

      pauseMission(result.workspacePath);

      const statePath = path.join(result.workspacePath, 'state.json');
      const stateContent = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      assert.strictEqual(stateContent.missionId, result.missionId, 'missionId preserved');
      assert.strictEqual(stateContent.totalFeatures, 3, 'totalFeatures preserved');
      assert.strictEqual(stateContent.completedFeatures, 0, 'completedFeatures preserved');
    });

    it('writes atomically (no .tmp file left behind)', () => {
      const result = startMission({
        featuresPath,
        missionPath,
        workingDirectory: tempDir,
      });

      pauseMission(result.workspacePath);

      const tmpPath = path.join(result.workspacePath, 'state.json.tmp');
      assert.ok(!fs.existsSync(tmpPath), 'No .tmp file should remain');
    });
  });

  describe('resumeMission', () => {
    it('sets state back to running after pause', () => {
      const result = startMission({
        featuresPath,
        missionPath,
        workingDirectory: tempDir,
      });

      pauseMission(result.workspacePath);
      resumeMission(result.workspacePath);

      const statePath = path.join(result.workspacePath, 'state.json');
      const stateContent = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      assert.strictEqual(stateContent.state, 'running', 'State should be running after resume');
    });

    it('preserves other fields when resuming', () => {
      const result = startMission({
        featuresPath,
        missionPath,
        workingDirectory: tempDir,
      });

      pauseMission(result.workspacePath);
      resumeMission(result.workspacePath);

      const statePath = path.join(result.workspacePath, 'state.json');
      const stateContent = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      assert.strictEqual(stateContent.missionId, result.missionId, 'missionId preserved');
      assert.strictEqual(stateContent.totalFeatures, 3, 'totalFeatures preserved');
    });

    it('toggle: pause then resume cycles state correctly', () => {
      const result = startMission({
        featuresPath,
        missionPath,
        workingDirectory: tempDir,
      });

      // running -> paused -> running -> paused
      assert.strictEqual(getMissionStatus(result.workspacePath).state, 'running');
      pauseMission(result.workspacePath);
      assert.strictEqual(getMissionStatus(result.workspacePath).state, 'paused');
      resumeMission(result.workspacePath);
      assert.strictEqual(getMissionStatus(result.workspacePath).state, 'running');
      pauseMission(result.workspacePath);
      assert.strictEqual(getMissionStatus(result.workspacePath).state, 'paused');
    });

    it('writes atomically (no .tmp file left behind)', () => {
      const result = startMission({
        featuresPath,
        missionPath,
        workingDirectory: tempDir,
      });

      pauseMission(result.workspacePath);
      resumeMission(result.workspacePath);

      const tmpPath = path.join(result.workspacePath, 'state.json.tmp');
      assert.ok(!fs.existsSync(tmpPath), 'No .tmp file should remain');
    });
  });
});
