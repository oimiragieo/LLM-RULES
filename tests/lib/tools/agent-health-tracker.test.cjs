#!/usr/bin/env node
/**
 * Agent Health Tracker Tests
 * ==========================
 *
 * Tests for the AgentHealthTracker class which tracks agent spawn
 * success/failure and manages health state transitions.
 *
 * @module tests/lib/tools/agent-health-tracker.test.cjs
 * @see {@link file://.claude/lib/tools/agent-health-tracker.cjs} Implementation
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// =============================================================================
// Test Setup
// =============================================================================

/**
 * Create a mock agent registry for testing
 */
function createMockRegistry() {
  return {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    metadata: {
      totalAgents: 3,
      healthyAgents: 3,
      degradedAgents: 0,
      unavailableAgents: 0,
      lastHealthCheck: new Date().toISOString(),
      lastFullScan: new Date().toISOString(),
    },
    agents: {
      developer: {
        id: 'developer',
        displayName: 'Developer Agent',
        category: 'core',
        filePath: '.claude/agents/core/developer.md',
        capabilities: [
          {
            name: 'implementation',
            domain: 'code',
            description: 'TDD-focused code implementation',
            triggerPhrases: ['implement', 'code', 'develop'],
            requiredTools: ['Read', 'Write', 'Edit', 'Bash'],
            skills: ['tdd', 'debugging'],
          },
        ],
        constraints: {
          maxConcurrentTasks: 5,
          preferredModel: 'sonnet',
        },
        health: {
          status: 'healthy',
          consecutiveFailures: 0,
          successCount: 0,
          failureCount: 0,
          successRate: 1.0,
          averageExecutionMs: null,
          lastUpdate: new Date().toISOString(),
          isolatedAt: null,
          isolationReason: null,
          lastSuccessAt: null,
          lastFailureAt: null,
        },
        metadata: {
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
      qa: {
        id: 'qa',
        displayName: 'QA Agent',
        category: 'core',
        filePath: '.claude/agents/core/qa.md',
        capabilities: [
          {
            name: 'testing',
            domain: 'testing',
            description: 'Test development and execution',
            triggerPhrases: ['test', 'qa', 'validate'],
            requiredTools: ['Read', 'Write', 'Edit', 'Bash'],
            skills: ['tdd', 'qa-workflow'],
          },
        ],
        constraints: {
          maxConcurrentTasks: 5,
          preferredModel: 'sonnet',
        },
        health: {
          status: 'healthy',
          consecutiveFailures: 0,
          successCount: 0,
          failureCount: 0,
          successRate: 1.0,
          averageExecutionMs: null,
          lastUpdate: new Date().toISOString(),
          isolatedAt: null,
          isolationReason: null,
          lastSuccessAt: null,
          lastFailureAt: null,
        },
        metadata: {
          version: '1.0.0',
        },
      },
      planner: {
        id: 'planner',
        displayName: 'Planner Agent',
        category: 'core',
        filePath: '.claude/agents/core/planner.md',
        capabilities: [
          {
            name: 'planning',
            domain: 'planning',
            description: 'Task planning and breakdown',
            triggerPhrases: ['plan', 'design', 'roadmap'],
            requiredTools: ['Read', 'Write', 'TaskCreate'],
            skills: ['task-breakdown'],
          },
        ],
        constraints: {
          maxConcurrentTasks: 3,
          preferredModel: 'sonnet',
        },
        health: {
          status: 'healthy',
          consecutiveFailures: 0,
          successCount: 0,
          failureCount: 0,
          successRate: 1.0,
          averageExecutionMs: null,
          lastUpdate: new Date().toISOString(),
          isolatedAt: null,
          isolationReason: null,
          lastSuccessAt: null,
          lastFailureAt: null,
        },
        metadata: {
          version: '1.0.0',
        },
      },
    },
    index: {
      byCapability: {
        implementation: ['developer'],
        testing: ['qa'],
        planning: ['planner'],
      },
      byDomain: {
        code: ['developer'],
        testing: ['qa'],
        planning: ['planner'],
      },
      byCategory: {
        core: ['developer', 'qa', 'planner'],
      },
    },
    health: {
      healthy: ['developer', 'qa', 'planner'],
      degraded: [],
      unavailable: [],
    },
  };
}

/**
 * Setup test environment with temporary registry file
 */
function setupTestEnvironment() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-health-test-'));
  const registryPath = path.join(tmpDir, 'agent-registry.json');
  const registry = createMockRegistry();
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
  return { tmpDir, registryPath, registry };
}

/**
 * Cleanup test environment
 */
function cleanupTestEnvironment(tmpDir) {
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('AgentHealthTracker', () => {
  let testEnv;
  let AgentHealthTracker;
  let FAILURE_THRESHOLD;
  let DEGRADED_THRESHOLD;
  let RECOVERY_THRESHOLD;
  let RECOVERY_WINDOW_MS;

  beforeEach(() => {
    testEnv = setupTestEnvironment();
    // Dynamically require to get fresh module
    delete require.cache[require.resolve('../../../.claude/lib/tools/agent-health-tracker.cjs')];
    const mod = require('../../../.claude/lib/tools/agent-health-tracker.cjs');
    AgentHealthTracker = mod.AgentHealthTracker;
    FAILURE_THRESHOLD = mod.FAILURE_THRESHOLD;
    DEGRADED_THRESHOLD = mod.DEGRADED_THRESHOLD;
    RECOVERY_THRESHOLD = mod.RECOVERY_THRESHOLD;
    RECOVERY_WINDOW_MS = mod.RECOVERY_WINDOW_MS;
  });

  afterEach(() => {
    cleanupTestEnvironment(testEnv.tmpDir);
  });

  // ===========================================================================
  // Constructor Tests
  // ===========================================================================

  describe('constructor', () => {
    it('should create tracker with default options', () => {
      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
      assert.ok(tracker, 'Tracker should be created');
      assert.strictEqual(tracker.failureThreshold, FAILURE_THRESHOLD, 'Should use default failure threshold');
      assert.strictEqual(tracker.recoveryWindow, RECOVERY_WINDOW_MS, 'Should use default recovery window');
    });

    it('should accept custom failure threshold', () => {
      const tracker = new AgentHealthTracker({
        registryPath: testEnv.registryPath,
        failureThreshold: 5,
      });
      assert.strictEqual(tracker.failureThreshold, 5, 'Should use custom failure threshold');
    });

    it('should accept custom recovery window', () => {
      const tracker = new AgentHealthTracker({
        registryPath: testEnv.registryPath,
        recoveryWindow: 10 * 60 * 1000, // 10 minutes
      });
      assert.strictEqual(tracker.recoveryWindow, 10 * 60 * 1000, 'Should use custom recovery window');
    });
  });

  // ===========================================================================
  // recordSuccess Tests
  // ===========================================================================

  describe('recordSuccess', () => {
    it('should increment successCount', () => {
      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
      tracker.recordSuccess('developer');
      const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      assert.strictEqual(registry.agents.developer.health.successCount, 1, 'Should increment successCount');
    });

    it('should reset consecutiveFailures to 0', () => {
      // Set up agent with failures
      const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      registry.agents.developer.health.consecutiveFailures = 2;
      fs.writeFileSync(testEnv.registryPath, JSON.stringify(registry, null, 2));

      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
      tracker.recordSuccess('developer');

      const updatedRegistry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      assert.strictEqual(
        updatedRegistry.agents.developer.health.consecutiveFailures,
        0,
        'Should reset consecutiveFailures'
      );
    });

    it('should set status to healthy when recovering from degraded with high success rate', () => {
      // Set up degraded agent with good success rate after success
      const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      registry.agents.developer.health.status = 'degraded';
      registry.agents.developer.health.successCount = 89; // Will be 90 after success
      registry.agents.developer.health.failureCount = 10;
      fs.writeFileSync(testEnv.registryPath, JSON.stringify(registry, null, 2));

      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
      tracker.recordSuccess('developer');

      const updatedRegistry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      assert.strictEqual(updatedRegistry.agents.developer.health.status, 'healthy', 'Should recover to healthy');
    });

    it('should update lastSuccessAt timestamp', () => {
      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
      const before = new Date();
      tracker.recordSuccess('developer');
      const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      const lastSuccessAt = new Date(registry.agents.developer.health.lastSuccessAt);
      assert.ok(lastSuccessAt >= before, 'lastSuccessAt should be updated');
    });

    it('should update lastUpdate timestamp', () => {
      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
      const before = new Date();
      tracker.recordSuccess('developer');
      const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      const lastUpdate = new Date(registry.agents.developer.health.lastUpdate);
      assert.ok(lastUpdate >= before, 'lastUpdate should be updated');
    });

    it('should calculate success rate correctly', () => {
      const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      registry.agents.developer.health.successCount = 7;
      registry.agents.developer.health.failureCount = 3;
      fs.writeFileSync(testEnv.registryPath, JSON.stringify(registry, null, 2));

      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
      tracker.recordSuccess('developer');

      const updatedRegistry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      // (7+1)/(7+1+3) = 8/11 = 0.727...
      const expected = 8 / 11;
      assert.ok(
        Math.abs(updatedRegistry.agents.developer.health.successRate - expected) < 0.001,
        'Should calculate success rate correctly'
      );
    });

    it('should update averageExecutionMs', () => {
      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
      tracker.recordSuccess('developer', 100);
      tracker.recordSuccess('developer', 200);

      const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      // Average of 100 and 200 = 150
      assert.ok(
        Math.abs(registry.agents.developer.health.averageExecutionMs - 150) < 1,
        'Should calculate average execution time'
      );
    });

    it('should return false for unknown agent', () => {
      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
      const result = tracker.recordSuccess('unknown-agent');
      assert.strictEqual(result, false, 'Should return false for unknown agent');
    });

    it('should return true on success', () => {
      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
      const result = tracker.recordSuccess('developer');
      assert.strictEqual(result, true, 'Should return true on success');
    });
  });

  // ===========================================================================
  // recordFailure Tests
  // ===========================================================================

  describe('recordFailure', () => {
    it('should increment failureCount', () => {
      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
      tracker.recordFailure('developer', 'Test failure');
      const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      assert.strictEqual(registry.agents.developer.health.failureCount, 1, 'Should increment failureCount');
    });

    it('should increment consecutiveFailures', () => {
      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
      tracker.recordFailure('developer', 'Test failure');
      const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      assert.strictEqual(
        registry.agents.developer.health.consecutiveFailures,
        1,
        'Should increment consecutiveFailures'
      );
    });

    it('should not isolate on 1st failure', () => {
      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
      tracker.recordFailure('developer', 'Test failure');
      const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      assert.strictEqual(registry.agents.developer.health.status, 'healthy', 'Should remain healthy after 1st failure');
    });

    it('should not isolate on 2nd failure', () => {
      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
      tracker.recordFailure('developer', 'Test failure 1');
      tracker.recordFailure('developer', 'Test failure 2');
      const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      assert.strictEqual(registry.agents.developer.health.status, 'healthy', 'Should remain healthy after 2nd failure');
    });

    it('should isolate (status=unavailable) on 3rd consecutive failure', () => {
      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
      tracker.recordFailure('developer', 'Test failure 1');
      tracker.recordFailure('developer', 'Test failure 2');
      tracker.recordFailure('developer', 'Test failure 3');
      const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      assert.strictEqual(
        registry.agents.developer.health.status,
        'unavailable',
        'Should be unavailable after 3rd failure'
      );
    });

    it('should set isolatedAt on isolation', () => {
      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
      const before = new Date();
      tracker.recordFailure('developer', 'Test failure 1');
      tracker.recordFailure('developer', 'Test failure 2');
      tracker.recordFailure('developer', 'Test failure 3');
      const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      const isolatedAt = new Date(registry.agents.developer.health.isolatedAt);
      assert.ok(isolatedAt >= before, 'isolatedAt should be set');
    });

    it('should set isolationReason on isolation', () => {
      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
      tracker.recordFailure('developer', 'Timeout error');
      tracker.recordFailure('developer', 'Timeout error');
      tracker.recordFailure('developer', 'Timeout error');
      const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      assert.ok(
        registry.agents.developer.health.isolationReason.includes('Timeout error'),
        'isolationReason should include failure reason'
      );
    });

    it('should update lastFailureAt timestamp', () => {
      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
      const before = new Date();
      tracker.recordFailure('developer', 'Test failure');
      const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      const lastFailureAt = new Date(registry.agents.developer.health.lastFailureAt);
      assert.ok(lastFailureAt >= before, 'lastFailureAt should be updated');
    });

    it('should calculate success rate correctly after failure', () => {
      const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      registry.agents.developer.health.successCount = 7;
      registry.agents.developer.health.failureCount = 2;
      fs.writeFileSync(testEnv.registryPath, JSON.stringify(registry, null, 2));

      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
      tracker.recordFailure('developer', 'Test failure');

      const updatedRegistry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      // 7/(7+3) = 0.7
      const expected = 7 / 10;
      assert.ok(
        Math.abs(updatedRegistry.agents.developer.health.successRate - expected) < 0.001,
        'Should calculate success rate correctly'
      );
    });

    it('should set status to degraded when success rate drops below 0.7', () => {
      const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      registry.agents.developer.health.successCount = 6;
      registry.agents.developer.health.failureCount = 3;
      // Current rate = 6/9 = 0.667 < 0.7
      fs.writeFileSync(testEnv.registryPath, JSON.stringify(registry, null, 2));

      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
      tracker.recordFailure('developer', 'Test failure');

      const updatedRegistry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      // New rate = 6/10 = 0.6 < 0.7
      assert.strictEqual(updatedRegistry.agents.developer.health.status, 'degraded', 'Should be degraded');
    });

    it('should return false for unknown agent', () => {
      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
      const result = tracker.recordFailure('unknown-agent', 'Test failure');
      assert.strictEqual(result, false, 'Should return false for unknown agent');
    });

    it('should update health arrays in registry', () => {
      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
      tracker.recordFailure('developer', 'Test failure 1');
      tracker.recordFailure('developer', 'Test failure 2');
      tracker.recordFailure('developer', 'Test failure 3');
      const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      assert.ok(registry.health.unavailable.includes('developer'), 'Should be in unavailable array');
      assert.ok(!registry.health.healthy.includes('developer'), 'Should not be in healthy array');
    });
  });

  // ===========================================================================
  // attemptRecovery Tests
  // ===========================================================================

  describe('attemptRecovery', () => {
    it('should return failure for non-isolated agent', () => {
      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
      const result = tracker.attemptRecovery('developer');
      assert.strictEqual(result.success, false, 'Should not recover non-isolated agent');
      assert.ok(result.reason.includes('not isolated'), 'Should indicate agent not isolated');
    });

    it('should stay isolated if recovery window has not passed (<5 min)', () => {
      // Isolate agent
      const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      registry.agents.developer.health.status = 'unavailable';
      registry.agents.developer.health.isolatedAt = new Date().toISOString(); // Just now
      registry.agents.developer.health.consecutiveFailures = 3;
      fs.writeFileSync(testEnv.registryPath, JSON.stringify(registry, null, 2));

      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
      const result = tracker.attemptRecovery('developer');
      assert.strictEqual(result.success, false, 'Should not recover before window passes');
      assert.ok(result.reason.includes('cooldown'), 'Should indicate cooldown active');
    });

    it('should recover to degraded status if recovery window has passed (>=5 min)', () => {
      // Isolate agent 6 minutes ago
      const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
      const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      registry.agents.developer.health.status = 'unavailable';
      registry.agents.developer.health.isolatedAt = sixMinutesAgo.toISOString();
      registry.agents.developer.health.consecutiveFailures = 3;
      fs.writeFileSync(testEnv.registryPath, JSON.stringify(registry, null, 2));

      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
      const result = tracker.attemptRecovery('developer');

      assert.strictEqual(result.success, true, 'Should recover after window passes');

      const updatedRegistry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      assert.strictEqual(updatedRegistry.agents.developer.health.status, 'degraded', 'Should be degraded after recovery');
    });

    it('should reset consecutiveFailures on recovery', () => {
      // Isolate agent 6 minutes ago
      const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
      const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      registry.agents.developer.health.status = 'unavailable';
      registry.agents.developer.health.isolatedAt = sixMinutesAgo.toISOString();
      registry.agents.developer.health.consecutiveFailures = 3;
      fs.writeFileSync(testEnv.registryPath, JSON.stringify(registry, null, 2));

      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
      tracker.attemptRecovery('developer');

      const updatedRegistry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      assert.strictEqual(updatedRegistry.agents.developer.health.consecutiveFailures, 0, 'Should reset consecutiveFailures');
    });

    it('should return failure for unknown agent', () => {
      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
      const result = tracker.attemptRecovery('unknown-agent');
      assert.strictEqual(result.success, false, 'Should fail for unknown agent');
      assert.ok(result.reason.includes('not found'), 'Should indicate agent not found');
    });
  });

  // ===========================================================================
  // getHealthReport Tests
  // ===========================================================================

  describe('getHealthReport', () => {
    it('should return summary with agent counts', () => {
      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
      const report = tracker.getHealthReport();
      assert.strictEqual(report.summary.totalAgents, 3, 'Should have 3 total agents');
      assert.strictEqual(report.summary.healthy, 3, 'Should have 3 healthy agents');
      assert.strictEqual(report.summary.degraded, 0, 'Should have 0 degraded agents');
      assert.strictEqual(report.summary.unavailable, 0, 'Should have 0 unavailable agents');
    });

    it('should return list of healthy agent IDs', () => {
      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
      const report = tracker.getHealthReport();
      assert.ok(Array.isArray(report.healthy), 'Should have healthy array');
      assert.ok(report.healthy.includes('developer'), 'Should include developer');
      assert.ok(report.healthy.includes('qa'), 'Should include qa');
      assert.ok(report.healthy.includes('planner'), 'Should include planner');
    });

    it('should return degraded agents with details', () => {
      // Set up degraded agent
      const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      registry.agents.developer.health.status = 'degraded';
      registry.agents.developer.health.successRate = 0.65;
      registry.agents.developer.health.consecutiveFailures = 1;
      registry.health.healthy = registry.health.healthy.filter((id) => id !== 'developer');
      registry.health.degraded.push('developer');
      registry.metadata.healthyAgents = 2;
      registry.metadata.degradedAgents = 1;
      fs.writeFileSync(testEnv.registryPath, JSON.stringify(registry, null, 2));

      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
      const report = tracker.getHealthReport();
      assert.strictEqual(report.degraded.length, 1, 'Should have 1 degraded agent');
      assert.strictEqual(report.degraded[0].id, 'developer', 'Should be developer');
      assert.ok(report.degraded[0].successRate !== undefined, 'Should include successRate');
    });

    it('should return unavailable agents with isolation details', () => {
      // Set up unavailable agent
      const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      registry.agents.developer.health.status = 'unavailable';
      registry.agents.developer.health.isolatedAt = new Date().toISOString();
      registry.agents.developer.health.isolationReason = 'Test isolation';
      registry.health.healthy = registry.health.healthy.filter((id) => id !== 'developer');
      registry.health.unavailable.push('developer');
      registry.metadata.healthyAgents = 2;
      registry.metadata.unavailableAgents = 1;
      fs.writeFileSync(testEnv.registryPath, JSON.stringify(registry, null, 2));

      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
      const report = tracker.getHealthReport();
      assert.strictEqual(report.unavailable.length, 1, 'Should have 1 unavailable agent');
      assert.strictEqual(report.unavailable[0].id, 'developer', 'Should be developer');
      assert.ok(report.unavailable[0].isolatedAt, 'Should include isolatedAt');
      assert.ok(report.unavailable[0].reason, 'Should include reason');
    });
  });

  // ===========================================================================
  // resetHealth Tests
  // ===========================================================================

  describe('resetHealth', () => {
    it('should reset agent health to defaults', () => {
      // Set up agent with non-default health
      const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      registry.agents.developer.health = {
        status: 'unavailable',
        consecutiveFailures: 5,
        successCount: 10,
        failureCount: 8,
        successRate: 0.56,
        averageExecutionMs: 500,
        lastUpdate: new Date().toISOString(),
        isolatedAt: new Date().toISOString(),
        isolationReason: 'Test isolation',
        lastSuccessAt: new Date().toISOString(),
        lastFailureAt: new Date().toISOString(),
      };
      fs.writeFileSync(testEnv.registryPath, JSON.stringify(registry, null, 2));

      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
      const result = tracker.resetHealth('developer');
      assert.strictEqual(result, true, 'Should return true on success');

      const updatedRegistry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      const health = updatedRegistry.agents.developer.health;
      assert.strictEqual(health.status, 'healthy', 'Should reset to healthy');
      assert.strictEqual(health.consecutiveFailures, 0, 'Should reset consecutiveFailures');
      assert.strictEqual(health.successCount, 0, 'Should reset successCount');
      assert.strictEqual(health.failureCount, 0, 'Should reset failureCount');
      assert.strictEqual(health.successRate, 1.0, 'Should reset successRate');
      assert.strictEqual(health.isolatedAt, null, 'Should clear isolatedAt');
      assert.strictEqual(health.isolationReason, null, 'Should clear isolationReason');
    });

    it('should return false for unknown agent', () => {
      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
      const result = tracker.resetHealth('unknown-agent');
      assert.strictEqual(result, false, 'Should return false for unknown agent');
    });

    it('should update health arrays after reset', () => {
      // Set up unavailable agent
      const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      registry.agents.developer.health.status = 'unavailable';
      registry.health.healthy = registry.health.healthy.filter((id) => id !== 'developer');
      registry.health.unavailable.push('developer');
      fs.writeFileSync(testEnv.registryPath, JSON.stringify(registry, null, 2));

      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
      tracker.resetHealth('developer');

      const updatedRegistry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      assert.ok(updatedRegistry.health.healthy.includes('developer'), 'Should be in healthy array');
      assert.ok(!updatedRegistry.health.unavailable.includes('developer'), 'Should not be in unavailable array');
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('edge cases', () => {
    it('should handle agent with no prior failures', () => {
      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
      tracker.recordSuccess('developer');
      const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      assert.strictEqual(registry.agents.developer.health.successRate, 1.0, 'Should have 100% success rate');
    });

    it('should handle multiple agents independently', () => {
      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
      tracker.recordFailure('developer', 'Failure 1');
      tracker.recordFailure('developer', 'Failure 2');
      tracker.recordSuccess('qa');

      const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      assert.strictEqual(registry.agents.developer.health.consecutiveFailures, 2, 'Developer should have 2 failures');
      assert.strictEqual(registry.agents.qa.health.successCount, 1, 'QA should have 1 success');
    });

    it('should handle success resetting failure streak before isolation', () => {
      // Set up agent with good success history to avoid degradation from low success rate
      const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      registry.agents.developer.health.successCount = 8;
      registry.agents.developer.health.failureCount = 0;
      fs.writeFileSync(testEnv.registryPath, JSON.stringify(registry, null, 2));

      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
      tracker.recordFailure('developer', 'Failure 1');
      tracker.recordFailure('developer', 'Failure 2');
      tracker.recordSuccess('developer'); // Reset streak
      tracker.recordFailure('developer', 'Failure 3');
      tracker.recordFailure('developer', 'Failure 4');

      // After: successCount=9, failureCount=4, total=13, rate=9/13=0.69 (just below 0.7)
      // But only 2 consecutive failures, so should NOT be unavailable
      // Note: Success rate is below 0.7, so agent becomes degraded
      // This test verifies that consecutive failure reset works (not isolation trigger)
      const updatedRegistry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      assert.strictEqual(updatedRegistry.agents.developer.health.consecutiveFailures, 2, 'Should have 2 consecutive failures');
      assert.notStrictEqual(updatedRegistry.agents.developer.health.status, 'unavailable', 'Should NOT be unavailable (only 2 consecutive)');
    });

    it('should handle re-isolation after recovery and more failures', () => {
      // Isolate agent
      const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
      const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      registry.agents.developer.health.status = 'unavailable';
      registry.agents.developer.health.isolatedAt = sixMinutesAgo.toISOString();
      registry.agents.developer.health.consecutiveFailures = 3;
      fs.writeFileSync(testEnv.registryPath, JSON.stringify(registry, null, 2));

      const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });

      // Recover
      tracker.attemptRecovery('developer');

      // Fail again 3 times
      tracker.recordFailure('developer', 'New failure 1');
      tracker.recordFailure('developer', 'New failure 2');
      tracker.recordFailure('developer', 'New failure 3');

      const updatedRegistry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      assert.strictEqual(updatedRegistry.agents.developer.health.status, 'unavailable', 'Should be re-isolated');
    });
  });

  // ===========================================================================
  // Constants Tests
  // ===========================================================================

  describe('exported constants', () => {
    it('should export FAILURE_THRESHOLD as 3', () => {
      assert.strictEqual(FAILURE_THRESHOLD, 3, 'FAILURE_THRESHOLD should be 3');
    });

    it('should export DEGRADED_THRESHOLD as 0.7', () => {
      assert.strictEqual(DEGRADED_THRESHOLD, 0.7, 'DEGRADED_THRESHOLD should be 0.7');
    });

    it('should export RECOVERY_THRESHOLD as 0.9', () => {
      assert.strictEqual(RECOVERY_THRESHOLD, 0.9, 'RECOVERY_THRESHOLD should be 0.9');
    });

    it('should export RECOVERY_WINDOW_MS as 5 minutes', () => {
      assert.strictEqual(RECOVERY_WINDOW_MS, 5 * 60 * 1000, 'RECOVERY_WINDOW_MS should be 5 minutes');
    });
  });
});
