'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const TaskRouter = require('../../../.claude/lib/workflow/task-router.cjs');

test('route propagates traceId for unified observability', async () => {
  const router = new TaskRouter({ defaultSystem: 'agent-studio' });
  const decision = await router.route({ path: 'feature/auth', traceId: 'trace-123' });
  assert.equal(decision.traceId, 'trace-123');
  assert.equal(decision.metadata.traceId, 'trace-123');
});

test('registerDelegation rejects circular delegation chains', async () => {
  const router = new TaskRouter();
  await assert.rejects(
    () =>
      router.registerDelegation({
        taskId: 't-1',
        parentAgent: 'agent-a',
        targetAgent: 'agent-a',
        chain: ['agent-a', 'agent-b'],
      }),
    /Circular Dependency Detected/i
  );
});

test('recoverOrphanedDelegations reassigns stranded tasks after timeout', async () => {
  const router = new TaskRouter();
  await router.initialize();
  const now = Date.now();

  await router.registerDelegation({
    taskId: 't-2',
    parentAgent: 'master-orchestrator',
    targetAgent: 'developer',
    chain: ['master-orchestrator'],
    timeoutMs: 100,
    traceId: 'trace-orphan',
  });

  const recovered = await router.recoverOrphanedDelegations(now + 150);
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].taskId, 't-2');
  assert.equal(recovered[0].status, 'reassigned');
});

test('invalid delegation updates are rejected', async () => {
  const router = new TaskRouter();
  await router.initialize();
  await router.registerDelegation({
    taskId: 't-3',
    parentAgent: 'agent-a',
    targetAgent: 'agent-b',
    chain: ['agent-a'],
  });

  const bad = await router.applyDelegationUpdate('t-3', { status: 'bogus' });
  assert.equal(bad, false);

  const good = await router.applyDelegationUpdate('t-3', { status: 'in_progress' });
  assert.equal(good, true);
});
