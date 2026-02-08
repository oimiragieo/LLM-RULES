/**
 * SPEC-019: Brownfield/Greenfield Hybrid Execution - Comprehensive Test Suite
 *
 * Tests hybrid execution enabling gradual migration from legacy conductor-main to Agent-Studio.
 *
 * Categories:
 * 1. Task Routing (15 tests) - Pattern-based, feature flag, time-based, fallback routing
 * 2. State Synchronization (15 tests) - Bi-directional sync, conflict detection, vector clocks
 * 3. Result Normalization (12 tests) - Legacy→standard format, metadata mapping, errors
 * 4. System Adapters (12 tests) - conductor-main adapter, Agent-Studio adapter, registry
 * 5. End-to-End Hybrid Workflows (8 tests) - Mixed execution, fallback chains, reconciliation
 *
 * Total: 62 comprehensive tests (RED phase)
 *
 * TDD Cycle:
 * RED: Write failing tests (this file) - defines behavior requirements
 * GREEN: Implement minimal code to pass tests
 * REFACTOR: Clean up implementation
 *
 * Performance Targets:
 * - Routing decision: <5ms
 * - State sync: <100ms (bi-directional)
 * - Result normalization: <10ms
 * - Adapter overhead: <50ms
 * - End-to-end hybrid task: <200ms (excluding task execution time)
 */

const assert = require('node:assert');
const { describe, it, beforeEach } = require('node:test');

// Modules to implement (will fail with MODULE_NOT_FOUND in RED phase)
let TaskRouter;
let StateSyncManager;
let ResultNormalizer;
let SystemAdapters;

// Mock implementations for testing
const mockLegacyState = {
  taskId: 'task-123',
  status: 'running',
  timestamp: '2026-01-30T10:00:00Z',
  metadata: { legacy_format: true },
};

const mockAgentStudioState = {
  taskId: 'task-123',
  status: 'in_progress',
  updatedAt: '2026-01-30T10:00:05Z',
  metadata: { modern_format: true },
};

