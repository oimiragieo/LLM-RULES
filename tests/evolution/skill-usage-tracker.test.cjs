'use strict';

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { SkillUsageTracker } = require('../../.claude/lib/evolution/skill-usage-tracker.cjs');

describe('SkillUsageTracker', () => {
  let rootTempDir;

  before(() => {
    rootTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-usage-tracker-test-'));
  });

  after(() => {
    if (fs.existsSync(rootTempDir)) {
      fs.rmSync(rootTempDir, { recursive: true, force: true });
    }
  });

  /**
   * Create a fresh isolated data directory and tracker for each test
   * so tests do not share JSONL state.
   */
  let testDir;
  let tracker;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(rootTempDir, 'test-'));
    tracker = new SkillUsageTracker(testDir);
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('VAL-SE-001: recordInvocation persists to JSONL', () => {
    it('appends a record to skill-usage.jsonl on each invocation', () => {
      const dataFile = path.join(testDir, 'skill-usage.jsonl');
      tracker.recordInvocation('test-skill', { success: true, durationMs: 100 });

      assert.ok(fs.existsSync(dataFile), 'JSONL file should be created');
      const lines = fs.readFileSync(dataFile, 'utf8').trim().split('\n');
      assert.equal(lines.length, 1);

      const record = JSON.parse(lines[0]);
      assert.equal(record.skillName, 'test-skill');
      assert.equal(record.success, true);
      assert.equal(record.durationMs, 100);
      assert.ok(record.timestamp, 'should have a timestamp');
    });

    it('appends multiple records without overwriting', () => {
      const dataFile = path.join(testDir, 'skill-usage.jsonl');
      tracker.recordInvocation('skill-a', { success: true, durationMs: 50 });
      tracker.recordInvocation('skill-a', { success: false, durationMs: 200 });
      tracker.recordInvocation('skill-b', { success: true, durationMs: 75 });

      const lines = fs.readFileSync(dataFile, 'utf8').trim().split('\n');
      assert.equal(lines.length, 3);

      const records = lines.map(l => JSON.parse(l));
      assert.equal(records[0].skillName, 'skill-a');
      assert.equal(records[1].skillName, 'skill-a');
      assert.equal(records[2].skillName, 'skill-b');
    });

    it('records contain required fields: skillName, success, durationMs, timestamp', () => {
      tracker.recordInvocation('my-skill', { success: false, durationMs: 300 });
      const dataFile = path.join(testDir, 'skill-usage.jsonl');
      const lines = fs.readFileSync(dataFile, 'utf8').trim().split('\n');
      assert.equal(lines.length, 1);
      const record = JSON.parse(lines[0]);

      assert.ok('skillName' in record);
      assert.ok('success' in record);
      assert.ok('durationMs' in record);
      assert.ok('timestamp' in record);
      assert.equal(record.skillName, 'my-skill');
      assert.equal(record.success, false);
      assert.equal(record.durationMs, 300);
    });

    it('creates the dataDir if it does not exist', () => {
      const nestedDir = path.join(testDir, 'nested', 'subdir');
      const nestedTracker = new SkillUsageTracker(nestedDir);
      nestedTracker.recordInvocation('skill-x', { success: true, durationMs: 10 });
      assert.ok(fs.existsSync(path.join(nestedDir, 'skill-usage.jsonl')));
    });
  });

  describe('VAL-SE-001: getUsageStats returns correct aggregates', () => {
    it('returns zero-value stats for unknown skill (empty data)', () => {
      const stats = tracker.getUsageStats('nonexistent-skill');
      assert.equal(stats.invocations, 0);
      assert.equal(stats.successRate, 0);
      assert.equal(stats.avgDurationMs, 0);
      assert.equal(stats.lastUsed, null);
    });

    it('returns correct invocations count', () => {
      tracker.recordInvocation('skill-a', { success: true, durationMs: 100 });
      tracker.recordInvocation('skill-a', { success: true, durationMs: 200 });
      tracker.recordInvocation('skill-a', { success: false, durationMs: 150 });

      const stats = tracker.getUsageStats('skill-a');
      assert.equal(stats.invocations, 3);
    });

    it('returns correct successRate', () => {
      tracker.recordInvocation('skill-a', { success: true, durationMs: 100 });
      tracker.recordInvocation('skill-a', { success: true, durationMs: 200 });
      tracker.recordInvocation('skill-a', { success: false, durationMs: 150 });

      const stats = tracker.getUsageStats('skill-a');
      assert.ok(Math.abs(stats.successRate - 2 / 3) < 0.0001);
    });

    it('returns correct avgDurationMs', () => {
      tracker.recordInvocation('skill-a', { success: true, durationMs: 100 });
      tracker.recordInvocation('skill-a', { success: true, durationMs: 200 });
      tracker.recordInvocation('skill-a', { success: false, durationMs: 300 });

      const stats = tracker.getUsageStats('skill-a');
      assert.equal(stats.avgDurationMs, 200);
    });

    it('returns lastUsed as the most recent timestamp', () => {
      const before = new Date(Date.now() - 1000).toISOString();
      tracker.recordInvocation('skill-a', { success: true, durationMs: 100 });
      const after = new Date(Date.now() + 1000).toISOString();

      const stats = tracker.getUsageStats('skill-a');
      assert.ok(stats.lastUsed >= before && stats.lastUsed <= after, 'lastUsed should be recent');
    });

    it('only counts stats for the requested skill', () => {
      tracker.recordInvocation('skill-a', { success: true, durationMs: 100 });
      tracker.recordInvocation('skill-a', { success: true, durationMs: 200 });
      tracker.recordInvocation('skill-b', { success: false, durationMs: 500 });

      const statsA = tracker.getUsageStats('skill-a');
      assert.equal(statsA.invocations, 2);
      assert.equal(statsA.successRate, 1);

      const statsB = tracker.getUsageStats('skill-b');
      assert.equal(statsB.invocations, 1);
      assert.equal(statsB.successRate, 0);
    });
  });

  describe('VAL-SE-002: getTopSkills returns sorted by invocation count', () => {
    it('returns top n skills sorted by invocation count descending', () => {
      tracker.recordInvocation('skill-c', { success: true, durationMs: 10 });
      tracker.recordInvocation('skill-a', { success: true, durationMs: 10 });
      tracker.recordInvocation('skill-a', { success: true, durationMs: 10 });
      tracker.recordInvocation('skill-a', { success: true, durationMs: 10 });
      tracker.recordInvocation('skill-b', { success: true, durationMs: 10 });
      tracker.recordInvocation('skill-b', { success: true, durationMs: 10 });

      const top2 = tracker.getTopSkills(2);
      assert.equal(top2.length, 2);
      assert.equal(top2[0].skillName, 'skill-a');
      assert.equal(top2[0].invocations, 3);
      assert.equal(top2[1].skillName, 'skill-b');
      assert.equal(top2[1].invocations, 2);
    });

    it('returns all skills if n is larger than number of tracked skills', () => {
      tracker.recordInvocation('only-skill', { success: true, durationMs: 10 });
      const top = tracker.getTopSkills(10);
      assert.equal(top.length, 1);
    });

    it('returns empty array when no data', () => {
      const top = tracker.getTopSkills(5);
      assert.equal(top.length, 0);
    });

    it('each entry has skillName and invocations fields', () => {
      tracker.recordInvocation('skill-x', { success: true, durationMs: 10 });
      const top = tracker.getTopSkills(1);
      assert.ok('skillName' in top[0]);
      assert.ok('invocations' in top[0]);
    });
  });

  describe('VAL-SE-002: getFailingSkills filters below threshold', () => {
    it('returns skills whose successRate is below the given threshold', () => {
      tracker.recordInvocation('bad-skill', { success: false, durationMs: 100 });
      tracker.recordInvocation('bad-skill', { success: false, durationMs: 100 });
      tracker.recordInvocation('bad-skill', { success: true, durationMs: 100 });
      // successRate = 1/3 ~ 0.333

      tracker.recordInvocation('good-skill', { success: true, durationMs: 100 });
      tracker.recordInvocation('good-skill', { success: true, durationMs: 100 });
      // successRate = 1.0

      const failing = tracker.getFailingSkills(0.5);
      const names = failing.map(s => s.skillName);
      assert.ok(names.includes('bad-skill'), 'bad-skill should be failing');
      assert.ok(!names.includes('good-skill'), 'good-skill should not be failing');
    });

    it('returns empty array when no skills are below threshold', () => {
      tracker.recordInvocation('good-skill', { success: true, durationMs: 100 });
      const failing = tracker.getFailingSkills(0.5);
      assert.equal(failing.length, 0);
    });

    it('returns empty array when no data', () => {
      const failing = tracker.getFailingSkills(0.5);
      assert.equal(failing.length, 0);
    });

    it('each entry has skillName and successRate fields', () => {
      tracker.recordInvocation('failing', { success: false, durationMs: 100 });
      const failing = tracker.getFailingSkills(0.5);
      assert.equal(failing.length, 1);
      assert.ok('skillName' in failing[0]);
      assert.ok('successRate' in failing[0]);
    });
  });

  describe('VAL-SE-002: getAllStats returns complete stats map', () => {
    it('returns a map with all tracked skills', () => {
      tracker.recordInvocation('skill-a', { success: true, durationMs: 100 });
      tracker.recordInvocation('skill-b', { success: false, durationMs: 200 });

      const all = tracker.getAllStats();
      assert.ok('skill-a' in all);
      assert.ok('skill-b' in all);
      assert.equal(all['skill-a'].invocations, 1);
      assert.equal(all['skill-b'].invocations, 1);
    });

    it('returns empty object when no data', () => {
      const all = tracker.getAllStats();
      assert.deepEqual(all, {});
    });

    it('returned stats match getUsageStats for each skill', () => {
      tracker.recordInvocation('skill-a', { success: true, durationMs: 100 });
      tracker.recordInvocation('skill-a', { success: false, durationMs: 300 });

      const all = tracker.getAllStats();
      const individual = tracker.getUsageStats('skill-a');

      assert.equal(all['skill-a'].invocations, individual.invocations);
      assert.equal(all['skill-a'].successRate, individual.successRate);
      assert.equal(all['skill-a'].avgDurationMs, individual.avgDurationMs);
    });
  });

  describe('JSONL append-only behavior', () => {
    it('does not rewrite existing data when appending new records', () => {
      const dataFile = path.join(testDir, 'skill-usage.jsonl');
      tracker.recordInvocation('skill-a', { success: true, durationMs: 100 });
      const after1 = fs.readFileSync(dataFile, 'utf8');

      tracker.recordInvocation('skill-b', { success: false, durationMs: 200 });
      const after2 = fs.readFileSync(dataFile, 'utf8');

      assert.ok(after2.startsWith(after1), 'second write should append, not overwrite');
    });
  });
});
