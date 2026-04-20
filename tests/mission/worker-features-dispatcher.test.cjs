'use strict';

/**
 * Tests for Worker-to-Features Dispatcher
 *
 * Covers VAL-WD-* assertions:
 * - VAL-WD-001: Selects next pending feature with met preconditions
 * - VAL-WD-002: Enqueues to SQLite worker pool with correct payload
 * - VAL-WD-003: Passes skillName and persona context in enqueued message
 * - VAL-WD-004: No-op when no eligible features (returns dispatched:false)
 * - VAL-WD-005: No-op when all pending features have unmet preconditions
 * - VAL-WD-006: Respects worker pool budget (budget exhausted returns retryAfterMs)
 * - VAL-WD-007: Feature priority by array index (lower first)
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Database = require('better-sqlite3');
const { BudgetEnforcementService } = require('../../.claude/lib/workers/budget-enforcement.cjs');
const { getPendingCount, claimNextMessage } = require('../../.claude/lib/db/queue-operations.cjs');
const {
  dispatchFeature,
  getDispatchStatus,
} = require('../../.claude/lib/mission/worker-features-dispatcher.cjs');

// Helper to create temp directory
function createTempDir() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wfd-test-'));
  return tmpDir;
}

// Helper to create test features.json
function createFeaturesJson(dir, features) {
  const featuresPath = path.join(dir, 'features.json');
  fs.writeFileSync(featuresPath, JSON.stringify({ features }, null, 2));
  return featuresPath;
}

// Helper to create test mission.md
function createMissionMd(dir, objectives) {
  const missionPath = path.join(dir, 'mission.md');
  const content = `# Test Mission\n\n## Objectives\n${objectives.map(o => `- ${o}`).join('\n')}\n`;
  fs.writeFileSync(missionPath, content);
  return missionPath;
}

// Helper to create in-memory SQLite database with message_queue table
function createTestDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE IF NOT EXISTS message_queue (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      user_id TEXT,
      text TEXT NOT NULL,
      attachments TEXT DEFAULT '[]',
      timestamp INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      claimed_at INTEGER,
      heartbeat_at INTEGER,
      worker_pid INTEGER,
      attempt_count INTEGER DEFAULT 0,
      completed_at INTEGER,
      last_error TEXT
    )
  `);
  return db;
}

describe('Worker-to-Features Dispatcher', () => {
  let tempDir;
  let db;
  let budget;
  let featuresPath;
  let missionPath;

  before(() => {
    tempDir = createTempDir();
    db = createTestDb();
  });

  after(() => {
    try {
      if (db) db.close();
      if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_err) {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    // Reset budget service for each test
    budget = new BudgetEnforcementService({ maxTokensPerMinute: 400000, maxConcurrentWorkers: 3 });

    // Clear the database
    db.exec(`DELETE FROM message_queue`);
  });

  describe('VAL-WD-001: Selects next pending feature with met preconditions', () => {
    it('selects feature with completed preconditions', () => {
      featuresPath = createFeaturesJson(tempDir, [
        { id: 'feature-a', description: 'Feature A', status: 'completed', skillName: 'tdd' },
        {
          id: 'feature-b',
          description: 'Feature B',
          status: 'pending',
          skillName: 'developer',
          preconditions: ['feature-a'],
        },
        {
          id: 'feature-c',
          description: 'Feature C',
          status: 'pending',
          skillName: 'qa',
          preconditions: ['feature-a', 'feature-b'],
        },
      ]);

      missionPath = createMissionMd(tempDir, ['Build the thing']);

      const result = dispatchFeature({ db, budget, featuresPath, missionPath });

      assert.ok(result.dispatched, 'Should dispatch');
      assert.equal(result.featureId, 'feature-b', 'Should select feature-b (preconditions met)');
    });

    it('does not select feature with incomplete preconditions', () => {
      featuresPath = createFeaturesJson(tempDir, [
        { id: 'feature-a', description: 'Feature A', status: 'pending', skillName: 'tdd' },
        {
          id: 'feature-b',
          description: 'Feature B',
          status: 'pending',
          skillName: 'developer',
          preconditions: ['feature-a'],
        },
      ]);

      missionPath = createMissionMd(tempDir, ['Build the thing']);

      const result = dispatchFeature({ db, budget, featuresPath, missionPath });

      assert.ok(result.dispatched, 'Should dispatch feature-a (no preconditions)');
      assert.equal(result.featureId, 'feature-a', 'Should select feature-a');
    });
  });

  describe('VAL-WD-002: Enqueues to SQLite worker pool with correct payload', () => {
    it('increases pending count after dispatch', () => {
      featuresPath = createFeaturesJson(tempDir, [
        { id: 'feature-a', description: 'Feature A', status: 'pending', skillName: 'tdd' },
      ]);

      missionPath = createMissionMd(tempDir, ['Build the thing']);

      const beforeCount = getPendingCount(db);
      const result = dispatchFeature({ db, budget, featuresPath, missionPath });
      const afterCount = getPendingCount(db);

      assert.ok(result.dispatched, 'Should dispatch');
      assert.equal(afterCount, beforeCount + 1, 'Pending count should increase by 1');
    });

    it('enqueued message contains featureId and skillName', () => {
      featuresPath = createFeaturesJson(tempDir, [
        { id: 'my-feature', description: 'My Feature', status: 'pending', skillName: 'tdd' },
      ]);

      missionPath = createMissionMd(tempDir, ['Build the thing']);

      dispatchFeature({ db, budget, featuresPath, missionPath });

      const row = claimNextMessage(db);
      assert.ok(row, 'Should have claimed a message');

      // Parse the text field which should contain the dispatch payload
      const payload = JSON.parse(row.text);
      assert.equal(payload.featureId, 'my-feature', 'Should contain featureId');
      assert.equal(payload.skillName, 'tdd', 'Should contain skillName');
    });
  });

  describe('VAL-WD-003: Passes skillName and persona context in enqueued message', () => {
    it('persona context contains mission objectives', () => {
      featuresPath = createFeaturesJson(tempDir, [
        { id: 'feature-a', description: 'Feature A', status: 'pending', skillName: 'tdd' },
      ]);

      missionPath = createMissionMd(tempDir, ['Build the thing', 'Ship it fast']);

      dispatchFeature({ db, budget, featuresPath, missionPath });

      const row = claimNextMessage(db);
      const payload = JSON.parse(row.text);

      assert.ok(payload.personaContext, 'Should have personaContext');
      assert.ok(payload.personaContext.missionObjectives, 'Should have missionObjectives');
      assert.deepEqual(payload.personaContext.missionObjectives, [
        'Build the thing',
        'Ship it fast',
      ]);
    });

    it('persona context contains feature fields', () => {
      featuresPath = createFeaturesJson(tempDir, [
        {
          id: 'feature-a',
          description: 'Feature A description',
          status: 'pending',
          skillName: 'tdd',
          expectedBehavior: ['Works correctly', 'Handles errors'],
          verificationSteps: ['Run tests'],
        },
      ]);

      missionPath = createMissionMd(tempDir, ['Build the thing']);

      dispatchFeature({ db, budget, featuresPath, missionPath });

      const row = claimNextMessage(db);
      const payload = JSON.parse(row.text);

      assert.equal(payload.personaContext.featureDescription, 'Feature A description');
      assert.deepEqual(payload.personaContext.expectedBehavior, [
        'Works correctly',
        'Handles errors',
      ]);
      assert.deepEqual(payload.personaContext.verificationSteps, ['Run tests']);
    });
  });

  describe('VAL-WD-004: No-op when no eligible features', () => {
    it('returns dispatched:false when all features completed', () => {
      featuresPath = createFeaturesJson(tempDir, [
        { id: 'feature-a', description: 'Feature A', status: 'completed', skillName: 'tdd' },
        { id: 'feature-b', description: 'Feature B', status: 'completed', skillName: 'developer' },
      ]);

      missionPath = createMissionMd(tempDir, ['Build the thing']);

      const beforeCount = getPendingCount(db);
      const result = dispatchFeature({ db, budget, featuresPath, missionPath });
      const afterCount = getPendingCount(db);

      assert.ok(!result.dispatched, 'Should not dispatch');
      assert.equal(afterCount, beforeCount, 'Pending count should not change');
      assert.ok(result.reason, 'Should have a reason');
    });

    it('returns dispatched:false when all features in_progress', () => {
      featuresPath = createFeaturesJson(tempDir, [
        { id: 'feature-a', description: 'Feature A', status: 'in_progress', skillName: 'tdd' },
      ]);

      missionPath = createMissionMd(tempDir, ['Build the thing']);

      const result = dispatchFeature({ db, budget, featuresPath, missionPath });

      assert.ok(!result.dispatched, 'Should not dispatch');
      assert.equal(result.reason, 'no_eligible_features', 'Should have correct reason');
    });
  });

  describe('VAL-WD-005: No-op when all pending features have unmet preconditions', () => {
    it('returns dispatched:false when circular dependencies detected', () => {
      // Circular dependencies are detected at load time by features-state-machine
      // This test checks that the dispatcher handles the error gracefully
      featuresPath = createFeaturesJson(tempDir, [
        {
          id: 'feature-a',
          description: 'Feature A',
          status: 'pending',
          skillName: 'tdd',
          preconditions: ['feature-b'],
        },
        {
          id: 'feature-b',
          description: 'Feature B',
          status: 'pending',
          skillName: 'developer',
          preconditions: ['feature-a'],
        },
      ]);

      missionPath = createMissionMd(tempDir, ['Build the thing']);

      // Should fail to load due to circular dependency
      const result = dispatchFeature({ db, budget, featuresPath, missionPath });

      assert.ok(!result.dispatched, 'Should not dispatch');
      assert.equal(result.reason, 'features_load_error', 'Should indicate load error');
    });

    it('returns dispatched:false when preconditions are in_progress', () => {
      featuresPath = createFeaturesJson(tempDir, [
        { id: 'feature-a', description: 'Feature A', status: 'in_progress', skillName: 'tdd' },
        {
          id: 'feature-b',
          description: 'Feature B',
          status: 'pending',
          skillName: 'developer',
          preconditions: ['feature-a'],
        },
      ]);

      missionPath = createMissionMd(tempDir, ['Build the thing']);

      const result = dispatchFeature({ db, budget, featuresPath, missionPath });

      assert.ok(!result.dispatched, 'Should not dispatch');
      assert.equal(result.reason, 'no_eligible_features', 'Should have correct reason');
    });
  });

  describe('VAL-WD-006: Respects worker pool budget', () => {
    it('returns dispatched:false with retryAfterMs when budget exhausted', () => {
      featuresPath = createFeaturesJson(tempDir, [
        { id: 'feature-a', description: 'Feature A', status: 'pending', skillName: 'tdd' },
      ]);

      missionPath = createMissionMd(tempDir, ['Build the thing']);

      // Exhaust the budget by acquiring all slots
      const slot1 = budget.acquireWorkerSlot(100000);
      const slot2 = budget.acquireWorkerSlot(100000);
      const slot3 = budget.acquireWorkerSlot(100000);

      const beforeCount = getPendingCount(db);
      const result = dispatchFeature({ db, budget, featuresPath, missionPath });
      const afterCount = getPendingCount(db);

      assert.ok(!result.dispatched, 'Should not dispatch');
      assert.equal(result.reason, 'budget_exhausted', 'Should indicate budget exhausted');
      assert.ok(typeof result.retryAfterMs === 'number', 'Should have retryAfterMs');
      assert.ok(result.retryAfterMs >= 0, 'retryAfterMs should be non-negative');
      assert.equal(afterCount, beforeCount, 'Nothing should be enqueued');

      // Cleanup
      slot1.release();
      slot2.release();
      slot3.release();
    });
  });

  describe('VAL-WD-007: Feature priority by array index', () => {
    it('selects lower index feature when both eligible', () => {
      featuresPath = createFeaturesJson(tempDir, [
        { id: 'feature-b', description: 'Feature B', status: 'pending', skillName: 'developer' },
        { id: 'feature-a', description: 'Feature A', status: 'pending', skillName: 'tdd' },
      ]);

      missionPath = createMissionMd(tempDir, ['Build the thing']);

      const result = dispatchFeature({ db, budget, featuresPath, missionPath });

      assert.ok(result.dispatched, 'Should dispatch');
      assert.equal(result.featureId, 'feature-b', 'Should select first (lower index) feature');
    });

    it('processes features in array order through multiple dispatches', () => {
      featuresPath = createFeaturesJson(tempDir, [
        { id: 'feature-1', description: 'Feature 1', status: 'pending', skillName: 'tdd' },
        { id: 'feature-2', description: 'Feature 2', status: 'pending', skillName: 'developer' },
        { id: 'feature-3', description: 'Feature 3', status: 'pending', skillName: 'qa' },
      ]);

      missionPath = createMissionMd(tempDir, ['Build the thing']);

      // First dispatch
      const result1 = dispatchFeature({ db, budget, featuresPath, missionPath });
      assert.equal(result1.featureId, 'feature-1', 'First dispatch should be feature-1');

      // Mark feature-1 as completed
      const data = JSON.parse(fs.readFileSync(featuresPath, 'utf8'));
      data.features[0].status = 'completed';
      fs.writeFileSync(featuresPath, JSON.stringify(data, null, 2));

      // Second dispatch (need fresh budget slot)
      const freshBudget = new BudgetEnforcementService({
        maxTokensPerMinute: 400000,
        maxConcurrentWorkers: 3,
      });
      const result2 = dispatchFeature({ db, budget: freshBudget, featuresPath, missionPath });
      assert.equal(result2.featureId, 'feature-2', 'Second dispatch should be feature-2');
    });
  });

  describe('getDispatchStatus', () => {
    it('returns correct status breakdown', () => {
      featuresPath = createFeaturesJson(tempDir, [
        { id: 'feature-a', description: 'Feature A', status: 'completed', skillName: 'tdd' },
        {
          id: 'feature-b',
          description: 'Feature B',
          status: 'pending',
          skillName: 'developer',
          preconditions: ['feature-a'],
        },
        {
          id: 'feature-c',
          description: 'Feature C',
          status: 'pending',
          skillName: 'qa',
          preconditions: ['feature-d'],
        },
      ]);

      const status = getDispatchStatus(featuresPath);

      assert.ok(status.eligible, 'Should have eligible');
      assert.ok(status.blocked, 'Should have blocked');
      assert.ok(status.completed, 'Should have completed');

      // feature-b is eligible (precondition feature-a is completed)
      assert.equal(status.eligible.length, 1, 'Should have 1 eligible feature');
      assert.equal(status.eligible[0].id, 'feature-b', 'feature-b should be eligible');

      // feature-c is blocked (precondition feature-d doesn't exist)
      assert.equal(status.blocked.length, 1, 'Should have 1 blocked feature');
      assert.equal(status.blocked[0].id, 'feature-c', 'feature-c should be blocked');

      // feature-a is completed
      assert.equal(status.completed.length, 1, 'Should have 1 completed feature');
      assert.equal(status.completed[0].id, 'feature-a', 'feature-a should be completed');
    });
  });
});
