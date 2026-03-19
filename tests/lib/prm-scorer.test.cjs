/* global performance */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  PRMScorer,
  ScoreValue,
  DEFAULT_VOTING_COUNT,
  aggregateVotes,
} = require('../../.claude/lib/metrics/prm-scorer.cjs');

// ─── Constants ──────────────────────────────────────────────────────────────

describe('prm-scorer constants', () => {
  it('exports ScoreValue enum', () => {
    assert.equal(ScoreValue.POSITIVE, 1);
    assert.equal(ScoreValue.NEUTRAL, 0);
    assert.equal(ScoreValue.NEGATIVE, -1);
  });

  it('exports DEFAULT_VOTING_COUNT', () => {
    assert.equal(typeof DEFAULT_VOTING_COUNT, 'number');
    assert.ok(DEFAULT_VOTING_COUNT >= 1);
  });
});

// ─── aggregateVotes ─────────────────────────────────────────────────────────

describe('aggregateVotes', () => {
  it('majority positive', () => {
    const result = aggregateVotes([1, 1, -1]);
    assert.equal(result.verdict, ScoreValue.POSITIVE);
    assert.equal(result.positiveCount, 2);
    assert.equal(result.negativeCount, 1);
  });

  it('majority negative', () => {
    const result = aggregateVotes([-1, -1, 0]);
    assert.equal(result.verdict, ScoreValue.NEGATIVE);
  });

  it('tie resolves to neutral', () => {
    const result = aggregateVotes([1, -1]);
    assert.equal(result.verdict, ScoreValue.NEUTRAL);
  });

  it('all neutral', () => {
    const result = aggregateVotes([0, 0, 0]);
    assert.equal(result.verdict, ScoreValue.NEUTRAL);
  });

  it('single vote', () => {
    assert.equal(aggregateVotes([1]).verdict, ScoreValue.POSITIVE);
    assert.equal(aggregateVotes([-1]).verdict, ScoreValue.NEGATIVE);
    assert.equal(aggregateVotes([0]).verdict, ScoreValue.NEUTRAL);
  });

  it('empty votes returns neutral', () => {
    assert.equal(aggregateVotes([]).verdict, ScoreValue.NEUTRAL);
  });

  it('includes vote count', () => {
    const result = aggregateVotes([1, 1, -1, 0, 1]);
    assert.equal(result.totalVotes, 5);
    assert.equal(result.positiveCount, 3);
    assert.equal(result.negativeCount, 1);
    assert.equal(result.neutralCount, 1);
  });
});

// ─── PRMScorer ──────────────────────────────────────────────────────────────

describe('PRMScorer', () => {
  it('creates with defaults', () => {
    const scorer = new PRMScorer();
    assert.equal(scorer.votingCount, DEFAULT_VOTING_COUNT);
  });

  it('creates with custom voting count', () => {
    const scorer = new PRMScorer({ votingCount: 5 });
    assert.equal(scorer.votingCount, 5);
  });

  it('records a score for an agent turn', () => {
    const scorer = new PRMScorer();
    scorer.recordScore('agent-1', 'task-1', 0, [1, 1, -1]);
    const scores = scorer.getAgentScores('agent-1');
    assert.equal(scores.length, 1);
    assert.equal(scores[0].taskId, 'task-1');
    assert.equal(scores[0].turnIndex, 0);
    assert.equal(scores[0].verdict, ScoreValue.POSITIVE);
  });

  it('records multiple turns for same agent', () => {
    const scorer = new PRMScorer();
    scorer.recordScore('agent-1', 'task-1', 0, [1, 1, 1]);
    scorer.recordScore('agent-1', 'task-1', 1, [-1, -1, 0]);
    scorer.recordScore('agent-1', 'task-1', 2, [0, 0, 0]);
    const scores = scorer.getAgentScores('agent-1');
    assert.equal(scores.length, 3);
  });

  it('computes agent average score', () => {
    const scorer = new PRMScorer();
    scorer.recordScore('agent-1', 'task-1', 0, [1, 1, 1]); // +1
    scorer.recordScore('agent-1', 'task-1', 1, [-1, -1, -1]); // -1
    scorer.recordScore('agent-1', 'task-1', 2, [0, 0, 0]); // 0
    const avg = scorer.getAgentAverageScore('agent-1');
    assert.equal(avg, 0); // (1 + -1 + 0) / 3
  });

  it('returns 0 for unknown agent average', () => {
    const scorer = new PRMScorer();
    assert.equal(scorer.getAgentAverageScore('unknown'), 0);
  });

  it('returns empty scores for unknown agent', () => {
    const scorer = new PRMScorer();
    assert.deepEqual(scorer.getAgentScores('unknown'), []);
  });

  it('getTaskScores filters by task', () => {
    const scorer = new PRMScorer();
    scorer.recordScore('a', 'task-1', 0, [1]);
    scorer.recordScore('a', 'task-2', 0, [-1]);
    const t1 = scorer.getTaskScores('a', 'task-1');
    assert.equal(t1.length, 1);
    assert.equal(t1[0].taskId, 'task-1');
  });

  it('getAllAgentIds returns unique agents', () => {
    const scorer = new PRMScorer();
    scorer.recordScore('a', 't1', 0, [1]);
    scorer.recordScore('b', 't1', 0, [1]);
    scorer.recordScore('a', 't2', 0, [-1]);
    const ids = scorer.getAllAgentIds();
    assert.deepEqual(ids.sort(), ['a', 'b']);
  });

  it('includes timestamp in recorded score', () => {
    const scorer = new PRMScorer();
    scorer.recordScore('a', 't1', 0, [1]);
    const scores = scorer.getAgentScores('a');
    assert.equal(typeof scores[0].timestamp, 'number');
    assert.ok(scores[0].timestamp > 0);
  });

  it('performance: record 1000 scores under 50ms', () => {
    const scorer = new PRMScorer();
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      scorer.recordScore('agent-perf', `task-${i}`, 0, [1, 0, -1]);
    }
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 50, `Took ${elapsed.toFixed(2)}ms`);
  });
});
