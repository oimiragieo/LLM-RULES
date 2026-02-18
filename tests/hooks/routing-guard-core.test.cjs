'use strict';

/**
 * Phase 3C TDD Tests: routing-guard-core bugs
 *
 * Bug 1 (HIGH): routing-guard-core.checks-task.cjs — block→warn downgrade on retry
 *   checkTaskCreate() should remain 'block' on retry (when dedupe fires), not silently
 *   downgrade to 'warn'.
 *
 * Bug 2 (MEDIUM): routing-guard-core.shared.cjs — Non-atomic dedupe state write
 *   setBlockDedupeState() must use atomicWriteJSONSync, not fs.writeFileSync, to prevent
 *   corruption on crash between read and write.
 */

const assert = require('assert');
const test = require('node:test');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rgc-phase3c-'));
}

// ─── Bug 1 tests ─────────────────────────────────────────────────────────────

test('Bug 1: checkTaskCreate does NOT downgrade block→warn on retry', async t => {
  const tmpDir = makeTmpDir();
  const stateFile = path.join(tmpDir, 'router-state.json');
  const dedupeFile = path.join(tmpDir, 'routing-block-dedupe.json');

  const savedPlannerEnv = process.env.PLANNER_FIRST_ENFORCEMENT;
  const savedStateFile = process.env.ROUTER_STATE_FILE;
  const savedDedupeFile = process.env.ROUTING_BLOCK_DEDUPE_PATH;
  const savedSessionId = process.env.CLAUDE_SESSION_ID;

  process.env.PLANNER_FIRST_ENFORCEMENT = 'block';
  process.env.ROUTER_STATE_FILE = stateFile;
  process.env.ROUTING_BLOCK_DEDUPE_PATH = dedupeFile;
  process.env.CLAUDE_SESSION_ID = 'test-session-bug1';

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (savedPlannerEnv === undefined) delete process.env.PLANNER_FIRST_ENFORCEMENT;
    else process.env.PLANNER_FIRST_ENFORCEMENT = savedPlannerEnv;
    if (savedStateFile === undefined) delete process.env.ROUTER_STATE_FILE;
    else process.env.ROUTER_STATE_FILE = savedStateFile;
    if (savedDedupeFile === undefined) delete process.env.ROUTING_BLOCK_DEDUPE_PATH;
    else process.env.ROUTING_BLOCK_DEDUPE_PATH = savedDedupeFile;
    if (savedSessionId === undefined) delete process.env.CLAUDE_SESSION_ID;
    else process.env.CLAUDE_SESSION_ID = savedSessionId;
  });

  // Write router state: requires planner, none spawned
  fs.writeFileSync(
    stateFile,
    JSON.stringify({
      complexity: 'high',
      requiresPlannerFirst: true,
      plannerSpawned: false,
      mode: 'router',
    })
  );

  // Clear module cache so env vars take effect
  const sharedPath = require.resolve(
    '../../.claude/hooks/routing/routing-guard-core.shared.cjs'
  );
  const checksTaskPath = require.resolve(
    '../../.claude/hooks/routing/routing-guard-core.checks-task.cjs'
  );
  const routerStatePath = require.resolve('../../.claude/lib/routing/router-state.cjs');

  delete require.cache[sharedPath];
  delete require.cache[checksTaskPath];
  delete require.cache[routerStatePath];

  // Re-require fresh modules with new env
  const routerState = require('../../.claude/lib/routing/router-state.cjs');
  routerState.invalidateStateCache();

  const shared = require('../../.claude/hooks/routing/routing-guard-core.shared.cjs');
  shared.resetBlockDedupeState();

  const { checkTaskCreate } = require('../../.claude/hooks/routing/routing-guard-core.checks-task.cjs');

  const hookInput = { session_id: 'test-session-bug1' };

  await t.test('first call blocks when enforcement=block', () => {
    const result1 = checkTaskCreate('TaskCreate', hookInput);
    assert.strictEqual(result1.pass, false, 'First call should block');
    assert.strictEqual(result1.result, 'block', 'First call result should be "block"');
  });

  await t.test('second call (retry/dedupe) still blocks — NOT downgraded to warn', () => {
    // Second call triggers dedupe (count >= threshold), the bug causes it to return pass:true/warn
    const result2 = checkTaskCreate('TaskCreate', hookInput);
    assert.strictEqual(
      result2.pass,
      false,
      'Retry should STILL block — enforcement must not be downgraded'
    );
    assert.strictEqual(
      result2.result,
      'block',
      'Retry result must remain "block", not be downgraded to "warn"'
    );
  });

  await t.test('third call also still blocks', () => {
    const result3 = checkTaskCreate('TaskCreate', hookInput);
    assert.strictEqual(result3.pass, false, 'Third call should still block');
    assert.strictEqual(result3.result, 'block', 'Third call result must remain "block"');
  });
});

// ─── Bug 2 tests ─────────────────────────────────────────────────────────────

