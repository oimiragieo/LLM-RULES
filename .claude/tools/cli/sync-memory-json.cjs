#!/usr/bin/env node
/**
 * One-time sync of patterns.json / gotchas.json into SQLite entity DB.
 *
 * Usage:
 *   node .claude/tools/cli/sync-memory-json.cjs
 *   node .claude/tools/cli/sync-memory-json.cjs --dry-run
 */

'use strict';
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const path = require('path');
const fs = require('fs');

const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const { MEMORY_DB_PATH } = require('../../lib/memory/memory-paths.cjs');
const {
  syncJsonMemory,
  ensureEntityDbInitialized,
} = require('../../hooks/memory/sync-memory-index.cjs');

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
  };
}

function main() {
  const { dryRun } = parseArgs();
  const dbPath = MEMORY_DB_PATH;
  ensureEntityDbInitialized(dbPath);

  const memoryDir = path.join(PROJECT_ROOT, '.claude', 'context', 'memory');
  const patternsPath = path.join(memoryDir, 'patterns.json');
  const gotchasPath = path.join(memoryDir, 'gotchas.json');

  const targets = [patternsPath, gotchasPath];

  for (const target of targets) {
    if (!fs.existsSync(target)) {
      console.log(`[sync-memory-json] Skipped (missing): ${target}`);
      continue;
    }
    if (dryRun) {
      console.log(`[sync-memory-json] Would sync: ${target}`);
      continue;
    }
    syncJsonMemory(target, dbPath);
    console.log(`[sync-memory-json] Synced: ${target}`);
  }
}

const wrappedMain = wrapCLITool(main, 'sync-memory-json');

if (require.main === module) {
  wrappedMain();
}

module.exports = { main };
