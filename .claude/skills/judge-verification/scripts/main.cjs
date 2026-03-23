#!/usr/bin/env node
// judge-verification/scripts/main.cjs
// CLI entry point for judge verification utilities
'use strict';

const { safeParseJSON } = require('../../../../lib/utils/safe-json.cjs');

/**
 * Score a single dimension based on evidence.
 * @param {object} evidence
 * @param {'goalAlignment'|'actionCompleteness'|'evidenceOfCompletion'|'finalStateCoherence'} dimension
 * @returns {{ score: number, justification: string }}
 */
function scoreDimension(evidence, dimension) {
  // This is the cognitive prompt — the judge agent fills this in
  // The script provides the scaffolding for structured evaluation
  const maxScores = {
    goalAlignment: 25,
    actionCompleteness: 25,
    evidenceOfCompletion: 25,
    finalStateCoherence: 25,
  };
  const max = maxScores[dimension] || 25;
  return { score: evidence[dimension] || 0, maxScore: max };
}

/**
 * Calculate the final verdict from dimension scores.
 * @param {{ goalAlignment: number, actionCompleteness: number, evidenceOfCompletion: number, finalStateCoherence: number }} scores
 * @returns {{ verdict: string, confidence: number, totalScore: number }}
 */
function calculateVerdict(scores) {
  const total =
    (scores.goalAlignment || 0) +
    (scores.actionCompleteness || 0) +
    (scores.evidenceOfCompletion || 0) +
    (scores.finalStateCoherence || 0);

  const dim3 = scores.evidenceOfCompletion || 0;

  let verdict;
  if (total >= 70 && dim3 >= 15) {
    verdict = 'PASS';
  } else if (total >= 60 && dim3 >= 15) {
    verdict = 'CONDITIONAL';
  } else {
    verdict = 'FAIL';
  }

  const confidence = Math.min(1.0, parseFloat((total / 100 + (dim3 >= 20 ? 0.1 : 0)).toFixed(2)));

  return { verdict, confidence, totalScore: total };
}

/**
 * Format the judge verdict for output.
 */
function formatVerdict(taskId, scores, reasoning, failureReasons, recommendations) {
  const { verdict, confidence, totalScore } = calculateVerdict(scores);
  return {
    taskId,
    verdict,
    confidence,
    totalScore,
    dimensions: scores,
    reasoning: reasoning || '',
    failureReasons: failureReasons || [],
    recommendations: recommendations || [],
    judgedAt: new Date().toISOString(),
  };
}

// ─── CLI Entry ───────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (cmd === '--verdict') {
    // Reads JSON from stdin: { taskId, scores: { goalAlignment, actionCompleteness, evidenceOfCompletion, finalStateCoherence }, reasoning, failureReasons, recommendations }
    let raw = '';
    process.stdin.on('data', chunk => {
      raw += chunk;
    });
    process.stdin.on('end', () => {
      const { success, data } = safeParseJSON(raw, {});
      if (!success || !data.scores) {
        process.stderr.write(
          '[judge-verification] Invalid input JSON — requires {taskId, scores}\n'
        );
        process.exit(1);
      }
      const result = formatVerdict(
        data.taskId || 'unknown',
        data.scores,
        data.reasoning,
        data.failureReasons,
        data.recommendations
      );
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    });
  } else if (cmd === '--score-only') {
    let raw = '';
    process.stdin.on('data', chunk => {
      raw += chunk;
    });
    process.stdin.on('end', () => {
      const { success, data } = safeParseJSON(raw, {});
      if (!success || !data.scores) {
        process.stderr.write('[judge-verification] Invalid input JSON — requires {scores}\n');
        process.exit(1);
      }
      const result = calculateVerdict(data.scores);
      process.stdout.write(JSON.stringify(result) + '\n');
    });
  } else {
    process.stdout.write(
      [
        'Usage:',
        '  echo \'{"taskId":"t1","scores":{"goalAlignment":20,"actionCompleteness":22,"evidenceOfCompletion":18,"finalStateCoherence":20},"reasoning":"..."}\' | node main.cjs --verdict',
        '  echo \'{"scores":{...}}\' | node main.cjs --score-only',
      ].join('\n') + '\n'
    );
    process.exit(0);
  }
}

module.exports = { calculateVerdict, formatVerdict, scoreDimension };
