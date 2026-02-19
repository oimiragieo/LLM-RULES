'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { AgentHealthTracker } = require('../../../.claude/lib/tools/agent-health-tracker.cjs');

function setupRegistry() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-health-avg-'));
  const registryPath = path.join(tmpDir, 'agent-registry.json');
  const now = new Date().toISOString();
  const registry = {
    agents: {
      developer: {
        health: {
          status: 'healthy',
          consecutiveFailures: 0,
          successCount: 2,
          failureCount: 8,
          successRate: 0.2,
          averageExecutionMs: 100,
          lastUpdate: now,
          isolatedAt: null,
          isolationReason: null,
          lastSuccessAt: now,
          lastFailureAt: now,
        },
      },
    },
    health: { healthy: ['developer'], degraded: [], unavailable: [] },
    metadata: {},
  };
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf8');
  return { tmpDir, registryPath };
}

test('recordSuccess averages execution time over successful runs only', () => {
  const { tmpDir, registryPath } = setupRegistry();
  try {
    const tracker = new AgentHealthTracker({ registryPath });
    tracker.recordSuccess('developer', 200);
    const updated = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const avg = updated.agents.developer.health.averageExecutionMs;
    assert.equal(avg, (100 * 2 + 200) / 3);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
