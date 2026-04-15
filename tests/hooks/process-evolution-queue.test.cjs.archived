'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');

const QUEUE_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'evolution-requests.jsonl'
);
const DISPATCH_PLAN_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'evolution-dispatch-plan.json'
);
const LOCK_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'evolution-processor.lock'
);

// ─── Helpers ────────────────────────────────────────────────────────────────

function safeUnlink(filepath) {
  try {
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  } catch (_e) {
    // ignore
  }
}

function cleanupFiles() {
  safeUnlink(QUEUE_FILE);
  safeUnlink(DISPATCH_PLAN_PATH);
  safeUnlink(LOCK_FILE);
}

/**
 * Write evolution requests to the queue file.
 */
function writeQueueEntries(entries) {
  fs.mkdirSync(path.dirname(QUEUE_FILE), { recursive: true });
  const lines = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
  fs.writeFileSync(QUEUE_FILE, lines, 'utf8');
}

/**
 * Load the module fresh by clearing require cache for hook + router.
 */
function freshRequireHook() {
  const hookPath = require.resolve(
    path.join(PROJECT_ROOT, '.claude', 'hooks', 'process-evolution-queue.cjs')
  );
  const routerPath = require.resolve(
    path.join(PROJECT_ROOT, '.claude', 'lib', 'evolution', 'evolution-request-router.cjs')
  );
  delete require.cache[hookPath];
  delete require.cache[routerPath];
  return require(hookPath);
}

// ─── Setup / Teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  cleanupFiles();
});

afterEach(() => {
  cleanupFiles();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

test('processQueue calls generateAndPersistDispatchPlan and reads actions', async () => {
  // Pre-seed the queue with a stale_skill request that passes the eval gate
  writeQueueEntries([
    {
      id: 'req-001',
      trigger: 'stale_skill',
      status: 'proposed',
      timestamp: new Date().toISOString(),
      targetArtifact: { name: 'test-skill' },
    },
  ]);

  const { processQueue } = freshRequireHook();

  // Capture stdout to verify dispatch output
  const originalWrite = process.stdout.write.bind(process.stdout);
  const captured = [];
  process.stdout.write = (chunk, ...args) => {
    captured.push(String(chunk));
    return originalWrite(chunk, ...args);
  };

  try {
    await processQueue();
  } finally {
    process.stdout.write = originalWrite;
  }

  // Verify at least one dispatch line was emitted
  const dispatchLines = captured
    .join('')
    .split('\n')
    .filter(l => l.trim());

  assert.ok(dispatchLines.length >= 1, 'Expected at least one dispatch JSON line on stdout');

  const firstDispatch = JSON.parse(dispatchLines[0]);
  assert.equal(firstDispatch.type, 'evolution-dispatch');
  assert.ok(firstDispatch.skill, 'dispatch must have a skill field');
  assert.ok(firstDispatch.trigger, 'dispatch must have a trigger field');
});

test('processQueue dispatches skill-updater for stale_skill trigger, not evolution-orchestrator', async () => {
  writeQueueEntries([
    {
      id: 'req-002',
      trigger: 'stale_skill',
      status: 'proposed',
      timestamp: new Date().toISOString(),
      targetArtifact: { name: 'my-skill' },
    },
  ]);

  const { processQueue } = freshRequireHook();

  const captured = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, ...args) => {
    captured.push(String(chunk));
    return originalWrite(chunk, ...args);
  };

  try {
    await processQueue();
  } finally {
    process.stdout.write = originalWrite;
  }

  const lines = captured
    .join('')
    .split('\n')
    .filter(l => l.trim());
  assert.ok(lines.length >= 1, 'Expected at least one dispatch line');

  const dispatched = JSON.parse(lines[0]);
  assert.equal(dispatched.skill, 'skill-updater', 'stale_skill must route to skill-updater');
  assert.notEqual(
    dispatched.skill,
    'evolution-orchestrator',
    'must NOT use evolution-orchestrator'
  );
});

test('processQueue handles empty/missing plan gracefully', async () => {
  // No queue file — plan will be empty
  safeUnlink(QUEUE_FILE);

  const { processQueue } = freshRequireHook();

  // Should not throw
  await assert.doesNotReject(async () => {
    await processQueue();
  });
});

test('processQueue handles plan with zero actions gracefully', async () => {
  // Write a queue but force the plan to have 0 eligible actions by writing
  // entries with no eval gate pass (requireEvalGate=on by default)
  writeQueueEntries([
    {
      id: 'req-gated',
      trigger: 'feature_request',
      suggestedArtifactType: 'skill',
      status: 'proposed',
      timestamp: new Date().toISOString(),
      // No eval field — will be gated
    },
  ]);

  const { processQueue } = freshRequireHook();

  // Should not throw even when nothing dispatches
  await assert.doesNotReject(async () => {
    await processQueue();
  });
});

test('processQueue clears the dispatch plan after processing', async () => {
  writeQueueEntries([
    {
      id: 'req-003',
      trigger: 'stale_skill',
      status: 'proposed',
      timestamp: new Date().toISOString(),
    },
  ]);

  const { processQueue } = freshRequireHook();

  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, ...args) => originalWrite(chunk, ...args);

  await processQueue();

  // Plan file should exist but have an empty actions array
  assert.ok(fs.existsSync(DISPATCH_PLAN_PATH), 'dispatch plan file should exist after processing');
  const raw = fs.readFileSync(DISPATCH_PLAN_PATH, 'utf8');
  const plan = JSON.parse(raw);
  assert.deepEqual(plan.actions, [], 'plan actions must be empty after processing');
  assert.ok(plan.processedAt, 'plan must have processedAt timestamp');
});

