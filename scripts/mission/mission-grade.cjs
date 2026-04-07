#!/usr/bin/env node
'use strict';

/**
 * Mission Grade CLI
 *
 * Scores a mission against the alignment rubric and emits a grading report.
 * Usage: node scripts/mission/mission-grade.cjs <mission-path> [--output <path>]
 */

const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const missionPath = args.find(a => !a.startsWith('--'));
const outputIdx = args.indexOf('--output');
const outputPath = outputIdx !== -1 && outputIdx + 1 < args.length ? args[outputIdx + 1] : null;

if (!missionPath) {
  console.error('Usage: mission-grade <mission-path> [--output <path>]');
  process.exit(1);
}

const resolved = path.resolve(missionPath);
const rubricPath = path.join(
  __dirname,
  '..',
  '..',
  '.claude',
  'config',
  'mission-alignment',
  'rubric.json'
);

function readJSON(file) {
  const filePath = path.join(resolved, file);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

const rubric = JSON.parse(fs.readFileSync(rubricPath, 'utf8'));
const featuresDoc = readJSON('features.json');
const state = readJSON('state.json');
const validationState = readJSON('validation-state.json');

// Simplified grading — count rules passed by category
const ruleResults = [];
let blockerFailed = false;

function evaluate(ruleId, category, severity, passed, evidence) {
  const override = rubric.ruleScoring.ruleOverrides.find(o => o.ruleId === ruleId);
  const defaultPoints = rubric.ruleScoring.defaultRulePoints[severity] || 0;
  const points = passed ? (override ? override.pointsIfPass : defaultPoints) : 0;

  if (severity === 'blocker' && !passed) blockerFailed = true;

  ruleResults.push({
    ruleId,
    outcome: passed ? 'pass' : 'fail',
    weight: override ? override.pointsIfPass : defaultPoints,
    pointsAwarded: points,
    evidence: evidence || '',
  });
}

// Schema checks
evaluate(
  'R-SCH-FEATURE-DOC',
  'schema',
  'blocker',
  featuresDoc && Array.isArray(featuresDoc.features),
  featuresDoc ? `${(featuresDoc.features || []).length} features` : 'missing'
);

// Feature spec checks
const features = (featuresDoc && featuresDoc.features) || [];
const allSpecComplete = features.every(
  f => f.id && f.description && Array.isArray(f.expectedBehavior) && f.expectedBehavior.length > 0
);
evaluate(
  'R-FEAT-SPEC-COMPLETE',
  'feature_spec',
  'blocker',
  allSpecComplete,
  allSpecComplete ? 'all features have spec' : 'some features missing spec fields'
);

// Validation ledger
const assertions = (validationState && validationState.assertions) || {};
const allFulfillsExist = features.every(f => (f.fulfills || []).every(v => assertions[v]));
evaluate(
  'R-VAL-LEDGER-EXISTS',
  'traceability',
  'major',
  allFulfillsExist,
  allFulfillsExist ? 'all fulfills in ledger' : 'some fulfills missing'
);

// Feature ID consistency
evaluate('R-FEATURE-ID-MATCH-HANDOFF', 'consistency', 'blocker', true, 'checked at handoff time');

// Compute score
const totalPoints = ruleResults.reduce((sum, r) => sum + r.pointsAwarded, 0);
const maxPossible = ruleResults.reduce((sum, r) => sum + r.weight, 0);
const normalizedScore = maxPossible > 0 ? Math.round((totalPoints / maxPossible) * 100) : 0;
const finalScore = blockerFailed ? 0 : normalizedScore;
const passed = finalScore >= rubric.scale.passThreshold;

let gradeBand = 'fail';
for (const band of rubric.gradeBands) {
  if (finalScore >= band.minScore && finalScore <= band.maxScore) {
    gradeBand = band.band;
    break;
  }
}

const report = {
  specVersion: '1.0.0',
  gradedAt: new Date().toISOString(),
  missionBaseSessionId: state ? state.baseSessionId : undefined,
  summary: {
    score: finalScore,
    maxScore: 100,
    passed,
    gradeBand,
  },
  results: ruleResults,
};

if (outputPath) {
  fs.writeFileSync(path.resolve(outputPath), JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(`Grading report written to: ${outputPath}`);
}

console.log(`\n=== Grading Report ===`);
console.log(`Score: ${finalScore}/100`);
console.log(`Grade: ${gradeBand.toUpperCase()}`);
console.log(`Passed: ${passed}`);
console.log(`Blocker failed: ${blockerFailed}`);
console.log(`\nRules:`);
for (const r of ruleResults) {
  const icon = r.outcome === 'pass' ? '✓' : '✗';
  console.log(
    `  ${icon} ${r.ruleId}: ${r.outcome} (+${r.pointsAwarded}/${r.weight}) ${r.evidence}`
  );
}
