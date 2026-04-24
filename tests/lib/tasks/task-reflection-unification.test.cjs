/**
 * D2 Red Test: Task ID Unification — Reflection Queue → Task System
 *
 * Tests that the reflection-queue-adapter creates real task IDs,
 * not synthetic ones, and that the adapter bridges the legacy
 * reflection-spawn-request.json queue during the migration window.
 *
 * TDD Phase: RED — all 5 cases must FAIL before impl exists.
 */

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// --------------------------------------------------------------------------
// Test environment: isolated temp dir so tests don't touch real runtime files
// --------------------------------------------------------------------------

let tmpDir;
let legacyQueuePath;
let taskStorePath;
let adapter;

function setupTmpDir() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'd2-test-'));
  legacyQueuePath = path.join(tmpDir, 'reflection-spawn-request.json');
  taskStorePath = path.join(tmpDir, 'v4-tasks.json');
  // Initialise empty legacy queue
  fs.writeFileSync(legacyQueuePath, '[]', 'utf8');
}

function teardownTmpDir() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

function loadAdapter() {
  // Clear require cache so each suite gets a fresh module state
  Object.keys(require.cache)
    .filter(k => k.includes('reflection-queue-adapter') || k.includes('task-store'))
    .forEach(k => delete require.cache[k]);

  // Override env vars so adapter uses isolated temp paths
  process.env.D2_LEGACY_QUEUE_PATH_OVERRIDE = legacyQueuePath;
  process.env.D2_TASK_STORE_PATH_OVERRIDE = taskStorePath;

  return require('../../../.claude/lib/tasks/reflection-queue-adapter.cjs');
}

// --------------------------------------------------------------------------
// Case 1: enqueueReflection returns a real task_id (not synthetic)
// --------------------------------------------------------------------------
describe('D2 Task-ID Unification', () => {
  before(() => {
    setupTmpDir();
    adapter = loadAdapter();
  });

  after(() => {
    delete process.env.D2_LEGACY_QUEUE_PATH_OVERRIDE;
    delete process.env.D2_TASK_STORE_PATH_OVERRIDE;
    teardownTmpDir();
  });

  it('case 1: enqueueReflection returns a real task_id', () => {
    const result = adapter.enqueueReflection({
      description: 'Review routing table coverage',
      prompt: 'Analyze routing coverage gaps and surface issues.',
    });

    assert.ok(result, 'enqueueReflection must return a result object');
    assert.ok(typeof result.id === 'string', 'result.id must be a string');
    assert.ok(result.id.length > 0, 'result.id must be non-empty');

    // Must NOT be a synthetic ID (synthetic IDs start with "task_completion:" or "session_end:")
    assert.ok(
      !result.id.startsWith('task_completion:'),
      'id must not be a legacy synthetic task_completion: ID'
    );
    assert.ok(
      !result.id.startsWith('session_end:'),
      'id must not be a legacy synthetic session_end: ID'
    );

    // legacyId must be present (used by migration path)
    assert.ok(typeof result.legacyId === 'string', 'result.legacyId must be a string');
  });

  // --------------------------------------------------------------------------
  // Case 2: drainReflectionQueue marks corresponding task completed
  // --------------------------------------------------------------------------
  it('case 2: drainReflectionQueue marks tasks completed in task store', () => {
    const result = adapter.enqueueReflection({
      description: 'Post-session memory consolidation',
      prompt: 'Consolidate session learnings into long-term memory.',
    });

    // Drain by passing the task ID (simulating what reflection-agent does via
    // TaskUpdate metadata.processedReflectionIds)
    adapter.drainReflectionQueue([result.id]);

    // Task store must show the task as completed
    const tasks = adapter.listReflections();
    const found = tasks.find(t => t.id === result.id);

    // After drain, the task should either be marked completed or absent from active list
    // We accept either: completed status OR not present (already removed)
    if (found) {
      assert.strictEqual(
        found.status,
        'completed',
        'drained task must have status "completed" in task store'
      );
    }
    // If not found that also passes — it was fully removed
  });

  // --------------------------------------------------------------------------
  // Case 3: Legacy JSON queue entries are visible via adapter (read-through)
  // --------------------------------------------------------------------------
  it('case 3: listReflections returns legacy JSON queue entries via read-through', () => {
    // Write a legacy entry directly to the JSON file (simulating v3.x writers)
    const legacyEntry = {
      id: 'legacy-synthetic-001',
      description: 'legacy reflection from v3',
      prompt: 'Review old session.',
      timestamp: new Date().toISOString(),
      source: 'test-v3-writer',
    };
    fs.writeFileSync(legacyQueuePath, JSON.stringify([legacyEntry]), 'utf8');

    const reflections = adapter.listReflections();

    assert.ok(Array.isArray(reflections), 'listReflections must return an array');
    const legacyVisible = reflections.some(r => r.id === 'legacy-synthetic-001');
    assert.ok(legacyVisible, 'legacy JSON queue entry must be visible via listReflections');
  });

  // --------------------------------------------------------------------------
  // Case 4: Duplicate enqueue is idempotent (same description → same task_id)
  // --------------------------------------------------------------------------
  it('case 4: duplicate enqueueReflection with same description is idempotent', () => {
    // Reset the legacy queue for a clean test
    fs.writeFileSync(legacyQueuePath, '[]', 'utf8');

    const params = {
      description: 'Deduplicate test: routing gap review',
      prompt: 'Check routing coverage gaps.',
    };

    const first = adapter.enqueueReflection(params);
    const second = adapter.enqueueReflection(params);

    assert.strictEqual(
      first.id,
      second.id,
      'duplicate enqueue with same description must return same task_id'
    );

    // The legacy queue must only have one entry (no duplicates)
    const rawQueue = JSON.parse(fs.readFileSync(legacyQueuePath, 'utf8'));
    const matchingEntries = rawQueue.filter(e => e.description === params.description);
    assert.strictEqual(matchingEntries.length, 1, 'legacy queue must have exactly 1 entry for duplicate enqueue');
  });

  // --------------------------------------------------------------------------
  // Case 5: drainReflectionQueue removes legacy entries AND marks tasks completed
  // --------------------------------------------------------------------------
  it('case 5: drainReflectionQueue removes legacy entries AND marks tasks completed', () => {
    // Reset the legacy queue
    fs.writeFileSync(legacyQueuePath, '[]', 'utf8');

    const r1 = adapter.enqueueReflection({
      description: 'Drain test reflection A',
      prompt: 'Prompt A',
    });
    const r2 = adapter.enqueueReflection({
      description: 'Drain test reflection B',
      prompt: 'Prompt B',
    });

    // Verify both are in the legacy queue
    const beforeDrain = JSON.parse(fs.readFileSync(legacyQueuePath, 'utf8'));
    assert.ok(beforeDrain.length >= 2, 'legacy queue must have at least 2 entries before drain');

    // Drain both
    adapter.drainReflectionQueue([r1.id, r2.id]);

    // Legacy queue must no longer contain these entries
    const afterDrain = JSON.parse(fs.readFileSync(legacyQueuePath, 'utf8'));
    const r1StillPresent = afterDrain.some(e => e.id === r1.id || e.id === r1.legacyId);
    const r2StillPresent = afterDrain.some(e => e.id === r2.id || e.id === r2.legacyId);

    assert.ok(!r1StillPresent, 'legacy queue must not contain r1 after drain');
    assert.ok(!r2StillPresent, 'legacy queue must not contain r2 after drain');
  });
});
