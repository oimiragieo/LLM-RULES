#!/usr/bin/env node
'use strict';

/**
 * Mission Validate CLI
 *
 * Validates a mission bundle against alignment rules.
 * Checks: JSON structure, required fields, cross-references, evidence.
 * Usage: node scripts/mission/mission-validate.cjs <mission-path>
 */

const fs = require('node:fs');
const path = require('node:path');

const missionPath = process.argv[2];
if (!missionPath) {
  console.error('Usage: mission-validate <mission-path>');
  process.exit(1);
}

const resolved = path.resolve(missionPath);

function readJSON(file) {
  const filePath = path.join(resolved, file);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readText(file) {
  const filePath = path.join(resolved, file);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8');
}

const results = [];
let blockerFailed = false;

function report(ruleId, severity, outcome, evidence) {
  results.push({ ruleId, severity, outcome, evidence });
  if (severity === 'blocker' && outcome === 'fail') blockerFailed = true;
}

// Load artifacts
const featuresDoc = readJSON('features.json');
const _state = readJSON('state.json');
const validationState = readJSON('validation-state.json');
const validationContract = readText('validation-contract.md');

// R-SCH-FEATURE-DOC: features.json exists and has features array
if (!featuresDoc || !Array.isArray(featuresDoc.features)) {
  report('R-SCH-FEATURE-DOC', 'blocker', 'fail', 'features.json missing or invalid');
} else {
  report('R-SCH-FEATURE-DOC', 'blocker', 'pass', `${featuresDoc.features.length} features found`);
}

// Validate each feature
const features = (featuresDoc && featuresDoc.features) || [];
for (const feature of features) {
  // R-FEAT-SPEC-COMPLETE
  const hasId = feature.id && feature.id.trim();
  const hasDesc = feature.description && feature.description.trim();
  const hasBehavior =
    Array.isArray(feature.expectedBehavior) && feature.expectedBehavior.length > 0;
  if (!hasId || !hasDesc || !hasBehavior) {
    report(
      'R-FEAT-SPEC-COMPLETE',
      'blocker',
      'fail',
      `Feature ${feature.id || '?'} missing required spec fields`
    );
  }

  // R-VAL-ID-FORMAT
  if (Array.isArray(feature.fulfills)) {
    const valPattern = /^VAL-[A-Z0-9]+-[0-9]{3}$/;
    for (const valId of feature.fulfills) {
      if (!valPattern.test(valId)) {
        report(
          'R-VAL-ID-FORMAT',
          'major',
          'fail',
          `Invalid VAL ID: ${valId} in feature ${feature.id}`
        );
      }
    }
  }

  // R-VAL-LEDGER-EXISTS
  if (validationState && Array.isArray(feature.fulfills)) {
    for (const valId of feature.fulfills) {
      if (!validationState.assertions || !validationState.assertions[valId]) {
        report('R-VAL-LEDGER-EXISTS', 'major', 'fail', `${valId} not in validation-state.json`);
      }
    }
  }

  // R-CONTRACT-MENTIONS-VAL
  if (validationContract && Array.isArray(feature.fulfills)) {
    for (const valId of feature.fulfills) {
      if (!validationContract.includes(valId)) {
        report(
          'R-CONTRACT-MENTIONS-VAL',
          'major',
          'fail',
          `${valId} not in validation-contract.md`
        );
      }
    }
  }

  // W-VAL-FEATURE-MISMATCH
  if (feature.status === 'completed' && Array.isArray(feature.fulfills) && validationState) {
    for (const valId of feature.fulfills) {
      const assertion = validationState.assertions && validationState.assertions[valId];
      if (assertion && assertion.status !== 'passed') {
        report(
          'W-VAL-FEATURE-MISMATCH',
          'warning',
          'fail',
          `Feature ${feature.id} completed but ${valId} is ${assertion.status}`
        );
      }
    }
  }
}

// Summary
const passed = results.filter(r => r.outcome === 'pass').length;
const failed = results.filter(r => r.outcome === 'fail').length;
const warnings = results.filter(r => r.severity === 'warning' && r.outcome === 'fail').length;

console.log(`\n=== Mission Validation: ${resolved} ===`);
console.log(`Rules checked: ${results.length}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed - warnings}`);
console.log(`Warnings: ${warnings}`);
console.log(`Blocker failed: ${blockerFailed}`);

if (failed > 0) {
  console.log('\nFailures:');
  for (const r of results.filter(r => r.outcome === 'fail')) {
    const prefix = r.severity === 'warning' ? '⚠' : '✗';
    console.log(`  ${prefix} [${r.severity}] ${r.ruleId}: ${r.evidence}`);
  }
}

console.log(`\nResult: ${blockerFailed ? 'FAIL' : 'PASS'}`);
process.exit(blockerFailed ? 1 : 0);
