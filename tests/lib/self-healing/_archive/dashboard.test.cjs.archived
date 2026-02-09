#!/usr/bin/env node
/**
 * dashboard.test.cjs
 *
 * Tests for the self-healing dashboard module.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Test utilities
let testDir;
let anomalyLog;
let rollbackLog;
let loopStateFile;

function createTestDir() {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-test-'));
  anomalyLog = path.join(testDir, 'anomaly-log.jsonl');
  rollbackLog = path.join(testDir, 'rollback-log.jsonl');
  loopStateFile = path.join(testDir, 'loop-state.json');
  return testDir;
}

function cleanupTestDir() {
  if (testDir && fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

// Simple test runner
const tests = [];
let passed = 0;
let failed = 0;

function describe(name, fn) {
  console.log(`\n${name}`);
  fn();
}

function it(name, fn) {
  tests.push({ name, fn });
}

async function runTests() {
  for (const test of tests) {
    try {
      createTestDir();
      await test.fn();
      passed++;
      console.log(`  PASS: ${test.name}`);
    } catch (e) {
      failed++;
      console.log(`  FAIL: ${test.name}`);
      console.log(`    Error: ${e.message}`);
    } finally {
      cleanupTestDir();
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

function assertIncludes(str, substr, message) {
  if (!str.includes(substr)) {
    throw new Error(message || `Expected "${str}" to include "${substr}"`);
  }
}

// Helper to create mock data
function createMockAnomalyLog(entries) {
  fs.writeFileSync(anomalyLog, entries.map(e => JSON.stringify(e)).join('\n') + '\n');
}

function createMockRollbackLog(entries) {
  fs.writeFileSync(rollbackLog, entries.map(e => JSON.stringify(e)).join('\n') + '\n');
}

function createMockLoopState(state) {
  fs.writeFileSync(loopStateFile, JSON.stringify(state, null, 2));
}

// Import the module (will be created)
const dashboard = require('../../../.claude/lib/self-healing/dashboard.cjs');

// =====================================================
// Tests
// =====================================================

describe('Dashboard Module Exports', () => {
  it('should export required functions', () => {
    assert(typeof dashboard.collectMetrics === 'function', 'collectMetrics should be a function');
    assert(typeof dashboard.formatStatus === 'function', 'formatStatus should be a function');
    assert(typeof dashboard.formatAnomalies === 'function', 'formatAnomalies should be a function');
    assert(typeof dashboard.formatLoops === 'function', 'formatLoops should be a function');
    assert(typeof dashboard.formatRollbacks === 'function', 'formatRollbacks should be a function');
    assert(typeof dashboard.run === 'function', 'run should be a function');
  });

  it('should export setters for paths (testing support)', () => {
    assert(typeof dashboard.setAnomalyLog === 'function', 'setAnomalyLog should be a function');
    assert(typeof dashboard.setRollbackLog === 'function', 'setRollbackLog should be a function');
    assert(
      typeof dashboard.setLoopStateFile === 'function',
      'setLoopStateFile should be a function'
    );
  });
});

describe('Anomaly Metrics', () => {
  it('should count anomalies in 24h window', () => {
    // Configure paths
    dashboard.setAnomalyLog(anomalyLog);
    dashboard.setRollbackLog(rollbackLog);
    dashboard.setLoopStateFile(loopStateFile);

    const now = new Date();
    const twentyHoursAgo = new Date(now.getTime() - 20 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    createMockAnomalyLog([
      { type: 'token_explosion', detected: true, timestamp: now.toISOString() },
      { type: 'duration_spike', detected: true, timestamp: twentyHoursAgo.toISOString() },
      { type: 'repeated_failures', detected: true, timestamp: twoDaysAgo.toISOString() },
    ]);
    createMockLoopState({
      evolutionCount: 0,
      lastEvolutions: {},
      spawnDepth: 0,
      actionHistory: [],
    });

    const metrics = dashboard.collectMetrics();
    assertEqual(metrics.anomalies.last24h, 2, 'Should count 2 anomalies in 24h');
  });

  it('should count anomalies in 7d window', () => {
    dashboard.setAnomalyLog(anomalyLog);
    dashboard.setRollbackLog(rollbackLog);
    dashboard.setLoopStateFile(loopStateFile);

    const now = new Date();
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

    createMockAnomalyLog([
      { type: 'token_explosion', detected: true, timestamp: now.toISOString() },
      { type: 'duration_spike', detected: true, timestamp: fiveDaysAgo.toISOString() },
      { type: 'repeated_failures', detected: true, timestamp: tenDaysAgo.toISOString() },
    ]);
    createMockLoopState({
      evolutionCount: 0,
      lastEvolutions: {},
      spawnDepth: 0,
      actionHistory: [],
    });

    const metrics = dashboard.collectMetrics();
    assertEqual(metrics.anomalies.last7d, 2, 'Should count 2 anomalies in 7d');
  });

  it('should list recent anomalies with relative times', () => {
    dashboard.setAnomalyLog(anomalyLog);
    dashboard.setRollbackLog(rollbackLog);
    dashboard.setLoopStateFile(loopStateFile);

    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    createMockAnomalyLog([
      { type: 'token_explosion', detected: true, timestamp: twoHoursAgo.toISOString() },
    ]);
    createMockLoopState({
      evolutionCount: 0,
      lastEvolutions: {},
      spawnDepth: 0,
      actionHistory: [],
    });

    const metrics = dashboard.collectMetrics();
    assert(metrics.anomalies.recent.length > 0, 'Should have recent anomalies');
    assert(metrics.anomalies.recent[0].type === 'token_explosion', 'Should have correct type');
  });
});

describe('Recovery Success Rate', () => {
  it('should calculate success rate from rollback log', () => {
    dashboard.setAnomalyLog(anomalyLog);
    dashboard.setRollbackLog(rollbackLog);
    dashboard.setLoopStateFile(loopStateFile);

    createMockAnomalyLog([]);
    createMockRollbackLog([
      {
        operation: 'rollback_completed',
        success: true,
        restoredCount: 3,
        failedCount: 0,
        timestamp: new Date().toISOString(),
      },
      {
        operation: 'rollback_completed',
        success: true,
        restoredCount: 2,
        failedCount: 0,
        timestamp: new Date().toISOString(),
      },
      {
        operation: 'rollback_completed',
        success: false,
        restoredCount: 0,
        failedCount: 2,
        timestamp: new Date().toISOString(),
      },
      { operation: 'checkpoint_created', timestamp: new Date().toISOString() }, // Should be ignored
    ]);
    createMockLoopState({
      evolutionCount: 0,
      lastEvolutions: {},
      spawnDepth: 0,
      actionHistory: [],
    });

    const metrics = dashboard.collectMetrics();
    // 2 successful out of 3 rollbacks = 67%
    assert(
      metrics.recovery.successRate >= 66 && metrics.recovery.successRate <= 67,
      `Expected ~67%, got ${metrics.recovery.successRate}%`
    );
    assertEqual(metrics.recovery.total, 3, 'Should count 3 rollbacks');
  });

  it('should handle empty rollback log', () => {
    dashboard.setAnomalyLog(anomalyLog);
    dashboard.setRollbackLog(rollbackLog);
    dashboard.setLoopStateFile(loopStateFile);

    createMockAnomalyLog([]);
    createMockRollbackLog([]);
    createMockLoopState({
      evolutionCount: 0,
      lastEvolutions: {},
      spawnDepth: 0,
      actionHistory: [],
    });

    const metrics = dashboard.collectMetrics();
    assertEqual(metrics.recovery.successRate, 0, 'Should be 0% when no rollbacks');
    assertEqual(metrics.recovery.total, 0, 'Should have 0 rollbacks');
  });
});

describe('Evolution Budget Metrics', () => {
  it('should report current evolution count vs budget', () => {
    dashboard.setAnomalyLog(anomalyLog);
    dashboard.setRollbackLog(rollbackLog);
    dashboard.setLoopStateFile(loopStateFile);

    createMockAnomalyLog([]);
    createMockRollbackLog([]);
    createMockLoopState({
      evolutionCount: 2,
      lastEvolutions: { agent: '2026-01-25T10:00:00Z' },
      spawnDepth: 1,
      actionHistory: [],
    });

    const metrics = dashboard.collectMetrics();
    assertEqual(metrics.evolution.current, 2, 'Should report current evolution count');
    assert(metrics.evolution.budget > 0, 'Should report budget');
  });

  it('should report loop blocks (pattern interventions)', () => {
    dashboard.setAnomalyLog(anomalyLog);
    dashboard.setRollbackLog(rollbackLog);
    dashboard.setLoopStateFile(loopStateFile);

    createMockAnomalyLog([]);
    createMockRollbackLog([]);
    createMockLoopState({
      evolutionCount: 1,
      lastEvolutions: {},
      spawnDepth: 0,
      actionHistory: [
        { action: 'spawn:developer', count: 4, lastAt: '2026-01-25T10:00:00Z' },
        { action: 'spawn:planner', count: 1, lastAt: '2026-01-25T09:00:00Z' },
      ],
    });

    const metrics = dashboard.collectMetrics();
    // spawn:developer count of 4 exceeds default threshold of 3
    assertEqual(
      metrics.loops.interventions,
      1,
      'Should count 1 intervention (action over threshold)'
    );
  });
});

describe('Rollback History', () => {
  it('should list recent rollbacks', () => {
    dashboard.setAnomalyLog(anomalyLog);
    dashboard.setRollbackLog(rollbackLog);
    dashboard.setLoopStateFile(loopStateFile);

    createMockAnomalyLog([]);
    createMockRollbackLog([
      {
        operation: 'rollback_completed',
        checkpointId: 'cp-1',
        restoredCount: 3,
        timestamp: '2026-01-25T10:00:00Z',
      },
      {
        operation: 'rollback_completed',
        checkpointId: 'cp-2',
        restoredCount: 1,
        timestamp: '2026-01-25T09:00:00Z',
      },
    ]);
    createMockLoopState({
      evolutionCount: 0,
      lastEvolutions: {},
      spawnDepth: 0,
      actionHistory: [],
    });

    const metrics = dashboard.collectMetrics();
    assertEqual(metrics.recovery.history.length, 2, 'Should have 2 rollback entries');
    assertEqual(metrics.recovery.history[0].checkpointId, 'cp-1', 'Should have most recent first');
  });
});

describe('formatStatus Output', () => {
  it('should produce ASCII box output', () => {
    dashboard.setAnomalyLog(anomalyLog);
    dashboard.setRollbackLog(rollbackLog);
    dashboard.setLoopStateFile(loopStateFile);

    createMockAnomalyLog([
      { type: 'token_explosion', detected: true, timestamp: new Date().toISOString() },
    ]);
    createMockRollbackLog([]);
    createMockLoopState({
      evolutionCount: 1,
      lastEvolutions: {},
      spawnDepth: 0,
      actionHistory: [],
    });

    const metrics = dashboard.collectMetrics();
    const output = dashboard.formatStatus(metrics);

    assertIncludes(output, 'SELF-HEALING SYSTEM STATUS', 'Should have title');
    assertIncludes(output, 'Anomalies', 'Should have anomalies');
    assertIncludes(output, 'Recovery Rate', 'Should have recovery rate');
    assertIncludes(output, 'Evolution Budget', 'Should have evolution budget');
  });

  it('should include recent anomalies section', () => {
    dashboard.setAnomalyLog(anomalyLog);
    dashboard.setRollbackLog(rollbackLog);
    dashboard.setLoopStateFile(loopStateFile);

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    createMockAnomalyLog([
      { type: 'token_explosion', detected: true, timestamp: twoHoursAgo.toISOString() },
    ]);
    createMockRollbackLog([]);
    createMockLoopState({
      evolutionCount: 0,
      lastEvolutions: {},
      spawnDepth: 0,
      actionHistory: [],
    });

    const metrics = dashboard.collectMetrics();
    const output = dashboard.formatStatus(metrics);

    assertIncludes(output, 'Recent Anomalies', 'Should have recent anomalies section');
    assertIncludes(output, 'token_explosion', 'Should show anomaly type');
  });
});

describe('formatAnomalies Output', () => {
  it('should list anomalies with details', () => {
    dashboard.setAnomalyLog(anomalyLog);
    dashboard.setRollbackLog(rollbackLog);
    dashboard.setLoopStateFile(loopStateFile);

    const now = new Date();
    createMockAnomalyLog([
      {
        type: 'token_explosion',
        detected: true,
        current: 10000,
        average: 2000,
        timestamp: now.toISOString(),
      },
      {
        type: 'repeated_failures',
        detected: true,
        tool: 'Bash',
        count: 5,
        timestamp: now.toISOString(),
      },
    ]);
    createMockRollbackLog([]);
    createMockLoopState({
      evolutionCount: 0,
      lastEvolutions: {},
      spawnDepth: 0,
      actionHistory: [],
    });

    const metrics = dashboard.collectMetrics();
    const output = dashboard.formatAnomalies(metrics);

    assertIncludes(output, 'token_explosion', 'Should show token explosion');
    assertIncludes(output, 'repeated_failures', 'Should show repeated failures');
    assertIncludes(output, 'Bash', 'Should show tool name');
  });
});

describe('formatLoops Output', () => {
  it('should show loop state details', () => {
    dashboard.setAnomalyLog(anomalyLog);
    dashboard.setRollbackLog(rollbackLog);
    dashboard.setLoopStateFile(loopStateFile);

    createMockAnomalyLog([]);
    createMockRollbackLog([]);
    createMockLoopState({
      evolutionCount: 2,
      lastEvolutions: { agent: '2026-01-25T10:00:00Z', skill: '2026-01-25T09:00:00Z' },
      spawnDepth: 1,
      actionHistory: [{ action: 'spawn:developer', count: 3, lastAt: '2026-01-25T10:00:00Z' }],
    });

    const metrics = dashboard.collectMetrics();
    const output = dashboard.formatLoops(metrics);

    assertIncludes(output, 'Evolution Budget', 'Should show evolution budget');
    assertIncludes(output, '2', 'Should show current count');
    assertIncludes(output, 'Spawn Depth', 'Should show spawn depth');
    assertIncludes(output, 'spawn:developer', 'Should show action history');
  });
});

describe('formatRollbacks Output', () => {
  it('should show rollback history with details', () => {
    dashboard.setAnomalyLog(anomalyLog);
    dashboard.setRollbackLog(rollbackLog);
    dashboard.setLoopStateFile(loopStateFile);

    createMockAnomalyLog([]);
    createMockRollbackLog([
      {
        operation: 'rollback_completed',
        checkpointId: 'cp-abc123',
        restoredCount: 5,
        failedCount: 0,
        timestamp: '2026-01-25T10:00:00Z',
      },
      {
        operation: 'selective_rollback',
        checkpointId: 'cp-def456',
        restoredCount: 2,
        skippedCount: 1,
        timestamp: '2026-01-25T09:00:00Z',
      },
    ]);
    createMockLoopState({
      evolutionCount: 0,
      lastEvolutions: {},
      spawnDepth: 0,
      actionHistory: [],
    });

    const metrics = dashboard.collectMetrics();
    const output = dashboard.formatRollbacks(metrics);

    assertIncludes(output, 'cp-abc123', 'Should show checkpoint ID');
    assertIncludes(output, '5 files restored', 'Should show restored count');
  });
});

describe('JSON Output', () => {
  it('should produce valid JSON when --json flag is used', () => {
    dashboard.setAnomalyLog(anomalyLog);
    dashboard.setRollbackLog(rollbackLog);
    dashboard.setLoopStateFile(loopStateFile);

    createMockAnomalyLog([]);
    createMockRollbackLog([]);
    createMockLoopState({
      evolutionCount: 1,
      lastEvolutions: {},
      spawnDepth: 0,
      actionHistory: [],
    });

    const metrics = dashboard.collectMetrics();
    const jsonOutput = JSON.stringify(metrics, null, 2);

    // Should parse without error
    const parsed = JSON.parse(jsonOutput);
    assert(typeof parsed.anomalies === 'object', 'Should have anomalies');
    assert(typeof parsed.recovery === 'object', 'Should have recovery');
    assert(typeof parsed.evolution === 'object', 'Should have evolution');
    assert(typeof parsed.loops === 'object', 'Should have loops');
  });
});

describe('Missing/Empty Files Handling', () => {
  it('should handle missing anomaly log gracefully', () => {
    dashboard.setAnomalyLog(path.join(testDir, 'nonexistent-anomaly.jsonl'));
    dashboard.setRollbackLog(rollbackLog);
    dashboard.setLoopStateFile(loopStateFile);

    createMockRollbackLog([]);
    createMockLoopState({
      evolutionCount: 0,
      lastEvolutions: {},
      spawnDepth: 0,
      actionHistory: [],
    });

    const metrics = dashboard.collectMetrics();
    assertEqual(metrics.anomalies.last24h, 0, 'Should be 0 anomalies');
    assertEqual(metrics.anomalies.last7d, 0, 'Should be 0 anomalies');
  });

  it('should handle missing rollback log gracefully', () => {
    dashboard.setAnomalyLog(anomalyLog);
    dashboard.setRollbackLog(path.join(testDir, 'nonexistent-rollback.jsonl'));
    dashboard.setLoopStateFile(loopStateFile);

    createMockAnomalyLog([]);
    createMockLoopState({
      evolutionCount: 0,
      lastEvolutions: {},
      spawnDepth: 0,
      actionHistory: [],
    });

    const metrics = dashboard.collectMetrics();
    assertEqual(metrics.recovery.total, 0, 'Should be 0 rollbacks');
    assertEqual(metrics.recovery.successRate, 0, 'Should be 0% success rate');
  });

  it('should handle missing loop state gracefully', () => {
    dashboard.setAnomalyLog(anomalyLog);
    dashboard.setRollbackLog(rollbackLog);
    dashboard.setLoopStateFile(path.join(testDir, 'nonexistent-loop.json'));

    createMockAnomalyLog([]);
    createMockRollbackLog([]);

    const metrics = dashboard.collectMetrics();
    assertEqual(metrics.evolution.current, 0, 'Should be 0 evolutions');
    assertEqual(metrics.loops.interventions, 0, 'Should be 0 interventions');
  });

  it('should handle empty files gracefully', () => {
    dashboard.setAnomalyLog(anomalyLog);
    dashboard.setRollbackLog(rollbackLog);
    dashboard.setLoopStateFile(loopStateFile);

    fs.writeFileSync(anomalyLog, '');
    fs.writeFileSync(rollbackLog, '');
    fs.writeFileSync(loopStateFile, '{}');

    const metrics = dashboard.collectMetrics();
    assertEqual(metrics.anomalies.last24h, 0, 'Should be 0 anomalies');
    assertEqual(metrics.recovery.total, 0, 'Should be 0 rollbacks');
  });
});

describe('Relative Time Formatting', () => {
  it('should format hours ago correctly', () => {
    dashboard.setAnomalyLog(anomalyLog);
    dashboard.setRollbackLog(rollbackLog);
    dashboard.setLoopStateFile(loopStateFile);

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    createMockAnomalyLog([
      { type: 'token_explosion', detected: true, timestamp: twoHoursAgo.toISOString() },
    ]);
    createMockRollbackLog([]);
    createMockLoopState({
      evolutionCount: 0,
      lastEvolutions: {},
      spawnDepth: 0,
      actionHistory: [],
    });

    const metrics = dashboard.collectMetrics();
    assert(metrics.anomalies.recent[0].relativeTime.includes('h ago'), 'Should show hours ago');
  });

  it('should format minutes ago correctly', () => {
    dashboard.setAnomalyLog(anomalyLog);
    dashboard.setRollbackLog(rollbackLog);
    dashboard.setLoopStateFile(loopStateFile);

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    createMockAnomalyLog([
      { type: 'token_explosion', detected: true, timestamp: tenMinutesAgo.toISOString() },
    ]);
    createMockRollbackLog([]);
    createMockLoopState({
      evolutionCount: 0,
      lastEvolutions: {},
      spawnDepth: 0,
      actionHistory: [],
    });

    const metrics = dashboard.collectMetrics();
    assert(metrics.anomalies.recent[0].relativeTime.includes('m ago'), 'Should show minutes ago');
  });
});

// Run tests
runTests();
