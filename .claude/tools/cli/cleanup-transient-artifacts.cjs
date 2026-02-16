#!/usr/bin/env node
'use strict';
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const args = argv.slice(2);
  const map = new Map();
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!key.startsWith('--')) continue;
    const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
    map.set(key, value);
  }

  return {
    json: map.get('--json') === 'true',
    projectRoot: map.get('--project-root') || process.cwd(),
    retentionDays: map.has('--retention-days') ? Number(map.get('--retention-days')) : 2,
    dryRun: map.get('--dry-run') !== 'false',
  };
}

function listCandidates(root) {
  const candidatePrefixes = [
    path.join(root, '.claude', 'staging'),
    path.join(root, 'tests', 'lib', 'memory'),
  ];

  const candidates = [];
  for (const base of candidatePrefixes) {
    if (!fs.existsSync(base)) continue;
    const entries = fs.readdirSync(base, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(base, entry.name);
      if (!entry.isDirectory()) continue;
      const isStaging = base.endsWith(path.join('.claude', 'staging'));
      const isSoakDir =
        entry.name.startsWith('.test-memory-soak-chaos-') ||
        entry.name.startsWith('.test-memory-soak-') ||
        entry.name.startsWith('.test-memory-stress-');
      if (isStaging || isSoakDir) {
        candidates.push(full);
      }
    }
  }

  return candidates;
}

function cleanupTransientArtifacts(projectRoot, options = {}) {
  const retentionDays = Number.isFinite(options.retentionDays) ? options.retentionDays : 2;
  const dryRun = options.dryRun !== false;
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  const candidates = listCandidates(projectRoot);
  let removed = 0;
  const removedPaths = [];

  for (const dirPath of candidates) {
    let stat;
    try {
      stat = fs.statSync(dirPath);
    } catch (_err) {
      continue;
    }
    if (stat.mtimeMs > cutoffMs) continue;

    if (!dryRun) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
    removed++;
    removedPaths.push(path.relative(projectRoot, dirPath).replace(/\\/g, '/'));
  }

  return {
    retentionDays,
    dryRun,
    scanned: candidates.length,
    removed,
    removedPaths,
  };
}

function main() {
  const opts = parseArgs(process.argv);
  const result = cleanupTransientArtifacts(opts.projectRoot, {
    retentionDays: opts.retentionDays,
    dryRun: opts.dryRun,
  });

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('Transient artifact cleanup');
    console.log(`- Dry run: ${result.dryRun}`);
    console.log(`- Retention days: ${result.retentionDays}`);
    console.log(`- Scanned: ${result.scanned}`);
    console.log(`- Removed: ${result.removed}`);
  }
}

const wrappedMain = wrapCLITool(main, 'cleanup-transient-artifacts');

if (require.main === module) {
  wrappedMain();
}

module.exports = {
  parseArgs,
  cleanupTransientArtifacts,
};