describe('SPEC-019: Hybrid Execution - Category 1: Task Routing (15 tests)', () => {
  beforeEach(() => {
    try {
      TaskRouter = require('../.claude/lib/workflow/task-router.cjs');
    } catch (_err) {
      TaskRouter = null; // Expected in RED phase
    }
  });

  describe('Pattern-Based Routing', () => {
    it('should route legacy paths to conductor-main', async () => {
      if (!TaskRouter) throw new Error('MODULE_NOT_FOUND: task-router.cjs');

      const router = new TaskRouter({
        rules: [{ pattern: 'legacy/*', system: 'conductor-main' }],
      });

      const decision = await router.route({ path: 'legacy/auth' });
      assert.strictEqual(decision.system, 'conductor-main');
      assert.strictEqual(decision.reason, 'pattern_match');
    });

    it('should route new paths to agent-studio', async () => {
      if (!TaskRouter) throw new Error('MODULE_NOT_FOUND: task-router.cjs');

      const router = new TaskRouter({
        rules: [{ pattern: 'new/*', system: 'agent-studio' }],
      });

      const decision = await router.route({ path: 'new/checkout' });
      assert.strictEqual(decision.system, 'agent-studio');
    });

    it('should support wildcard patterns', async () => {
      if (!TaskRouter) throw new Error('MODULE_NOT_FOUND: task-router.cjs');

      const router = new TaskRouter({
        rules: [
          { pattern: 'api/v1/*', system: 'conductor-main' },
          { pattern: 'api/v2/*', system: 'agent-studio' },
        ],
      });

      const v1 = await router.route({ path: 'api/v1/users' });
      const v2 = await router.route({ path: 'api/v2/users' });

      assert.strictEqual(v1.system, 'conductor-main');
      assert.strictEqual(v2.system, 'agent-studio');
    });
  });

  describe('Feature Flag Routing', () => {
    it('should route based on feature flag percentage', async () => {
      if (!TaskRouter) throw new Error('MODULE_NOT_FOUND: task-router.cjs');

      const router = new TaskRouter({
        rules: [
          {
            featureFlag: 'new-checkout',
            percentage: 50,
            system: 'agent-studio',
            fallback: 'conductor-main',
          },
        ],
      });

      // Run 100 times, expect ~50% agent-studio
      const results = { 'agent-studio': 0, 'conductor-main': 0 };
      for (let i = 0; i < 100; i++) {
        const decision = await router.route({ path: 'checkout', userId: `user-${i}` });
        results[decision.system]++;
      }

      // Expect 40-60% (allowing variance)
      assert.ok(results['agent-studio'] >= 40 && results['agent-studio'] <= 60);
    });

    it('should honor sticky session for consistent routing', async () => {
      if (!TaskRouter) throw new Error('MODULE_NOT_FOUND: task-router.cjs');

      const router = new TaskRouter({
        rules: [
          {
            featureFlag: 'new-checkout',
            percentage: 50,
            system: 'agent-studio',
            fallback: 'conductor-main',
            stickySession: true,
          },
        ],
      });

      // Same user should always get same system
      const user1System = (await router.route({ userId: 'user-1' })).system;
      for (let i = 0; i < 10; i++) {
        const decision = await router.route({ userId: 'user-1' });
        assert.strictEqual(decision.system, user1System);
      }
    });

    it('should fallback to default system when feature flag disabled', async () => {
      if (!TaskRouter) throw new Error('MODULE_NOT_FOUND: task-router.cjs');

      const router = new TaskRouter({
        rules: [
          {
            featureFlag: 'disabled-feature',
            percentage: 0,
            system: 'agent-studio',
            fallback: 'conductor-main',
          },
        ],
      });

      const decision = await router.route({ path: 'test' });
      assert.strictEqual(decision.system, 'conductor-main');
    });
  });

  describe('Time-Based Routing (Canary Deployment)', () => {
    it('should route to new system during canary window', async () => {
      if (!TaskRouter) throw new Error('MODULE_NOT_FOUND: task-router.cjs');

      const router = new TaskRouter({
        rules: [
          {
            pattern: 'checkout/*',
            system: 'agent-studio',
            schedule: {
              start: '02:00',
              end: '06:00',
              timezone: 'UTC',
            },
            fallback: 'conductor-main',
          },
        ],
      });

      // Mock current time to be within window
      const decision = await router.route({
        path: 'checkout/payment',
        timestamp: '2026-01-30T03:00:00Z', // Within window
      });

      assert.strictEqual(decision.system, 'agent-studio');
    });

    it('should route to fallback outside canary window', async () => {
      if (!TaskRouter) throw new Error('MODULE_NOT_FOUND: task-router.cjs');

      const router = new TaskRouter({
        rules: [
          {
            pattern: 'checkout/*',
            system: 'agent-studio',
            schedule: {
              start: '02:00',
              end: '06:00',
              timezone: 'UTC',
            },
            fallback: 'conductor-main',
          },
        ],
      });

      const decision = await router.route({
        path: 'checkout/payment',
        timestamp: '2026-01-30T10:00:00Z', // Outside window
      });

      assert.strictEqual(decision.system, 'conductor-main');
    });
  });

  describe('Weighted Routing', () => {
    it('should support weighted routing between systems', async () => {
      if (!TaskRouter) throw new Error('MODULE_NOT_FOUND: task-router.cjs');

      const router = new TaskRouter({
        rules: [
          {
            pattern: 'api/*',
            weights: {
              'conductor-main': 70,
              'agent-studio': 30,
            },
          },
        ],
      });

      const results = { 'conductor-main': 0, 'agent-studio': 0 };
      for (let i = 0; i < 100; i++) {
        const decision = await router.route({ path: 'api/users' });
        results[decision.system]++;
      }

      // Expect 60-80% conductor-main (70% ± 10%)
      assert.ok(results['conductor-main'] >= 60 && results['conductor-main'] <= 80);
    });
  });

  describe('Fallback on Error', () => {
    it('should fallback to conductor-main on agent-studio error', async () => {
      if (!TaskRouter) throw new Error('MODULE_NOT_FOUND: task-router.cjs');

      const router = new TaskRouter({
        rules: [{ pattern: 'new/*', system: 'agent-studio', fallback: 'conductor-main' }],
      });

      // Simulate agent-studio failure
      const decision = await router.route({
        path: 'new/feature',
        systemHealth: { 'agent-studio': 'unhealthy' },
      });

      assert.strictEqual(decision.system, 'conductor-main');
      assert.strictEqual(decision.reason, 'fallback_on_error');
    });

    it('should track fallback rate for monitoring', async () => {
      if (!TaskRouter) throw new Error('MODULE_NOT_FOUND: task-router.cjs');

      const router = new TaskRouter({
        rules: [{ pattern: '*', system: 'agent-studio', fallback: 'conductor-main' }],
      });

      // Simulate 3 failures
      for (let i = 0; i < 3; i++) {
        await router.route({
          path: 'test',
          systemHealth: { 'agent-studio': 'unhealthy' },
        });
      }

      const metrics = router.getMetrics();
      assert.strictEqual(metrics.fallbackCount, 3);
      assert.strictEqual(metrics.fallbackRate, 1); // 100% fallback
    });
  });

  describe('Rule Evaluation Order', () => {
    it('should evaluate rules in order and use first match', async () => {
      if (!TaskRouter) throw new Error('MODULE_NOT_FOUND: task-router.cjs');

      const router = new TaskRouter({
        rules: [
          { pattern: 'api/*', system: 'agent-studio' },
          { pattern: 'api/legacy/*', system: 'conductor-main' }, // More specific but after
        ],
      });

      const decision = await router.route({ path: 'api/legacy/auth' });
      assert.strictEqual(decision.system, 'agent-studio'); // First match wins
    });

    it('should support rule priority for explicit ordering', async () => {
      if (!TaskRouter) throw new Error('MODULE_NOT_FOUND: task-router.cjs');

      const router = new TaskRouter({
        rules: [
          { pattern: 'api/*', system: 'agent-studio', priority: 1 },
          { pattern: 'api/legacy/*', system: 'conductor-main', priority: 10 }, // Higher priority
        ],
      });

      const decision = await router.route({ path: 'api/legacy/auth' });
      assert.strictEqual(decision.system, 'conductor-main'); // Higher priority wins
    });
  });

  describe('Routing Performance', () => {
    it('should make routing decision in <5ms', async () => {
      if (!TaskRouter) throw new Error('MODULE_NOT_FOUND: task-router.cjs');

      const router = new TaskRouter({
        rules: [{ pattern: 'test/*', system: 'agent-studio' }],
      });

      const start = Date.now();
      await router.route({ path: 'test/path' });
      const duration = Date.now() - start;

      assert.ok(duration < 5, `Routing took ${duration}ms, expected <5ms`);
    });
  });
});

