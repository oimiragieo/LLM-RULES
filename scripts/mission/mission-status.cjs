#!/usr/bin/env node
'use strict';

/**
 * Mission Status CLI
 *
 * Prints progress summary from state.json + features.json + validation-state.json.
 * Usage: node scripts/mission/mission-status.cjs <mission-path>
 */

const fs = require('node:fs');
const path = require('node:path');

const missionPath = process.argv[2];
if (!missionPath) {
  console.error('Usage: mission-status <mission-path>');
  process.exit(1);
}

const resolved = path.resolve(missionPath);

function readJSON(file) {
  const filePath = path.join(resolved, file);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const state = readJSON('state.json');
const featuresDoc = readJSON('features.json');
const validationState = readJSON('validation-state.json');

if (!state || !featuresDoc) {
  console.error('Missing state.json or features.json in mission folder');
  process.exit(1);
}

const features = featuresDoc.features || [];
const statusCounts = {};
for (const f of features) {
  statusCounts[f.status] = (statusCounts[f.status] || 0) + 1;
}

const assertions = validationState ? validationState.assertions || {} : {};
const assertionCounts = {};
for (const a of Object.values(assertions)) {
  assertionCounts[a.status] = (assertionCounts[a.status] || 0) + 1;
}

const totalAssertions = Object.keys(assertions).length;
const passedAssertions = assertionCounts.passed || 0;
const pendingAssertions = assertionCounts.pending || 0;

console.log(`\n=== Mission Status: ${state.missionId} ===`);
console.log(`State: ${state.state}`);
console.log(`Working Directory: ${state.workingDirectory}`);
console.log(`Current Feature: ${state.currentFeatureId || 'none'}`);
console.log('');
console.log(`Features: ${statusCounts.completed || 0}/${features.length} completed`);
for (const [status, count] of Object.entries(statusCounts)) {
  console.log(`  ${status}: ${count}`);
}
console.log('');
console.log(
  `Assertions: ${passedAssertions}/${totalAssertions} passed (${pendingAssertions} pending)`
);
for (const [status, count] of Object.entries(assertionCounts)) {
  console.log(`  ${status}: ${count}`);
}

// Feature ≠ Assertion mismatch check
const mismatches = [];
for (const f of features) {
  if (f.status === 'completed' && f.fulfills) {
    for (const valId of f.fulfills) {
      const assertion = assertions[valId];
      if (assertion && assertion.status !== 'passed') {
        mismatches.push({ featureId: f.id, valId, assertionStatus: assertion.status });
      }
    }
  }
}

if (mismatches.length > 0) {
  console.log(`\n⚠ Feature ≠ Assertion Mismatches: ${mismatches.length}`);
  for (const m of mismatches) {
    console.log(`  ${m.featureId} → ${m.valId} (${m.assertionStatus})`);
  }
}

console.log('');
