/**
 * SPEC-020: Workflow Versioning & Migrations
 * RED Phase: Comprehensive test suite (67 tests)
 *
 * Tests semantic versioning, blue-green deployment, migration strategies,
 * and version compatibility checking.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// ==============================================================================
// Category 1: Version Management (14 tests)
// ==============================================================================

describe('Category 1: Version Management', () => {
  describe('Semantic Versioning', () => {
    it('should parse semantic version (major.minor.patch)', async () => {
      const WorkflowVersioner = require('../.claude/lib/workflow/workflow-versioner.cjs');
      const versioner = new WorkflowVersioner();

      const parsed = versioner.parseVersion('2.1.3');

      assert.equal(parsed.major, 2);
      assert.equal(parsed.minor, 1);
      assert.equal(parsed.patch, 3);
      assert.equal(parsed.string, '2.1.3');
    });

    it('should compare versions for ordering', async () => {
      const WorkflowVersioner = require('../.claude/lib/workflow/workflow-versioner.cjs');
      const versioner = new WorkflowVersioner();

      assert.equal(versioner.compareVersions('1.0.0', '2.0.0'), -1); // 1.0.0 < 2.0.0
      assert.equal(versioner.compareVersions('2.0.0', '2.0.0'), 0); // equal
      assert.equal(versioner.compareVersions('2.1.0', '2.0.5'), 1); // 2.1.0 > 2.0.5
    });

    it('should validate version constraints (semver ranges)', async () => {
      const WorkflowVersioner = require('../.claude/lib/workflow/workflow-versioner.cjs');
      const versioner = new WorkflowVersioner();

      assert.equal(versioner.satisfies('2.1.0', '>=2.0.0'), true);
      assert.equal(versioner.satisfies('1.9.0', '>=2.0.0'), false);
      assert.equal(versioner.satisfies('2.0.5', '^2.0.0'), true); // Compatible
      assert.equal(versioner.satisfies('3.0.0', '^2.0.0'), false); // Breaking
    });

    it('should detect breaking changes (major version increment)', async () => {
      const WorkflowVersioner = require('../.claude/lib/workflow/workflow-versioner.cjs');
      const versioner = new WorkflowVersioner();

      assert.equal(versioner.isBreakingChange('1.9.0', '2.0.0'), true);
      assert.equal(versioner.isBreakingChange('2.0.0', '2.1.0'), false);
      assert.equal(versioner.isBreakingChange('2.1.5', '2.1.6'), false);
    });
  });

  describe('Version Registry', () => {
    let versioner;

    beforeEach(() => {
      const WorkflowVersioner = require('../.claude/lib/workflow/workflow-versioner.cjs');
      versioner = new WorkflowVersioner();
    });

    it('should register workflow version with metadata', async () => {
      await versioner.register('feature-dev', '1.0.0', {
        workflowPath: '/workflows/feature-dev/v1.0.0',
        created: '2026-01-30T10:00:00Z',
        author: 'planner',
      });

      const version = versioner.get('feature-dev', '1.0.0');

      assert.equal(version.version, '1.0.0');
      assert.equal(version.workflowPath, '/workflows/feature-dev/v1.0.0');
      assert.equal(version.author, 'planner');
    });

    it('should list all versions for workflow (sorted)', async () => {
      await versioner.register('feature-dev', '1.0.0', {});
      await versioner.register('feature-dev', '2.0.0', {});
      await versioner.register('feature-dev', '1.5.0', {});

      const versions = versioner.listVersions('feature-dev');

      assert.equal(versions.length, 3);
      assert.equal(versions[0], '1.0.0'); // Sorted ascending
      assert.equal(versions[1], '1.5.0');
      assert.equal(versions[2], '2.0.0');
    });

    it('should get latest version for workflow', async () => {
      await versioner.register('feature-dev', '1.0.0', {});
      await versioner.register('feature-dev', '2.1.0', {});
      await versioner.register('feature-dev', '2.0.5', {});

      const latest = versioner.getLatest('feature-dev');

      assert.equal(latest.version, '2.1.0');
    });

    it('should get active version (symlink or default to latest)', async () => {
      await versioner.register('feature-dev', '1.0.0', {});
      await versioner.register('feature-dev', '2.0.0', {});
      await versioner.setActive('feature-dev', '2.0.0');

      const active = versioner.getActive('feature-dev');

      assert.equal(active.version, '2.0.0');
    });

    it('should update active version (for blue-green switch)', async () => {
      await versioner.register('feature-dev', '1.0.0', {});
      await versioner.register('feature-dev', '2.0.0', {});
      await versioner.setActive('feature-dev', '1.0.0');

      await versioner.setActive('feature-dev', '2.0.0');

      const active = versioner.getActive('feature-dev');
      assert.equal(active.version, '2.0.0');
    });
  });

  describe('Backward Compatibility Checking', () => {
    it('should check if version is backward compatible', async () => {
      const WorkflowVersioner = require('../.claude/lib/workflow/workflow-versioner.cjs');
      const versioner = new WorkflowVersioner();

      await versioner.register('feature-dev', '1.0.0', { minCompatibleVersion: '1.0.0' });
      await versioner.register('feature-dev', '1.5.0', { minCompatibleVersion: '1.0.0' });
      await versioner.register('feature-dev', '2.0.0', { minCompatibleVersion: '2.0.0' });

      assert.equal(versioner.isBackwardCompatible('feature-dev', '1.2.0', '1.5.0'), true);
      assert.equal(versioner.isBackwardCompatible('feature-dev', '1.9.0', '2.0.0'), false);
    });

    it('should validate state can be migrated from old version', async () => {
      const WorkflowVersioner = require('../.claude/lib/workflow/workflow-versioner.cjs');
      const versioner = new WorkflowVersioner();

      await versioner.register('feature-dev', '1.0.0', { minCompatibleVersion: '1.0.0' });
      await versioner.register('feature-dev', '2.0.0', { minCompatibleVersion: '1.0.0' });

      const state = { workflowVersion: '1.5.0', phases: {} };

      assert.equal(versioner.canMigrate(state, '2.0.0'), true);
    });

    it('should detect incompatible state versions (no migration path)', async () => {
      const WorkflowVersioner = require('../.claude/lib/workflow/workflow-versioner.cjs');
      const versioner = new WorkflowVersioner();

      await versioner.register('feature-dev', '3.0.0', { minCompatibleVersion: '2.0.0' });

      const state = { workflowVersion: '1.0.0', phases: {} };

      assert.equal(versioner.canMigrate(state, '3.0.0'), false);
    });

    it('should calculate upgrade path (list of required migrations)', async () => {
      const WorkflowVersioner = require('../.claude/lib/workflow/workflow-versioner.cjs');
      const versioner = new WorkflowVersioner();

      await versioner.register('feature-dev', '1.0.0', {});
      await versioner.register('feature-dev', '2.0.0', {
        migrations: [{ from: '1.x.x', to: '2.0.0' }],
      });
      await versioner.register('feature-dev', '3.0.0', {
        migrations: [{ from: '2.x.x', to: '3.0.0' }],
      });

      const path = versioner.getUpgradePath('feature-dev', '1.0.0', '3.0.0');

      assert.equal(path.length, 2);
      assert.equal(path[0].to, '2.0.0');
      assert.equal(path[1].to, '3.0.0');
    });

    it('should reject downgrade without rollback migration', async () => {
      const WorkflowVersioner = require('../.claude/lib/workflow/workflow-versioner.cjs');
      const versioner = new WorkflowVersioner();

      await versioner.register('feature-dev', '1.0.0', {});
      await versioner.register('feature-dev', '2.0.0', {});

      assert.throws(() => {
        versioner.getUpgradePath('feature-dev', '2.0.0', '1.0.0');
      }, /Downgrade not supported/);
    });
  });
});

// ==============================================================================
// Category 2: Blue-Green Deployment (15 tests)
// ==============================================================================

describe('Category 2: Blue-Green Deployment', () => {
  describe('Parallel Version Execution', () => {
    it('should deploy new version alongside current (both active)', async () => {
      const DeploymentManager = require('../.claude/lib/workflow/deployment-manager.cjs');
      const deployer = new DeploymentManager();

      await deployer.deploy('feature-dev', '2.0.0', { startPercentage: 0 });

      const state = deployer.getDeploymentState('feature-dev');

      assert.equal(state.blue.version, '1.0.0');
      assert.equal(state.green.version, '2.0.0');
      assert.equal(state.greenPercentage, 0);
    });

    it('should execute request with blue version (0% green traffic)', async () => {
      const DeploymentManager = require('../.claude/lib/workflow/deployment-manager.cjs');
      const deployer = new DeploymentManager();

      await deployer.deploy('feature-dev', '2.0.0', { startPercentage: 0 });

      const selectedVersion = deployer.selectVersion('feature-dev');

      assert.equal(selectedVersion.version, '1.0.0'); // Blue
    });

    it('should execute request with green version (100% green traffic)', async () => {
      const DeploymentManager = require('../.claude/lib/workflow/deployment-manager.cjs');
      const deployer = new DeploymentManager();

      await deployer.deploy('feature-dev', '2.0.0', { startPercentage: 100 });

      const selectedVersion = deployer.selectVersion('feature-dev');

      assert.equal(selectedVersion.version, '2.0.0'); // Green
    });

    it('should route percentage of traffic to green version', async () => {
      const DeploymentManager = require('../.claude/lib/workflow/deployment-manager.cjs');
      const deployer = new DeploymentManager();

      await deployer.setTraffic('feature-dev', { greenPercentage: 50 });

      // Run 1000 requests for better statistical accuracy
      const results = [];
      for (let i = 0; i < 1000; i++) {
        const version = deployer.selectVersion('feature-dev');
        results.push(version.version);
      }

      const greenCount = results.filter(v => v === '2.0.0').length;
      // With 1000 samples, 50% ± 5% is more reliable (450-550)
      assert.ok(
        greenCount >= 450 && greenCount <= 550,
        `Should route ~50% to green (got ${greenCount}/1000)`
      );
    });
  });

  describe('Traffic Routing', () => {
    let deployer;

    beforeEach(() => {
      const DeploymentManager = require('../.claude/lib/workflow/deployment-manager.cjs');
      deployer = new DeploymentManager();
    });

    it('should ramp up traffic from 0% → 10% → 50% → 100%', async () => {
      await deployer.deploy('feature-dev', '2.0.0', { startPercentage: 0 });

      await deployer.rampUp('feature-dev', 10);
      assert.equal(deployer.getDeploymentState('feature-dev').greenPercentage, 10);

      await deployer.rampUp('feature-dev', 50);
      assert.equal(deployer.getDeploymentState('feature-dev').greenPercentage, 50);

      await deployer.rampUp('feature-dev', 100);
      assert.equal(deployer.getDeploymentState('feature-dev').greenPercentage, 100);
    });

    it('should ramp down traffic (rollback scenario)', async () => {
      await deployer.deploy('feature-dev', '2.0.0', { startPercentage: 50 });

      await deployer.rampDown('feature-dev', 10);

      assert.equal(deployer.getDeploymentState('feature-dev').greenPercentage, 10);
    });

    it('should set traffic to 0% (instant rollback)', async () => {
      await deployer.deploy('feature-dev', '2.0.0', { startPercentage: 100 });

      await deployer.rollback('feature-dev');

      assert.equal(deployer.getDeploymentState('feature-dev').greenPercentage, 0);
    });

    it('should validate traffic percentage (0-100)', async () => {
      assert.rejects(async () => {
        await deployer.setTraffic('feature-dev', { greenPercentage: 150 });
      }, /Invalid percentage/);
    });
  });

  describe('Instant Rollback', () => {
    it('should rollback to blue version (<100ms)', async () => {
      const DeploymentManager = require('../.claude/lib/workflow/deployment-manager.cjs');
      const deployer = new DeploymentManager();

      await deployer.deploy('feature-dev', '2.0.0', { startPercentage: 100 });

      const start = Date.now();
      await deployer.rollback('feature-dev');
      const duration = Date.now() - start;

      assert.ok(duration < 100, 'Rollback should take <100ms');
      assert.equal(deployer.getDeploymentState('feature-dev').greenPercentage, 0);
    });

    it('should restore all traffic to blue version', async () => {
      const DeploymentManager = require('../.claude/lib/workflow/deployment-manager.cjs');
      const deployer = new DeploymentManager();

      await deployer.deploy('feature-dev', '2.0.0', { startPercentage: 100 });
      await deployer.rollback('feature-dev');

      // All requests should go to blue
      for (let i = 0; i < 10; i++) {
        const version = deployer.selectVersion('feature-dev');
        assert.equal(version.version, '1.0.0');
      }
    });

    it('should record rollback reason and timestamp', async () => {
      const DeploymentManager = require('../.claude/lib/workflow/deployment-manager.cjs');
      const deployer = new DeploymentManager();

      await deployer.deploy('feature-dev', '2.0.0', { startPercentage: 100 });
      await deployer.rollback('feature-dev', { reason: 'High error rate' });

      const history = deployer.getRollbackHistory('feature-dev');

      assert.equal(history.length, 1);
      assert.equal(history[0].reason, 'High error rate');
      assert.ok(history[0].timestamp);
    });
  });

  describe('Health Checking', () => {
    it('should check health of blue version', async () => {
      const DeploymentManager = require('../.claude/lib/workflow/deployment-manager.cjs');
      const deployer = new DeploymentManager();

      const health = await deployer.checkHealth('feature-dev', 'blue');

      assert.equal(health.version, '1.0.0');
      assert.ok('healthy' in health);
      assert.ok('metrics' in health);
    });

    it('should check health of green version', async () => {
      const DeploymentManager = require('../.claude/lib/workflow/deployment-manager.cjs');
      const deployer = new DeploymentManager();

      await deployer.deploy('feature-dev', '2.0.0', { startPercentage: 10 });

      const health = await deployer.checkHealth('feature-dev', 'green');

      assert.equal(health.version, '2.0.0');
      assert.ok('healthy' in health);
    });

    it('should prevent ramp-up if green version unhealthy', async () => {
      const DeploymentManager = require('../.claude/lib/workflow/deployment-manager.cjs');
      const deployer = new DeploymentManager();

      // Mock unhealthy green version
      deployer.setMockHealth('feature-dev', 'green', { healthy: false, errorRate: 0.1 });

      await deployer.deploy('feature-dev', '2.0.0', { startPercentage: 10 });

      await assert.rejects(async () => {
        await deployer.rampUp('feature-dev', 50);
      }, /Unhealthy metrics/);
    });

    it('should auto-rollback if health degrades during deployment', async () => {
      const DeploymentManager = require('../.claude/lib/workflow/deployment-manager.cjs');
      const deployer = new DeploymentManager();

      await deployer.deploy('feature-dev', '2.0.0', {
        startPercentage: 10,
        autoRollback: true,
        healthCheckInterval: 1000,
      });

      // Simulate health degradation
      setTimeout(() => {
        deployer.setMockHealth('feature-dev', 'green', { healthy: false });
      }, 500);

      await new Promise(resolve => setTimeout(resolve, 1500));

      // Should have auto-rolled back
      assert.equal(deployer.getDeploymentState('feature-dev').greenPercentage, 0);
    });
  });
});

// ==============================================================================
// Category 3: Migration Strategies (14 tests)
// ==============================================================================

describe('Category 3: Migration Strategies', () => {
  describe('Schema Migration Definitions', () => {
    it('should define migration script with from/to versions', async () => {
      const MigrationExecutor = require('../.claude/lib/workflow/migration-executor.cjs');
      const executor = new MigrationExecutor();

      const migration = {
        from: '1.x.x',
        to: '2.0.0',
        migrate: async state => ({ ...state, newField: 'added' }),
      };

      executor.register('feature-dev', migration);

      const registered = executor.getMigration('feature-dev', '1.5.0', '2.0.0');
      assert.equal(registered.to, '2.0.0');
    });

    it('should define migration with validation function', async () => {
      const MigrationExecutor = require('../.claude/lib/workflow/migration-executor.cjs');
      const executor = new MigrationExecutor();

      const migration = {
        from: '1.x.x',
        to: '2.0.0',
        migrate: async state => state,
        validate: async state => {
          const errors = [];
          if (!state.phases['security-review']) {
            errors.push('Missing security-review phase');
          }
          return { valid: errors.length === 0, errors };
        },
      };

      executor.register('feature-dev', migration);

      const state = { phases: {} };
      const result = await migration.validate(state);

      assert.equal(result.valid, false);
      assert.equal(result.errors[0], 'Missing security-review phase');
    });

    it('should define rollback function for migration', async () => {
      const MigrationExecutor = require('../.claude/lib/workflow/migration-executor.cjs');
      const executor = new MigrationExecutor();

      const migration = {
        from: '1.x.x',
        to: '2.0.0',
        migrate: async state => ({ ...state, newField: 'added' }),
        rollback: async state => {
          const rolled = { ...state };
          delete rolled.newField;
          return rolled;
        },
      };

      executor.register('feature-dev', migration);

      const state = { newField: 'added' };
      const rolledBack = await migration.rollback(state);

      assert.equal(rolledBack.newField, undefined);
    });

    it('should define multi-step migration (chained)', async () => {
      const MigrationExecutor = require('../.claude/lib/workflow/migration-executor.cjs');
      const executor = new MigrationExecutor();

      executor.register('feature-dev', {
        from: '1.x.x',
        to: '2.0.0',
        migrate: async state => ({ ...state, v2: true }),
      });

      executor.register('feature-dev', {
        from: '2.x.x',
        to: '3.0.0',
        migrate: async state => ({ ...state, v3: true }),
      });

      const path = executor.getMigrationPath('feature-dev', '1.0.0', '3.0.0');

      assert.equal(path.length, 2);
      assert.equal(path[0].to, '2.0.0');
      assert.equal(path[1].to, '3.0.0');
    });
  });

  describe('Gradual Migration Execution', () => {
    let executor;

    beforeEach(() => {
      const MigrationExecutor = require('../.claude/lib/workflow/migration-executor.cjs');
      executor = new MigrationExecutor();

      executor.register('feature-dev', {
        from: '1.x.x',
        to: '2.0.0',
        migrate: async state => ({ ...state, migrated: true }),
        validate: async state => ({ valid: !!state.migrated, errors: [] }),
      });
    });

    it('should migrate 10% of state instances', async () => {
      const states = Array.from({ length: 100 }, (_, i) => ({
        id: `task-${i}`,
        workflowVersion: '1.0.0',
      }));

      await executor.migrateGradual('feature-dev', states, '2.0.0', { percentage: 10 });

      const migrated = states.filter(s => s.migrated);
      assert.ok(migrated.length >= 8 && migrated.length <= 12, 'Should migrate ~10%');
    });

    it('should migrate 50% of state instances', async () => {
      const states = Array.from({ length: 100 }, (_, i) => ({
        id: `task-${i}`,
        workflowVersion: '1.0.0',
      }));

      await executor.migrateGradual('feature-dev', states, '2.0.0', { percentage: 50 });

      const migrated = states.filter(s => s.migrated);
      assert.ok(migrated.length >= 45 && migrated.length <= 55, 'Should migrate ~50%');
    });

    it('should migrate 100% of state instances', async () => {
      const states = Array.from({ length: 100 }, (_, i) => ({
        id: `task-${i}`,
        workflowVersion: '1.0.0',
      }));

      await executor.migrateGradual('feature-dev', states, '2.0.0', { percentage: 100 });

      const migrated = states.filter(s => s.migrated);
      assert.equal(migrated.length, 100);
    });

    it('should validate migrated instances', async () => {
      const states = [{ id: 'task-1', workflowVersion: '1.0.0' }];

      await executor.migrateGradual('feature-dev', states, '2.0.0', { percentage: 100 });

      const validation = await executor.validateMigration('feature-dev', states[0], '2.0.0');

      assert.equal(validation.valid, true);
    });

    it('should rollback failed migrations', async () => {
      executor.register('feature-dev', {
        from: '1.x.x',
        to: '2.0.0',
        migrate: async state => {
          if (state.id === 'task-fail') {
            throw new Error('Migration failed');
          }
          return { ...state, migrated: true };
        },
        rollback: async state => ({ ...state, migrated: false }),
      });

      const states = [
        { id: 'task-1', workflowVersion: '1.0.0' },
        { id: 'task-fail', workflowVersion: '1.0.0' },
      ];

      try {
        await executor.migrateGradual('feature-dev', states, '2.0.0', { percentage: 100 });
      } catch (_error) {
        // Expected failure
      }

      // Failed instance should be rolled back
      assert.equal(states[1].migrated, false);
    });
  });

  describe('State Mapping (Schema Evolution)', () => {
    it('should map old schema to new schema (rename phase)', async () => {
      const MigrationExecutor = require('../.claude/lib/workflow/migration-executor.cjs');
      const executor = new MigrationExecutor();

      const migration = {
        from: '1.x.x',
        to: '2.0.0',
        migrate: async state => {
          const mapped = { ...state };
          if (mapped.phases.testing) {
            mapped.phases['quality-assurance'] = mapped.phases.testing;
            delete mapped.phases.testing;
          }
          return mapped;
        },
      };

      executor.register('feature-dev', migration);

      const oldState = {
        workflowVersion: '1.0.0',
        phases: { testing: { status: 'completed' } },
      };

      const newState = await executor.migrate('feature-dev', oldState, '2.0.0');

      assert.equal(newState.phases['quality-assurance'].status, 'completed');
      assert.equal(newState.phases.testing, undefined);
    });

    it('should add new required fields with defaults', async () => {
      const MigrationExecutor = require('../.claude/lib/workflow/migration-executor.cjs');
      const executor = new MigrationExecutor();

      const migration = {
        from: '1.x.x',
        to: '2.0.0',
        migrate: async state => ({
          ...state,
          phases: {
            ...state.phases,
            'security-review': { status: 'pending', startedAt: null },
          },
        }),
      };

      executor.register('feature-dev', migration);

      const oldState = { workflowVersion: '1.0.0', phases: {} };
      const newState = await executor.migrate('feature-dev', oldState, '2.0.0');

      assert.ok(newState.phases['security-review']);
      assert.equal(newState.phases['security-review'].status, 'pending');
    });

    it('should remove deprecated fields', async () => {
      const MigrationExecutor = require('../.claude/lib/workflow/migration-executor.cjs');
      const executor = new MigrationExecutor();

      const migration = {
        from: '1.x.x',
        to: '2.0.0',
        migrate: async state => {
          const mapped = { ...state };
          delete mapped.deprecatedField;
          return mapped;
        },
      };

      executor.register('feature-dev', migration);

      const oldState = { workflowVersion: '1.0.0', deprecatedField: 'old' };
      const newState = await executor.migrate('feature-dev', oldState, '2.0.0');

      assert.equal(newState.deprecatedField, undefined);
    });

    it('should transform nested state structures', async () => {
      const MigrationExecutor = require('../.claude/lib/workflow/migration-executor.cjs');
      const executor = new MigrationExecutor();

      const migration = {
        from: '1.x.x',
        to: '2.0.0',
        migrate: async state => ({
          ...state,
          metadata: {
            ...(state.metadata || {}),
            version: '2.0.0',
            migrated: true,
          },
        }),
      };

      executor.register('feature-dev', migration);

      const oldState = { workflowVersion: '1.0.0', metadata: {} };
      const newState = await executor.migrate('feature-dev', oldState, '2.0.0');

      assert.equal(newState.metadata.version, '2.0.0');
      assert.equal(newState.metadata.migrated, true);
    });
  });

  describe('Rollback Strategies', () => {
    it('should rollback migration (undo changes)', async () => {
      const MigrationExecutor = require('../.claude/lib/workflow/migration-executor.cjs');
      const executor = new MigrationExecutor();

      const migration = {
        from: '1.x.x',
        to: '2.0.0',
        migrate: async state => ({ ...state, newField: 'added' }),
        rollback: async state => {
          const rolled = { ...state };
          delete rolled.newField;
          return rolled;
        },
      };

      executor.register('feature-dev', migration);

      const state = { workflowVersion: '1.0.0' };
      const migrated = await executor.migrate('feature-dev', state, '2.0.0');
      const rolledBack = await executor.rollback('feature-dev', migrated, '1.0.0');

      assert.equal(rolledBack.newField, undefined);
    });

    it('should validate rollback result matches old schema', async () => {
      const MigrationExecutor = require('../.claude/lib/workflow/migration-executor.cjs');
      const executor = new MigrationExecutor();

      const migration = {
        from: '1.x.x',
        to: '2.0.0',
        migrate: async state => ({ ...state, newField: 'added' }),
        rollback: async state => {
          const rolled = { ...state };
          delete rolled.newField;
          return rolled;
        },
        validateRollback: async state => {
          const errors = [];
          if (state.newField) errors.push('newField should be removed');
          return { valid: errors.length === 0, errors };
        },
      };

      executor.register('feature-dev', migration);

      const state = { workflowVersion: '2.0.0', newField: 'added' };
      const rolledBack = await executor.rollback('feature-dev', state, '1.0.0');
      const validation = await migration.validateRollback(rolledBack);

      assert.equal(validation.valid, true);
    });
  });
});

// ==============================================================================
// Category 4: Version Compatibility (12 tests)
// ==============================================================================

describe('Category 4: Version Compatibility', () => {
  describe('Forward Compatibility', () => {
    it('should check if old version can run on new runtime', async () => {
      const VersionRegistry = require('../.claude/lib/workflow/version-registry.cjs');
      const registry = new VersionRegistry();

      await registry.register('feature-dev', '1.0.0', {
        maxCompatibleVersion: '2.0.0',
      });

      assert.equal(registry.isForwardCompatible('feature-dev', '1.0.0', '1.5.0'), true);
      assert.equal(registry.isForwardCompatible('feature-dev', '1.0.0', '2.0.0'), true);
      assert.equal(registry.isForwardCompatible('feature-dev', '1.0.0', '3.0.0'), false);
    });

    it('should detect API changes that break forward compatibility', async () => {
      const VersionRegistry = require('../.claude/lib/workflow/version-registry.cjs');
      const registry = new VersionRegistry();

      await registry.register('feature-dev', '1.0.0', {
        apiSignature: { phase1: ['task1', 'task2'] },
      });

      await registry.register('feature-dev', '2.0.0', {
        apiSignature: { phase1: ['task1', 'task2', 'task3'] }, // Added task
      });

      const compatible = registry.isForwardCompatible('feature-dev', '1.0.0', '2.0.0');

      assert.equal(compatible, true); // Additive change is forward compatible
    });

    it('should reject forward compatibility if API removed', async () => {
      const VersionRegistry = require('../.claude/lib/workflow/version-registry.cjs');
      const registry = new VersionRegistry();

      await registry.register('feature-dev', '1.0.0', {
        apiSignature: { phase1: ['task1', 'task2'] },
      });

      await registry.register('feature-dev', '2.0.0', {
        apiSignature: { phase1: ['task1'] }, // Removed task2
      });

      const compatible = registry.isForwardCompatible('feature-dev', '1.0.0', '2.0.0');

      assert.equal(compatible, false);
    });
  });

  describe('Backward Compatibility', () => {
    it('should check if new version can run old state', async () => {
      const VersionRegistry = require('../.claude/lib/workflow/version-registry.cjs');
      const registry = new VersionRegistry();

      await registry.register('feature-dev', '2.0.0', {
        minCompatibleVersion: '1.0.0',
      });

      assert.equal(registry.isBackwardCompatible('feature-dev', '1.5.0', '2.0.0'), true);
      assert.equal(registry.isBackwardCompatible('feature-dev', '0.9.0', '2.0.0'), false);
    });

    it('should use migration to achieve backward compatibility', async () => {
      const VersionRegistry = require('../.claude/lib/workflow/version-registry.cjs');
      const registry = new VersionRegistry();

      await registry.register('feature-dev', '2.0.0', {
        minCompatibleVersion: '1.0.0',
        migrations: [{ from: '1.x.x', to: '2.0.0' }],
      });

      const state = { workflowVersion: '1.5.0' };

      assert.equal(registry.canMigrate('feature-dev', state, '2.0.0'), true);
    });

    it('should detect breaking changes that break backward compatibility', async () => {
      const VersionRegistry = require('../.claude/lib/workflow/version-registry.cjs');
      const registry = new VersionRegistry();

      await registry.register('feature-dev', '2.0.0', {
        minCompatibleVersion: '2.0.0',
        breakingChanges: ['Renamed phase "testing" to "qa"'],
      });

      const compatible = registry.isBackwardCompatible('feature-dev', '1.0.0', '2.0.0');

      assert.equal(compatible, false);
    });
  });

  describe('Breaking Change Detection', () => {
    it('should detect removed phase as breaking change', async () => {
      const VersionRegistry = require('../.claude/lib/workflow/version-registry.cjs');
      const registry = new VersionRegistry();

      await registry.register('feature-dev', '1.0.0', {
        phases: ['planning', 'implementation', 'testing'],
      });

      await registry.register('feature-dev', '2.0.0', {
        phases: ['planning', 'implementation'], // Removed testing
      });

      const breaking = registry.detectBreakingChanges('feature-dev', '1.0.0', '2.0.0');

      assert.ok(breaking.length > 0);
      assert.ok(breaking.some(c => c.includes('Removed phase: testing')));
    });

    it('should detect renamed phase as breaking change', async () => {
      const VersionRegistry = require('../.claude/lib/workflow/version-registry.cjs');
      const registry = new VersionRegistry();

      await registry.register('feature-dev', '1.0.0', {
        phases: ['testing'],
      });

      await registry.register('feature-dev', '2.0.0', {
        phases: ['quality-assurance'], // Renamed
      });

      const breaking = registry.detectBreakingChanges('feature-dev', '1.0.0', '2.0.0');

      assert.ok(breaking.length > 0);
    });

    it('should detect removed task as breaking change', async () => {
      const VersionRegistry = require('../.claude/lib/workflow/version-registry.cjs');
      const registry = new VersionRegistry();

      await registry.register('feature-dev', '1.0.0', {
        tasks: { phase1: ['task1', 'task2'] },
      });

      await registry.register('feature-dev', '2.0.0', {
        tasks: { phase1: ['task1'] }, // Removed task2
      });

      const breaking = registry.detectBreakingChanges('feature-dev', '1.0.0', '2.0.0');

      assert.ok(breaking.some(c => c.includes('Removed task: task2')));
    });

    it('should NOT flag added phase as breaking change', async () => {
      const VersionRegistry = require('../.claude/lib/workflow/version-registry.cjs');
      const registry = new VersionRegistry();

      await registry.register('feature-dev', '1.0.0', {
        phases: ['planning', 'implementation'],
      });

      await registry.register('feature-dev', '2.0.0', {
        phases: ['planning', 'implementation', 'security-review'], // Added
      });

      const breaking = registry.detectBreakingChanges('feature-dev', '1.0.0', '2.0.0');

      assert.equal(breaking.length, 0);
    });
  });

  describe('Upgrade Path Validation', () => {
    it('should validate upgrade path exists from old to new version', async () => {
      const VersionRegistry = require('../.claude/lib/workflow/version-registry.cjs');
      const registry = new VersionRegistry();

      await registry.register('feature-dev', '1.0.0', {});
      await registry.register('feature-dev', '2.0.0', {
        migrations: [{ from: '1.x.x', to: '2.0.0' }],
      });

      const hasPath = registry.hasUpgradePath('feature-dev', '1.0.0', '2.0.0');

      assert.equal(hasPath, true);
    });

    it('should reject upgrade if no migration path', async () => {
      const VersionRegistry = require('../.claude/lib/workflow/version-registry.cjs');
      const registry = new VersionRegistry();

      await registry.register('feature-dev', '1.0.0', {});
      await registry.register('feature-dev', '3.0.0', { minCompatibleVersion: '2.0.0' });

      const hasPath = registry.hasUpgradePath('feature-dev', '1.0.0', '3.0.0');

      assert.equal(hasPath, false);
    });

    it('should calculate multi-hop upgrade path (1.0 → 2.0 → 3.0)', async () => {
      const VersionRegistry = require('../.claude/lib/workflow/version-registry.cjs');
      const registry = new VersionRegistry();

      await registry.register('feature-dev', '1.0.0', {});
      await registry.register('feature-dev', '2.0.0', {
        migrations: [{ from: '1.x.x', to: '2.0.0' }],
      });
      await registry.register('feature-dev', '3.0.0', {
        migrations: [{ from: '2.x.x', to: '3.0.0' }],
      });

      const path = registry.getUpgradePath('feature-dev', '1.0.0', '3.0.0');

      assert.equal(path.length, 2);
      assert.equal(path[0].to, '2.0.0');
      assert.equal(path[1].to, '3.0.0');
    });

    it('should estimate upgrade duration based on migration complexity', async () => {
      const VersionRegistry = require('../.claude/lib/workflow/version-registry.cjs');
      const registry = new VersionRegistry();

      await registry.register('feature-dev', '2.0.0', {
        migrations: [
          {
            from: '1.x.x',
            to: '2.0.0',
            estimatedDuration: 5000, // 5s
          },
        ],
      });

      const estimate = registry.estimateUpgradeDuration('feature-dev', '1.0.0', '2.0.0');

      assert.equal(estimate, 5000);
    });
  });
});

// ==============================================================================
// Category 5: End-to-End Versioning (12 tests)
// ==============================================================================

describe('Category 5: End-to-End Versioning Scenarios', () => {
  describe('Full Deployment Workflow', () => {
    it('should complete full deployment: deploy → ramp → switch → retire', async () => {
      const DeploymentManager = require('../.claude/lib/workflow/deployment-manager.cjs');
      const deployer = new DeploymentManager();

      // Deploy
      await deployer.deploy('feature-dev', '2.0.0', { startPercentage: 0 });
      assert.equal(deployer.getDeploymentState('feature-dev').greenPercentage, 0);

      // Ramp up
      await deployer.rampUp('feature-dev', 10);
      await deployer.rampUp('feature-dev', 50);
      await deployer.rampUp('feature-dev', 100);
      assert.equal(deployer.getDeploymentState('feature-dev').greenPercentage, 100);

      // Switch active
      await deployer.switchActive('feature-dev');
      assert.equal(deployer.getActive('feature-dev').version, '2.0.0');

      // Retire old
      await deployer.retire('feature-dev', '1.0.0');
      const versions = deployer.listVersions('feature-dev');
      assert.ok(!versions.includes('1.0.0'));
    });

    it('should handle deployment with auto-migration', async () => {
      const DeploymentManager = require('../.claude/lib/workflow/deployment-manager.cjs');
      const deployer = new DeploymentManager();

      const states = [
        { id: 'task-1', workflowVersion: '1.0.0' },
        { id: 'task-2', workflowVersion: '1.0.0' },
      ];

      await deployer.deploy('feature-dev', '2.0.0', {
        startPercentage: 0,
        autoMigrate: true,
        states,
      });

      // States should be migrated
      assert.equal(states[0].workflowVersion, '2.0.0');
      assert.equal(states[1].workflowVersion, '2.0.0');
    });

    it('should handle deployment with health monitoring', async () => {
      const DeploymentManager = require('../.claude/lib/workflow/deployment-manager.cjs');
      const deployer = new DeploymentManager();

      await deployer.deploy('feature-dev', '2.0.0', {
        startPercentage: 10,
        monitorHealth: true,
        healthCheckInterval: 1000,
      });

      // Simulate healthy metrics
      deployer.setMockHealth('feature-dev', 'green', { healthy: true, errorRate: 0.001 });

      await deployer.rampUp('feature-dev', 50);

      // Should succeed with healthy metrics
      assert.equal(deployer.getDeploymentState('feature-dev').greenPercentage, 50);
    });
  });

  describe('Canary Deployment', () => {
    it('should deploy to 10% canary first', async () => {
      const DeploymentManager = require('../.claude/lib/workflow/deployment-manager.cjs');
      const deployer = new DeploymentManager();

      await deployer.deployCanary('feature-dev', '2.0.0', {
        canaryPercentage: 10,
        monitoringPeriod: 3600000,
      });

      assert.equal(deployer.getDeploymentState('feature-dev').greenPercentage, 10);
    });

    it('should monitor canary metrics before full rollout', async () => {
      const DeploymentManager = require('../.claude/lib/workflow/deployment-manager.cjs');
      const deployer = new DeploymentManager();

      await deployer.deployCanary('feature-dev', '2.0.0', {
        canaryPercentage: 10,
        successThreshold: 0.99,
      });

      deployer.setMockHealth('feature-dev', 'green', {
        healthy: true,
        errorRate: 0.005,
        successRate: 0.995,
      });

      const canaryHealthy = await deployer.checkCanaryHealth('feature-dev');

      assert.equal(canaryHealthy, true);
    });

    it('should rollback canary if metrics fail', async () => {
      const DeploymentManager = require('../.claude/lib/workflow/deployment-manager.cjs');
      const deployer = new DeploymentManager();

      await deployer.deployCanary('feature-dev', '2.0.0', {
        canaryPercentage: 10,
        autoRollbackOnFailure: true,
      });

      // Simulate failing metrics
      deployer.setMockHealth('feature-dev', 'green', {
        healthy: false,
        errorRate: 0.1,
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      // Should auto-rollback
      assert.equal(deployer.getDeploymentState('feature-dev').greenPercentage, 0);
    });

    it('should promote canary to full deployment after success', async () => {
      const DeploymentManager = require('../.claude/lib/workflow/deployment-manager.cjs');
      const deployer = new DeploymentManager();

      await deployer.deployCanary('feature-dev', '2.0.0', { canaryPercentage: 10 });

      deployer.setMockHealth('feature-dev', 'green', { healthy: true });

      await deployer.promoteCanary('feature-dev');

      assert.equal(deployer.getDeploymentState('feature-dev').greenPercentage, 100);
    });
  });

  describe('Rollback Scenarios', () => {
    it('should rollback deployment due to high error rate', async () => {
      const DeploymentManager = require('../.claude/lib/workflow/deployment-manager.cjs');
      const deployer = new DeploymentManager();

      await deployer.deploy('feature-dev', '2.0.0', { startPercentage: 50 });

      deployer.setMockHealth('feature-dev', 'green', { healthy: false, errorRate: 0.15 });

      await deployer.rollback('feature-dev', { reason: 'High error rate' });

      assert.equal(deployer.getDeploymentState('feature-dev').greenPercentage, 0);
      const history = deployer.getRollbackHistory('feature-dev');
      assert.equal(history[0].reason, 'High error rate');
    });

    it('should rollback state migrations', async () => {
      const MigrationExecutor = require('../.claude/lib/workflow/migration-executor.cjs');
      const executor = new MigrationExecutor();

      executor.register('feature-dev', {
        from: '1.x.x',
        to: '2.0.0',
        migrate: async state => ({ ...state, migrated: true }),
        rollback: async state => ({ ...state, migrated: false }),
      });

      const states = [{ id: 'task-1', workflowVersion: '1.0.0' }];

      await executor.migrate('feature-dev', states[0], '2.0.0');
      assert.equal(states[0].migrated, true);

      await executor.rollback('feature-dev', states[0], '1.0.0');
      assert.equal(states[0].migrated, false);
    });

    it('should preserve rollback history for audit', async () => {
      const DeploymentManager = require('../.claude/lib/workflow/deployment-manager.cjs');
      const deployer = new DeploymentManager();

      await deployer.deploy('feature-dev', '2.0.0', { startPercentage: 100 });
      await deployer.rollback('feature-dev', { reason: 'User reported issues' });

      const history = deployer.getRollbackHistory('feature-dev');

      assert.equal(history.length, 1);
      assert.ok(history[0].timestamp);
      assert.equal(history[0].fromVersion, '2.0.0');
      assert.equal(history[0].toVersion, '1.0.0');
    });
  });

  describe('Migration with Rollback', () => {
    it('should migrate state then rollback on error', async () => {
      const MigrationExecutor = require('../.claude/lib/workflow/migration-executor.cjs');
      const executor = new MigrationExecutor();

      let callCount = 0;

      executor.register('feature-dev', {
        from: '1.x.x',
        to: '2.0.0',
        migrate: async state => {
          callCount++;
          if (callCount > 1) {
            throw new Error('Migration failed');
          }
          return { ...state, migrated: true };
        },
        rollback: async state => ({ ...state, migrated: false }),
      });

      const states = [
        { id: 'task-1', workflowVersion: '1.0.0' },
        { id: 'task-2', workflowVersion: '1.0.0' },
      ];

      try {
        await executor.migrateGradual('feature-dev', states, '2.0.0', {
          percentage: 100,
          rollbackOnError: true,
        });
      } catch (_error) {
        // Expected
      }

      // First state migrated, second failed and rolled back
      assert.equal(states[0].migrated, true);
      assert.equal(states[1].migrated, false);
    });

    it('should track migration progress for resume', async () => {
      const MigrationExecutor = require('../.claude/lib/workflow/migration-executor.cjs');
      const executor = new MigrationExecutor();

      const states = Array.from({ length: 100 }, (_, i) => ({
        id: `task-${i}`,
        workflowVersion: '1.0.0',
      }));

      executor.register('feature-dev', {
        from: '1.x.x',
        to: '2.0.0',
        migrate: async state => ({ ...state, migrated: true }),
      });

      await executor.migrateGradual('feature-dev', states, '2.0.0', {
        percentage: 50,
        trackProgress: true,
      });

      const progress = executor.getMigrationProgress('feature-dev');

      assert.ok(progress.completed >= 45 && progress.completed <= 55);
      assert.equal(progress.total, 100);
    });
  });
});

console.log('SPEC-020 RED Phase Complete: 67 tests defined');