describe('SPEC-019: Hybrid Execution - Category 2: State Synchronization (15 tests)', () => {
  beforeEach(() => {
    try {
      StateSyncManager = require('../.claude/lib/workflow/state-sync-manager.cjs');
    } catch (_err) {
      StateSyncManager = null;
    }
  });

  describe('Bi-Directional Synchronization', () => {
    it('should sync state from agent-studio to conductor-main', async () => {
      if (!StateSyncManager) throw new Error('MODULE_NOT_FOUND: state-sync-manager.cjs');

      const syncManager = new StateSyncManager();

      const agentStudioState = {
        taskId: 'task-1',
        status: 'in_progress',
        vectorClock: 5,
      };

      await syncManager.pushToSystem('conductor-main', agentStudioState);

      const conductorState = await syncManager.getFromSystem('conductor-main', 'task-1');
      assert.strictEqual(conductorState.taskId, 'task-1');
      assert.strictEqual(conductorState.status, 'running'); // Translated format
    });

    it('should sync state from conductor-main to agent-studio', async () => {
      if (!StateSyncManager) throw new Error('MODULE_NOT_FOUND: state-sync-manager.cjs');

      const syncManager = new StateSyncManager();

      const conductorState = {
        taskId: 'task-1',
        status: 'running',
        vectorClock: 3,
      };

      await syncManager.pushToSystem('agent-studio', conductorState);

      const agentStudioState = await syncManager.getFromSystem('agent-studio', 'task-1');
      assert.strictEqual(agentStudioState.status, 'in_progress'); // Translated
    });

    it('should preserve metadata during sync', async () => {
      if (!StateSyncManager) throw new Error('MODULE_NOT_FOUND: state-sync-manager.cjs');

      const syncManager = new StateSyncManager();

      const state = {
        taskId: 'task-1',
        status: 'completed',
        metadata: { user: 'test', priority: 'high' },
        vectorClock: 10,
      };

      await syncManager.pushToSystem('conductor-main', state);
      const synced = await syncManager.getFromSystem('conductor-main', 'task-1');

      assert.deepStrictEqual(synced.metadata, state.metadata);
    });
  });

  describe('Vector Clock Conflict Detection', () => {
    it('should detect concurrent updates using vector clocks', async () => {
      if (!StateSyncManager) throw new Error('MODULE_NOT_FOUND: state-sync-manager.cjs');

      const syncManager = new StateSyncManager();

      const stateA = { taskId: 'task-1', status: 'running', vectorClock: 5 };
      const stateB = { taskId: 'task-1', status: 'completed', vectorClock: 5 };

      const conflict = syncManager.detectConflict(stateA, stateB);
      assert.strictEqual(conflict.type, 'concurrent_update');
      assert.ok(conflict.conflicted);
    });

    it('should resolve conflicts using last-write-wins with vector clock', async () => {
      if (!StateSyncManager) throw new Error('MODULE_NOT_FOUND: state-sync-manager.cjs');

      const syncManager = new StateSyncManager();

      const olderState = { taskId: 'task-1', status: 'running', vectorClock: 3 };
      const newerState = { taskId: 'task-1', status: 'completed', vectorClock: 10 };

      const resolved = syncManager.resolve(olderState, newerState);
      assert.strictEqual(resolved.status, 'completed');
      assert.strictEqual(resolved.vectorClock, 10);
    });

    it('should merge states on concurrent conflict', async () => {
      if (!StateSyncManager) throw new Error('MODULE_NOT_FOUND: state-sync-manager.cjs');

      const syncManager = new StateSyncManager();

      const stateA = {
        taskId: 'task-1',
        status: 'running',
        metadata: { userA: 'value' },
        vectorClock: 5,
      };

      const stateB = {
        taskId: 'task-1',
        status: 'completed',
        metadata: { userB: 'value' },
        vectorClock: 5,
      };

      const merged = syncManager.merge(stateA, stateB);
      assert.ok(merged.metadata.userA);
      assert.ok(merged.metadata.userB);
      assert.ok(merged._conflict); // Conflict marker
    });
  });

  describe('Conflict Resolution Strategies', () => {
    it('should support last-write-wins strategy', async () => {
      if (!StateSyncManager) throw new Error('MODULE_NOT_FOUND: state-sync-manager.cjs');

      const syncManager = new StateSyncManager({ strategy: 'last-write-wins' });

      const older = { taskId: 'task-1', status: 'running', updatedAt: '2026-01-30T10:00:00Z' };
      const newer = { taskId: 'task-1', status: 'completed', updatedAt: '2026-01-30T10:05:00Z' };

      const resolved = syncManager.resolve(older, newer);
      assert.strictEqual(resolved.status, 'completed');
    });

    it('should support manual conflict resolution', async () => {
      if (!StateSyncManager) throw new Error('MODULE_NOT_FOUND: state-sync-manager.cjs');

      const syncManager = new StateSyncManager({ strategy: 'manual' });

      const stateA = { taskId: 'task-1', status: 'running' };
      const stateB = { taskId: 'task-1', status: 'completed' };

      const conflict = syncManager.merge(stateA, stateB);
      assert.ok(conflict._conflict);
      assert.strictEqual(conflict._conflict.local, 'running');
      assert.strictEqual(conflict._conflict.remote, 'completed');
    });

    it('should support field-level merge strategy', async () => {
      if (!StateSyncManager) throw new Error('MODULE_NOT_FOUND: state-sync-manager.cjs');

      const syncManager = new StateSyncManager({ strategy: 'field-merge' });

      const stateA = {
        taskId: 'task-1',
        status: 'running',
        progress: 50,
        metadata: { a: 1 },
      };

      const stateB = {
        taskId: 'task-1',
        status: 'completed',
        progress: 100,
        metadata: { b: 2 },
      };

      const merged = syncManager.merge(stateA, stateB);
      assert.strictEqual(merged.status, 'completed'); // Take newer for status
      assert.strictEqual(merged.progress, 100);
      assert.deepStrictEqual(merged.metadata, { a: 1, b: 2 }); // Merge objects
    });
  });

  describe('Eventual Consistency', () => {
    it('should converge to consistent state after multiple syncs', async () => {
      if (!StateSyncManager) throw new Error('MODULE_NOT_FOUND: state-sync-manager.cjs');

      const syncManager = new StateSyncManager();

      // Initial state
      const initialState = { taskId: 'task-1', status: 'pending', vectorClock: 1 };
      await syncManager.pushToSystem('conductor-main', initialState);
      await syncManager.pushToSystem('agent-studio', initialState);

      // Update in agent-studio
      const update1 = { ...initialState, status: 'in_progress', vectorClock: 2 };
      await syncManager.pushToSystem('agent-studio', update1);

      // Sync to conductor-main
      await syncManager.sync('task-1');

      // Both systems should converge
      const conductorState = await syncManager.getFromSystem('conductor-main', 'task-1');
      const agentStudioState = await syncManager.getFromSystem('agent-studio', 'task-1');

      assert.strictEqual(conductorState.status, 'running'); // Translated
      assert.strictEqual(agentStudioState.status, 'in_progress');
      // Both represent same logical state
    });

    it('should validate eventual consistency within time bound', async () => {
      if (!StateSyncManager) throw new Error('MODULE_NOT_FOUND: state-sync-manager.cjs');

      const syncManager = new StateSyncManager({ syncInterval: 100 }); // 100ms sync

      const initialState = { taskId: 'task-1', status: 'pending', vectorClock: 1 };
      await syncManager.pushToSystem('agent-studio', initialState);

      // Start background sync
      syncManager.startBackgroundSync();

      // Wait for sync to propagate (should be <200ms)
      await new Promise(resolve => setTimeout(resolve, 200));

      const conductorState = await syncManager.getFromSystem('conductor-main', 'task-1');
      assert.ok(conductorState, 'State should have synced to conductor-main');

      syncManager.stopBackgroundSync();
    });
  });

  describe('Orphaned Task Handling', () => {
    it('should detect orphaned tasks in conductor-main', async () => {
      if (!StateSyncManager) throw new Error('MODULE_NOT_FOUND: state-sync-manager.cjs');

      const syncManager = new StateSyncManager();

      // Task exists in conductor-main but not agent-studio
      await syncManager.pushToSystem('conductor-main', { taskId: 'orphan-1', status: 'running' });

      const orphans = await syncManager.findOrphans('conductor-main');
      assert.strictEqual(orphans.length, 1);
      assert.strictEqual(orphans[0].taskId, 'orphan-1');
    });

    it('should sync orphaned tasks to primary system', async () => {
      if (!StateSyncManager) throw new Error('MODULE_NOT_FOUND: state-sync-manager.cjs');

      const syncManager = new StateSyncManager({ primarySystem: 'agent-studio' });

      // Orphan in conductor-main
      await syncManager.pushToSystem('conductor-main', { taskId: 'orphan-1', status: 'running' });

      // Reconcile orphans
      await syncManager.reconcileOrphans();

      const agentStudioState = await syncManager.getFromSystem('agent-studio', 'orphan-1');
      assert.ok(agentStudioState, 'Orphan should be synced to agent-studio');
    });
  });

  describe('Sync Performance', () => {
    it('should complete bi-directional sync in <100ms', async () => {
      if (!StateSyncManager) throw new Error('MODULE_NOT_FOUND: state-sync-manager.cjs');

      const syncManager = new StateSyncManager();

      const state = { taskId: 'task-1', status: 'running', vectorClock: 5 };

      const start = Date.now();
      await syncManager.sync('task-1', state);
      const duration = Date.now() - start;

      assert.ok(duration < 100, `Sync took ${duration}ms, expected <100ms`);
    });

    it('should batch sync multiple tasks efficiently', async () => {
      if (!StateSyncManager) throw new Error('MODULE_NOT_FOUND: state-sync-manager.cjs');

      const syncManager = new StateSyncManager();

      const tasks = Array.from({ length: 10 }, (_, i) => ({
        taskId: `task-${i}`,
        status: 'running',
        vectorClock: i,
      }));

      const start = Date.now();
      await syncManager.batchSync(tasks);
      const duration = Date.now() - start;

      // Should be faster than 10 individual syncs (< 500ms for 10 tasks)
      assert.ok(duration < 500, `Batch sync took ${duration}ms, expected <500ms`);
    });

    it('should prevent syncHistory memory leak with max history limit', async () => {
      if (!StateSyncManager) throw new Error('MODULE_NOT_FOUND: state-sync-manager.cjs');

      const syncManager = new StateSyncManager();

      // Simulate 1500 sync operations (exceeds default 1000 limit)
      for (let i = 0; i < 1500; i++) {
        await syncManager.sync(`task-${i}`, {
          taskId: `task-${i}`,
          status: 'running',
          vectorClock: i,
        });
      }

      // Verify syncHistory is bounded to maxHistorySize (default 1000)
      const metrics = syncManager.getMetrics();
      assert.ok(
        metrics.totalSyncs <= 1000,
        `syncHistory has ${metrics.totalSyncs} entries, expected <= 1000`
      );
      assert.strictEqual(
        metrics.totalSyncs,
        1000,
        'syncHistory should be trimmed to maxHistorySize'
      );
    });
  });
});

