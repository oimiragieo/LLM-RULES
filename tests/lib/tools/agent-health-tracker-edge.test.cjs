'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  AgentHealthTracker,
  FAILURE_THRESHOLD,
  DEGRADED_THRESHOLD,
  RECOVERY_THRESHOLD,
  RECOVERY_WINDOW_MS,
} = require('../../../.claude/lib/tools/agent-health-tracker.cjs');

function createRegistry() {
  return {
    metadata: { totalAgents: 2 },
    agents: {
      developer: {
        id: 'developer',
        health: {
          status: 'healthy',
          consecutiveFailures: 0,
          successCount: 0,
          failureCount: 0,
          successRate: 1.0,
          isolatedAt: null,
          isolationReason: null,
          lastUpdate: new Date().toISOString(),
        },
      },
      qa: {
        id: 'qa',
        health: {
          status: 'healthy',
          consecutiveFailures: 0,
          successCount: 0,
          failureCount: 0,
          successRate: 1.0,
          isolatedAt: null,
          isolationReason: null,
          lastUpdate: new Date().toISOString(),
        },
      },
    },
    health: {
      healthy: ['developer', 'qa'],
      degraded: [],
      unavailable: [],
    },
  };
}

function setup() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-health-edge-'));
  const registryPath = path.join(tmpDir, 'agent-registry.json');
  fs.writeFileSync(registryPath, JSON.stringify(createRegistry(), null, 2));
  return { tmpDir, registryPath };
}

function cleanup(tmpDir) {
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

describe('AgentHealthTracker edge cases and constants', () => {
  let testEnv;

  beforeEach(() => {
    testEnv = setup();
  });

  afterEach(() => {
    cleanup(testEnv.tmpDir);
  });

  it('should handle agent with no prior failures', () => {
    const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
    tracker.recordSuccess('developer');
    const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
    assert.strictEqual(registry.agents.developer.health.successRate, 1.0);
  });

  it('should handle multiple agents independently', () => {
    const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
    tracker.recordFailure('developer', 'Failure 1');
    tracker.recordFailure('developer', 'Failure 2');
    tracker.recordSuccess('qa');

    const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
    assert.strictEqual(registry.agents.developer.health.consecutiveFailures, 2);
    assert.strictEqual(registry.agents.qa.health.successCount, 1);
  });

  it('should handle success resetting failure streak before isolation', () => {
    const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
    registry.agents.developer.health.successCount = 8;
    registry.agents.developer.health.failureCount = 0;
    fs.writeFileSync(testEnv.registryPath, JSON.stringify(registry, null, 2));

    const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
    tracker.recordFailure('developer', 'Failure 1');
    tracker.recordFailure('developer', 'Failure 2');
    tracker.recordSuccess('developer');
    tracker.recordFailure('developer', 'Failure 3');
    tracker.recordFailure('developer', 'Failure 4');

    const updatedRegistry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
    assert.strictEqual(updatedRegistry.agents.developer.health.consecutiveFailures, 2);
    assert.notStrictEqual(updatedRegistry.agents.developer.health.status, 'unavailable');
  });

  it('should handle re-isolation after recovery and more failures', () => {
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
    const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
    registry.agents.developer.health.status = 'unavailable';
    registry.agents.developer.health.isolatedAt = sixMinutesAgo.toISOString();
    registry.agents.developer.health.consecutiveFailures = 3;
    fs.writeFileSync(testEnv.registryPath, JSON.stringify(registry, null, 2));

    const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
    tracker.attemptRecovery('developer');
    tracker.recordFailure('developer', 'New failure 1');
    tracker.recordFailure('developer', 'New failure 2');
    tracker.recordFailure('developer', 'New failure 3');

    const updatedRegistry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
    assert.strictEqual(updatedRegistry.agents.developer.health.status, 'unavailable');
  });

  it('should export expected health constants', () => {
    assert.strictEqual(FAILURE_THRESHOLD, 3);
    assert.strictEqual(DEGRADED_THRESHOLD, 0.7);
    assert.strictEqual(RECOVERY_THRESHOLD, 0.9);
    assert.strictEqual(RECOVERY_WINDOW_MS, 5 * 60 * 1000);
  });

  it('should return summary with agent counts from getHealthReport', () => {
    const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
    const report = tracker.getHealthReport();
    assert.strictEqual(report.summary.totalAgents, 2);
    assert.strictEqual(report.summary.healthy, 2);
    assert.strictEqual(report.summary.degraded, 0);
    assert.strictEqual(report.summary.unavailable, 0);
  });

  it('should return degraded and unavailable details from getHealthReport', () => {
    const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
    registry.agents.developer.health.status = 'degraded';
    registry.agents.developer.health.successRate = 0.65;
    registry.health.healthy = registry.health.healthy.filter(id => id !== 'developer');
    registry.health.degraded.push('developer');
    registry.agents.qa.health.status = 'unavailable';
    registry.agents.qa.health.isolatedAt = new Date().toISOString();
    registry.agents.qa.health.isolationReason = 'Test isolation';
    registry.health.healthy = registry.health.healthy.filter(id => id !== 'qa');
    registry.health.unavailable.push('qa');
    fs.writeFileSync(testEnv.registryPath, JSON.stringify(registry, null, 2));

    const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
    const report = tracker.getHealthReport();
    assert.strictEqual(report.degraded[0].id, 'developer');
    assert.strictEqual(report.unavailable[0].id, 'qa');
    assert.ok(report.unavailable[0].isolatedAt);
    assert.ok(report.unavailable[0].reason);
  });

  it('should reset agent health to defaults', () => {
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
    assert.strictEqual(result, true);

    const updatedRegistry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
    const health = updatedRegistry.agents.developer.health;
    assert.strictEqual(health.status, 'healthy');
    assert.strictEqual(health.consecutiveFailures, 0);
    assert.strictEqual(health.successCount, 0);
    assert.strictEqual(health.failureCount, 0);
    assert.strictEqual(health.successRate, 1.0);
    assert.strictEqual(health.isolatedAt, null);
    assert.strictEqual(health.isolationReason, null);
  });

  it('should return false for unknown agent resetHealth', () => {
    const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
    const result = tracker.resetHealth('unknown-agent');
    assert.strictEqual(result, false);
  });

  it('should update health arrays after reset', () => {
    const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
    registry.agents.developer.health.status = 'unavailable';
    registry.health.healthy = registry.health.healthy.filter(id => id !== 'developer');
    registry.health.unavailable.push('developer');
    fs.writeFileSync(testEnv.registryPath, JSON.stringify(registry, null, 2));

    const tracker = new AgentHealthTracker({ registryPath: testEnv.registryPath });
    tracker.resetHealth('developer');

    const updatedRegistry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
    assert.ok(updatedRegistry.health.healthy.includes('developer'));
    assert.ok(!updatedRegistry.health.unavailable.includes('developer'));
  });
});
