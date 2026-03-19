'use strict';

/**
 * Agent Evaluation Framework
 *
 * Multi-metric evaluation across 5 dimensions:
 *   - GoalAlignment: did the agent achieve the stated goal?
 *   - ToolSelection: were appropriate tools chosen?
 *   - ReasoningEfficiency: was reasoning concise and effective?
 *   - SemanticQuality: was output semantically correct?
 *   - Completeness: were all requirements addressed?
 *
 * Supports A/B testing via composite score comparison.
 *
 * @module eval-runner
 */

const EvalDimension = Object.freeze({
  GOAL_ALIGNMENT: 'goal_alignment',
  TOOL_SELECTION: 'tool_selection',
  REASONING_EFFICIENCY: 'reasoning_efficiency',
  SEMANTIC_QUALITY: 'semantic_quality',
  COMPLETENESS: 'completeness',
});

/**
 * Compute weighted average score from criteria.
 *
 * @param {Array<{ name: string, score: number, weight: number }>} criteria
 * @returns {number} score 0-1
 */
function computeDimensionScore(criteria) {
  if (!criteria || criteria.length === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const c of criteria) {
    const score = Math.min(1, Math.max(0, c.score));
    const weight = c.weight || 1;
    weightedSum += score * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Compute composite score from dimension scores.
 *
 * @param {Object<string, { score: number, weight: number }>} dimensions
 * @returns {number} composite score 0-1
 */
function computeCompositeScore(dimensions) {
  const entries = Object.values(dimensions);
  if (entries.length === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const d of entries) {
    const weight = d.weight || 1;
    weightedSum += d.score * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

class EvalRunner {
  constructor() {
    /** @type {Map<string, Array>} agentId -> evaluations */
    this._evaluations = new Map();
  }

  /**
   * Record an evaluation result for an agent on a task.
   *
   * @param {string} agentId
   * @param {string} taskId
   * @param {Object<string, { score: number, weight: number }>} dimensions
   */
  recordEvaluation(agentId, taskId, dimensions) {
    const compositeScore = computeCompositeScore(dimensions);

    if (!this._evaluations.has(agentId)) {
      this._evaluations.set(agentId, []);
    }

    this._evaluations.get(agentId).push({
      taskId,
      dimensions: { ...dimensions },
      compositeScore,
      timestamp: Date.now(),
    });
  }

  /**
   * Get all evaluations for an agent.
   * @param {string} agentId
   * @returns {Array}
   */
  getAgentEvaluations(agentId) {
    return this._evaluations.has(agentId) ? [...this._evaluations.get(agentId)] : [];
  }

  /**
   * Get average composite score for an agent.
   * @param {string} agentId
   * @returns {number}
   */
  getAgentAverageComposite(agentId) {
    const evals = this.getAgentEvaluations(agentId);
    if (evals.length === 0) return 0;
    const sum = evals.reduce((acc, e) => acc + e.compositeScore, 0);
    return sum / evals.length;
  }

  /**
   * Get leaderboard sorted by average composite score descending.
   * @returns {Array<{ agentId: string, averageScore: number, evalCount: number }>}
   */
  getLeaderboard() {
    const board = [];
    for (const [agentId] of this._evaluations) {
      board.push({
        agentId,
        averageScore: this.getAgentAverageComposite(agentId),
        evalCount: this._evaluations.get(agentId).length,
      });
    }
    board.sort((a, b) => b.averageScore - a.averageScore);
    return board;
  }
}

module.exports = {
  EvalRunner,
  EvalDimension,
  computeDimensionScore,
  computeCompositeScore,
};
