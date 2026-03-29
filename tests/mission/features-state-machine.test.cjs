'use strict';

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Module under test
const { FeaturesStateMachine } = require('../../.claude/lib/mission/features-state-machine.cjs');

describe('Features State Machine', () => {
  let tempDir;
  let featuresPath;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'features-state-machine-test-'));
  });

  after(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    featuresPath = path.join(tempDir, 'features.json');
  });

  afterEach(() => {
    if (fs.existsSync(featuresPath)) {
      fs.rmSync(featuresPath, { force: true });
    }
  });

  function writeFeatures(features) {
    fs.writeFileSync(featuresPath, JSON.stringify({ features }, null, 2), 'utf8');
  }

  function readFeatures() {
    const content = fs.readFileSync(featuresPath, 'utf8');
    return JSON.parse(content);
  }

  describe('VAL-FS-001: Valid transition pending to in_progress succeeds', () => {
    it('pending to in_progress succeeds and sets startedAt timestamp', () => {
      writeFeatures([
        { id: 'feature-a', description: 'Test feature', status: 'pending', preconditions: [] },
      ]);

      const machine = new FeaturesStateMachine(featuresPath);
      machine.load();

      const beforeTransition = Date.now();
      machine.transition('feature-a', 'in_progress');
      const afterTransition = Date.now();

      const data = readFeatures();
      const feature = data.features.find(f => f.id === 'feature-a');

      assert.strictEqual(feature.status, 'in_progress', 'Status should be in_progress');
      assert.ok(feature.startedAt, 'startedAt should be set');

      const startedAtTime = new Date(feature.startedAt).getTime();
      assert.ok(
        startedAtTime >= beforeTransition && startedAtTime <= afterTransition,
        'startedAt should be set to current time'
      );
    });

    it('pending to in_progress works for feature with empty preconditions', () => {
      writeFeatures([
        { id: 'standalone', description: 'No deps', status: 'pending', preconditions: [] },
      ]);

      const machine = new FeaturesStateMachine(featuresPath);
      machine.load();
      machine.transition('standalone', 'in_progress');

      const data = readFeatures();
      const feature = data.features.find(f => f.id === 'standalone');
      assert.strictEqual(feature.status, 'in_progress');
    });
  });

  describe('VAL-FS-002: Valid transition in_progress to completed succeeds', () => {
    it('validating to completed succeeds and sets completedAt', () => {
      writeFeatures([
        {
          id: 'feature-b',
          description: 'Test feature',
          status: 'validating',
          startedAt: new Date().toISOString(),
          preconditions: [],
        },
      ]);

      const machine = new FeaturesStateMachine(featuresPath);
      machine.load();

      const beforeTransition = Date.now();
      machine.transition('feature-b', 'completed');
      const afterTransition = Date.now();

      const data = readFeatures();
      const feature = data.features.find(f => f.id === 'feature-b');

      assert.strictEqual(feature.status, 'completed', 'Status should be completed');
      assert.ok(feature.completedAt, 'completedAt should be set');

      const completedAtTime = new Date(feature.completedAt).getTime();
      assert.ok(
        completedAtTime >= beforeTransition && completedAtTime <= afterTransition,
        'completedAt should be set to current time'
      );
    });

    it('in_progress to validating succeeds', () => {
      writeFeatures([
        {
          id: 'feature-c',
          description: 'Test feature',
          status: 'in_progress',
          startedAt: new Date().toISOString(),
          preconditions: [],
        },
      ]);

      const machine = new FeaturesStateMachine(featuresPath);
      machine.load();
      machine.transition('feature-c', 'validating');

      const data = readFeatures();
      const feature = data.features.find(f => f.id === 'feature-c');
      assert.strictEqual(feature.status, 'validating');
    });

    it('validating to completed succeeds', () => {
      writeFeatures([
        {
          id: 'feature-d',
          description: 'Test feature',
          status: 'validating',
          startedAt: new Date().toISOString(),
          preconditions: [],
        },
      ]);

      const machine = new FeaturesStateMachine(featuresPath);
      machine.load();

      machine.transition('feature-d', 'completed');

      const data = readFeatures();
      const feature = data.features.find(f => f.id === 'feature-d');

      assert.strictEqual(feature.status, 'completed');
      assert.ok(feature.completedAt, 'completedAt should be set');
    });
  });

  describe('VAL-FS-003: Transition in_progress to failed increments retry counter', () => {
    it('failed increments retryCount from 0 to 1', () => {
      writeFeatures([
        {
          id: 'feature-e',
          description: 'Test feature',
          status: 'in_progress',
          startedAt: new Date().toISOString(),
          retryCount: 0,
          preconditions: [],
        },
      ]);

      const machine = new FeaturesStateMachine(featuresPath);
      machine.load();

      const beforeTransition = Date.now();
      machine.transition('feature-e', 'failed');
      const afterTransition = Date.now();

      const data = readFeatures();
      const feature = data.features.find(f => f.id === 'feature-e');

      assert.strictEqual(feature.status, 'failed');
      assert.strictEqual(feature.retryCount, 1, 'retryCount should be incremented to 1');
      assert.ok(feature.failedAt, 'failedAt should be set');

      const failedAtTime = new Date(feature.failedAt).getTime();
      assert.ok(
        failedAtTime >= beforeTransition && failedAtTime <= afterTransition,
        'failedAt should be current time'
      );
    });

    it('failed->pending->in_progress->failed increments retryCount to 2', () => {
      writeFeatures([
        {
          id: 'feature-retry',
          description: 'Retry test',
          status: 'in_progress',
          retryCount: 0,
          preconditions: [],
        },
      ]);

      const machine = new FeaturesStateMachine(featuresPath);
      machine.load();

      // First failure
      machine.transition('feature-retry', 'failed');
      let data = readFeatures();
      let feature = data.features.find(f => f.id === 'feature-retry');
      assert.strictEqual(feature.retryCount, 1);

      // Reset to pending
      machine.transition('feature-retry', 'pending');
      data = readFeatures();
      feature = data.features.find(f => f.id === 'feature-retry');
      assert.strictEqual(feature.status, 'pending');
      assert.strictEqual(feature.retryCount, 1, 'retryCount preserved on pending transition');

      // Back to in_progress
      machine.transition('feature-retry', 'in_progress');
      data = readFeatures();
      feature = data.features.find(f => f.id === 'feature-retry');
      assert.strictEqual(feature.status, 'in_progress');

      // Second failure
      machine.transition('feature-retry', 'failed');
      data = readFeatures();
      feature = data.features.find(f => f.id === 'feature-retry');
      assert.strictEqual(feature.retryCount, 2, 'retryCount should be 2 after second failure');
    });
  });

  describe('VAL-FS-004: Invalid transition pending to completed is rejected', () => {
    it('pending to completed throws INVALID_TRANSITION', () => {
      writeFeatures([
        { id: 'feature-f', description: 'Test', status: 'pending', preconditions: [] },
      ]);

      const machine = new FeaturesStateMachine(featuresPath);
      machine.load();

      assert.throws(
        () => {
          machine.transition('feature-f', 'completed');
        },
        err => {
          assert.strictEqual(err.code, 'INVALID_TRANSITION');
          assert.ok(err.message.includes('pending') && err.message.includes('completed'));
          return true;
        }
      );
    });

    it('pending to validating throws INVALID_TRANSITION', () => {
      writeFeatures([
        { id: 'feature-g', description: 'Test', status: 'pending', preconditions: [] },
      ]);

      const machine = new FeaturesStateMachine(featuresPath);
      machine.load();

      assert.throws(
        () => {
          machine.transition('feature-g', 'validating');
        },
        { code: 'INVALID_TRANSITION' }
      );
    });

    it('pending to failed throws INVALID_TRANSITION', () => {
      writeFeatures([
        { id: 'feature-h', description: 'Test', status: 'pending', preconditions: [] },
      ]);

      const machine = new FeaturesStateMachine(featuresPath);
      machine.load();

      assert.throws(
        () => {
          machine.transition('feature-h', 'failed');
        },
        { code: 'INVALID_TRANSITION' }
      );
    });
  });

  describe('VAL-FS-005: Completed is a terminal state', () => {
    it('completed to pending throws INVALID_TRANSITION', () => {
      writeFeatures([
        {
          id: 'feature-done',
          description: 'Done',
          status: 'completed',
          completedAt: new Date().toISOString(),
          preconditions: [],
        },
      ]);

      const machine = new FeaturesStateMachine(featuresPath);
      machine.load();

      assert.throws(
        () => {
          machine.transition('feature-done', 'pending');
        },
        { code: 'INVALID_TRANSITION' }
      );
    });

    it('completed to in_progress throws INVALID_TRANSITION', () => {
      writeFeatures([
        {
          id: 'feature-done2',
          description: 'Done',
          status: 'completed',
          completedAt: new Date().toISOString(),
          preconditions: [],
        },
      ]);

      const machine = new FeaturesStateMachine(featuresPath);
      machine.load();

      assert.throws(
        () => {
          machine.transition('feature-done2', 'in_progress');
        },
        { code: 'INVALID_TRANSITION' }
      );
    });

    it('completed to validating throws INVALID_TRANSITION', () => {
      writeFeatures([
        {
          id: 'feature-done3',
          description: 'Done',
          status: 'completed',
          completedAt: new Date().toISOString(),
          preconditions: [],
        },
      ]);

      const machine = new FeaturesStateMachine(featuresPath);
      machine.load();

      assert.throws(
        () => {
          machine.transition('feature-done3', 'validating');
        },
        { code: 'INVALID_TRANSITION' }
      );
    });

    it('completed to failed throws INVALID_TRANSITION', () => {
      writeFeatures([
        {
          id: 'feature-done4',
          description: 'Done',
          status: 'completed',
          completedAt: new Date().toISOString(),
          preconditions: [],
        },
      ]);

      const machine = new FeaturesStateMachine(featuresPath);
      machine.load();

      assert.throws(
        () => {
          machine.transition('feature-done4', 'failed');
        },
        { code: 'INVALID_TRANSITION' }
      );
    });

    it('cancelled to any state throws INVALID_TRANSITION', () => {
      writeFeatures([
        { id: 'feature-cancelled', description: 'Cancelled', status: 'cancelled', preconditions: [] },
      ]);

      const machine = new FeaturesStateMachine(featuresPath);
      machine.load();

      for (const targetStatus of ['pending', 'in_progress', 'validating', 'completed', 'failed']) {
        assert.throws(
          () => {
            machine.transition('feature-cancelled', targetStatus);
          },
          { code: 'INVALID_TRANSITION' },
          `cancelled to ${targetStatus} should throw`
        );
      }
    });
  });
});
