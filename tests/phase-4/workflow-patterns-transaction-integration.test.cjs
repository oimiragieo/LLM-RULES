/**
 * Phase 4 / SPEC-017: Integration of workflow patterns with SPEC-011 state transactions
 * Fan-out + conditional + loop with begin/commit/rollback and checkpoint
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { FanOutFanInExecutor } = require('../../.claude/lib/workflow/fan-out-fan-in.cjs');
const { ConditionalExecutor } = require('../../.claude/lib/workflow/conditional-executor.cjs');
const { LoopExecutor } = require('../../.claude/lib/workflow/loop-executor.cjs');
const { TransactionalStateManager } = require('../../.claude/lib/workflow/state-transaction-manager.cjs');

const TEST_DIR = path.join(__dirname, '../temp/phase-4-patterns-tx');
const JOURNAL_PATH = path.join(TEST_DIR, 'journal.jsonl');

describe('Phase 4: workflow patterns + state transaction integration', () => {
  beforeEach(async () => {
    if (fs.existsSync(TEST_DIR)) {
      await fs.promises.rm(TEST_DIR, { recursive: true, force: true });
    }
    await fs.promises.mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    if (fs.existsSync(TEST_DIR)) {
      await fs.promises.rm(TEST_DIR, { recursive: true, force: true });
    }
  });

  test('fan-out within transaction: commit applies state', async () => {
    const manager = new TransactionalStateManager(null, JOURNAL_PATH);
    const txId = await manager.beginTransaction('wf-1');

    const executor = new FanOutFanInExecutor();
    const tasks = [
      { id: 'a', fn: async () => 'a' },
      { id: 'b', fn: async () => 'b' },
    ];
    const results = await executor.execute(tasks, { strategy: 'all' });

    await manager.setState(txId, 'fanOutResults', results);
    const commit = await manager.commit(txId);

    assert.strictEqual(commit.success, true);
    assert.strictEqual(commit.writesApplied, 1);
  });

  test('conditional within transaction: rollback discards state', async () => {
    const manager = new TransactionalStateManager(null, JOURNAL_PATH);
    const txId = await manager.beginTransaction('wf-2');
    await manager.setState(txId, 'step', 1);

    const conditional = new ConditionalExecutor();
    const branch = await conditional.when(true, async () => 'then', async () => 'else');
    await manager.setState(txId, 'branch', branch);

    await manager.rollback(txId);
    const tx = manager.transactions.get(txId);
    assert.strictEqual(tx, undefined);
  });

  test('loop checkpoint each iteration then commit', async () => {
    const manager = new TransactionalStateManager(null, JOURNAL_PATH);
    const txId = await manager.beginTransaction('wf-3');
    const loop = new LoopExecutor();
    const checkpoints = [];

    await loop.doWhile(
      (s) => s.iterations < 2,
      async (s) => {
        checkpoints.push(s.iterations);
        return s;
      },
      { maxIterations: 5, onCheckpoint: (s) => checkpoints.push(s.iterations) }
    );

    await manager.setState(txId, 'loopCheckpoints', checkpoints.length);
    await manager.setState(txId, 'loopDone', true);
    const commit = await manager.commit(txId);
    assert.strictEqual(commit.success, true);
    assert.ok(checkpoints.length >= 2);
  });
});