describe('SPEC-019: Hybrid Execution - Category 3: Result Normalization (12 tests)', () => {
  beforeEach(() => {
    try {
      ResultNormalizer = require('../.claude/lib/workflow/result-normalizer.cjs');
    } catch (_err) {
      ResultNormalizer = null;
    }
  });

  describe('Legacy to Standard Format', () => {
    it('should convert conductor-main result to standard format', async () => {
      if (!ResultNormalizer) throw new Error('MODULE_NOT_FOUND: result-normalizer.cjs');

      const normalizer = new ResultNormalizer();

      const legacyResult = {
        task_id: 'task-1',
        state: 'success',
        output: { data: 'test' },
        created_at: '2026-01-30T10:00:00Z',
      };

      const normalized = normalizer.normalize(legacyResult, 'conductor-main');

      assert.strictEqual(normalized.taskId, 'task-1'); // camelCase
      assert.strictEqual(normalized.status, 'completed'); // Translated
      assert.deepStrictEqual(normalized.result, { data: 'test' });
      assert.strictEqual(normalized.createdAt, '2026-01-30T10:00:00Z');
    });

    it('should handle nested legacy structures', async () => {
      if (!ResultNormalizer) throw new Error('MODULE_NOT_FOUND: result-normalizer.cjs');

      const normalizer = new ResultNormalizer();

      const legacyResult = {
        task_id: 'task-1',
        state: 'success',
        output: {
          nested_data: {
            inner_field: 'value',
          },
        },
      };

      const normalized = normalizer.normalize(legacyResult, 'conductor-main');

      assert.strictEqual(normalized.result.nested_data.inner_field, 'value');
    });

    it('should preserve original format in metadata', async () => {
      if (!ResultNormalizer) throw new Error('MODULE_NOT_FOUND: result-normalizer.cjs');

      const normalizer = new ResultNormalizer({ preserveOriginal: true });

      const legacyResult = { task_id: 'task-1', state: 'success' };
      const normalized = normalizer.normalize(legacyResult, 'conductor-main');

      assert.ok(normalized._original);
      assert.deepStrictEqual(normalized._original, legacyResult);
    });
  });

  describe('Metadata Mapping', () => {
    it('should map legacy metadata fields to standard', async () => {
      if (!ResultNormalizer) throw new Error('MODULE_NOT_FOUND: result-normalizer.cjs');

      const normalizer = new ResultNormalizer();

      const legacyResult = {
        task_id: 'task-1',
        state: 'success',
        meta: {
          user_id: 'user-123',
          created_by: 'system',
        },
      };

      const normalized = normalizer.normalize(legacyResult, 'conductor-main');

      assert.strictEqual(normalized.metadata.userId, 'user-123');
      assert.strictEqual(normalized.metadata.createdBy, 'system');
    });

    it('should handle missing optional metadata', async () => {
      if (!ResultNormalizer) throw new Error('MODULE_NOT_FOUND: result-normalizer.cjs');

      const normalizer = new ResultNormalizer();

      const legacyResult = {
        task_id: 'task-1',
        state: 'success',
        // No metadata
      };

      const normalized = normalizer.normalize(legacyResult, 'conductor-main');

      assert.strictEqual(typeof normalized.metadata, 'object');
      assert.strictEqual(Object.keys(normalized.metadata).length, 0);
    });

    it('should preserve unknown metadata fields', async () => {
      if (!ResultNormalizer) throw new Error('MODULE_NOT_FOUND: result-normalizer.cjs');

      const normalizer = new ResultNormalizer();

      const legacyResult = {
        task_id: 'task-1',
        state: 'success',
        meta: {
          custom_field: 'value',
          unknown: 123,
        },
      };

      const normalized = normalizer.normalize(legacyResult, 'conductor-main');

      assert.strictEqual(normalized.metadata.custom_field, 'value');
      assert.strictEqual(normalized.metadata.unknown, 123);
    });
  });

  describe('Error Normalization', () => {
    it('should normalize legacy error format', async () => {
      if (!ResultNormalizer) throw new Error('MODULE_NOT_FOUND: result-normalizer.cjs');

      const normalizer = new ResultNormalizer();

      const legacyError = {
        task_id: 'task-1',
        state: 'failed',
        error_message: 'Task execution failed',
        error_code: 'EXEC_ERROR',
      };

      const normalized = normalizer.normalize(legacyError, 'conductor-main');

      assert.strictEqual(normalized.status, 'failed');
      assert.strictEqual(normalized.error.message, 'Task execution failed');
      assert.strictEqual(normalized.error.code, 'EXEC_ERROR');
    });

    it('should preserve error stack traces', async () => {
      if (!ResultNormalizer) throw new Error('MODULE_NOT_FOUND: result-normalizer.cjs');

      const normalizer = new ResultNormalizer();

      const legacyError = {
        task_id: 'task-1',
        state: 'failed',
        error_message: 'Error',
        error_stack: 'Error\n  at fn (file.js:10)',
      };

      const normalized = normalizer.normalize(legacyError, 'conductor-main');

      assert.strictEqual(normalized.error.stack, 'Error\n  at fn (file.js:10)');
    });

    it('should categorize errors by type', async () => {
      if (!ResultNormalizer) throw new Error('MODULE_NOT_FOUND: result-normalizer.cjs');

      const normalizer = new ResultNormalizer();

      const legacyError = {
        task_id: 'task-1',
        state: 'failed',
        error_code: 'TIMEOUT',
      };

      const normalized = normalizer.normalize(legacyError, 'conductor-main');

      assert.strictEqual(normalized.error.category, 'timeout');
    });
  });

  describe('Partial Result Handling', () => {
    it('should handle partial results from failed tasks', async () => {
      if (!ResultNormalizer) throw new Error('MODULE_NOT_FOUND: result-normalizer.cjs');

      const normalizer = new ResultNormalizer();

      const partialResult = {
        task_id: 'task-1',
        state: 'failed',
        output: { partial_data: 'available' },
        error_message: 'Failed after partial completion',
      };

      const normalized = normalizer.normalize(partialResult, 'conductor-main');

      assert.strictEqual(normalized.status, 'failed');
      assert.strictEqual(normalized.partialResult.partial_data, 'available');
      assert.ok(normalized.error);
    });

    it('should aggregate results from multi-part tasks', async () => {
      if (!ResultNormalizer) throw new Error('MODULE_NOT_FOUND: result-normalizer.cjs');

      const normalizer = new ResultNormalizer();

      const results = [
        { task_id: 'task-1', state: 'success', output: { part: 1 } },
        { task_id: 'task-1', state: 'success', output: { part: 2 } },
      ];

      const aggregated = normalizer.aggregate(results);

      assert.strictEqual(aggregated.taskId, 'task-1');
      assert.strictEqual(aggregated.result.length, 2);
    });
  });

  describe('Normalization Performance', () => {
    it('should normalize result in <10ms', async () => {
      if (!ResultNormalizer) throw new Error('MODULE_NOT_FOUND: result-normalizer.cjs');

      const normalizer = new ResultNormalizer();

      const legacyResult = { task_id: 'task-1', state: 'success', output: { data: 'test' } };

      const start = Date.now();
      normalizer.normalize(legacyResult, 'conductor-main');
      const duration = Date.now() - start;

      assert.ok(duration < 10, `Normalization took ${duration}ms, expected <10ms`);
    });

    it('should normalize batch of 100 results in <100ms', async () => {
      if (!ResultNormalizer) throw new Error('MODULE_NOT_FOUND: result-normalizer.cjs');

      const normalizer = new ResultNormalizer();

      const results = Array.from({ length: 100 }, (_, i) => ({
        task_id: `task-${i}`,
        state: 'success',
        output: { data: i },
      }));

      const start = Date.now();
      results.forEach(r => normalizer.normalize(r, 'conductor-main'));
      const duration = Date.now() - start;

      assert.ok(duration < 100, `Batch normalization took ${duration}ms, expected <100ms`);
    });
  });
});

