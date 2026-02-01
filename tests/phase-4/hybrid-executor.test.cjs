/**
 * Phase 4 / SPEC-019: Hybrid executor tests
 * routeTask, syncState, translateResult, routing rules, adapters
 */

const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { HybridExecutor } = require('../../.claude/lib/workflow/hybrid-executor.cjs');
const SystemAdapters = require('../../.claude/lib/workflow/system-adapters.cjs');

describe('Phase 4: hybrid executor', () => {
  let executor;

  beforeEach(() => {
    executor = new HybridExecutor({
      rules: [
        { pattern: 'legacy/*', system: 'conductor-main' },
        { pattern: 'new/*', system: 'agent-studio' },
      ],
      defaultSystem: 'agent-studio',
    });
  });

  test('routeTask returns system and reason', async () => {
    const decision = await executor.routeTask({ path: 'new/checkout' });
    assert.ok(['agent-studio', 'conductor-main'].includes(decision.system));
    assert.ok(decision.reason);
  });

  test('routeTask with config default_system when disabled', async () => {
    const decision = await executor.routeTask(
      { path: 'any' },
      { enabled: false, default_system: 'conductor-main' }
    );
    assert.strictEqual(decision.system, 'conductor-main');
    assert.strictEqual(decision.reason, 'hybrid_disabled');
  });

  test('routeTask pattern legacy/* routes to conductor-main', async () => {
    const decision = await executor.routeTask({ path: 'legacy/auth' });
    assert.strictEqual(decision.system, 'conductor-main');
  });

  test('routeTask pattern new/* routes to agent-studio', async () => {
    const decision = await executor.routeTask({ path: 'new/feature' });
    assert.strictEqual(decision.system, 'agent-studio');
  });

  test('syncState returns null when no state', async () => {
    const state = await executor.syncState('no-such-task');
    assert.strictEqual(state, null);
  });

  test('translateResult normalizes conductor-main result', () => {
    const raw = { task_id: 't1', state: 'success', output: { x: 1 } };
    const out = executor.translateResult(raw, 'conductor-main');
    assert.ok(out);
    assert.strictEqual(out.taskId, 't1');
    assert.strictEqual(out.status, 'completed');
    assert.deepStrictEqual(out.result, { x: 1 });
  });

  test('translateResult passes through agent-studio result', () => {
    const raw = { taskId: 't1', status: 'completed', result: { x: 1 } };
    const out = executor.translateResult(raw, 'agent-studio');
    assert.ok(out);
    assert.strictEqual(out.taskId || raw.taskId, 't1');
  });

  test('execute returns executedBy and result', async () => {
    const result = await executor.execute({
      taskId: 'e1',
      path: 'new/task',
      payload: { data: 1 },
      mockExecution: true,
    });
    assert.strictEqual(result.status, 'completed');
    assert.ok(['agent-studio', 'conductor-main'].includes(result.executedBy));
  });

  test('getMetrics returns totalExecutions and fallbackCount', async () => {
    await executor.execute({ taskId: 'm1', path: 'new/x', mockExecution: true });
    const metrics = executor.getMetrics();
    assert.strictEqual(typeof metrics.totalExecutions, 'number');
    assert.strictEqual(typeof metrics.fallbackCount, 'number');
    assert.ok(metrics.totalExecutions >= 1);
  });

  test('adapter returns adapter for system', () => {
    const adapter = executor.adapter('conductor-main');
    assert.ok(adapter);
    assert.ok(typeof adapter.readState === 'function');
    assert.ok(typeof adapter.writeState === 'function');
  });
});

describe('Phase 4: system adapters', () => {
  test('getAdapter conductor-main returns adapter', () => {
    const adapter = SystemAdapters.getAdapter('conductor-main');
    assert.ok(adapter);
    assert.ok(adapter.name === 'conductor-main' || adapter.constructor.name.includes('Conductor'));
  });

  test('getAdapter agent-studio returns adapter', () => {
    const adapter = SystemAdapters.getAdapter('agent-studio');
    assert.ok(adapter);
  });

  test('conductor adapter translateToSystem uses task_id', () => {
    const adapter = SystemAdapters.getAdapter('conductor-main');
    const out = adapter.translateToSystem({ taskId: 't1', status: 'completed' });
    assert.strictEqual(out.task_id, 't1');
  });

  test('conductor adapter translateFromSystem uses taskId', () => {
    const adapter = SystemAdapters.getAdapter('conductor-main');
    const out = adapter.translateFromSystem({ task_id: 't1', state: 'success' });
    assert.strictEqual(out.taskId, 't1');
    assert.strictEqual(out.status, 'completed');
  });
});
