'use strict';

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { ValidationStateGatekeeper, createGatekeeper } = require('../../.claude/lib/mission/validation-state-gatekeeper.cjs');

// Test fixtures directory
let tempDir;

// Helper to create a temp directory
function createTempDir() {
  const baseDir = os.tmpdir();
  const testId = `vsg-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  tempDir = path.join(baseDir, testId);
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

// Helper to create a minimal validation-state.json
function createValidationState(statePath, assertions = {}) {
  const data = { assertions };
  fs.writeFileSync(statePath, JSON.stringify(data, null, 2));
}

// Helper to create a minimal validation-contract.md
function createValidationContract(contractPath, rules = []) {
  let content = '# Validation Contract\n\n';
  for (const rule of rules) {
    content += `### ${rule.id}: ${rule.title}\n`;
    content += `${rule.description || 'Description here.'}\n`;
    content += `Evidence: ${rule.evidence || 'unit-test(...)'}\n\n`;
  }
  fs.writeFileSync(contractPath, content);
}

// Helper to clean up temp directory
function cleanupTempDir() {
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

describe('Validation State Gatekeeper', () => {
  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir();
  });

  describe('VAL-VS-001: Tracks assertion states with valid transitions', () => {
    it('valid transition pending->passed succeeds', () => {
      const statePath = path.join(tempDir, 'validation-state.json');
      createValidationState(statePath, {
        'VAL-TEST-001': { status: 'pending' },
      });

      const gatekeeper = new ValidationStateGatekeeper(statePath);
      const result = gatekeeper.transition('VAL-TEST-001', 'passed');

      assert.equal(result.success, true);
      assert.equal(result.previousStatus, 'pending');
      assert.equal(result.newStatus, 'passed');

      const state = gatekeeper.getState();
      assert.equal(state.assertions['VAL-TEST-001'].status, 'passed');
    });

    it('valid transition pending->failed succeeds', () => {
      const statePath = path.join(tempDir, 'validation-state.json');
      createValidationState(statePath, {
        'VAL-TEST-001': { status: 'pending' },
      });

      const gatekeeper = new ValidationStateGatekeeper(statePath);
      const result = gatekeeper.transition('VAL-TEST-001', 'failed');

      assert.equal(result.success, true);
      assert.equal(result.newStatus, 'failed');
    });

    it('valid transition pending->blocked succeeds', () => {
      const statePath = path.join(tempDir, 'validation-state.json');
      createValidationState(statePath, {
        'VAL-TEST-001': { status: 'pending' },
      });

      const gatekeeper = new ValidationStateGatekeeper(statePath);
      const result = gatekeeper.transition('VAL-TEST-001', 'blocked');

      assert.equal(result.success, true);
      assert.equal(result.newStatus, 'blocked');
    });

    it('valid transition failed->passed succeeds (re-validation)', () => {
      const statePath = path.join(tempDir, 'validation-state.json');
      createValidationState(statePath, {
        'VAL-TEST-001': { status: 'failed' },
      });

      const gatekeeper = new ValidationStateGatekeeper(statePath);
      const result = gatekeeper.transition('VAL-TEST-001', 'passed');

      assert.equal(result.success, true);
      assert.equal(result.previousStatus, 'failed');
      assert.equal(result.newStatus, 'passed');
    });

    it('valid transition failed->blocked succeeds', () => {
      const statePath = path.join(tempDir, 'validation-state.json');
      createValidationState(statePath, {
        'VAL-TEST-001': { status: 'failed' },
      });

      const gatekeeper = new ValidationStateGatekeeper(statePath);
      const result = gatekeeper.transition('VAL-TEST-001', 'blocked');

      assert.equal(result.success, true);
      assert.equal(result.newStatus, 'blocked');
    });

    it('valid transition blocked->pending succeeds', () => {
      const statePath = path.join(tempDir, 'validation-state.json');
      createValidationState(statePath, {
        'VAL-TEST-001': { status: 'blocked' },
      });

      const gatekeeper = new ValidationStateGatekeeper(statePath);
      const result = gatekeeper.transition('VAL-TEST-001', 'pending');

      assert.equal(result.success, true);
      assert.equal(result.newStatus, 'pending');
    });

    it('invalid transition passed->pending is rejected', () => {
      const statePath = path.join(tempDir, 'validation-state.json');
      createValidationState(statePath, {
        'VAL-TEST-001': { status: 'passed' },
      });

      const gatekeeper = new ValidationStateGatekeeper(statePath);

      assert.throws(
        () => gatekeeper.transition('VAL-TEST-001', 'pending'),
        (err) => {
          assert.equal(err.code, 'INVALID_TRANSITION');
          assert.ok(err.message.includes('passed'));
          assert.ok(err.message.includes('pending'));
          return true;
        }
      );
    });

    it('invalid transition passed->failed is rejected', () => {
      const statePath = path.join(tempDir, 'validation-state.json');
      createValidationState(statePath, {
        'VAL-TEST-001': { status: 'passed' },
      });

      const gatekeeper = new ValidationStateGatekeeper(statePath);

      assert.throws(
        () => gatekeeper.transition('VAL-TEST-001', 'failed'),
        (err) => {
          assert.equal(err.code, 'INVALID_TRANSITION');
          return true;
        }
      );
    });

    it('invalid transition passed->blocked is rejected', () => {
      const statePath = path.join(tempDir, 'validation-state.json');
      createValidationState(statePath, {
        'VAL-TEST-001': { status: 'passed' },
      });

      const gatekeeper = new ValidationStateGatekeeper(statePath);

      assert.throws(
        () => gatekeeper.transition('VAL-TEST-001', 'blocked'),
        (err) => {
          assert.equal(err.code, 'INVALID_TRANSITION');
          return true;
        }
      );
    });

    it('passed is a terminal state - all outgoing transitions rejected', () => {
      const statePath = path.join(tempDir, 'validation-state.json');
      createValidationState(statePath, {
        'VAL-TEST-001': { status: 'passed' },
      });

      const gatekeeper = new ValidationStateGatekeeper(statePath);

      // All transitions from passed should fail
      for (const targetState of ['pending', 'failed', 'blocked']) {
        assert.throws(
          () => gatekeeper.transition('VAL-TEST-001', targetState),
          (err) => err.code === 'INVALID_TRANSITION',
          `Transition passed->${targetState} should be rejected`
        );
      }
    });
  });

  describe('VAL-VS-002: Blocks feature completion until all assertions pass', () => {
    it('canComplete() returns false when any assertion not passed', () => {
      const statePath = path.join(tempDir, 'validation-state.json');
      createValidationState(statePath, {
        'VAL-TEST-001': { status: 'passed' },
        'VAL-TEST-002': { status: 'failed' },
        'VAL-TEST-003': { status: 'pending' },
      });

      const gatekeeper = new ValidationStateGatekeeper(statePath);
      const result = gatekeeper.canComplete(['VAL-TEST-001', 'VAL-TEST-002', 'VAL-TEST-003']);

      assert.equal(result.allowed, false);
      assert.ok(Array.isArray(result.blocking));
      assert.ok(result.blocking.length > 0);
    });

    it('canComplete() returns true when all assertions passed', () => {
      const statePath = path.join(tempDir, 'validation-state.json');
      createValidationState(statePath, {
        'VAL-TEST-001': { status: 'passed' },
        'VAL-TEST-002': { status: 'passed' },
        'VAL-TEST-003': { status: 'passed' },
      });

      const gatekeeper = new ValidationStateGatekeeper(statePath);
      const result = gatekeeper.canComplete(['VAL-TEST-001', 'VAL-TEST-002', 'VAL-TEST-003']);

      assert.equal(result.allowed, true);
      assert.deepEqual(result.blocking, []);
    });

    it('canComplete() returns correct blocker list with details', () => {
      const statePath = path.join(tempDir, 'validation-state.json');
      createValidationState(statePath, {
        'VAL-TEST-001': { status: 'passed' },
        'VAL-TEST-002': { status: 'failed' },
        'VAL-TEST-003': { status: 'pending' },
        'VAL-TEST-004': { status: 'blocked' },
      });

      const gatekeeper = new ValidationStateGatekeeper(statePath);
      const result = gatekeeper.canComplete([
        'VAL-TEST-001',
        'VAL-TEST-002',
        'VAL-TEST-003',
        'VAL-TEST-004',
      ]);

      assert.equal(result.allowed, false);
      assert.ok(result.blocking.includes('VAL-TEST-002'));
      assert.ok(result.blocking.includes('VAL-TEST-003'));
      assert.ok(result.blocking.includes('VAL-TEST-004'));
      assert.ok(!result.blocking.includes('VAL-TEST-001'));
    });

    it('canComplete() returns true for empty assertion list', () => {
      const statePath = path.join(tempDir, 'validation-state.json');
      createValidationState(statePath, {});

      const gatekeeper = new ValidationStateGatekeeper(statePath);
      const result = gatekeeper.canComplete([]);

      assert.equal(result.allowed, true);
      assert.deepEqual(result.blocking, []);
    });

    it('canComplete() handles unknown assertion IDs as blockers', () => {
      const statePath = path.join(tempDir, 'validation-state.json');
      createValidationState(statePath, {
        'VAL-TEST-001': { status: 'passed' },
      });

      const gatekeeper = new ValidationStateGatekeeper(statePath);
      const result = gatekeeper.canComplete(['VAL-TEST-001', 'VAL-UNKNOWN-999']);

      assert.equal(result.allowed, false);
      assert.ok(result.blocking.includes('VAL-UNKNOWN-999'));
    });
  });

  describe('VAL-VS-003: Partial re-validation only re-runs failed checks', () => {
    it('getFailedAssertions() returns only failed assertion IDs', () => {
      const statePath = path.join(tempDir, 'validation-state.json');
      createValidationState(statePath, {
        'VAL-TEST-001': { status: 'passed' },
        'VAL-TEST-002': { status: 'failed' },
        'VAL-TEST-003': { status: 'pending' },
        'VAL-TEST-004': { status: 'failed' },
        'VAL-TEST-005': { status: 'blocked' },
      });

      const gatekeeper = new ValidationStateGatekeeper(statePath);
      const failed = gatekeeper.getFailedAssertions();

      assert.deepEqual(failed.sort(), ['VAL-TEST-002', 'VAL-TEST-004']);
    });

    it('getFailedAssertions() returns empty array when no failures', () => {
      const statePath = path.join(tempDir, 'validation-state.json');
      createValidationState(statePath, {
        'VAL-TEST-001': { status: 'passed' },
        'VAL-TEST-002': { status: 'passed' },
      });

      const gatekeeper = new ValidationStateGatekeeper(statePath);
      const failed = gatekeeper.getFailedAssertions();

      assert.deepEqual(failed, []);
    });

    it('revalidate() returns list of failed assertions to re-run', () => {
      const statePath = path.join(tempDir, 'validation-state.json');
      createValidationState(statePath, {
        'VAL-TEST-001': { status: 'passed' },
        'VAL-TEST-002': { status: 'failed' },
        'VAL-TEST-003': { status: 'pending' },
        'VAL-TEST-004': { status: 'failed' },
      });

      const gatekeeper = new ValidationStateGatekeeper(statePath);
      const result = gatekeeper.revalidate(['VAL-TEST-001', 'VAL-TEST-002', 'VAL-TEST-004']);

      assert.deepEqual(result.toRerun.sort(), ['VAL-TEST-002', 'VAL-TEST-004']);
      assert.ok(!result.toRerun.includes('VAL-TEST-001'));
    });

    it('revalidate() resets failed assertions to pending before re-run', () => {
      const statePath = path.join(tempDir, 'validation-state.json');
      createValidationState(statePath, {
        'VAL-TEST-001': { status: 'passed' },
        'VAL-TEST-002': { status: 'failed' },
      });

      const gatekeeper = new ValidationStateGatekeeper(statePath);
      gatekeeper.revalidate(['VAL-TEST-001', 'VAL-TEST-002']);

      const state = gatekeeper.getState();
      assert.equal(state.assertions['VAL-TEST-002'].status, 'pending');
      assert.equal(state.assertions['VAL-TEST-001'].status, 'passed');
    });
  });

  describe('VAL-VS-004: Atomic state persistence', () => {
    it('uses atomic write pattern (write-temp-rename)', () => {
      const statePath = path.join(tempDir, 'validation-state.json');
      createValidationState(statePath, {
        'VAL-TEST-001': { status: 'pending' },
      });

      const gatekeeper = new ValidationStateGatekeeper(statePath);
      gatekeeper.transition('VAL-TEST-001', 'passed');

      // Verify no .tmp file left behind
      const tmpPath = statePath + '.tmp';
      assert.ok(!fs.existsSync(tmpPath), 'No .tmp file should remain');

      // Verify state file exists and is valid JSON
      assert.ok(fs.existsSync(statePath));
      const content = fs.readFileSync(statePath, 'utf8');
      const data = JSON.parse(content);
      assert.equal(data.assertions['VAL-TEST-001'].status, 'passed');
    });

    it('persists state after each transition', () => {
      const statePath = path.join(tempDir, 'validation-state.json');
      createValidationState(statePath, {
        'VAL-TEST-001': { status: 'pending' },
        'VAL-TEST-002': { status: 'pending' },
      });

      const gatekeeper = new ValidationStateGatekeeper(statePath);
      gatekeeper.transition('VAL-TEST-001', 'passed');

      // Create new gatekeeper to verify persistence
      const gatekeeper2 = new ValidationStateGatekeeper(statePath);
      const state = gatekeeper2.getState();
      assert.equal(state.assertions['VAL-TEST-001'].status, 'passed');
      assert.equal(state.assertions['VAL-TEST-002'].status, 'pending');
    });

    it('atomic write prevents mid-write corruption', () => {
      const statePath = path.join(tempDir, 'validation-state.json');
      createValidationState(statePath, {
        'VAL-TEST-001': { status: 'pending' },
      });

      // Simulate a concurrent read during write by checking the file is never malformed
      const gatekeeper = new ValidationStateGatekeeper(statePath);

      // Multiple rapid transitions
      gatekeeper.transition('VAL-TEST-001', 'passed');

      // Verify file is valid
      const content = fs.readFileSync(statePath, 'utf8');
      assert.doesNotThrow(() => JSON.parse(content));
    });
  });

  describe('VAL-VS-005: Corrupted state file triggers recovery', () => {
    it('corrupted JSON triggers backup and reinitialization', () => {
      const statePath = path.join(tempDir, 'validation-state.json');
      fs.writeFileSync(statePath, '{ invalid json }');

      const gatekeeper = new ValidationStateGatekeeper(statePath);

      // Should recover and have empty assertions
      const state = gatekeeper.getState();
      assert.deepEqual(state.assertions, {});
    });

    it('backup file is created with .corrupt.<timestamp> suffix', () => {
      const statePath = path.join(tempDir, 'validation-state.json');
      fs.writeFileSync(statePath, '{ invalid json }');

      const gatekeeper = new ValidationStateGatekeeper(statePath);

      // Verify state was recovered
      const state = gatekeeper.getState();
      assert.deepEqual(state.assertions, {}, 'State should be recovered with empty assertions');

      // Check backup file exists
      const files = fs.readdirSync(tempDir);
      const backupFiles = files.filter((f) => f.startsWith('validation-state.json.corrupt.'));
      assert.ok(backupFiles.length > 0, 'Backup file should be created');
    });

    it('reinitializes all assertions as pending after corruption', () => {
      const statePath = path.join(tempDir, 'validation-state.json');
      const contractPath = path.join(tempDir, 'validation-contract.md');

      // Create contract with 3 rules
      createValidationContract(contractPath, [
        { id: 'VAL-TEST-001', title: 'Test 1' },
        { id: 'VAL-TEST-002', title: 'Test 2' },
        { id: 'VAL-TEST-003', title: 'Test 3' },
      ]);

      // Create corrupted state file
      fs.writeFileSync(statePath, '{ invalid json }');

      // Sync with contract
      const gatekeeper = new ValidationStateGatekeeper(statePath, { contractPath });
      gatekeeper.syncWithContract();

      const state = gatekeeper.getState();
      assert.equal(state.assertions['VAL-TEST-001'].status, 'pending');
      assert.equal(state.assertions['VAL-TEST-002'].status, 'pending');
      assert.equal(state.assertions['VAL-TEST-003'].status, 'pending');
    });

    it('empty state file is handled gracefully', () => {
      const statePath = path.join(tempDir, 'validation-state.json');
      fs.writeFileSync(statePath, '');

      const gatekeeper = new ValidationStateGatekeeper(statePath);
      const state = gatekeeper.getState();

      assert.deepEqual(state.assertions, {});
    });

    it('state file with wrong schema triggers recovery', () => {
      const statePath = path.join(tempDir, 'validation-state.json');
      fs.writeFileSync(statePath, JSON.stringify({ wrongField: 'value' }));

      const gatekeeper = new ValidationStateGatekeeper(statePath);
      const state = gatekeeper.getState();

      assert.deepEqual(state.assertions, {});
    });
  });

  describe('Orphaned assertion handling', () => {
    it('orphaned assertion IDs logged as warnings and excluded', () => {
      const statePath = path.join(tempDir, 'validation-state.json');
      const contractPath = path.join(tempDir, 'validation-contract.md');

      createValidationState(statePath, {
        'VAL-TEST-001': { status: 'passed' },
        'VAL-ORPHAN-999': { status: 'passed' }, // This one is orphaned
      });

      createValidationContract(contractPath, [{ id: 'VAL-TEST-001', title: 'Test 1' }]);

      const gatekeeper = new ValidationStateGatekeeper(statePath, { contractPath });
      const warnings = gatekeeper.syncWithContract();

      assert.ok(Array.isArray(warnings));
      assert.ok(warnings.some((w) => w.code === 'ORPHANED_ASSERTION'));

      // Orphaned assertion should not block canComplete for known assertions
      const result = gatekeeper.canComplete(['VAL-TEST-001']);
      assert.equal(result.allowed, true);
    });

    it('new contract IDs auto-added as pending', () => {
      const statePath = path.join(tempDir, 'validation-state.json');
      const contractPath = path.join(tempDir, 'validation-contract.md');

      createValidationState(statePath, {
        'VAL-TEST-001': { status: 'passed' },
      });

      createValidationContract(contractPath, [
        { id: 'VAL-TEST-001', title: 'Test 1' },
        { id: 'VAL-NEW-002', title: 'Test 2' }, // New assertion in contract
      ]);

      const gatekeeper = new ValidationStateGatekeeper(statePath, { contractPath });
      gatekeeper.syncWithContract();

      const state = gatekeeper.getState();
      assert.equal(state.assertions['VAL-NEW-002'].status, 'pending');
    });
  });

  describe('Write queue for concurrent updates', () => {
    it('concurrent updates are serialized', async () => {
      const statePath = path.join(tempDir, 'validation-state.json');
      createValidationState(statePath, {
        'VAL-TEST-001': { status: 'pending' },
        'VAL-TEST-002': { status: 'pending' },
      });

      const gatekeeper = new ValidationStateGatekeeper(statePath);

      // Fire multiple transitions concurrently
      const promises = [
        gatekeeper.transitionAsync('VAL-TEST-001', 'passed'),
        gatekeeper.transitionAsync('VAL-TEST-002', 'failed'),
      ];

      await Promise.all(promises);

      // Both should be persisted
      const state = gatekeeper.getState();
      assert.equal(state.assertions['VAL-TEST-001'].status, 'passed');
      assert.equal(state.assertions['VAL-TEST-002'].status, 'failed');
    });
  });

  describe('Assertion status metadata', () => {
    it('tracks validatedAtMilestone when set', () => {
      const statePath = path.join(tempDir, 'validation-state.json');
      createValidationState(statePath, {
        'VAL-TEST-001': { status: 'passed', validatedAtMilestone: 'mission-core' },
      });

      const gatekeeper = new ValidationStateGatekeeper(statePath);
      const state = gatekeeper.getState();

      assert.equal(state.assertions['VAL-TEST-001'].validatedAtMilestone, 'mission-core');
    });

    it('updates timestamp on status change', () => {
      const statePath = path.join(tempDir, 'validation-state.json');
      createValidationState(statePath, {
        'VAL-TEST-001': { status: 'pending' },
      });

      const beforeTransition = new Date().toISOString();
      const gatekeeper = new ValidationStateGatekeeper(statePath);
      gatekeeper.transition('VAL-TEST-001', 'passed');

      const state = gatekeeper.getState();
      assert.ok(state.assertions['VAL-TEST-001'].updatedAt);
      assert.ok(state.assertions['VAL-TEST-001'].updatedAt >= beforeTransition);
    });
  });

  describe('Missing file initialization', () => {
    it('creates new state file with empty assertions if missing', () => {
      const statePath = path.join(tempDir, 'validation-state.json');

      // Don't create the file
      const gatekeeper = new ValidationStateGatekeeper(statePath);
      const state = gatekeeper.getState();

      assert.deepEqual(state.assertions, {});
      assert.ok(fs.existsSync(statePath));
    });
  });

  describe('Error handling', () => {
    it('transition on unknown assertion throws ASSERTION_NOT_FOUND', () => {
      const statePath = path.join(tempDir, 'validation-state.json');
      createValidationState(statePath, {});

      const gatekeeper = new ValidationStateGatekeeper(statePath);

      assert.throws(
        () => gatekeeper.transition('VAL-UNKNOWN-999', 'passed'),
        (err) => {
          assert.equal(err.code, 'ASSERTION_NOT_FOUND');
          return true;
        }
      );
    });

    it('invalid status value throws INVALID_STATUS', () => {
      const statePath = path.join(tempDir, 'validation-state.json');
      createValidationState(statePath, {
        'VAL-TEST-001': { status: 'pending' },
      });

      const gatekeeper = new ValidationStateGatekeeper(statePath);

      assert.throws(
        () => gatekeeper.transition('VAL-TEST-001', 'invalid_status'),
        (err) => {
          assert.equal(err.code, 'INVALID_STATUS');
          return true;
        }
      );
    });
  });

  describe('Convenience functions', () => {
    it('createGatekeeper() creates and initializes gatekeeper', () => {
      const statePath = path.join(tempDir, 'validation-state.json');
      const gatekeeper = createGatekeeper(statePath);

      assert.ok(gatekeeper instanceof ValidationStateGatekeeper);
      assert.ok(fs.existsSync(statePath));
    });
  });
});