describe('SPEC-019: Hybrid Execution - Category 4: System Adapters (12 tests)', () => {
  beforeEach(() => {
    try {
      SystemAdapters = require('../.claude/lib/workflow/system-adapters.cjs');
    } catch (_err) {
      SystemAdapters = null;
    }
  });

  describe('Conductor-Main Adapter', () => {
    it('should read state from conductor-main', async () => {
      if (!SystemAdapters) throw new Error('MODULE_NOT_FOUND: system-adapters.cjs');

      const adapter = SystemAdapters.getAdapter('conductor-main');

      const state = await adapter.readState('task-1');
      assert.ok(state);
      assert.strictEqual(state.taskId, 'task-1');
    });

    it('should write state to conductor-main', async () => {
      if (!SystemAdapters) throw new Error('MODULE_NOT_FOUND: system-adapters.cjs');

      const adapter = SystemAdapters.getAdapter('conductor-main');

      const state = { taskId: 'task-1', status: 'running' };
      await adapter.writeState(state);

      const read = await adapter.readState('task-1');
      assert.strictEqual(read.taskId, 'task-1');
    });

    it('should translate state format to conductor-main schema', async () => {
      if (!SystemAdapters) throw new Error('MODULE_NOT_FOUND: system-adapters.cjs');

      const adapter = SystemAdapters.getAdapter('conductor-main');

      const agentStudioState = { taskId: 'task-1', status: 'in_progress' };
      const translated = adapter.translateToSystem(agentStudioState);

      assert.strictEqual(translated.task_id, 'task-1'); // snake_case
      assert.strictEqual(translated.state, 'running'); // Translated status
    });

    it('should translate state format from conductor-main schema', async () => {
      if (!SystemAdapters) throw new Error('MODULE_NOT_FOUND: system-adapters.cjs');

      const adapter = SystemAdapters.getAdapter('conductor-main');

      const conductorState = { task_id: 'task-1', state: 'running' };
      const translated = adapter.translateFromSystem(conductorState);

      assert.strictEqual(translated.taskId, 'task-1'); // camelCase
      assert.strictEqual(translated.status, 'in_progress');
    });
  });

  describe('Agent-Studio Adapter', () => {
    it('should read state from agent-studio', async () => {
      if (!SystemAdapters) throw new Error('MODULE_NOT_FOUND: system-adapters.cjs');

      const adapter = SystemAdapters.getAdapter('agent-studio');

      const state = await adapter.readState('task-1');
      assert.ok(state);
      assert.strictEqual(state.taskId, 'task-1');
    });

    it('should write state to agent-studio', async () => {
      if (!SystemAdapters) throw new Error('MODULE_NOT_FOUND: system-adapters.cjs');

      const adapter = SystemAdapters.getAdapter('agent-studio');

      const state = { taskId: 'task-1', status: 'in_progress' };
      await adapter.writeState(state);

      const read = await adapter.readState('task-1');
      assert.strictEqual(read.status, 'in_progress');
    });

    it('should use native format for agent-studio (no translation)', async () => {
      if (!SystemAdapters) throw new Error('MODULE_NOT_FOUND: system-adapters.cjs');

      const adapter = SystemAdapters.getAdapter('agent-studio');

      const state = { taskId: 'task-1', status: 'in_progress' };
      const translated = adapter.translateToSystem(state);

      assert.deepStrictEqual(translated, state); // No translation needed
    });
  });

  describe('Adapter Registry', () => {
    it('should register custom adapter', async () => {
      if (!SystemAdapters) throw new Error('MODULE_NOT_FOUND: system-adapters.cjs');

      const customAdapter = {
        name: 'custom-system',
        readState: async taskId => ({ taskId, status: 'custom' }),
        writeState: async _state => {},
        translateToSystem: state => state,
        translateFromSystem: state => state,
      };

      SystemAdapters.registerAdapter(customAdapter);

      const adapter = SystemAdapters.getAdapter('custom-system');
      assert.ok(adapter);
      assert.strictEqual(adapter.name, 'custom-system');
    });

    it('should list all registered adapters', async () => {
      if (!SystemAdapters) throw new Error('MODULE_NOT_FOUND: system-adapters.cjs');

      const adapters = SystemAdapters.listAdapters();

      assert.ok(adapters.includes('conductor-main'));
      assert.ok(adapters.includes('agent-studio'));
    });

    it('should throw error for unknown adapter', async () => {
      if (!SystemAdapters) throw new Error('MODULE_NOT_FOUND: system-adapters.cjs');

      assert.throws(() => SystemAdapters.getAdapter('unknown-system'), /Adapter not found/);
    });
  });

  describe('Adapter Performance', () => {
    it('should read state in <50ms', async () => {
      if (!SystemAdapters) throw new Error('MODULE_NOT_FOUND: system-adapters.cjs');

      const adapter = SystemAdapters.getAdapter('agent-studio');

      const start = Date.now();
      await adapter.readState('task-1');
      const duration = Date.now() - start;

      assert.ok(duration < 50, `Read took ${duration}ms, expected <50ms`);
    });

    it('should write state in <50ms', async () => {
      if (!SystemAdapters) throw new Error('MODULE_NOT_FOUND: system-adapters.cjs');

      const adapter = SystemAdapters.getAdapter('agent-studio');

      const state = { taskId: 'task-1', status: 'running' };

      const start = Date.now();
      await adapter.writeState(state);
      const duration = Date.now() - start;

      assert.ok(duration < 50, `Write took ${duration}ms, expected <50ms`);
    });
  });
});

