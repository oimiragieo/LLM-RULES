#!/usr/bin/env node
/**
 * Migrate legacy sessions/ files into MTM tier.
 *
 * Usage:
 *   node .claude/tools/cli/migrate-legacy-sessions.cjs
 *   node .claude/tools/cli/migrate-legacy-sessions.cjs --delete
 *   node .claude/tools/cli/migrate-legacy-sessions.cjs --dry-run
 */

'use strict';

const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const { atomicWriteSync } = require('../../lib/utils/atomic-write.cjs');

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    deleteSource: args.includes('--delete'),
    dryRun: args.includes('--dry-run'),
  };
}

function main() {
  const { deleteSource, dryRun } = parseArgs();
  const memoryDir = path.join(PROJECT_ROOT, '.claude', 'context', 'memory');
  const legacyDir = path.join(memoryDir, 'sessions');
  const mtmDir = path.join(memoryDir, 'mtm');

  if (!fs.existsSync(legacyDir)) {
    console.log('[migrate-legacy-sessions] No legacy sessions directory found.');
    return;
  }

  if (!fs.existsSync(mtmDir)) {
    fs.mkdirSync(mtmDir, { recursive: true });
  }

  const files = fs
    .readdirSync(legacyDir)
    .filter(f => /^session_\d{3}\.json$/.test(f))
    .sort();

  if (files.length === 0) {
    console.log('[migrate-legacy-sessions] No legacy session files found.');
    return;
  }

  let migrated = 0;
  let skipped = 0;

  for (const file of files) {
    const abs = path.join(legacyDir, file);
    let session;
    try {
      session = safeParseJSON(fs.readFileSync(abs, 'utf8'));
    } catch (_e) {
      console.warn(`[migrate-legacy-sessions] Skipped (parse error): ${file}`);
      skipped++;
      continue;
    }

    const ts = session.timestamp || session.consolidated_at || new Date().toISOString();
    const safeTs = String(ts).replace(/[:.]/g, '-').slice(0, 19);
    const mtmFilename = `legacy_${safeTs}_${file}`;
    const mtmPath = path.join(mtmDir, mtmFilename);

    if (fs.existsSync(mtmPath)) {
      console.warn(`[migrate-legacy-sessions] Skipped (exists): ${mtmFilename}`);
      skipped++;
      continue;
    }

    const mtmData = {
      ...session,
      tier: 'MTM',
      source: 'legacy_migration',
      legacy_file: file,
      migrated_at: new Date().toISOString(),
    };

    if (dryRun) {
      console.log(`[migrate-legacy-sessions] Would write: ${mtmFilename}`);
    } else {
      atomicWriteSync(mtmPath, JSON.stringify(mtmData, null, 2));
      migrated++;
      if (deleteSource) {
        try {
          fs.rmSync(abs);
        } catch (_e) {
          console.warn(`[migrate-legacy-sessions] Failed to delete: ${file}`);
        }
      }
    }
  }

  const action = dryRun ? 'Planned' : 'Migrated';
  console.log(`[migrate-legacy-sessions] ${action}: ${migrated}, Skipped: ${skipped}`);
  if (deleteSource && !dryRun) {
    console.log('[migrate-legacy-sessions] Legacy sessions deleted after migration.');
  }
}

const wrappedMain = wrapCLITool(main, 'migrate-legacy-sessions');

if (require.main === module) {
  wrappedMain();
}

module.exports = { main };
