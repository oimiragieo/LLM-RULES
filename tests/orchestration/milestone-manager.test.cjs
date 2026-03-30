'use strict';

/**
 * Tests for Milestone Manager
 *
 * Covers expected behaviors:
 * - checkMilestoneCompletion evaluates MilestoneGate and returns {passed, blocking}
 * - When gate passes, next milestone is unlocked in milestone-state.json
 * - When gate fails, no unlock occurs
 * - isMilestoneUnlocked returns true for first milestone always
 * - isMilestoneUnlocked returns false for subsequent milestones until unlocked
 * - Progress logger appends valid JSONL lines
 * - All event types have timestamp and relevant IDs
 * - Mission_completed event when all milestones pass
 * - milestone_gated event logged when gate passes
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  createMilestoneManager,
  createProgressLogger,
} = require('../../.claude/lib/orchestration/milestone-manager.cjs');

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Write features.json with multiple milestones to a directory.
 * @param {string} dir
 * @param {object[]} features
 * @returns {string} featuresPath
 */
function writeFeatures(dir, features) {
  const featuresPath = path.join(dir, 'features.json');
  fs.writeFileSync(featuresPath, JSON.stringify({ features }, null, 2), 'utf8');
  return featuresPath;
}

/**
 * Read all JSONL lines from a file.
 * @param {string} filePath
 * @returns {object[]}
 */
function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf8').trim();
  if (!content) return [];
  return content
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
}

/**
 * Read milestone-state.json from workspace.
 * @param {string} workspacePath
 * @returns {object|null}
 */
function readMilestoneState(workspacePath) {
  const statePath = path.join(workspacePath, 'milestone-state.json');
  if (!fs.existsSync(statePath)) return null;
  return JSON.parse(fs.readFileSync(statePath, 'utf8'));
}

// ---------------------------------------------------------------------------
// Shared fixtures: features with two milestones
// ---------------------------------------------------------------------------

const MILESTONE_A = 'alpha';
const MILESTONE_B = 'beta';
const MILESTONE_C = 'gamma';

/** Features where milestone-alpha is fully completed */
const ALPHA_COMPLETED_FEATURES = [
  {
    id: 'a1',
    description: 'Alpha 1',
    status: 'completed',
    milestone: MILESTONE_A,
    preconditions: [],
  },
  {
    id: 'a2',
    description: 'Alpha 2',
    status: 'completed',
    milestone: MILESTONE_A,
    preconditions: [],
  },
  { id: 'b1', description: 'Beta 1', status: 'pending', milestone: MILESTONE_B, preconditions: [] },
  { id: 'b2', description: 'Beta 2', status: 'pending', milestone: MILESTONE_B, preconditions: [] },
];

/** Features where milestone-alpha has one pending feature (blocking) */
const ALPHA_INCOMPLETE_FEATURES = [
  {
    id: 'a1',
    description: 'Alpha 1',
    status: 'completed',
    milestone: MILESTONE_A,
    preconditions: [],
  },
  {
    id: 'a2',
    description: 'Alpha 2',
    status: 'pending',
    milestone: MILESTONE_A,
    preconditions: [],
  },
  { id: 'b1', description: 'Beta 1', status: 'pending', milestone: MILESTONE_B, preconditions: [] },
];

/** Features spanning three milestones for mission_completed tests */
const THREE_MILESTONE_FEATURES = [
  {
    id: 'a1',
    description: 'Alpha 1',
    status: 'completed',
    milestone: MILESTONE_A,
    preconditions: [],
  },
  {
    id: 'b1',
    description: 'Beta 1',
    status: 'completed',
    milestone: MILESTONE_B,
    preconditions: [],
  },
  {
    id: 'c1',
    description: 'Gamma 1',
    status: 'completed',
    milestone: MILESTONE_C,
    preconditions: [],
  },
];

// ---------------------------------------------------------------------------
// Describe: createMilestoneManager
// ---------------------------------------------------------------------------

