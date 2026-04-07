'use strict';

/**
 * Mission Status Generator
 *
 * Generates a mission-status.md file with side-by-side view of
 * feature progress vs assertion progress. Surfaces the Factory Droid
 * "feature done ≠ assertion done" distinction explicitly.
 *
 * Also detects W-VAL-FEATURE-MISMATCH warnings (feature completed but
 * fulfills VAL-* assertions still pending).
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * Generate a mission status markdown report.
 *
 * @param {object} options
 * @param {string} options.missionDir - Mission bundle directory
 * @param {string} [options.outputPath] - Output path (default: missionDir/mission-status.md)
 * @returns {{ report: string, mismatches: object[], summary: object }}
 */
function generateMissionStatus(options) {
  const { missionDir, outputPath } = options;

  const statePath = path.join(missionDir, 'state.json');
  const featuresPath = path.join(missionDir, 'features.json');
  const validationPath = path.join(missionDir, 'validation-state.json');

  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const { features } = JSON.parse(fs.readFileSync(featuresPath, 'utf8'));
  const validationState = fs.existsSync(validationPath)
    ? JSON.parse(fs.readFileSync(validationPath, 'utf8'))
    : { assertions: {} };

  const assertions = validationState.assertions || {};

  // Count features by status
  const featuresByStatus = {};
  for (const f of features) {
    featuresByStatus[f.status] = (featuresByStatus[f.status] || 0) + 1;
  }
  const completedFeatures = featuresByStatus.completed || 0;

  // Count assertions by status
  const assertionsByStatus = {};
  for (const a of Object.values(assertions)) {
    assertionsByStatus[a.status] = (assertionsByStatus[a.status] || 0) + 1;
  }
  const totalAssertions = Object.keys(assertions).length;
  const passedAssertions = assertionsByStatus.passed || 0;
  const pendingAssertions = assertionsByStatus.pending || 0;

  // Detect feature ≠ assertion mismatches
  const mismatches = [];
  for (const f of features) {
    if (f.status === 'completed' && Array.isArray(f.fulfills)) {
      for (const valId of f.fulfills) {
        const assertion = assertions[valId];
        if (assertion && assertion.status !== 'passed') {
          mismatches.push({
            featureId: f.id,
            valId,
            featureStatus: f.status,
            assertionStatus: assertion.status,
          });
        }
      }
    }
  }

  // Build milestones summary
  const milestoneMap = new Map();
  for (const f of features) {
    if (!f.milestone) continue;
    if (!milestoneMap.has(f.milestone)) {
      milestoneMap.set(f.milestone, { total: 0, completed: 0, features: [] });
    }
    const ms = milestoneMap.get(f.milestone);
    ms.total++;
    if (f.status === 'completed') ms.completed++;
    ms.features.push(f);
  }

  // Generate markdown
  const lines = [];
  lines.push(`<!-- Generated: ${new Date().toISOString()} -->`);
  lines.push(`# Mission Status: ${state.missionId}`);
  lines.push('');
  lines.push(`**State:** ${state.state}`);
  lines.push(`**Working Directory:** ${state.workingDirectory || 'N/A'}`);
  lines.push(`**Current Feature:** ${state.currentFeatureId || 'none'}`);
  lines.push(`**Updated:** ${state.updatedAt || 'unknown'}`);
  lines.push('');

  // Side-by-side summary
  lines.push('## Progress Summary');
  lines.push('');
  lines.push('| Dimension | Done | Total | Pending |');
  lines.push('|-----------|------|-------|---------|');
  lines.push(
    `| Features | ${completedFeatures} | ${features.length} | ${featuresByStatus.pending || 0} |`
  );
  lines.push(`| Assertions | ${passedAssertions} | ${totalAssertions} | ${pendingAssertions} |`);
  lines.push('');

  // Mismatch warnings
  if (mismatches.length > 0) {
    lines.push(`## Feature ≠ Assertion Mismatches (${mismatches.length})`);
    lines.push('');
    lines.push('These features are completed but their VAL-* assertions have not passed:');
    lines.push('');
    lines.push('| Feature | VAL ID | Assertion Status |');
    lines.push('|---------|--------|-----------------|');
    for (const m of mismatches) {
      lines.push(`| ${m.featureId} | ${m.valId} | ${m.assertionStatus} |`);
    }
    lines.push('');
  }

  // Milestone progression
  lines.push('## Milestones');
  lines.push('');
  for (const [name, ms] of milestoneMap) {
    const icon = ms.completed === ms.total ? '[x]' : `[${ms.completed}/${ms.total}]`;
    lines.push(`- ${icon} **${name}** — ${ms.completed}/${ms.total} features`);
  }
  lines.push('');

  // Feature detail table
  lines.push('## Features');
  lines.push('');
  lines.push('| ID | Status | Milestone | Fulfills |');
  lines.push('|----|--------|-----------|----------|');
  for (const f of features) {
    const fulfills = (f.fulfills || []).join(', ') || '-';
    lines.push(`| ${f.id} | ${f.status} | ${f.milestone} | ${fulfills} |`);
  }
  lines.push('');

  const report = lines.join('\n');

  // Write to file if outputPath given
  const dest = outputPath || path.join(missionDir, 'mission-status.md');
  fs.writeFileSync(dest, report, 'utf8');

  const summary = {
    features: { total: features.length, completed: completedFeatures },
    assertions: { total: totalAssertions, passed: passedAssertions, pending: pendingAssertions },
    mismatches: mismatches.length,
    milestones: milestoneMap.size,
  };

  return { report, mismatches, summary };
}

module.exports = {
  generateMissionStatus,
};
