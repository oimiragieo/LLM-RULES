'use strict';
const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '.claude',
  'context',
  'memory',
  'velocity-data.json'
);

// Back up and restore velocity data around tests
let originalData = null;

beforeEach(() => {
  if (fs.existsSync(DATA_PATH)) {
    originalData = fs.readFileSync(DATA_PATH, 'utf8');
  }
  // Clear for clean test state
  if (fs.existsSync(DATA_PATH)) {
    fs.unlinkSync(DATA_PATH);
  }
  // Clear require cache so module re-reads file
  delete require.cache[
    require.resolve('../../../.claude/lib/metrics/velocity-tracker.cjs')
  ];
});

afterEach(() => {
  if (originalData !== null) {
    fs.writeFileSync(DATA_PATH, originalData, 'utf8');
  } else if (fs.existsSync(DATA_PATH)) {
    fs.unlinkSync(DATA_PATH);
  }
  originalData = null;
});

function loadTracker() {
  delete require.cache[
    require.resolve('../../../.claude/lib/metrics/velocity-tracker.cjs')
  ];
  return require('../../../.claude/lib/metrics/velocity-tracker.cjs');
}

describe('velocity-tracker', () => {
  test('module should export expected functions', () => {
    const tracker = loadTracker();
    assert.strictEqual(typeof tracker.recordTaskCompletion, 'function');
    assert.strictEqual(typeof tracker.getVelocityStats, 'function');
    assert.strictEqual(typeof tracker.getOverallVelocity, 'function');
    assert.strictEqual(typeof tracker.getTrend, 'function');
  });

  test('records task completion with correct fields', () => {
    const tracker = loadTracker();
    tracker.recordTaskCompletion('developer', 5000, 'task-1');
    const stats = tracker.getVelocityStats('developer');
    assert.strictEqual(stats.taskCount, 1);
    assert.strictEqual(stats.avgDuration, 5000);
  });

  test('computes running average duration per agent type', () => {
    const tracker = loadTracker();
    tracker.recordTaskCompletion('developer', 4000, 'task-1');
    tracker.recordTaskCompletion('developer', 6000, 'task-2');
    tracker.recordTaskCompletion('developer', 5000, 'task-3');
    const stats = tracker.getVelocityStats('developer');
    assert.strictEqual(stats.taskCount, 3);
    assert.strictEqual(stats.avgDuration, 5000);
  });

  test('reports improving trend when recent tasks faster', () => {
    const tracker = loadTracker();
    // Older tasks: slow
    for (let i = 0; i < 5; i++) {
      tracker.recordTaskCompletion('qa', 10000, `task-old-${i}`);
    }
    // Recent tasks: fast (>15% improvement)
    for (let i = 0; i < 5; i++) {
      tracker.recordTaskCompletion('qa', 5000, `task-new-${i}`);
    }
    assert.strictEqual(tracker.getTrend('qa'), 'improving');
  });

  test('reports degrading trend when recent tasks slower', () => {
    const tracker = loadTracker();
    // Older tasks: fast
    for (let i = 0; i < 5; i++) {
      tracker.recordTaskCompletion('architect', 5000, `task-old-${i}`);
    }
    // Recent tasks: slow (>15% degradation)
    for (let i = 0; i < 5; i++) {
      tracker.recordTaskCompletion('architect', 10000, `task-new-${i}`);
    }
    assert.strictEqual(tracker.getTrend('architect'), 'degrading');
  });

  test('reports stable trend when no significant change', () => {
    const tracker = loadTracker();
    for (let i = 0; i < 10; i++) {
      tracker.recordTaskCompletion('devops', 5000 + (i % 3) * 100, `task-${i}`);
    }
    assert.strictEqual(tracker.getTrend('devops'), 'stable');
  });

  test('returns default stats for unknown agent type', () => {
    const tracker = loadTracker();
    const stats = tracker.getVelocityStats('nonexistent-agent');
    assert.strictEqual(stats.taskCount, 0);
    assert.strictEqual(stats.avgDuration, 0);
    assert.strictEqual(stats.trend, 'stable');
  });

  test('caps completions at 100 per agent (FIFO)', () => {
    const tracker = loadTracker();
    for (let i = 0; i < 110; i++) {
      tracker.recordTaskCompletion('developer', 1000 + i, `task-${i}`);
    }
    const stats = tracker.getVelocityStats('developer');
    assert.strictEqual(stats.taskCount, 100);
  });

  test('getOverallVelocity aggregates across all agents', () => {
    const tracker = loadTracker();
    tracker.recordTaskCompletion('developer', 4000, 'task-1');
    tracker.recordTaskCompletion('qa', 6000, 'task-2');
    const overall = tracker.getOverallVelocity();
    assert.strictEqual(overall.totalTasks, 2);
    assert.strictEqual(overall.avgDuration, 5000);
    assert.ok(Array.isArray(overall.agentBreakdown));
    assert.strictEqual(overall.agentBreakdown.length, 2);
  });

  test('trend requires at least 5 tasks to compute', () => {
    const tracker = loadTracker();
    for (let i = 0; i < 3; i++) {
      tracker.recordTaskCompletion('planner', 5000, `task-${i}`);
    }
    // With < 5 tasks, trend should be stable (insufficient data)
    assert.strictEqual(tracker.getTrend('planner'), 'stable');
  });
});
