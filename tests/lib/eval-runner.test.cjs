/* global performance */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  EvalRunner,
  EvalDimension,
  computeDimensionScore,
  computeCompositeScore,
} = require('../../.claude/lib/metrics/eval-runner.cjs');

// ─── EvalDimension ──────────────────────────────────────────────────────────

describe('EvalDimension', () => {
  it('exports dimension names', () => {
    assert.equal(EvalDimension.GOAL_ALIGNMENT, 'goal_alignment');
    assert.equal(EvalDimension.TOOL_SELECTION, 'tool_selection');
    assert.equal(EvalDimension.REASONING_EFFICIENCY, 'reasoning_efficiency');
    assert.equal(EvalDimension.SEMANTIC_QUALITY, 'semantic_quality');
    assert.equal(EvalDimension.COMPLETENESS, 'completeness');
  });
});

// ─── computeDimensionScore ──────────────────────────────────────────────────

describe('computeDimensionScore', () => {
  it('computes score from criteria', () => {
    const criteria = [
      { name: 'c1', score: 0.8, weight: 1 },
      { name: 'c2', score: 0.6, weight: 1 },
    ];
    const result = computeDimensionScore(criteria);
    assert.ok(Math.abs(result - 0.7) < 0.001);
  });

  it('applies weights', () => {
    const criteria = [
      { name: 'c1', score: 1.0, weight: 3 },
      { name: 'c2', score: 0.0, weight: 1 },
    ];
    const result = computeDimensionScore(criteria);
    assert.ok(Math.abs(result - 0.75) < 0.001);
  });

  it('returns 0 for empty criteria', () => {
    assert.equal(computeDimensionScore([]), 0);
  });

  it('clamps to 0-1 range', () => {
    const criteria = [{ name: 'c1', score: 1.5, weight: 1 }];
    const result = computeDimensionScore(criteria);
    assert.ok(result <= 1);
  });
});

// ─── computeCompositeScore ──────────────────────────────────────────────────

describe('computeCompositeScore', () => {
  it('weighted average of dimensions', () => {
    const dimensions = {
      [EvalDimension.GOAL_ALIGNMENT]: { score: 0.9, weight: 2 },
      [EvalDimension.TOOL_SELECTION]: { score: 0.8, weight: 1 },
      [EvalDimension.REASONING_EFFICIENCY]: { score: 0.7, weight: 1 },
      [EvalDimension.SEMANTIC_QUALITY]: { score: 0.6, weight: 1 },
      [EvalDimension.COMPLETENESS]: { score: 0.5, weight: 1 },
    };
    const result = computeCompositeScore(dimensions);
    // (0.9*2 + 0.8 + 0.7 + 0.6 + 0.5) / (2+1+1+1+1) = 4.4/6 ≈ 0.733
    assert.ok(Math.abs(result - 0.7333) < 0.01);
  });

  it('handles single dimension', () => {
    const dimensions = {
      [EvalDimension.GOAL_ALIGNMENT]: { score: 0.85, weight: 1 },
    };
    assert.ok(Math.abs(computeCompositeScore(dimensions) - 0.85) < 0.001);
  });

  it('returns 0 for empty dimensions', () => {
    assert.equal(computeCompositeScore({}), 0);
  });
});

// ─── EvalRunner ─────────────────────────────────────────────────────────────

describe('EvalRunner', () => {
  it('creates with default config', () => {
    const runner = new EvalRunner();
    assert.ok(runner);
  });

  it('records an evaluation result', () => {
    const runner = new EvalRunner();
    runner.recordEvaluation('agent-1', 'task-1', {
      [EvalDimension.GOAL_ALIGNMENT]: { score: 0.9, weight: 1 },
      [EvalDimension.COMPLETENESS]: { score: 0.8, weight: 1 },
    });
    const evals = runner.getAgentEvaluations('agent-1');
    assert.equal(evals.length, 1);
    assert.equal(evals[0].taskId, 'task-1');
    assert.ok(evals[0].compositeScore > 0);
  });

  it('computes composite score on record', () => {
    const runner = new EvalRunner();
    runner.recordEvaluation('a', 't', {
      [EvalDimension.GOAL_ALIGNMENT]: { score: 1.0, weight: 1 },
      [EvalDimension.COMPLETENESS]: { score: 0.5, weight: 1 },
    });
    const evals = runner.getAgentEvaluations('a');
    assert.ok(Math.abs(evals[0].compositeScore - 0.75) < 0.001);
  });

  it('getAgentAverageComposite across evals', () => {
    const runner = new EvalRunner();
    runner.recordEvaluation('a', 't1', {
      [EvalDimension.GOAL_ALIGNMENT]: { score: 1.0, weight: 1 },
    });
    runner.recordEvaluation('a', 't2', {
      [EvalDimension.GOAL_ALIGNMENT]: { score: 0.5, weight: 1 },
    });
    const avg = runner.getAgentAverageComposite('a');
    assert.ok(Math.abs(avg - 0.75) < 0.001);
  });

  it('returns 0 for unknown agent', () => {
    const runner = new EvalRunner();
    assert.equal(runner.getAgentAverageComposite('unknown'), 0);
  });

  it('returns empty evals for unknown agent', () => {
    const runner = new EvalRunner();
    assert.deepEqual(runner.getAgentEvaluations('unknown'), []);
  });

  it('getLeaderboard returns sorted agents', () => {
    const runner = new EvalRunner();
    runner.recordEvaluation('low', 't', {
      [EvalDimension.GOAL_ALIGNMENT]: { score: 0.3, weight: 1 },
    });
    runner.recordEvaluation('high', 't', {
      [EvalDimension.GOAL_ALIGNMENT]: { score: 0.9, weight: 1 },
    });
    runner.recordEvaluation('mid', 't', {
      [EvalDimension.GOAL_ALIGNMENT]: { score: 0.6, weight: 1 },
    });
    const board = runner.getLeaderboard();
    assert.equal(board[0].agentId, 'high');
    assert.equal(board[1].agentId, 'mid');
    assert.equal(board[2].agentId, 'low');
  });

  it('includes timestamp in evaluation', () => {
    const runner = new EvalRunner();
    runner.recordEvaluation('a', 't', {
      [EvalDimension.COMPLETENESS]: { score: 0.5, weight: 1 },
    });
    const evals = runner.getAgentEvaluations('a');
    assert.equal(typeof evals[0].timestamp, 'number');
  });

  it('performance: 500 evaluations under 50ms', () => {
    const runner = new EvalRunner();
    const dims = {
      [EvalDimension.GOAL_ALIGNMENT]: { score: 0.8, weight: 2 },
      [EvalDimension.TOOL_SELECTION]: { score: 0.7, weight: 1 },
    };
    const start = performance.now();
    for (let i = 0; i < 500; i++) {
      runner.recordEvaluation(`agent-${i % 10}`, `task-${i}`, dims);
    }
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 50, `Took ${elapsed.toFixed(2)}ms`);
  });
});