describe('MilestoneManager', () => {
  let tempDir;
  let workspacePath;
  let featuresPath;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'milestone-mgr-test-'));
  });

  after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors on Windows (EBUSY)
    }
  });

  beforeEach(() => {
    // Create a fresh workspace sub-directory per test
    workspacePath = fs.mkdtempSync(path.join(tempDir, 'ws-'));
    // Create progress subdirectory (as mission-cli does)
    fs.mkdirSync(path.join(workspacePath, 'progress'), { recursive: true });
    featuresPath = writeFeatures(workspacePath, ALPHA_COMPLETED_FEATURES);
  });

  // -------------------------------------------------------------------------
  // createMilestoneManager factory
  // -------------------------------------------------------------------------

  describe('createMilestoneManager', () => {
    it('returns an object with checkMilestoneCompletion and isMilestoneUnlocked methods', () => {
      const manager = createMilestoneManager({ workspacePath, featuresPath });
      assert.ok(manager, 'Should return a manager object');
      assert.strictEqual(typeof manager.checkMilestoneCompletion, 'function');
      assert.strictEqual(typeof manager.isMilestoneUnlocked, 'function');
    });
  });

  // -------------------------------------------------------------------------
  // checkMilestoneCompletion — passing gate
  // -------------------------------------------------------------------------

  describe('checkMilestoneCompletion — gate passes', () => {
    it('returns {passed: true, blocking: []} when all milestone features are completed', async () => {
      const manager = createMilestoneManager({ workspacePath, featuresPath });
      const result = await manager.checkMilestoneCompletion(MILESTONE_A);
      assert.strictEqual(result.passed, true, 'Should pass when all features completed');
      assert.ok(Array.isArray(result.blocking), 'blocking should be an array');
      assert.strictEqual(result.blocking.length, 0, 'blocking should be empty when passed');
    });

    it('writes milestone-state.json with passed milestone when gate passes', async () => {
      const manager = createMilestoneManager({ workspacePath, featuresPath });
      await manager.checkMilestoneCompletion(MILESTONE_A);

      const state = readMilestoneState(workspacePath);
      assert.ok(state, 'milestone-state.json should exist after passing gate');
      assert.ok(Array.isArray(state.passedMilestones), 'passedMilestones should be an array');
      assert.ok(
        state.passedMilestones.includes(MILESTONE_A),
        `passedMilestones should include ${MILESTONE_A}`
      );
    });

    it('unlocks next milestone in milestone-state.json when gate passes', async () => {
      const manager = createMilestoneManager({ workspacePath, featuresPath });
      await manager.checkMilestoneCompletion(MILESTONE_A);

      const state = readMilestoneState(workspacePath);
      assert.ok(Array.isArray(state.unlockedMilestones), 'unlockedMilestones should be an array');
      assert.ok(
        state.unlockedMilestones.includes(MILESTONE_B),
        `unlockedMilestones should include ${MILESTONE_B} after ${MILESTONE_A} passes`
      );
    });

    it('logs a milestone_gated event to the progress log when gate passes', async () => {
      const manager = createMilestoneManager({ workspacePath, featuresPath });
      await manager.checkMilestoneCompletion(MILESTONE_A);

      const logPath = path.join(workspacePath, 'progress', 'progress_log.jsonl');
      const lines = readJsonl(logPath);
      const gatedEvent = lines.find(l => l.event === 'milestone_gated');
      assert.ok(gatedEvent, 'Should log a milestone_gated event');
      assert.ok(gatedEvent.timestamp, 'milestone_gated event should have a timestamp');
      assert.strictEqual(
        gatedEvent.milestone,
        MILESTONE_A,
        'milestone_gated event should reference the milestone'
      );
    });

    it('logs a mission_completed event when the last milestone passes', async () => {
      // Use single-milestone features so alpha is the last milestone
      const singleMilestoneFeatures = [
        {
          id: 'a1',
          description: 'Alpha 1',
          status: 'completed',
          milestone: MILESTONE_A,
          preconditions: [],
        },
      ];
      const fp = writeFeatures(workspacePath, singleMilestoneFeatures);
      const manager = createMilestoneManager({ workspacePath, featuresPath: fp });
      await manager.checkMilestoneCompletion(MILESTONE_A);

      const logPath = path.join(workspacePath, 'progress', 'progress_log.jsonl');
      const lines = readJsonl(logPath);
      const completedEvent = lines.find(l => l.event === 'mission_completed');
      assert.ok(completedEvent, 'Should log a mission_completed event when last milestone passes');
      assert.ok(completedEvent.timestamp, 'mission_completed event should have a timestamp');
    });

    it('does NOT log mission_completed when a non-last milestone passes', async () => {
      const manager = createMilestoneManager({ workspacePath, featuresPath });
      await manager.checkMilestoneCompletion(MILESTONE_A);

      const logPath = path.join(workspacePath, 'progress', 'progress_log.jsonl');
      const lines = readJsonl(logPath);
      const completedEvent = lines.find(l => l.event === 'mission_completed');
      assert.strictEqual(
        completedEvent,
        undefined,
        'Should NOT log mission_completed when non-last milestone passes'
      );
    });
  });

  // -------------------------------------------------------------------------
  // checkMilestoneCompletion — failing gate
  // -------------------------------------------------------------------------

  describe('checkMilestoneCompletion — gate fails', () => {
    it('returns {passed: false, blocking: [...]} when milestone has incomplete features', async () => {
      const fp = writeFeatures(workspacePath, ALPHA_INCOMPLETE_FEATURES);
      const manager = createMilestoneManager({ workspacePath, featuresPath: fp });
      const result = await manager.checkMilestoneCompletion(MILESTONE_A);
      assert.strictEqual(result.passed, false, 'Should fail when features are incomplete');
      assert.ok(Array.isArray(result.blocking), 'blocking should be an array');
      assert.ok(result.blocking.length > 0, 'blocking should be non-empty when gate fails');
    });

    it('does not write or update milestone-state.json when gate fails', async () => {
      const fp = writeFeatures(workspacePath, ALPHA_INCOMPLETE_FEATURES);
      const manager = createMilestoneManager({ workspacePath, featuresPath: fp });
      await manager.checkMilestoneCompletion(MILESTONE_A);

      const state = readMilestoneState(workspacePath);
      if (state) {
        // If state exists, the failing milestone should NOT be in passedMilestones
        assert.ok(
          !state.passedMilestones || !state.passedMilestones.includes(MILESTONE_A),
          `${MILESTONE_A} should not be in passedMilestones when gate fails`
        );
        // Next milestone should NOT be in unlockedMilestones
        assert.ok(
          !state.unlockedMilestones || !state.unlockedMilestones.includes(MILESTONE_B),
          `${MILESTONE_B} should not be unlocked when gate fails`
        );
      }
    });

    it('does not log milestone_gated when gate fails', async () => {
      const fp = writeFeatures(workspacePath, ALPHA_INCOMPLETE_FEATURES);
      const manager = createMilestoneManager({ workspacePath, featuresPath: fp });
      await manager.checkMilestoneCompletion(MILESTONE_A);

      const logPath = path.join(workspacePath, 'progress', 'progress_log.jsonl');
      const lines = readJsonl(logPath);
      const gatedEvent = lines.find(l => l.event === 'milestone_gated');
      assert.strictEqual(gatedEvent, undefined, 'Should NOT log milestone_gated when gate fails');
    });
  });

  // -------------------------------------------------------------------------
  // isMilestoneUnlocked
  // -------------------------------------------------------------------------

  describe('isMilestoneUnlocked', () => {
    it('returns true for the first milestone (always unlocked)', () => {
      const manager = createMilestoneManager({ workspacePath, featuresPath });
      assert.strictEqual(
        manager.isMilestoneUnlocked(MILESTONE_A),
        true,
        'First milestone should always be unlocked'
      );
    });

    it('returns false for subsequent milestones before their predecessor passes', () => {
      const manager = createMilestoneManager({ workspacePath, featuresPath });
      assert.strictEqual(
        manager.isMilestoneUnlocked(MILESTONE_B),
        false,
        'Second milestone should be locked until first passes'
      );
    });

    it('returns true for a milestone after it has been unlocked', async () => {
      const manager = createMilestoneManager({ workspacePath, featuresPath });
      // Passing alpha should unlock beta
      await manager.checkMilestoneCompletion(MILESTONE_A);
      assert.strictEqual(
        manager.isMilestoneUnlocked(MILESTONE_B),
        true,
        'Second milestone should be unlocked after first passes'
      );
    });

    it('blocks second milestone dispatch while first gate is pending', async () => {
      const fp = writeFeatures(workspacePath, ALPHA_INCOMPLETE_FEATURES);
      const manager = createMilestoneManager({ workspacePath, featuresPath: fp });
      // alpha gate fails (incomplete)
      await manager.checkMilestoneCompletion(MILESTONE_A);
      assert.strictEqual(
        manager.isMilestoneUnlocked(MILESTONE_B),
        false,
        'Second milestone should remain locked when first gate fails'
      );
    });
  });

  // -------------------------------------------------------------------------
  // mission_completed — three-milestone progression
  // -------------------------------------------------------------------------

  describe('mission_completed on final milestone', () => {
    it('logs mission_completed when all three milestones have passed', async () => {
      const fp = writeFeatures(workspacePath, THREE_MILESTONE_FEATURES);
      const manager = createMilestoneManager({ workspacePath, featuresPath: fp });

      await manager.checkMilestoneCompletion(MILESTONE_A);
      await manager.checkMilestoneCompletion(MILESTONE_B);
      await manager.checkMilestoneCompletion(MILESTONE_C);

      const logPath = path.join(workspacePath, 'progress', 'progress_log.jsonl');
      const lines = readJsonl(logPath);
      const completedEvent = lines.find(l => l.event === 'mission_completed');
      assert.ok(completedEvent, 'Should have a mission_completed event after all milestones pass');
      assert.ok(completedEvent.timestamp, 'mission_completed event should have a timestamp');
    });

    it('does not log mission_completed until the last milestone passes', async () => {
      const fp = writeFeatures(workspacePath, THREE_MILESTONE_FEATURES);
      const manager = createMilestoneManager({ workspacePath, featuresPath: fp });

      // Only pass the first two
      await manager.checkMilestoneCompletion(MILESTONE_A);
      await manager.checkMilestoneCompletion(MILESTONE_B);

      const logPath = path.join(workspacePath, 'progress', 'progress_log.jsonl');
      const lines = readJsonl(logPath);
      const completedEvents = lines.filter(l => l.event === 'mission_completed');
      assert.strictEqual(
        completedEvents.length,
        0,
        'Should NOT log mission_completed before last milestone passes'
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Describe: createProgressLogger
// ---------------------------------------------------------------------------

describe('ProgressLogger', () => {
  let tempDir;
  let logPath;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'progress-logger-test-'));
    logPath = path.join(tempDir, 'progress', 'progress_log.jsonl');
  });

  after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors on Windows (EBUSY)
    }
  });

  describe('createProgressLogger', () => {
    it('returns an object with a log() method', () => {
      const logger = createProgressLogger(logPath);
      assert.ok(logger, 'Should return a logger object');
      assert.strictEqual(typeof logger.log, 'function');
    });

    it('creates the log file and parent directories on first log()', () => {
      const logger = createProgressLogger(logPath);
      logger.log({ event: 'mission_started' });
      assert.ok(fs.existsSync(logPath), 'Log file should be created');
    });

    it('appends a valid JSON line with timestamp on each log() call', () => {
      const logger = createProgressLogger(logPath);
      logger.log({ event: 'worker_dispatched', featureId: 'feat-1', sessionId: 'sess-abc' });

      const lines = readJsonl(logPath);
      const entry = lines.find(l => l.event === 'worker_dispatched');
      assert.ok(entry, 'Should find a worker_dispatched event');
      assert.ok(entry.timestamp, 'Entry should have a timestamp');
      assert.strictEqual(entry.featureId, 'feat-1');
      assert.strictEqual(entry.sessionId, 'sess-abc');
    });

    it('appends multiple lines without overwriting previous ones', () => {
      const logger = createProgressLogger(logPath);
      logger.log({ event: 'handoff_received', featureId: 'feat-2' });
      logger.log({ event: 'scrutiny_passed', featureId: 'feat-2', sessionId: 'sess-xyz' });
      logger.log({ event: 'scrutiny_failed', featureId: 'feat-3' });

      const lines = readJsonl(logPath);
      // Filter to just the events we just wrote (may have earlier lines from previous test)
      const handoffEvents = lines.filter(
        l => l.event === 'handoff_received' && l.featureId === 'feat-2'
      );
      const passedEvents = lines.filter(
        l => l.event === 'scrutiny_passed' && l.featureId === 'feat-2'
      );
      const failedEvents = lines.filter(
        l => l.event === 'scrutiny_failed' && l.featureId === 'feat-3'
      );
      assert.ok(handoffEvents.length >= 1, 'Should find handoff_received event');
      assert.ok(passedEvents.length >= 1, 'Should find scrutiny_passed event');
      assert.ok(failedEvents.length >= 1, 'Should find scrutiny_failed event');
    });

    it('each logged line is valid JSON parseable independently', () => {
      const logger = createProgressLogger(logPath);
      logger.log({ event: 'milestone_gated', milestone: 'alpha' });

      const content = fs.readFileSync(logPath, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        assert.doesNotThrow(() => JSON.parse(line), `Line should be valid JSON: ${line}`);
      }
    });
  });

  // -------------------------------------------------------------------------
  // All event types with required fields
  // -------------------------------------------------------------------------

  describe('all event types have timestamp and relevant IDs', () => {
    it('mission_started event has timestamp', () => {
      const freshLogPath = path.join(
        fs.mkdtempSync(path.join(tempDir, 'evt-')),
        'progress_log.jsonl'
      );
      const logger = createProgressLogger(freshLogPath);
      logger.log({ event: 'mission_started', sessionId: 'sess-1' });
      const lines = readJsonl(freshLogPath);
      const entry = lines[0];
      assert.ok(entry.timestamp, 'mission_started should have timestamp');
      assert.strictEqual(entry.event, 'mission_started');
    });

    it('worker_dispatched event has featureId and sessionId', () => {
      const freshLogPath = path.join(
        fs.mkdtempSync(path.join(tempDir, 'evt-')),
        'progress_log.jsonl'
      );
      const logger = createProgressLogger(freshLogPath);
      logger.log({ event: 'worker_dispatched', featureId: 'f1', sessionId: 's1' });
      const lines = readJsonl(freshLogPath);
      const entry = lines[0];
      assert.ok(entry.timestamp, 'worker_dispatched should have timestamp');
      assert.strictEqual(entry.featureId, 'f1');
      assert.strictEqual(entry.sessionId, 's1');
    });

    it('handoff_received event has featureId', () => {
      const freshLogPath = path.join(
        fs.mkdtempSync(path.join(tempDir, 'evt-')),
        'progress_log.jsonl'
      );
      const logger = createProgressLogger(freshLogPath);
      logger.log({ event: 'handoff_received', featureId: 'f2' });
      const lines = readJsonl(freshLogPath);
      const entry = lines[0];
      assert.ok(entry.timestamp, 'handoff_received should have timestamp');
      assert.strictEqual(entry.featureId, 'f2');
    });

    it('scrutiny_passed event has featureId', () => {
      const freshLogPath = path.join(
        fs.mkdtempSync(path.join(tempDir, 'evt-')),
        'progress_log.jsonl'
      );
      const logger = createProgressLogger(freshLogPath);
      logger.log({ event: 'scrutiny_passed', featureId: 'f3', sessionId: 's3' });
      const lines = readJsonl(freshLogPath);
      const entry = lines[0];
      assert.ok(entry.timestamp, 'scrutiny_passed should have timestamp');
      assert.strictEqual(entry.featureId, 'f3');
    });

    it('scrutiny_failed event has featureId', () => {
      const freshLogPath = path.join(
        fs.mkdtempSync(path.join(tempDir, 'evt-')),
        'progress_log.jsonl'
      );
      const logger = createProgressLogger(freshLogPath);
      logger.log({ event: 'scrutiny_failed', featureId: 'f4' });
      const lines = readJsonl(freshLogPath);
      const entry = lines[0];
      assert.ok(entry.timestamp, 'scrutiny_failed should have timestamp');
      assert.strictEqual(entry.featureId, 'f4');
    });

    it('milestone_gated event has milestone field', () => {
      const freshLogPath = path.join(
        fs.mkdtempSync(path.join(tempDir, 'evt-')),
        'progress_log.jsonl'
      );
      const logger = createProgressLogger(freshLogPath);
      logger.log({ event: 'milestone_gated', milestone: 'alpha' });
      const lines = readJsonl(freshLogPath);
      const entry = lines[0];
      assert.ok(entry.timestamp, 'milestone_gated should have timestamp');
      assert.strictEqual(entry.milestone, 'alpha');
    });

    it('mission_completed event has timestamp', () => {
      const freshLogPath = path.join(
        fs.mkdtempSync(path.join(tempDir, 'evt-')),
        'progress_log.jsonl'
      );
      const logger = createProgressLogger(freshLogPath);
      logger.log({ event: 'mission_completed' });
      const lines = readJsonl(freshLogPath);
      const entry = lines[0];
      assert.ok(entry.timestamp, 'mission_completed should have timestamp');
      assert.strictEqual(entry.event, 'mission_completed');
    });
  });
});
