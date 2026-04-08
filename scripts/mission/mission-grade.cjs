#!/usr/bin/env node
'use strict';

/**
 * Mission Grade CLI
 *
 * Scores a mission against the full alignment rubric (17 rules, 12 evaluation kinds)
 * and emits a grading-report.schema.json conformant report.
 *
 * Usage:
 *   node scripts/mission/mission-grade.cjs <mission-path> [--output <path>] [--feature <id>]
 */

const fs = require('node:fs');
const path = require('node:path');
const { MissionGrader } = require('../../.claude/lib/mission/mission-grader.cjs');

/**
 * Find the latest handoff for a given feature.
 * @param {string} missionDir - Mission directory path
 * @param {string} targetFeatureId - Feature ID to match
 * @returns {object|null}
 */
function findLatestHandoff(missionDir, targetFeatureId) {
  const handoffsDir = path.join(missionDir, 'handoffs');
  if (!fs.existsSync(handoffsDir)) return null;

  let latest = null;
  const files = fs.readdirSync(handoffsDir).filter(f => f.endsWith('.json'));

  for (const file of files) {
    try {
      const h = JSON.parse(fs.readFileSync(path.join(handoffsDir, file), 'utf8'));
      if (h.featureId !== targetFeatureId) continue;
      if (!latest || h.timestamp > latest.timestamp) latest = h;
    } catch {
      // Skip malformed files
    }
  }

  return latest;
}

const args = process.argv.slice(2);
const missionPath = args.find(a => !a.startsWith('--'));
const outputIdx = args.indexOf('--output');
const outputPath = outputIdx !== -1 && outputIdx + 1 < args.length ? args[outputIdx + 1] : null;
const featureIdx = args.indexOf('--feature');
const featureId = featureIdx !== -1 && featureIdx + 1 < args.length ? args[featureIdx + 1] : null;

if (!missionPath) {
  console.error('Usage: mission-grade <mission-path> [--output <path>] [--feature <id>]');
  process.exit(1);
}

const resolved = path.resolve(missionPath);

if (!fs.existsSync(resolved)) {
  console.error(`Mission directory not found: ${resolved}`);
  process.exit(1);
}

const grader = new MissionGrader();

let report;

if (featureId) {
  // Grade a specific feature
  const featuresDoc = JSON.parse(fs.readFileSync(path.join(resolved, 'features.json'), 'utf8'));
  const feature = (featuresDoc.features || []).find(f => f.id === featureId);

  if (!feature) {
    console.error(`Feature not found: ${featureId}`);
    process.exit(1);
  }

  // Find latest handoff for this feature
  const handoff = findLatestHandoff(resolved, featureId);

  if (!handoff) {
    console.error(`No handoff found for feature: ${featureId}`);
    process.exit(1);
  }

  const validationState = fs.existsSync(path.join(resolved, 'validation-state.json'))
    ? JSON.parse(fs.readFileSync(path.join(resolved, 'validation-state.json'), 'utf8'))
    : { assertions: {} };

  const validationContract = fs.existsSync(path.join(resolved, 'validation-contract.md'))
    ? fs.readFileSync(path.join(resolved, 'validation-contract.md'), 'utf8')
    : '';

  report = grader.gradeFeature(feature, handoff, {
    featuresDocument: featuresDoc,
    validationState,
    validationContract,
  });
} else {
  // Grade entire mission
  report = grader.gradeMission(resolved);
}

// Write output if requested
if (outputPath) {
  fs.writeFileSync(path.resolve(outputPath), JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(`Grading report written to: ${outputPath}`);
}

// Display results
console.log(`\n=== Grading Report ===`);
console.log(`Score: ${report.summary.score}/100`);
console.log(`Grade: ${report.summary.gradeBand.toUpperCase()}`);
console.log(`Passed: ${report.summary.passed}`);

if (report.summary.featuresGraded != null) {
  console.log(`Features graded: ${report.summary.featuresGraded}/${report.summary.featuresTotal}`);
}

// Show per-rule results for single feature grading
if (report.results) {
  console.log(`\nRules:`);
  for (const r of report.results) {
    const icon = r.outcome === 'pass' ? '+' : r.outcome === 'na' ? '~' : '-';
    console.log(
      `  [${icon}] ${r.ruleId}: ${r.outcome} (+${r.pointsAwarded}/${r.weight}) ${r.evidence}`
    );
  }
}

// Show per-feature results for mission grading
if (report.featureReports) {
  console.log(`\nFeature Scores:`);
  for (const fr of report.featureReports) {
    const icon = fr.summary.passed ? '+' : '-';
    console.log(`  [${icon}] ${fr.featureId}: ${fr.summary.score}/100 (${fr.summary.gradeBand})`);
  }
}
