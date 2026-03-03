#!/usr/bin/env node
'use strict';

/**
 * Stale Skill Processor
 *
 * Reads .claude/context/runtime/stale-artifacts.json and creates
 * evolution requests in .claude/context/runtime/evolution-requests.jsonl.
 *
 * Usage:
 *   node .claude/tools/cli/process-stale-skills.cjs [--max N] [--type skill|agent|all] [--json]
 */

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

function findProjectRoot() {
  let dir = __dirname;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.claude'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

function processStaleSkills(projectRoot, options = {}) {
  const { max = Infinity, type = 'all' } = options;

  const runtimeDir = path.join(projectRoot, '.claude', 'context', 'runtime');
  const staleArtifactsPath = path.join(runtimeDir, 'stale-artifacts.json');
  const evolutionRequestsPath = path.join(runtimeDir, 'evolution-requests.jsonl');

  // Read stale-artifacts.json
  if (!fs.existsSync(staleArtifactsPath)) {
    return { processed: 0, skipped: 0, total: 0 };
  }

  const staleData = safeParseJSON(fs.readFileSync(staleArtifactsPath, 'utf8'), null, null, null);
  if (!staleData || typeof staleData !== 'object') {
    return { processed: 0, skipped: 0, total: 0 };
  }

  // Combine both stale AND unverified artifacts — both need review
  // Stale: verified:true but lastVerifiedAt >6 months old
  // Unverified: verified:false or missing (never reviewed)
  const staleEntries = [...(staleData.stale || []), ...(staleData.unverified || [])];
  const total = staleEntries.length;

  if (total === 0) {
    return { processed: 0, skipped: 0, total: 0 };
  }

  let processed = 0;
  let skipped = 0;
  const lines = [];

  for (const entry of staleEntries) {
    // Filter by type
    if (type !== 'all' && entry.type !== type) {
      skipped++;
      continue;
    }

    // Skip already-processed entries
    if (entry.processed === true) {
      skipped++;
      continue;
    }

    // Respect max limit
    if (processed >= max) {
      break;
    }

    const request = {
      trigger: 'stale_skill',
      skillName: entry.name,
      lastVerifiedAt: entry.lastVerifiedAt || null,
      evidence: `Artifact ${entry.name} (${entry.type}) is stale with status ${entry.status}. Last verified: ${entry.lastVerifiedAt || 'never'}.`,
      timestamp: new Date().toISOString(),
    };

    lines.push(JSON.stringify(request));
    processed++;
  }

  // Write evolution-requests.jsonl (append mode)
  if (lines.length > 0) {
    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.appendFileSync(evolutionRequestsPath, lines.join('\n') + '\n', 'utf8');
  }

  return { processed, skipped, total };
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = { max: Infinity, type: 'all', json: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--max' && i + 1 < args.length) {
      options.max = parseInt(args[++i], 10);
    } else if (args[i] === '--type' && i + 1 < args.length) {
      options.type = args[++i];
    } else if (args[i] === '--json') {
      options.json = true;
    }
  }

  return options;
}

if (require.main === module) {
  const options = parseArgs(process.argv);
  const projectRoot = findProjectRoot();
  const result = processStaleSkills(projectRoot, options);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Stale Skill Processor:`);
    console.log(`  Total entries:  ${result.total}`);
    console.log(`  Processed:      ${result.processed}`);
    console.log(`  Skipped:        ${result.skipped}`);
  }
}

module.exports = { processStaleSkills, parseArgs };
