#!/usr/bin/env node
/**
 * Fix Spawn Log Task IDs
 * ======================
 *
 * Scans spawn-log.jsonl and regenerates task IDs for entries with task_id: null.
 *
 * Strategy:
 * 1. Read all entries from spawn-log.jsonl
 * 2. For each entry with task_id: null, generate a unique ID based on timestamp + agent
 * 3. Pair spawn_start and spawn_end events with the same generated ID
 * 4. Rewrite spawn-log.jsonl with corrected entries
 *
 * Usage:
 *   node .claude/tools/cli/fix-spawn-log-task-ids.cjs [--dry-run]
 */

'use strict';

const fs = require('fs');
const path = require('path');

function getProjectRoot() {
  const root = path.join(__dirname, '..', '..', '..');
  return fs.existsSync(path.join(root, 'package.json')) ? root : process.cwd();
}

const PROJECT_ROOT = getProjectRoot();
const SPAWN_LOG_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'metrics', 'spawn-log.jsonl');

function generateTaskId(entry) {
  const timestamp = entry.timestamp || new Date().toISOString();
  const date = new Date(timestamp);
  const agentType = (entry.agent_type || 'unknown').toLowerCase();
  const sessionPart = (entry.session_id || '').slice(0, 8);

  // Format: spawn-YYYYMMDD-HHMMSS-agent-sessionId
  const dateStr = date.toISOString().replace(/[-:]/g, '').slice(0, 15); // YYYYMMDDTHHMMSS
  return `spawn-${dateStr}-${agentType}-${sessionPart}`;
}

function fixSpawnLog(dryRun = false) {
  if (!fs.existsSync(SPAWN_LOG_PATH)) {
    console.log('spawn-log.jsonl not found, nothing to fix');
    return { fixed: 0, total: 0 };
  }

  const content = fs.readFileSync(SPAWN_LOG_PATH, 'utf8');
  const lines = content.split('\n').filter(Boolean);

  if (lines.length === 0) {
    console.log('spawn-log.jsonl is empty, nothing to fix');
    return { fixed: 0, total: 0 };
  }

  const entries = lines.map(line => {
    try {
      return JSON.parse(line);
    } catch (_err) {
      console.error(`Failed to parse line: ${line.slice(0, 80)}...`);
      return null;
    }
  }).filter(Boolean);

  // Pair spawn_start and spawn_end events
  const pairs = [];
  const unpaired = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    if (entry.event === 'spawn_start') {
      // Look for matching spawn_end
      const matchingEnd = entries.slice(i + 1).find(e =>
        e.event === 'spawn_end' &&
        e.session_id === entry.session_id &&
        (!e.task_id || e.task_id === entry.task_id)
      );

      if (matchingEnd) {
        pairs.push({ start: entry, end: matchingEnd });
      } else {
        unpaired.push(entry);
      }
    } else if (entry.event !== 'spawn_end') {
      // memory_load_failed, etc.
      unpaired.push(entry);
    }
  }

  // Generate task IDs for entries with null task_id
  let fixed = 0;
  const fixedEntries = [];
  const seen = new Set();

  for (const { start, end } of pairs) {
    if (start.task_id === null || end.task_id === null) {
      const generatedId = generateTaskId(start);
      start.task_id = generatedId;
      end.task_id = generatedId;
      fixed += 2;
      console.log(`  Fixed pair: ${generatedId} (${start.agent_type || 'unknown'})`);
    }
    fixedEntries.push(start);
    seen.add(start);
    fixedEntries.push(end);
    seen.add(end);
  }

  // Add unpaired entries (already processed or non-spawn events)
  for (const entry of entries) {
    if (!seen.has(entry)) {
      if (entry.task_id === null) {
        const generatedId = generateTaskId(entry);
        entry.task_id = generatedId;
        fixed++;
        console.log(`  Fixed unpaired: ${generatedId} (${entry.event})`);
      }
      fixedEntries.push(entry);
    }
  }

  if (dryRun) {
    console.log(`\n[DRY RUN] Would fix ${fixed} entries out of ${entries.length} total`);
    return { fixed, total: entries.length };
  }

  // Backup original file
  const backupPath = `${SPAWN_LOG_PATH}.backup-${Date.now()}`;
  fs.copyFileSync(SPAWN_LOG_PATH, backupPath);
  console.log(`\nCreated backup: ${backupPath}`);

  // Write fixed entries
  const newContent = fixedEntries.map(e => JSON.stringify(e)).join('\n') + '\n';
  fs.writeFileSync(SPAWN_LOG_PATH, newContent, 'utf8');

  console.log(`\nFixed ${fixed} entries out of ${entries.length} total`);
  console.log(`Wrote ${fixedEntries.length} entries to spawn-log.jsonl`);

  return { fixed, total: entries.length };
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');

  if (dryRun) {
    console.log('=== DRY RUN MODE (no changes will be made) ===\n');
  }

  console.log('Fixing spawn-log.jsonl task IDs...\n');
  const result = fixSpawnLog(dryRun);

  if (!dryRun && result.fixed > 0) {
    console.log('\nSuccess! All null task_id entries have been fixed.');
    console.log('Backup created in case rollback is needed.');
  } else if (result.fixed === 0) {
    console.log('\nNo fixes needed - all entries already have task IDs.');
  }

  process.exit(0);
}

module.exports = { fixSpawnLog, generateTaskId };