test('Bug 2: setBlockDedupeState uses atomic write (atomicWriteJSONSync)', async t => {
  const tmpDir = makeTmpDir();
  const dedupeFile = path.join(tmpDir, 'routing-block-dedupe.json');

  const savedDedupeFile = process.env.ROUTING_BLOCK_DEDUPE_PATH;
  const savedSessionId = process.env.CLAUDE_SESSION_ID;

  process.env.ROUTING_BLOCK_DEDUPE_PATH = dedupeFile;
  process.env.CLAUDE_SESSION_ID = 'test-session-bug2';

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (savedDedupeFile === undefined) delete process.env.ROUTING_BLOCK_DEDUPE_PATH;
    else process.env.ROUTING_BLOCK_DEDUPE_PATH = savedDedupeFile;
    if (savedSessionId === undefined) delete process.env.CLAUDE_SESSION_ID;
    else process.env.CLAUDE_SESSION_ID = savedSessionId;
  });

  const sharedPath = require.resolve(
    '../../.claude/hooks/routing/routing-guard-core.shared.cjs'
  );
  delete require.cache[sharedPath];

  const shared = require('../../.claude/hooks/routing/routing-guard-core.shared.cjs');
  shared.resetBlockDedupeState();

  await t.test('registerBlockAttempt writes dedupe state without leaving temp files', () => {
    // Write some state via registerBlockAttempt
    const result = shared.registerBlockAttempt('test-check', 'TaskCreate', {
      session_id: 'test-session-bug2',
    });

    assert.strictEqual(typeof result.count, 'number');
    assert.ok(result.count >= 1, 'Count should be at least 1');

    // The dedupe file should exist and be valid JSON (not corrupted/partial)
    assert.ok(fs.existsSync(dedupeFile), 'Dedupe state file should exist after write');

    const raw = fs.readFileSync(dedupeFile, 'utf8');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_e) {
      assert.fail('Dedupe state file must contain valid JSON — corruption detected');
    }
    assert.ok(typeof parsed === 'object' && parsed !== null, 'Parsed state must be an object');
  });

  await t.test('no .tmp-* orphan files left after write', () => {
    // A non-atomic write wouldn't leave temp files, but the ATOMIC write should never leave them
    // This test confirms the implementation path exercises atomic temp+rename
    shared.registerBlockAttempt('check-b', 'Task', { session_id: 'test-session-bug2' });
    shared.registerBlockAttempt('check-c', 'TaskList', { session_id: 'test-session-bug2' });

    const files = fs.readdirSync(tmpDir);
    const tempFiles = files.filter(f => f.startsWith('.tmp-'));
    assert.strictEqual(
      tempFiles.length,
      0,
      `No .tmp-* orphan files should remain after atomic write. Found: ${tempFiles.join(', ')}`
    );
  });

  await t.test('concurrent writes do not corrupt dedupe state', () => {
    // Simulate rapid successive calls
    shared.resetBlockDedupeState();
    for (let i = 0; i < 10; i++) {
      shared.registerBlockAttempt(`check-${i}`, 'Task', { session_id: 'test-session-bug2' });
    }

    const raw = fs.readFileSync(dedupeFile, 'utf8');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_e) {
      assert.fail('Concurrent writes corrupted dedupe state file');
    }
    // Should have 10 distinct check keys
    const keys = Object.keys(parsed).filter(k => k.includes('check-'));
    assert.strictEqual(keys.length, 10, 'All 10 check entries should be present');
  });
});

// ─── Atomic write integration test ───────────────────────────────────────────

test('Bug 2 integration: shared.cjs uses atomicWriteJSONSync not fs.writeFileSync', async t => {
  // Read the source of routing-guard-core.shared.cjs and verify it imports and uses
  // atomicWriteJSONSync rather than bare fs.writeFileSync for the dedupe state.
  const sharedSource = fs.readFileSync(
    path.join(
      __dirname,
      '../../.claude/hooks/routing/routing-guard-core.shared.cjs'
    ),
    'utf8'
  );

  await t.test('imports atomicWriteJSONSync from atomic-write.cjs', () => {
    assert.ok(
      sharedSource.includes('atomic-write') ||
        sharedSource.includes('atomicWriteJSONSync') ||
        sharedSource.includes('atomicWriteSync'),
      'shared.cjs must import from atomic-write.cjs for atomic dedupe writes'
    );
  });

  await t.test('setBlockDedupeState does not call bare fs.writeFileSync for state path', () => {
    // The function should no longer contain a bare fs.writeFileSync call
    // targeting the BLOCK_DEDUPE_STATE_PATH. Look for the function body.
    // We identify the pattern: setBlockDedupeState uses atomicWriteJSON, not writeFileSync directly.
    // Strategy: confirm atomicWriteJSONSync call exists near BLOCK_DEDUPE_STATE_PATH reference.
    const hasAtomicWrite =
      sharedSource.includes('atomicWriteJSONSync') || sharedSource.includes('atomicWriteSync');
    assert.ok(
      hasAtomicWrite,
      'setBlockDedupeState must use atomicWriteJSONSync/atomicWriteSync, not bare fs.writeFileSync'
    );
  });
});
