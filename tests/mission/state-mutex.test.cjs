'use strict';

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Ajv = require('ajv');

// Module under test (will be created)
const {
  StateMutex,
  acquireLock,
  releaseLock,
  initializeState,
} = require('../../.claude/lib/mission/state-mutex.cjs');

// AJV schema for state.json validation
const STATE_SCHEMA = {
  type: 'object',
  required: ['turn', 'lockedBy', 'lockedAt'],
  properties: {
    turn: { type: 'string', enum: ['orchestrator_turn', 'worker_turn'] },
    lockedBy: { type: 'string', nullable: true },
    lockedAt: { type: 'string', format: 'date-time', nullable: true },
    designatedWorkerId: { type: 'string', nullable: true },
    staleThresholdMs: { type: 'integer', minimum: 1000 },
  },
  additionalProperties: true,
};

const ajv = new Ajv({ allErrors: true, strict: false });
const validateState = ajv.compile(STATE_SCHEMA);

describe('State Mutex', () => {
  let tempDir;
  let statePath;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-mutex-test-'));
  });

  after(() => {
    // Cleanup temp directories
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Create a fresh state.json for each test
    statePath = path.join(tempDir, 'state.json');
    // Initialize with safe defaults
    const initialState = {
      turn: 'orchestrator_turn',
      lockedBy: null,
      lockedAt: null,
      designatedWorkerId: null,
      staleThresholdMs: 30000,
    };
    fs.writeFileSync(statePath, JSON.stringify(initialState, null, 2), 'utf8');
  });

  afterEach(() => {
    // Clean up state.json after each test
    if (fs.existsSync(statePath)) {
      fs.rmSync(statePath, { force: true });
    }
  });

  describe('VAL-MX-001: Lock acquisition succeeds when turn matches', () => {
    it('orchestrator can acquire lock during orchestrator_turn', () => {
      const mutex = new StateMutex(statePath);

      const result = mutex.acquireLock({ requesterType: 'orchestrator', requesterId: 'orch-1' });

      assert.strictEqual(result.acquired, true, 'Lock should be acquired');
      assert.strictEqual(result.turn, 'orchestrator_turn', 'Turn should remain orchestrator_turn');

      // Verify state was updated
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      assert.strictEqual(state.lockedBy, 'orch-1', 'lockedBy should be set');
      assert.ok(state.lockedAt, 'lockedAt should be set');
    });

    it('worker can acquire lock during worker_turn with matching designatedWorkerId', () => {
      // First, set up state for worker turn with designated worker
      const workerState = {
        turn: 'worker_turn',
        lockedBy: null,
        lockedAt: null,
        designatedWorkerId: 'worker-123',
        staleThresholdMs: 30000,
      };
      fs.writeFileSync(statePath, JSON.stringify(workerState, null, 2), 'utf8');

      const mutex = new StateMutex(statePath);
      const result = mutex.acquireLock({ requesterType: 'worker', requesterId: 'worker-123' });

      assert.strictEqual(result.acquired, true, 'Lock should be acquired');

      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      assert.strictEqual(state.lockedBy, 'worker-123', 'lockedBy should be set to worker ID');
    });

    it('sets lockedBy and lockedAt fields correctly', () => {
      const mutex = new StateMutex(statePath);
      const beforeTime = new Date().toISOString();

      mutex.acquireLock({ requesterType: 'orchestrator', requesterId: 'orch-1' });

      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      assert.strictEqual(state.lockedBy, 'orch-1');
      assert.ok(state.lockedAt, 'lockedAt should be set');
      // lockedAt should be >= beforeTime
      assert.ok(new Date(state.lockedAt) >= new Date(beforeTime), 'lockedAt should be recent');
    });
  });

  describe('VAL-MX-002: Worker cannot acquire lock during orchestrator_turn', () => {
    it('worker denied during orchestrator_turn with TURN_VIOLATION error', () => {
      const mutex = new StateMutex(statePath);

      assert.throws(
        () => {
          mutex.acquireLock({ requesterType: 'worker', requesterId: 'worker-123' });
        },
        err => {
          assert.strictEqual(err.code, 'TURN_VIOLATION', 'Error code should be TURN_VIOLATION');
          assert.ok(
            err.message.includes('orchestrator_turn'),
            'Error message should mention turn state'
          );
          return true;
        },
        'Should throw TURN_VIOLATION error'
      );
    });

    it('worker with wrong designatedWorkerId denied during worker_turn', () => {
      // Set up state for worker turn with different designated worker
      const workerState = {
        turn: 'worker_turn',
        lockedBy: null,
        lockedAt: null,
        designatedWorkerId: 'worker-456',
        staleThresholdMs: 30000,
      };
      fs.writeFileSync(statePath, JSON.stringify(workerState, null, 2), 'utf8');

      const mutex = new StateMutex(statePath);

      assert.throws(
        () => {
          mutex.acquireLock({ requesterType: 'worker', requesterId: 'worker-123' });
        },
        err => {
          assert.strictEqual(
            err.code,
            'DESIGNATED_WORKER_MISMATCH',
            'Error code should be DESIGNATED_WORKER_MISMATCH'
          );
          return true;
        },
        'Should throw DESIGNATED_WORKER_MISMATCH error'
      );
    });
  });

  describe('VAL-MX-003: Stale lock detection and recovery', () => {
    it('stale lock (older than threshold) is automatically released', () => {
      // Create state with stale lock (60 seconds ago)
      const staleTime = new Date(Date.now() - 60000).toISOString();
      const staleState = {
        turn: 'orchestrator_turn',
        lockedBy: 'old-orch',
        lockedAt: staleTime,
        designatedWorkerId: null,
        staleThresholdMs: 30000,
      };
      fs.writeFileSync(statePath, JSON.stringify(staleState, null, 2), 'utf8');

      const mutex = new StateMutex(statePath);
      const result = mutex.acquireLock({ requesterType: 'orchestrator', requesterId: 'new-orch' });

      assert.strictEqual(result.acquired, true, 'Lock should be acquired after stale release');
      assert.strictEqual(result.staleLockReleased, true, 'Should indicate stale lock was released');

      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      assert.strictEqual(state.lockedBy, 'new-orch', 'lockedBy should be updated to new requester');
      assert.notStrictEqual(state.lockedAt, staleTime, 'lockedAt should be updated');
    });

    it('fresh lock is not released (respects threshold)', () => {
      // Create state with fresh lock (10 seconds ago)
      const freshTime = new Date(Date.now() - 10000).toISOString();
      const freshState = {
        turn: 'orchestrator_turn',
        lockedBy: 'current-orch',
        lockedAt: freshTime,
        designatedWorkerId: null,
        staleThresholdMs: 30000,
      };
      fs.writeFileSync(statePath, JSON.stringify(freshState, null, 2), 'utf8');

      const mutex = new StateMutex(statePath);

      assert.throws(
        () => {
          mutex.acquireLock({ requesterType: 'orchestrator', requesterId: 'new-orch' });
        },
        err => {
          assert.strictEqual(err.code, 'LOCK_HELD', 'Error code should be LOCK_HELD');
          return true;
        },
        'Should throw LOCK_HELD error for fresh lock'
      );
    });

    it('uses configurable stale threshold', () => {
      // Create state with custom threshold of 10 seconds
      const state15SecAgo = new Date(Date.now() - 15000).toISOString();
      const customState = {
        turn: 'orchestrator_turn',
        lockedBy: 'old-orch',
        lockedAt: state15SecAgo,
        designatedWorkerId: null,
        staleThresholdMs: 10000, // 10 second threshold
      };
      fs.writeFileSync(statePath, JSON.stringify(customState, null, 2), 'utf8');

      const mutex = new StateMutex(statePath);
      const result = mutex.acquireLock({ requesterType: 'orchestrator', requesterId: 'new-orch' });

      assert.strictEqual(result.acquired, true, 'Lock should be acquired with custom threshold');
    });
  });

  describe('VAL-MX-004: Lock release clears lock fields', () => {
    it('releaseLock sets lockedBy and lockedAt to null', () => {
      // First acquire a lock
      const mutex = new StateMutex(statePath);
      mutex.acquireLock({ requesterType: 'orchestrator', requesterId: 'orch-1' });

      // Verify lock is held
      let state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      assert.strictEqual(state.lockedBy, 'orch-1');
      assert.ok(state.lockedAt);

      // Release the lock
      mutex.releaseLock({ requesterId: 'orch-1' });

      // Verify fields are cleared
      state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      assert.strictEqual(state.lockedBy, null, 'lockedBy should be null');
      assert.strictEqual(state.lockedAt, null, 'lockedAt should be null');
    });

    it('releaseLock throws if requester does not hold the lock', () => {
      // Acquire lock with one requester
      const mutex = new StateMutex(statePath);
      mutex.acquireLock({ requesterType: 'orchestrator', requesterId: 'orch-1' });

      // Try to release with different requester
      assert.throws(
        () => {
          mutex.releaseLock({ requesterId: 'orch-2' });
        },
        err => {
          assert.strictEqual(err.code, 'NOT_LOCK_OWNER', 'Error code should be NOT_LOCK_OWNER');
          return true;
        },
        'Should throw NOT_LOCK_OWNER error'
      );
    });
  });

  describe('VAL-MX-005: Corrupted state.json triggers recovery', () => {
    it('corrupted JSON is backed up and reinitialized', () => {
      // Write corrupted JSON
      fs.writeFileSync(statePath, '{ invalid json }', 'utf8');

      const mutex = new StateMutex(statePath);
      const result = mutex.acquireLock({ requesterType: 'orchestrator', requesterId: 'orch-1' });

      assert.strictEqual(result.acquired, true, 'Lock should be acquired after recovery');
      assert.strictEqual(result.recovered, true, 'Should indicate recovery happened');

      // Verify backup file was created
      const files = fs.readdirSync(tempDir);
      const backupFiles = files.filter(f => f.startsWith('state.json.corrupt.'));
      assert.ok(backupFiles.length > 0, 'Backup file should be created');

      // Verify state.json is now valid
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      assert.ok(validateState(state), 'Recovered state should be valid');
    });

    it('reinitialized state has safe defaults (unlocked, orchestrator_turn)', () => {
      // Write corrupted JSON
      fs.writeFileSync(statePath, 'not json at all', 'utf8');

      const mutex = new StateMutex(statePath);
      mutex.acquireLock({ requesterType: 'orchestrator', requesterId: 'orch-1' });

      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));

      assert.strictEqual(state.turn, 'orchestrator_turn', 'Turn should be orchestrator_turn');
      assert.strictEqual(state.lockedBy, 'orch-1', 'lockedBy should be set to new owner');
      assert.ok(state.lockedAt, 'lockedAt should be set');
    });

    it('corrupted state with valid lock is reinitialized safely', () => {
      // Write corrupted JSON that looks like it might have lock info
      fs.writeFileSync(statePath, '{ "turn": "worker_turn", "lockedBy": "some-worker"', 'utf8');

      const mutex = new StateMutex(statePath);
      const result = mutex.acquireLock({ requesterType: 'orchestrator', requesterId: 'orch-1' });

      assert.strictEqual(result.acquired, true, 'Should acquire lock after recovery');
      assert.strictEqual(result.recovered, true, 'Should indicate recovery');

      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      assert.strictEqual(state.lockedBy, 'orch-1', 'Lock should be given to new requester');
    });
  });

  describe('Atomic writes', () => {
    it('uses write-to-temp then rename pattern', () => {
      const mutex = new StateMutex(statePath);

      // Acquire lock
      mutex.acquireLock({ requesterType: 'orchestrator', requesterId: 'orch-1' });

      // No .tmp file should remain
      const tmpPath = statePath + '.tmp';
      assert.ok(!fs.existsSync(tmpPath), 'No temp file should remain after atomic write');

      // State file should be valid JSON
      const content = fs.readFileSync(statePath, 'utf8');
      assert.doesNotThrow(() => JSON.parse(content), 'state.json should be valid JSON');
    });
  });

  describe('Convenience functions', () => {
    it('acquireLock function works without instantiating class', () => {
      const result = acquireLock(statePath, {
        requesterType: 'orchestrator',
        requesterId: 'orch-1',
      });

      assert.strictEqual(result.acquired, true);

      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      assert.strictEqual(state.lockedBy, 'orch-1');
    });

    it('releaseLock function works without instantiating class', () => {
      acquireLock(statePath, { requesterType: 'orchestrator', requesterId: 'orch-1' });
      releaseLock(statePath, { requesterId: 'orch-1' });

      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      assert.strictEqual(state.lockedBy, null);
    });

    it('initializeState creates fresh state file', () => {
      // Remove existing state
      fs.rmSync(statePath, { force: true });

      initializeState(statePath);

      assert.ok(fs.existsSync(statePath), 'state.json should exist');
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      assert.strictEqual(state.turn, 'orchestrator_turn');
      assert.strictEqual(state.lockedBy, null);
      assert.strictEqual(state.lockedAt, null);
    });
  });

  describe('Turn transitions', () => {
    it('transitionTurn changes turn state when unlocked', () => {
      const mutex = new StateMutex(statePath);
      mutex.transitionTurn('worker_turn', { designatedWorkerId: 'worker-123' });

      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      assert.strictEqual(state.turn, 'worker_turn');
      assert.strictEqual(state.designatedWorkerId, 'worker-123');
    });

    it('transitionTurn fails if lock is held', () => {
      const mutex = new StateMutex(statePath);
      mutex.acquireLock({ requesterType: 'orchestrator', requesterId: 'orch-1' });

      assert.throws(
        () => {
          mutex.transitionTurn('worker_turn', { designatedWorkerId: 'worker-123' });
        },
        err => {
          assert.strictEqual(err.code, 'LOCK_HELD', 'Error code should be LOCK_HELD');
          return true;
        },
        'Should throw LOCK_HELD error when trying to transition with held lock'
      );
    });
  });

  describe('State validation', () => {
    it('getState returns current state without acquiring lock', () => {
      const mutex = new StateMutex(statePath);
      const state = mutex.getState();

      assert.strictEqual(state.turn, 'orchestrator_turn');
      assert.strictEqual(state.lockedBy, null);
      assert.ok(validateState(state), 'State should be valid');
    });

    it('isLocked returns correct status', () => {
      const mutex = new StateMutex(statePath);

      assert.strictEqual(mutex.isLocked(), false, 'Should not be locked initially');

      mutex.acquireLock({ requesterType: 'orchestrator', requesterId: 'orch-1' });

      assert.strictEqual(mutex.isLocked(), true, 'Should be locked after acquisition');

      mutex.releaseLock({ requesterId: 'orch-1' });

      assert.strictEqual(mutex.isLocked(), false, 'Should not be locked after release');
    });
  });
});
