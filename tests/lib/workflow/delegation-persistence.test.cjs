'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const TaskRouter = require('../../../.claude/lib/workflow/task-router.cjs');

test('TaskRouter persists delegations across initializations', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'delegation-test-'));
  const delegationsPath = path.join(tmpDir, 'delegations.json');

  try {
    const router1 = new TaskRouter({ delegationsPath });
    await router1.initialize();

    await router1.registerDelegation({
      taskId: 'persist-1',
      parentAgent: 'agent-a',
      targetAgent: 'agent-b',
      traceId: 'trace-p1',
    });

    // Create a second router pointing to the same file
    const router2 = new TaskRouter({ delegationsPath });
    await router2.initialize();

    assert.equal(router2.delegations.has('persist-1'), true);
    const record = router2.delegations.get('persist-1');
    assert.equal(record.traceId, 'trace-p1');
    assert.equal(record.status, 'pending');

    // Update status in router 1
    await router1.applyDelegationUpdate('persist-1', { status: 'completed' });

    // Initialize a third router
    const router3 = new TaskRouter({ delegationsPath });
    await router3.initialize();
    assert.equal(router3.delegations.get('persist-1').status, 'completed');

  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('recoverOrphanedDelegations marks old pending tasks as reassigned', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-test-'));
  const delegationsPath = path.join(tmpDir, 'delegations.json');

  try {
    const router = new TaskRouter({ delegationsPath });
    await router.initialize();

    await router.registerDelegation({
      taskId: 'orphan-1',
      targetAgent: 'agent-b',
      timeoutMs: 100,
    });

    // Wait for timeout
    await new Promise(resolve => setTimeout(resolve, 150));

    const recovered = await router.recoverOrphanedDelegations();
    assert.equal(recovered.length, 1);
    assert.equal(recovered[0].taskId, 'orphan-1');
    assert.equal(recovered[0].status, 'reassigned');

    // Verify persistence of recovery
    const router2 = new TaskRouter({ delegationsPath });
    await router2.initialize();
    assert.equal(router2.delegations.get('orphan-1').status, 'reassigned');

  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
