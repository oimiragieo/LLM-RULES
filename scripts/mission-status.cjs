#!/usr/bin/env node
'use strict';

/**
 * Mission Status CLI
 *
 * Generates a human-readable dashboard showing:
 * - Feature progress by milestone
 * - VAL assertion matrix (feature done vs assertion done)
 * - Mismatched statuses (feature completed but VAL still pending)
 *
 * Usage:
 *   node scripts/mission-status.cjs --mission-path <path-to-mission-dir>
 *   node scripts/mission-status.cjs --mission-path .claude/missions/<uuid>
 *   pnpm mission:status -- --mission-path .claude/missions/<uuid>
 */

const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const args = { json: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--mission-path' && argv[i + 1]) {
      args.missionPath = argv[++i];
    } else if (argv[i] === '--json') {
      args.json = true;
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log(`Usage: node scripts/mission-status.cjs --mission-path <path>

Options:
  --mission-path <path>  Path to mission directory
  --json                 Output as JSON
  --help                 Show this help`);
      process.exit(0);
    }
  }
  return args;
}

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function autoDiscoverMission() {
  const missionsDir = path.resolve(process.cwd(), '.claude', 'missions');
  if (!fs.existsSync(missionsDir)) return null;

  const entries = fs.readdirSync(missionsDir).filter(e => {
    return fs.statSync(path.join(missionsDir, e)).isDirectory();
  });
  if (entries.length === 0) return null;

  entries.sort((a, b) => {
    const sa = fs.statSync(path.join(missionsDir, a));
    const sb = fs.statSync(path.join(missionsDir, b));
    return sb.mtimeMs - sa.mtimeMs;
  });
  return path.join(missionsDir, entries[0]);
}

function groupByMilestone(features) {
  const milestones = new Map();
  for (const f of features) {
    const ms = f.milestone || 'unassigned';
    if (!milestones.has(ms)) milestones.set(ms, []);
    milestones.get(ms).push(f);
  }
  return milestones;
}

function collectMismatches(features, assertions) {
  const mismatches = [];
  for (const f of features) {
    if (f.status !== 'completed' || !Array.isArray(f.fulfills)) continue;
    for (const valId of f.fulfills) {
      const asr = assertions[valId];
      if (!asr || asr.status !== 'passed') {
        mismatches.push({
          featureId: f.id,
          valId,
          featureStatus: 'completed',
          assertionStatus: asr ? asr.status : 'missing',
        });
      }
    }
  }
  return mismatches;
}

function buildJsonReport(features, milestones, mismatches, assertions, state) {
  const report = {
    missionId: state ? state.missionId : 'unknown',
    missionState: state ? state.state : 'unknown',
    totalFeatures: features.length,
    completedFeatures: features.filter(f => f.status === 'completed').length,
    milestones: {},
    mismatches,
    assertionSummary: {
      total: Object.keys(assertions).length,
      passed: Object.values(assertions).filter(a => a.status === 'passed').length,
      pending: Object.values(assertions).filter(a => a.status === 'pending').length,
      failed: Object.values(assertions).filter(a => a.status === 'failed').length,
    },
  };
  for (const [ms, feats] of milestones) {
    report.milestones[ms] = {
      total: feats.length,
      completed: feats.filter(f => f.status === 'completed').length,
      pending: feats.filter(f => f.status === 'pending').length,
      in_progress: feats.filter(f => f.status === 'in_progress').length,
      failed: feats.filter(f => f.status === 'failed').length,
    };
  }
  return report;
}

function statusChar(status) {
  if (status === 'completed') return '#';
  if (status === 'in_progress') return '~';
  if (status === 'failed') return 'X';
  return '.';
}

function printHumanReport(features, milestones, mismatches, assertions, state) {
  const missionId = state ? state.missionId : 'unknown';
  const missionState = state ? state.state : 'unknown';
  const completed = features.filter(f => f.status === 'completed').length;
  const totalA = Object.keys(assertions).length;
  const passedA = Object.values(assertions).filter(a => a.status === 'passed').length;

  console.log(`\n=== Mission Status: ${missionId} ===`);
  console.log(`State: ${missionState}`);
  console.log(`Features: ${completed}/${features.length} completed`);
  console.log(`Assertions: ${passedA}/${totalA} passed\n`);

  for (const [ms, feats] of milestones) {
    const done = feats.filter(f => f.status === 'completed').length;
    const bar = feats.map(f => statusChar(f.status)).join('');
    console.log(`  ${ms}: [${bar}] ${done}/${feats.length}`);
  }

  if (mismatches.length > 0) {
    console.log(`\n  WARNINGS: ${mismatches.length} feature/assertion mismatches`);
    for (const m of mismatches) {
      console.log(`    ${m.featureId} -> ${m.valId}: feature=${m.featureStatus}, assertion=${m.assertionStatus}`);
    }
  }
  console.log('');
}

function main() {
  const args = parseArgs(process.argv);

  if (!args.missionPath) {
    args.missionPath = autoDiscoverMission();
  }
  if (!args.missionPath) {
    console.error('Error: No --mission-path provided and no missions found in .claude/missions/');
    process.exit(1);
  }

  const missionDir = path.resolve(args.missionPath);
  const featuresDoc = readJSON(path.join(missionDir, 'features.json'));
  const state = readJSON(path.join(missionDir, 'state.json'));
  const valState = readJSON(path.join(missionDir, 'validation-state.json'));

  if (!featuresDoc) {
    console.error(`Error: Cannot read features.json in ${missionDir}`);
    process.exit(1);
  }

  const features = featuresDoc.features || [];
  const assertions = (valState && valState.assertions) || {};
  const milestones = groupByMilestone(features);
  const mismatches = collectMismatches(features, assertions);

  if (args.json) {
    console.log(JSON.stringify(buildJsonReport(features, milestones, mismatches, assertions, state), null, 2));
  } else {
    printHumanReport(features, milestones, mismatches, assertions, state);
  }
}

main();