describe('SPEC-019: Hybrid Execution - Category 5: End-to-End Hybrid Workflows (8 tests)', () => {
  let HybridExecutor;

  beforeEach(() => {
    try {
      TaskRouter = require('../.claude/lib/workflow/task-router.cjs');
      StateSyncManager = require('../.claude/lib/workflow/state-sync-manager.cjs');
      ResultNormalizer = require('../.claude/lib/workflow/result-normalizer.cjs');
      SystemAdapters = require('../.claude/lib/workflow/system-adapters.cjs');

      // Hypothetical orchestrator module combining all components
      const { HybridExecutor: HE } = require('../.claude/lib/workflow/hybrid-executor.cjs');
      HybridExecutor = HE;
    } catch (_err) {
      HybridExecutor = null;
    }
  });

  describe('Mixed Execution Workflows', () => {
    it('should execute task in agent-studio and sync to conductor-main', async () => {
      if (!HybridExecutor) throw new Error('MODULE_NOT_FOUND: hybrid-executor.cjs or dependencies');

      const executor = new HybridExecutor({
        defaultSystem: 'agent-studio',
      });

      const task = {
        path: 'new/feature',
        payload: { data: 'test' },
      };

      const result = await executor.execute(task);

      assert.strictEqual(result.executedBy, 'agent-studio');
      assert.strictEqual(result.status, 'completed');

      // Verify synced to conductor-main
      const conductorState = await executor.getStateFrom('conductor-main', result.taskId);
      assert.ok(conductorState);
    });

    it('should execute task in conductor-main and sync to agent-studio', async () => {
      if (!HybridExecutor) throw new Error('MODULE_NOT_FOUND: hybrid-executor.cjs or dependencies');

      const executor = new HybridExecutor({
        rules: [{ pattern: 'legacy/*', system: 'conductor-main' }],
      });

      const task = {
        path: 'legacy/auth',
        payload: { user: 'test' },
      };

      const result = await executor.execute(task);

      assert.strictEqual(result.executedBy, 'conductor-main');

      // Verify synced to agent-studio
      const agentStudioState = await executor.getStateFrom('agent-studio', result.taskId);
      assert.ok(agentStudioState);
    });

    it('should handle multi-step workflow across systems', async () => {
      if (!HybridExecutor) throw new Error('MODULE_NOT_FOUND: hybrid-executor.cjs or dependencies');

      const executor = new HybridExecutor();

      const workflow = {
        steps: [
          { path: 'legacy/validate', system: 'conductor-main' },
          { path: 'new/process', system: 'agent-studio' },
          { path: 'legacy/store', system: 'conductor-main' },
        ],
      };

      const result = await executor.executeWorkflow(workflow);

      assert.strictEqual(result.steps.length, 3);
      assert.strictEqual(result.steps[0].executedBy, 'conductor-main');
      assert.strictEqual(result.steps[1].executedBy, 'agent-studio');
      assert.strictEqual(result.steps[2].executedBy, 'conductor-main');
    });
  });

  describe('Fallback Chain Execution', () => {
    it('should fallback to conductor-main on agent-studio failure', async () => {
      if (!HybridExecutor) throw new Error('MODULE_NOT_FOUND: hybrid-executor.cjs or dependencies');

      const executor = new HybridExecutor({
        rules: [{ pattern: '*', system: 'agent-studio', fallback: 'conductor-main' }],
      });

      const task = {
        path: 'test',
        payload: {},
        systemHealth: { 'agent-studio': 'unhealthy' }, // Force failure
      };

      const result = await executor.execute(task);

      assert.strictEqual(result.executedBy, 'conductor-main');
      assert.strictEqual(result.fallbackReason, 'agent-studio-unhealthy');
    });

    it('should track fallback chain for debugging', async () => {
      if (!HybridExecutor) throw new Error('MODULE_NOT_FOUND: hybrid-executor.cjs or dependencies');

      const executor = new HybridExecutor({
        rules: [{ pattern: '*', system: 'agent-studio', fallback: 'conductor-main' }],
      });

      const task = {
        path: 'test',
        systemHealth: { 'agent-studio': 'unhealthy' },
      };

      const result = await executor.execute(task);

      assert.ok(result.fallbackChain);
      assert.deepStrictEqual(result.fallbackChain, ['agent-studio', 'conductor-main']);
    });
  });

  describe('State Reconciliation', () => {
    it('should reconcile diverged state between systems', async () => {
      if (!HybridExecutor) throw new Error('MODULE_NOT_FOUND: hybrid-executor.cjs or dependencies');

      const executor = new HybridExecutor();

      // Create diverged state
      await executor.adapter('agent-studio').writeState({
        taskId: 'task-1',
        status: 'in_progress',
        vectorClock: 5,
      });

      await executor.adapter('conductor-main').writeState({
        taskId: 'task-1',
        status: 'running',
        vectorClock: 3,
      });

      // Reconcile
      const reconciled = await executor.reconcileState('task-1');

      assert.strictEqual(reconciled.status, 'in_progress'); // Newer state wins
      assert.strictEqual(reconciled.vectorClock, 5);

      // Verify both systems updated
      const agentStudioState = await executor.getStateFrom('agent-studio', 'task-1');
      const conductorState = await executor.getStateFrom('conductor-main', 'task-1');

      assert.strictEqual(agentStudioState.status, 'in_progress');
      assert.strictEqual(conductorState.state, 'running'); // Translated format
    });

    it('should detect and report irreconcilable conflicts', async () => {
      if (!HybridExecutor) throw new Error('MODULE_NOT_FOUND: hybrid-executor.cjs or dependencies');

      const executor = new HybridExecutor({ conflictStrategy: 'manual' });

      // Create concurrent conflicting state
      await executor.adapter('agent-studio').writeState({
        taskId: 'task-1',
        status: 'completed',
        vectorClock: 5,
      });

      await executor.adapter('conductor-main').writeState({
        taskId: 'task-1',
        status: 'failed',
        vectorClock: 5, // Same vector clock = concurrent
      });

      const reconciled = await executor.reconcileState('task-1');

      assert.ok(reconciled._conflict);
      assert.strictEqual(reconciled._conflict.agentStudio, 'completed');
      assert.strictEqual(reconciled._conflict.conductorMain, 'failed');
    });
  });

  describe('End-to-End Performance', () => {
    it('should execute hybrid task in <200ms (excluding task logic)', async () => {
      if (!HybridExecutor) throw new Error('MODULE_NOT_FOUND: hybrid-executor.cjs or dependencies');

      const executor = new HybridExecutor();

      const task = {
        path: 'test',
        payload: {},
        mockExecution: true, // Skip actual execution, measure overhead only
      };

      const start = Date.now();
      await executor.execute(task);
      const duration = Date.now() - start;

      assert.ok(duration < 200, `Hybrid execution overhead: ${duration}ms, expected <200ms`);
    });
  });
});