test('processQueue returns early when lock is held by another process', async () => {
  // Write a fake lock file with a recent timestamp
  fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
  fs.writeFileSync(LOCK_FILE, '99999', 'utf8');

  writeQueueEntries([
    {
      id: 'req-locked',
      trigger: 'stale_skill',
      status: 'proposed',
      timestamp: new Date().toISOString(),
    },
  ]);

  const { processQueue } = freshRequireHook();

  const captured = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, ...args) => {
    captured.push(String(chunk));
    return originalWrite(chunk, ...args);
  };

  try {
    await processQueue();
  } finally {
    process.stdout.write = originalWrite;
  }

  // With lock held, no dispatch lines should be emitted
  const lines = captured
    .join('')
    .split('\n')
    .filter(l => l.trim());
  assert.equal(lines.length, 0, 'Should emit no dispatch lines when locked');
});

test('processQueue sorts actions by priority (high before medium before low)', async () => {
  // Write three stale_skill entries — all pass the gate (stale_skill bypasses eval gate)
  writeQueueEntries([
    {
      id: 'low-001',
      trigger: 'other',
      suggestedArtifactType: 'unknown',
      status: 'proposed',
      timestamp: new Date(Date.now() - 1000).toISOString(),
    },
    {
      id: 'high-001',
      trigger: 'stale_skill',
      status: 'proposed',
      timestamp: new Date(Date.now() - 2000).toISOString(),
      targetArtifact: { name: 'skill-a' },
    },
    {
      id: 'med-001',
      trigger: 'feature_request',
      suggestedArtifactType: 'skill',
      status: 'proposed',
      timestamp: new Date(Date.now() - 3000).toISOString(),
      eval: { passed: true, deltaScore: 1 },
    },
  ]);

  const { processQueue } = freshRequireHook();

  const captured = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, ...args) => {
    captured.push(String(chunk));
    return originalWrite(chunk, ...args);
  };

  try {
    await processQueue();
  } finally {
    process.stdout.write = originalWrite;
  }

  const dispatches = captured
    .join('')
    .split('\n')
    .filter(l => l.trim())
    .map(l => JSON.parse(l));

  if (dispatches.length >= 2) {
    const priorities = dispatches.map(d => d.priority);
    const priorityValues = priorities.map(p => ({ high: 0, medium: 1, low: 2 })[p] ?? 2);
    for (let i = 1; i < priorityValues.length; i++) {
      assert.ok(
        priorityValues[i] >= priorityValues[i - 1],
        `Priority ordering violated: ${priorities[i - 1]} before ${priorities[i]}`
      );
    }
  }
});

test('clearDispatchPlan writes empty actions array with processedAt', () => {
  const { clearDispatchPlan } = freshRequireHook();

  clearDispatchPlan();

  assert.ok(fs.existsSync(DISPATCH_PLAN_PATH), 'plan file should exist');
  const plan = JSON.parse(fs.readFileSync(DISPATCH_PLAN_PATH, 'utf8'));
  assert.deepEqual(plan.actions, []);
  assert.ok(typeof plan.processedAt === 'string', 'processedAt must be a string');
  assert.ok(plan.processedAt.length > 0, 'processedAt must not be empty');
});
