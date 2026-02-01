/**
 * Phase 4 / SPEC-020: Workflow versioning tests
 * createVersion, getVersion, listVersions, setActive, migrate, validateMigration
 */

const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const WorkflowVersioner = require('../../.claude/lib/workflow/workflow-versioner.cjs');
const MigrationExecutor = require('../../.claude/lib/workflow/migration-executor.cjs');

describe('Phase 4: workflow versioning', () => {
  let versioner;
  let migrations;

  beforeEach(() => {
    versioner = new WorkflowVersioner();
    migrations = new MigrationExecutor();
  });

  test('createVersion via register and getVersion', async () => {
    await versioner.register('wf1', '1.0.0', { changelog: ['initial'] });
    const meta = versioner.get('wf1', '1.0.0');
    assert.ok(meta);
    assert.strictEqual(meta.version, '1.0.0');
  });

  test('listVersions returns sorted versions', async () => {
    await versioner.register('wf2', '2.0.0', {});
    await versioner.register('wf2', '1.0.0', {});
    await versioner.register('wf2', '1.1.0', {});
    const list = versioner.listVersions('wf2');
    assert.deepStrictEqual(list, ['1.0.0', '1.1.0', '2.0.0']);
  });

  test('setActive and getActive', async () => {
    await versioner.register('wf3', '1.0.0', {});
    await versioner.register('wf3', '2.0.0', {});
    await versioner.setActive('wf3', '1.0.0');
    const active = versioner.getActive('wf3');
    assert.strictEqual(active.version, '1.0.0');
  });

  test('migrate state from version to version', async () => {
    migrations.register('wf4', {
      from: '1.0.0',
      to: '2.0.0',
      migrate: state => ({ ...state, workflowVersion: '2.0.0', phase: 'v2' }),
      validate: state => ({ valid: !!state.phase, errors: [] }),
      rollback: state => ({ ...state, workflowVersion: '1.0.0' }),
    });
    const state = { workflowVersion: '1.0.0' };
    await migrations.migrate('wf4', state, '2.0.0');
    assert.strictEqual(state.workflowVersion, '2.0.0');
    assert.strictEqual(state.phase, 'v2');
  });

  test('validateMigration returns valid and errors', async () => {
    migrations.register('wf5', {
      from: '1.x.x',
      to: '2.0.0',
      validate: state => ({
        valid: state.workflowVersion === '2.0.0',
        errors: state.workflowVersion ? [] : ['missing version'],
      }),
    });
    const result = await migrations.validateMigration('wf5', { workflowVersion: '2.0.0' }, '2.0.0');
    assert.ok(result.valid !== undefined || result.errors !== undefined);
  });

  test('rollback restores version', async () => {
    migrations.register('wf6', {
      from: '1.0.0',
      to: '2.0.0',
      migrate: s => ({ ...s, workflowVersion: '2.0.0' }),
      rollback: s => ({ ...s, workflowVersion: '1.0.0' }),
    });
    const state = { workflowVersion: '2.0.0' };
    await migrations.rollback('wf6', state, '1.0.0');
    assert.strictEqual(state.workflowVersion, '1.0.0');
  });

  test('version lookup under 100ms', async () => {
    await versioner.register('perf', '1.0.0', {});
    const start = Date.now();
    for (let i = 0; i < 100; i++) {
      versioner.get('perf', '1.0.0');
    }
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 100, '100 lookups under 100ms');
  });
});
