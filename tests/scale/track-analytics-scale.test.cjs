/**
 * SPEC-014: Enterprise-Scale Testing Suite (initial slice)
 *
 * Validates that core analytics logic stays fast and bounded at scale.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const trackAnalytics = require(
  path.join(PROJECT_ROOT, '.claude', 'lib', 'utils', 'track-analytics.cjs')
);

function makeTrack(i) {
  const day = String((i % 28) + 1).padStart(2, '0');
  const created = `2026-01-${day}T00:00:00.000Z`;
  const updated = `2026-01-${day}T12:00:00.000Z`;

  const phaseStates = ['planned', 'implementation', 'verification', 'deployed'];
  const statuses = ['todo', 'in_progress', 'completed'];
  const priorities = ['low', 'medium', 'high'];
  const types = ['spec', 'bugfix', 'refactor'];
  const assignees = ['developer', 'qa', 'security', 'planner'];

  return {
    trackId: `TRACK-${String(i).padStart(6, '0')}`,
    title: `Task ${i}`,
    type: types[i % types.length],
    phaseState: phaseStates[i % phaseStates.length],
    status: statuses[i % statuses.length],
    priority: priorities[i % priorities.length],
    assignee: assignees[i % assignees.length],
    estimatedEffort: { days: (i % 5) + 1 },
    actualEffort: { days: (i % 7) + 1 },
    created_at: created,
    updated_at: updated,
  };
}

function heapUsedMb() {
  return process.memoryUsage().heapUsed / (1024 * 1024);
}

describe('SPEC-014: Scale - Track Analytics', () => {
  it('computes metrics for 10,000 tracks under memory budget', () => {
    const beforeMb = heapUsedMb();

    const tracks = new Array(10_000);
    for (let i = 0; i < tracks.length; i++) tracks[i] = makeTrack(i);

    const metrics = trackAnalytics.computeProjectMetrics(tracks);
    assert.equal(metrics.totalTasks, 10_000);
    assert.ok(metrics.completionPercentage >= 0 && metrics.completionPercentage <= 100);

    const afterMb = heapUsedMb();
    const deltaMb = afterMb - beforeMb;

    // Budget is intentionally conservative (heap delta only; excludes baseline).
    assert.ok(deltaMb < 500, `Expected heap delta < 500MB, got ${deltaMb.toFixed(1)}MB`);
  });

  it('generates analytics report for 10,000 tracks in a reasonable time', () => {
    const tracks = new Array(10_000);
    for (let i = 0; i < tracks.length; i++) tracks[i] = makeTrack(i);

    const start = Date.now();
    const report = trackAnalytics.generateReport(tracks);
    const elapsed = Date.now() - start;

    assert.ok(typeof report === 'string' && report.includes('# Track Analytics Report'));
    // This should normally be far below the threshold; guard against accidental O(n^2) regressions.
    assert.ok(elapsed < 1500, `Expected <1500ms, got ${elapsed}ms`);
  });
});
