'use strict';

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Module under test
const { FeaturesStateMachine } = require('../../.claude/lib/mission/features-state-machine.cjs');

describe('Features State Machine - Extended Tests', () => {
  let tempDir;
  let featuresPath;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'features-state-machine-extended-test-'));
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

  describe('VAL-FS-006: Precondition check blocks dependent feature', () => {
    it('feature with unmet precondition cannot transition to in_progress', () => {
      writeFeatures([
        { id: 'feature-a', description: 'Base', status: 'pending', preconditions: [] },
        {
          id: 'feature-b',
          description: 'Depends on A',
          status: 'pending',
          preconditions: ['feature-a'],
        },
      ]);

      const machine = new FeaturesStateMachine(featuresPath);
      machine.load();

      assert.throws(
        () => {
          machine.transition('feature-b', 'in_progress');
        },
        err => {
          assert.strictEqual(err.code, 'PRECONDITION_NOT_MET');
          assert.ok(err.details && err.details.unmetDeps);
          assert.ok(err.details.unmetDeps.includes('feature-a'));
          return true;
        }
      );
    });

    it('feature with multiple unmet preconditions lists all', () => {
      writeFeatures([
        { id: 'dep-a', description: 'Dep A', status: 'pending', preconditions: [] },
        { id: 'dep-b', description: 'Dep B', status: 'pending', preconditions: [] },
        {
          id: 'feature-c',
          description: 'Depends on A and B',
          status: 'pending',
          preconditions: ['dep-a', 'dep-b'],
        },
      ]);

      const machine = new FeaturesStateMachine(featuresPath);
      machine.load();

      assert.throws(
        () => {
          machine.transition('feature-c', 'in_progress');
        },
        err => {
          assert.strictEqual(err.code, 'PRECONDITION_NOT_MET');
          assert.ok(err.details.unmetDeps.includes('dep-a'));
          assert.ok(err.details.unmetDeps.includes('dep-b'));
          return true;
        }
      );
    });

    it('feature with partially met preconditions still blocked', () => {
      writeFeatures([
        {
          id: 'dep-x',
          description: 'Dep X',
          status: 'completed',
          completedAt: new Date().toISOString(),
          preconditions: [],
        },
        { id: 'dep-y', description: 'Dep Y', status: 'pending', preconditions: [] },
        {
          id: 'feature-d',
          description: 'Depends on X and Y',
          status: 'pending',
          preconditions: ['dep-x', 'dep-y'],
        },
      ]);

      const machine = new FeaturesStateMachine(featuresPath);
      machine.load();

      assert.throws(
        () => {
          machine.transition('feature-d', 'in_progress');
        },
        err => {
          assert.strictEqual(err.code, 'PRECONDITION_NOT_MET');
          assert.ok(!err.details.unmetDeps.includes('dep-x'));
          assert.ok(err.details.unmetDeps.includes('dep-y'));
          return true;
        }
      );
    });
  });

  describe('VAL-FS-007: Precondition passes when dependency is completed', () => {
    it('feature can transition after dependency is completed', () => {
      writeFeatures([
        {
          id: 'base-feature',
          description: 'Base',
          status: 'completed',
          completedAt: new Date().toISOString(),
          preconditions: [],
        },
        {
          id: 'dependent-feature',
          description: 'Depends on base',
          status: 'pending',
          preconditions: ['base-feature'],
        },
      ]);

      const machine = new FeaturesStateMachine(featuresPath);
      machine.load();

      machine.transition('dependent-feature', 'in_progress');

      const data = readFeatures();
      const feature = data.features.find(f => f.id === 'dependent-feature');
      assert.strictEqual(feature.status, 'in_progress');
    });

    it('feature with multiple completed dependencies can transition', () => {
      writeFeatures([
        {
          id: 'dep-1',
          description: 'D1',
          status: 'completed',
          completedAt: new Date().toISOString(),
          preconditions: [],
        },
        {
          id: 'dep-2',
          description: 'D2',
          status: 'completed',
          completedAt: new Date().toISOString(),
          preconditions: [],
        },
        {
          id: 'multi-dep',
          description: 'Multi dep',
          status: 'pending',
          preconditions: ['dep-1', 'dep-2'],
        },
      ]);

      const machine = new FeaturesStateMachine(featuresPath);
      machine.load();

      machine.transition('multi-dep', 'in_progress');

      const data = readFeatures();
      const feature = data.features.find(f => f.id === 'multi-dep');
      assert.strictEqual(feature.status, 'in_progress');
    });
  });

  describe('VAL-FS-008: Circular dependency detection', () => {
    it('A depends on B, B depends on A throws CIRCULAR_DEPENDENCY at load', () => {
      writeFeatures([
        { id: 'feature-a', description: 'A', status: 'pending', preconditions: ['feature-b'] },
        { id: 'feature-b', description: 'B', status: 'pending', preconditions: ['feature-a'] },
      ]);

      assert.throws(
        () => {
          const machine = new FeaturesStateMachine(featuresPath);
          machine.load();
        },
        err => {
          assert.strictEqual(err.code, 'CIRCULAR_DEPENDENCY');
          assert.ok(err.details && err.details.cycle);
          return true;
        }
      );
    });

    it('three-node cycle A->B->C->A detected', () => {
      writeFeatures([
        { id: 'a', description: 'A', status: 'pending', preconditions: ['c'] },
        { id: 'b', description: 'B', status: 'pending', preconditions: ['a'] },
        { id: 'c', description: 'C', status: 'pending', preconditions: ['b'] },
      ]);

      assert.throws(
        () => {
          const machine = new FeaturesStateMachine(featuresPath);
          machine.load();
        },
        { code: 'CIRCULAR_DEPENDENCY' }
      );
    });

    it('self-dependency detected', () => {
      writeFeatures([
        { id: 'self-loop', description: 'Self', status: 'pending', preconditions: ['self-loop'] },
      ]);

      assert.throws(
        () => {
          const machine = new FeaturesStateMachine(featuresPath);
          machine.load();
        },
        { code: 'CIRCULAR_DEPENDENCY' }
      );
    });

    it('no cycle in valid dependency chain', () => {
      writeFeatures([
        { id: 'a', description: 'A', status: 'pending', preconditions: [] },
        { id: 'b', description: 'B', status: 'pending', preconditions: ['a'] },
        { id: 'c', description: 'C', status: 'pending', preconditions: ['b'] },
      ]);

      const machine = new FeaturesStateMachine(featuresPath);
      machine.load();

      const data = readFeatures();
      assert.strictEqual(data.features.length, 3);
    });
  });

  describe('VAL-FS-009: Malformed features.json rejected gracefully', () => {
    it('invalid JSON syntax produces descriptive error', () => {
      fs.writeFileSync(featuresPath, '{ invalid json }', 'utf8');

      assert.throws(
        () => {
          const machine = new FeaturesStateMachine(featuresPath);
          machine.load();
        },
        err => {
          assert.ok(
            err.code === 'INVALID_JSON' ||
              err.message.includes('JSON') ||
              err.message.includes('parse')
          );
          assert.ok(err.details && err.details.path);
          return true;
        }
      );
    });

    it('missing features array produces validation error', () => {
      fs.writeFileSync(featuresPath, JSON.stringify({ notFeatures: [] }), 'utf8');

      assert.throws(
        () => {
          const machine = new FeaturesStateMachine(featuresPath);
          machine.load();
        },
        err => {
          assert.strictEqual(err.code, 'SCHEMA_VALIDATION_ERROR');
          return true;
        }
      );
    });

    it('feature with invalid status produces validation error', () => {
      writeFeatures([
        { id: 'bad-status', description: 'Bad', status: 'invalid_status', preconditions: [] },
      ]);

      assert.throws(
        () => {
          const machine = new FeaturesStateMachine(featuresPath);
          machine.load();
        },
        err => {
          assert.strictEqual(err.code, 'SCHEMA_VALIDATION_ERROR');
          return true;
        }
      );
    });

    it('feature missing required id produces validation error', () => {
      fs.writeFileSync(
        featuresPath,
        JSON.stringify({
          features: [{ description: 'No ID', status: 'pending', preconditions: [] }],
        }),
        'utf8'
      );

      assert.throws(
        () => {
          const machine = new FeaturesStateMachine(featuresPath);
          machine.load();
        },
        err => {
          assert.strictEqual(err.code, 'SCHEMA_VALIDATION_ERROR');
          return true;
        }
      );
    });

    it('empty file produces controlled error', () => {
      fs.writeFileSync(featuresPath, '', 'utf8');

      assert.throws(
        () => {
          const machine = new FeaturesStateMachine(featuresPath);
          machine.load();
        },
        err => {
          assert.ok(err.code);
          return true;
        }
      );
    });
  });

  describe('VAL-FS-010: Atomic write safety', () => {
    it('state transitions use atomic write (write .tmp + rename)', () => {
      writeFeatures([
        { id: 'atomic-test', description: 'Atomic', status: 'pending', preconditions: [] },
      ]);

      const machine = new FeaturesStateMachine(featuresPath);
      machine.load();

      machine.transition('atomic-test', 'in_progress');

      const tmpPath = featuresPath + '.tmp';
      assert.ok(!fs.existsSync(tmpPath), '.tmp file should not remain after atomic write');
      assert.ok(fs.existsSync(featuresPath), 'features.json should exist');

      const data = readFeatures();
      const feature = data.features.find(f => f.id === 'atomic-test');
      assert.strictEqual(feature.status, 'in_progress');
    });

    it('atomic write preserves other features', () => {
      writeFeatures([
        { id: 'feature-1', description: 'F1', status: 'pending', preconditions: [] },
        { id: 'feature-2', description: 'F2', status: 'pending', preconditions: [] },
        { id: 'feature-3', description: 'F3', status: 'pending', preconditions: [] },
      ]);

      const machine = new FeaturesStateMachine(featuresPath);
      machine.load();

      machine.transition('feature-2', 'in_progress');

      const data = readFeatures();

      assert.strictEqual(data.features.length, 3);

      const f1 = data.features.find(f => f.id === 'feature-1');
      const f2 = data.features.find(f => f.id === 'feature-2');
      const f3 = data.features.find(f => f.id === 'feature-3');

      assert.strictEqual(f1.status, 'pending');
      assert.strictEqual(f2.status, 'in_progress');
      assert.strictEqual(f3.status, 'pending');
    });
  });

  describe('Additional functionality', () => {
    it('getEligibleFeatures returns features with met preconditions', () => {
      writeFeatures([
        {
          id: 'done',
          description: 'Done',
          status: 'completed',
          completedAt: new Date().toISOString(),
          preconditions: [],
        },
        { id: 'eligible', description: 'Eligible', status: 'pending', preconditions: ['done'] },
        { id: 'blocked', description: 'Blocked', status: 'pending', preconditions: ['not-done'] },
        { id: 'no-deps', description: 'No deps', status: 'pending', preconditions: [] },
      ]);

      const machine = new FeaturesStateMachine(featuresPath);
      machine.load();

      const eligible = machine.getEligibleFeatures();

      const eligibleIds = eligible.map(f => f.id);

      assert.ok(eligibleIds.includes('eligible'));
      assert.ok(eligibleIds.includes('no-deps'));
      assert.ok(!eligibleIds.includes('done'));
      assert.ok(!eligibleIds.includes('blocked'));
    });

    it('getEligibleFeatures returns features in array order (priority)', () => {
      writeFeatures([
        { id: 'first', description: 'First', status: 'pending', preconditions: [] },
        { id: 'second', description: 'Second', status: 'pending', preconditions: [] },
        { id: 'third', description: 'Third', status: 'pending', preconditions: [] },
      ]);

      const machine = new FeaturesStateMachine(featuresPath);
      machine.load();

      const eligible = machine.getEligibleFeatures();

      assert.strictEqual(eligible[0].id, 'first');
      assert.strictEqual(eligible[1].id, 'second');
      assert.strictEqual(eligible[2].id, 'third');
    });

    it('unknown feature ID throws FEATURE_NOT_FOUND', () => {
      writeFeatures([
        { id: 'exists', description: 'Exists', status: 'pending', preconditions: [] },
      ]);

      const machine = new FeaturesStateMachine(featuresPath);
      machine.load();

      assert.throws(
        () => {
          machine.transition('non-existent', 'in_progress');
        },
        { code: 'FEATURE_NOT_FOUND' }
      );
    });

    it('retryCount defaults to 0 for new features', () => {
      writeFeatures([
        { id: 'new-feature', description: 'New', status: 'pending', preconditions: [] },
      ]);

      const machine = new FeaturesStateMachine(featuresPath);
      machine.load();

      const feature = machine.getFeature('new-feature');
      assert.strictEqual(feature.retryCount, 0);
    });

    it('transition to pending from failed preserves retryCount', () => {
      writeFeatures([
        {
          id: 'retry-preserve',
          description: 'Retry',
          status: 'failed',
          retryCount: 3,
          failedAt: new Date().toISOString(),
          preconditions: [],
        },
      ]);

      const machine = new FeaturesStateMachine(featuresPath);
      machine.load();

      machine.transition('retry-preserve', 'pending');

      const data = readFeatures();
      const feature = data.features.find(f => f.id === 'retry-preserve');
      assert.strictEqual(feature.status, 'pending');
      assert.strictEqual(feature.retryCount, 3);
    });
  });
});
