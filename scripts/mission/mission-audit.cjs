#!/usr/bin/env node
'use strict';

/**
 * Mission Audit CLI
 *
 * Queries the unified audit index for a mission.
 * Usage: node scripts/mission/mission-audit.cjs <mission-path> [--feature <id>] [--type <eventType>]
 */

const fs = require('node:fs');
const path = require('node:path');
const { createAuditIndex } = require('../../.claude/lib/mission/mission-audit-index.cjs');

const args = process.argv.slice(2);
const missionPath = args.find(a => !a.startsWith('--'));
const featureIdx = args.indexOf('--feature');
const featureId = featureIdx !== -1 && featureIdx + 1 < args.length ? args[featureIdx + 1] : null;
const typeIdx = args.indexOf('--type');
const eventType = typeIdx !== -1 && typeIdx + 1 < args.length ? args[typeIdx + 1] : null;

if (!missionPath) {
  console.error('Usage: mission-audit <mission-path> [--feature <id>] [--type <eventType>]');
  process.exit(1);
}

const resolved = path.resolve(missionPath);
if (!fs.existsSync(resolved)) {
  console.error(`Mission directory not found: ${resolved}`);
  process.exit(1);
}

const audit = createAuditIndex(resolved);

if (featureId) {
  const trail = audit.getAuditTrail(featureId);
  console.log(`\n=== Audit Trail for ${featureId} (${trail.length} events) ===\n`);
  for (const e of trail) {
    console.log(`  ${e.timestamp}  ${e.eventType}${e.artifactPath ? `  ${e.artifactPath}` : ''}`);
    if (e.metadata && Object.keys(e.metadata).length > 0) {
      console.log(`    ${JSON.stringify(e.metadata)}`);
    }
  }
} else {
  const filter = {};
  if (eventType) filter.eventType = eventType;

  const entries = audit.query(filter);
  const summary = audit.getSummary();

  console.log(`\n=== Mission Audit Summary ===`);
  console.log(`Total events: ${summary.totalEvents}`);
  console.log(`Features tracked: ${summary.featuresTracked}`);
  console.log(`\nEvents by type:`);
  for (const [type, count] of Object.entries(summary.eventsByType)) {
    console.log(`  ${type}: ${count}`);
  }

  if (entries.length > 0 && entries.length <= 50) {
    console.log(`\nRecent events:`);
    for (const e of entries.slice(-20)) {
      console.log(`  ${e.timestamp}  ${e.eventType}  ${e.featureId || '-'}`);
    }
  }
}
