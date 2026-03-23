#!/usr/bin/env node
'use strict';

/**
 * outcome-reflection - Main Execution Script
 *
 * Computes calibration scores comparing predicted vs actual task outcomes.
 * Produces per-dimension scores (estimation, prediction, decision) and overall score.
 *
 * Usage:
 *   node .claude/skills/outcome-reflection/scripts/main.cjs \
 *     --taskId task-N \
 *     --predicted '{"tokens":5000,"files":3,"steps":5}' \
 *     --actual '{"tokens":7200,"files":5,"steps":8}'
 *
 *   node .claude/skills/outcome-reflection/scripts/main.cjs \
 *     --analyze --agentType developer --taskType implementation --last 10
 */

const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true;
      args[key] = val;
      if (val !== true) i++;
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Estimation accuracy score formula
// score = max(0, 1 - abs(predicted - actual) / max(predicted, actual))
// ---------------------------------------------------------------------------
function computeEstimationScore(predictions = {}, actuals = {}) {
  const pairs = [
    ['estimatedTokens', 'actualTokens'],
    ['estimatedFiles', 'actualFiles'],
    ['estimatedSteps', 'actualSteps'],
  ];

  const scores = [];
  const details = {};

  for (const [predKey, actualKey] of pairs) {
    const pred = predictions[predKey];
    const actual = actuals[actualKey];

    if (pred !== undefined && actual !== undefined && pred !== null && actual !== null) {
      const denominator = Math.max(pred, actual);
      if (denominator === 0) {
        scores.push(1.0);
        details[predKey] = { predicted: pred, actual, score: 1.0 };
      } else {
        const score = Math.max(0, 1 - Math.abs(pred - actual) / denominator);
        scores.push(score);
        details[predKey] = { predicted: pred, actual, score: Math.round(score * 100) / 100 };
      }
    }
  }

  const mean = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  return {
    score: mean !== null ? Math.round(mean * 100) / 100 : null,
    details,
    samplesUsed: scores.length,
  };
}

// ---------------------------------------------------------------------------
// Decision quality score from rework loops
// ---------------------------------------------------------------------------
function computeDecisionScore(actuals = {}) {
  const rework = actuals.reworkLoops;
  if (rework === undefined || rework === null) return null;

  const scoreMap = { 0: 1.0, 1: 0.75, 2: 0.5, 3: 0.25 };
  return rework >= 4 ? 0.0 : (scoreMap[rework] ?? 0.0);
}

// ---------------------------------------------------------------------------
// Overall score (mean of available dimension scores)
// ---------------------------------------------------------------------------
function computeOverallScore(estimationScore, predictionScore, decisionScore) {
  const available = [estimationScore, predictionScore, decisionScore].filter(s => s !== null);
  if (available.length === 0) return null;
  return Math.round((available.reduce((a, b) => a + b, 0) / available.length) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------
function computeFlags(scores, actuals = {}) {
  const flags = [];
  if (scores.overall !== null && scores.overall < 0.6) {
    flags.push('high-miss');
  }
  if (scores.estimationAccuracy !== null && scores.estimationAccuracy < 0.5) {
    flags.push('estimation-miss');
  }
  if (actuals.reworkLoops >= 3) {
    flags.push('excessive-rework');
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Notes generation
// ---------------------------------------------------------------------------
function generateNotes(estimation, decisionScore, actuals = {}) {
  const notes = [];

  if (estimation.details) {
    for (const [key, detail] of Object.entries(estimation.details)) {
      if (detail.predicted !== undefined && detail.actual !== undefined) {
        const ratio = detail.actual / Math.max(detail.predicted, 1);
        if (ratio > 1.3) {
          notes.push(
            `${key} underestimated by ${Math.round((ratio - 1) * 100)}%. Consider ${Math.round(ratio * 10) / 10}x buffer.`
          );
        } else if (ratio < 0.7) {
          notes.push(`${key} overestimated by ${Math.round((1 - ratio) * 100)}%. Reduce buffer.`);
        }
      }
    }
  }

  if (decisionScore !== null && decisionScore < 0.75) {
    notes.push(`${actuals.reworkLoops} rework loop(s). Investigate root cause of pivots.`);
  }

  return notes.join(' ') || 'No significant calibration issues detected.';
}

// ---------------------------------------------------------------------------
// Main reflect mode
// ---------------------------------------------------------------------------
function reflect(args) {
  let predictions = {};
  let actuals = {};

  try {
    if (args.predicted) predictions = JSON.parse(args.predicted);
  } catch (e) {
    process.stderr.write(`ERROR: Could not parse --predicted JSON: ${e.message}\n`);
    process.exit(1);
  }

  try {
    if (args.actual) actuals = JSON.parse(args.actual);
  } catch (e) {
    process.stderr.write(`ERROR: Could not parse --actual JSON: ${e.message}\n`);
    process.exit(1);
  }

  const estimation = computeEstimationScore(predictions, actuals);
  const decisionScore = computeDecisionScore(actuals);

  // Prediction quality must be provided externally (qualitative assessment)
  // Default to null unless --predictionScore is provided
  const predictionScore = args.predictionScore ? parseFloat(args.predictionScore) : null;

  const overall = computeOverallScore(estimation.score, predictionScore, decisionScore);

  const scores = {
    estimationAccuracy: estimation.score,
    predictionQuality: predictionScore,
    decisionQuality: decisionScore,
    overall,
  };

  const flags = computeFlags({ ...scores, overall }, actuals);
  const notes = generateNotes(estimation, decisionScore, actuals);

  const result = {
    taskId: args.taskId || 'unknown',
    mode: 'reflect',
    scores,
    estimationDetails: estimation.details,
    flags,
    notes,
    reflectionQueued: flags.includes('high-miss'),
  };

  console.log(JSON.stringify(result, null, 2));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const args = parseArgs(process.argv);

  if (!args.taskId && !args.analyze && !args.trend) {
    process.stderr.write(
      'Usage: main.cjs --taskId task-N --predicted \'{"tokens":5000}\' --actual \'{"tokens":7200}\'\n'
    );
    process.stderr.write(
      '       main.cjs --analyze --agentType developer --taskType implementation --last 10\n'
    );
    process.exit(1);
  }

  if (args.analyze || args.trend) {
    // Trend analysis — reads from learnings.md (future implementation)
    console.log(
      JSON.stringify(
        {
          mode: 'trend',
          note: 'Trend analysis reads from .claude/context/memory/learnings.md calibration records.',
          agentType: args.agentType || 'all',
          taskType: args.taskType || 'all',
          last: parseInt(args.last, 10) || 10,
          scores: { overall: null },
          trend: { direction: 'insufficient-data', sampleCount: 0 },
        },
        null,
        2
      )
    );
    return;
  }

  reflect(args);
}

if (require.main === module) {
  main();
}

module.exports = {
  computeEstimationScore,
  computeDecisionScore,
  computeOverallScore,
  computeFlags,
  generateNotes,
};
