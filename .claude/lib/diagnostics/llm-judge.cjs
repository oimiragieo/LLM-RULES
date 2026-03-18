#!/usr/bin/env node
'use strict';

/**
 * LLM-as-Judge Evaluation (Feature F5)
 * ======================================
 * Structured evaluation with 5-dimension rubric and evidence citations.
 * Produces composite scores for agent output quality assessment.
 *
 * Usage:
 *   const { createEvaluation, scoreDimension, computeComposite } = require('./llm-judge.cjs');
 */

const DEFAULT_WEIGHTS = {
  accuracy: 0.25,
  groundedness: 0.25,
  coherence: 0.15,
  completeness: 0.2,
  helpfulness: 0.15,
};

const DEFAULT_PASS_THRESHOLD = 0.7;

/**
 * @typedef {Object} EvidenceItem
 * @property {'supports'|'contradicts'|'neutral'} type
 * @property {string} source
 * @property {string} [excerpt]
 * @property {number} [relevance]
 */

/**
 * @typedef {Object} DimensionScore
 * @property {string} name
 * @property {number} score
 * @property {number} weight
 * @property {EvidenceItem[]} evidence
 * @property {string} reasoning
 */

/**
 * Create a new evaluation structure.
 * @param {Object} params
 * @param {string} params.evaluationId
 * @param {string} params.evaluator
 * @param {Object} params.target
 * @param {string} params.target.task_id
 * @param {string} [params.target.agent_type]
 * @param {string} [params.target.output_summary]
 * @returns {Object} Evaluation object
 */
function createEvaluation({ evaluationId, evaluator, target }) {
  return {
    evaluation_id: evaluationId,
    evaluator,
    target,
    dimensions: [],
    composite_score: 0,
    verdict: 'pending',
    pass_threshold: DEFAULT_PASS_THRESHOLD,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Score a single dimension with evidence.
 * @param {string} name - Dimension name
 * @param {number} score - Score 0.0 to 1.0
 * @param {Object} [options]
 * @param {number} [options.weight] - Override default weight
 * @param {EvidenceItem[]} [options.evidence]
 * @param {string} [options.reasoning]
 * @returns {DimensionScore}
 */
function scoreDimension(name, score, options = {}) {
  const validNames = Object.keys(DEFAULT_WEIGHTS);
  if (!validNames.includes(name)) {
    throw new Error(`Invalid dimension: ${name}. Valid: ${validNames.join(', ')}`);
  }
  if (score < 0 || score > 1) {
    throw new Error(`Score must be 0.0-1.0, got: ${score}`);
  }

  return {
    name,
    score: Math.round(score * 100) / 100,
    weight: options.weight ?? DEFAULT_WEIGHTS[name],
    evidence: (options.evidence || []).map(e => ({
      type: e.type,
      source: e.source,
      excerpt: (e.excerpt || '').substring(0, 200),
      relevance: e.relevance ?? 1.0,
    })),
    reasoning: options.reasoning || '',
  };
}

/**
 * Compute weighted composite score from dimensions.
 * @param {DimensionScore[]} dimensions
 * @returns {number} Composite score 0.0 to 1.0
 */
function computeComposite(dimensions) {
  if (dimensions.length === 0) return 0;

  let totalWeight = 0;
  let weightedSum = 0;

  for (const dim of dimensions) {
    totalWeight += dim.weight;
    weightedSum += dim.score * dim.weight;
  }

  return totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : 0;
}

/**
 * Finalize an evaluation with composite score and verdict.
 * @param {Object} evaluation
 * @param {DimensionScore[]} dimensions
 * @param {number} [passThreshold]
 * @returns {Object} Finalized evaluation
 */
function finalizeEvaluation(evaluation, dimensions, passThreshold) {
  const threshold = passThreshold ?? evaluation.pass_threshold ?? DEFAULT_PASS_THRESHOLD;
  const composite = computeComposite(dimensions);

  let verdict;
  if (composite >= threshold) verdict = 'pass';
  else if (composite >= threshold - 0.1) verdict = 'marginal';
  else verdict = 'fail';

  return {
    ...evaluation,
    dimensions,
    composite_score: composite,
    verdict,
    pass_threshold: threshold,
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  createEvaluation,
  scoreDimension,
  computeComposite,
  finalizeEvaluation,
  DEFAULT_WEIGHTS,
  DEFAULT_PASS_THRESHOLD,
};