/**
 * Test Summary:
 *
 * Category 1: Task Routing - 15 tests
 * - Pattern-based routing (3 tests)
 * - Feature flag routing (3 tests)
 * - Time-based routing (2 tests)
 * - Weighted routing (1 test)
 * - Fallback on error (2 tests)
 * - Rule evaluation order (2 tests)
 * - Performance (2 tests)
 *
 * Category 2: State Synchronization - 15 tests
 * - Bi-directional sync (3 tests)
 * - Vector clock conflict detection (3 tests)
 * - Conflict resolution strategies (3 tests)
 * - Eventual consistency (2 tests)
 * - Orphaned task handling (2 tests)
 * - Sync performance (2 tests)
 *
 * Category 3: Result Normalization - 12 tests
 * - Legacy to standard format (3 tests)
 * - Metadata mapping (3 tests)
 * - Error normalization (3 tests)
 * - Partial result handling (2 tests)
 * - Performance (1 test)
 *
 * Category 4: System Adapters - 12 tests
 * - Conductor-main adapter (4 tests)
 * - Agent-studio adapter (3 tests)
 * - Adapter registry (3 tests)
 * - Performance (2 tests)
 *
 * Category 5: End-to-End Hybrid Workflows - 8 tests
 * - Mixed execution (3 tests)
 * - Fallback chain (2 tests)
 * - State reconciliation (2 tests)
 * - End-to-end performance (1 test)
 *
 * TOTAL: 62 comprehensive tests
 *
 * All tests will FAIL in RED phase with MODULE_NOT_FOUND errors.
 * This is expected and correct TDD behavior.
 */
