'use strict';

/**
 * PRM (Process Reward Model) Scorer
 *
 * Per-turn quality scoring for agent outputs.
 * Uses majority voting (m=3 default) for stable scores.
 * Scores: +1 (positive), 0 (neutral), -1 (negative).
 *
 * Feeds into trust scoring (P0-08) for agent selection.
 *
 * @module prm-scorer
 */

const ScoreValue = Object.freeze({
  POSITIVE: 1,
  NEUTRAL: 0,
  NEGATIVE: -1,
});

const DEFAULT_VOTING_COUNT = 3;

/**
 * Aggregate multiple votes into a verdict using majority voting.
 *
 * @param {number[]} votes - array of +1, 0, -1 values
 * @returns {{ verdict: number, positiveCount: number, negativeCount: number, neutralCount: number, totalVotes: number }}
 */
function aggregateVotes(votes) {
  if (!votes || votes.length === 0) {
    return {
      verdict: ScoreValue.NEUTRAL,
      positiveCount: 0,
      negativeCount: 0,
      neutralCount: 0,
      totalVotes: 0,
    };
  }

  let positiveCount = 0;
  let negativeCount = 0;
  let neutralCount = 0;

  for (const v of votes) {
    if (v > 0) positiveCount++;
    else if (v < 0) negativeCount++;
    else neutralCount++;
  }

  let verdict;
  if (positiveCount > negativeCount) {
    verdict = ScoreValue.POSITIVE;
  } else if (negativeCount > positiveCount) {
    verdict = ScoreValue.NEGATIVE;
  } else {
    verdict = ScoreValue.NEUTRAL;
  }

  return {
    verdict,
    positiveCount,
    negativeCount,
    neutralCount,
    totalVotes: votes.length,
  };
}

class PRMScorer {
  /**
   * @param {{ votingCount?: number }} [opts]
   */
  constructor(opts = {}) {
    this.votingCount =
      typeof opts.votingCount === 'number' && opts.votingCount > 0
        ? opts.votingCount
        : DEFAULT_VOTING_COUNT;

    /** @type {Map<string, Array>} agentId -> scores */
    this._scores = new Map();
  }

  /**
   * Record a score for an agent's turn.
   *
   * @param {string} agentId
   * @param {string} taskId
   * @param {number} turnIndex
   * @param {number[]} votes - array of +1/0/-1 values
   */
  recordScore(agentId, taskId, turnIndex, votes) {
    const agg = aggregateVotes(votes);

    if (!this._scores.has(agentId)) {
      this._scores.set(agentId, []);
    }

    this._scores.get(agentId).push({
      taskId,
      turnIndex,
      votes: [...votes],
      verdict: agg.verdict,
      positiveCount: agg.positiveCount,
      negativeCount: agg.negativeCount,
      neutralCount: agg.neutralCount,
      timestamp: Date.now(),
    });
  }

  /**
   * Get all scores for an agent.
   * @param {string} agentId
   * @returns {Array}
   */
  getAgentScores(agentId) {
    return this._scores.has(agentId) ? [...this._scores.get(agentId)] : [];
  }

  /**
   * Get scores for a specific task.
   * @param {string} agentId
   * @param {string} taskId
   * @returns {Array}
   */
  getTaskScores(agentId, taskId) {
    return this.getAgentScores(agentId).filter(s => s.taskId === taskId);
  }

  /**
   * Compute average verdict for an agent across all turns.
   * @param {string} agentId
   * @returns {number} average score (-1 to 1)
   */
  getAgentAverageScore(agentId) {
    const scores = this.getAgentScores(agentId);
    if (scores.length === 0) return 0;
    const sum = scores.reduce((acc, s) => acc + s.verdict, 0);
    return sum / scores.length;
  }

  /**
   * Get all unique agent IDs that have scores.
   * @returns {string[]}
   */
  getAllAgentIds() {
    return [...this._scores.keys()];
  }
}

module.exports = {
  PRMScorer,
  ScoreValue,
  DEFAULT_VOTING_COUNT,
  aggregateVotes,
};
