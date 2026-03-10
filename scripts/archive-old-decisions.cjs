#!/usr/bin/env node
'use strict';
/**
 * archive-old-decisions.cjs
 * Moves decisions.md entries older than 30 days to decisions-archive.jsonl
 * Prevents Foundational Amnesia by using structured archival (not line truncation)
 * ADR-120 compliant
 */
const fs = require('fs');
const path = require('path');

const DECISIONS_PATH = path.join(__dirname, '../.claude/context/memory/decisions.md');
const ARCHIVE_PATH = path.join(
  __dirname,
  '../.claude/context/memory/archive/decisions-archive.jsonl'
);
const MAX_AGE_DAYS = 30;

if (!fs.existsSync(DECISIONS_PATH)) {
  console.log('decisions.md not found');
  process.exit(0);
}

const content = fs.readFileSync(DECISIONS_PATH, 'utf8');
const lines = content.split('\n');
const cutoff = Date.now() - MAX_AGE_DAYS * 86400 * 1000;

// Parse date-tagged entries (## YYYY-MM-DD or <!-- date: ... --> patterns)
const datePattern = /(\d{4}-\d{2}-\d{2})/;
let currentEntry = [];
let currentDate = null;
const toArchive = [];
const toKeep = [];

for (const line of lines) {
  const dateMatch = line.match(datePattern);
  if (dateMatch && line.startsWith('#')) {
    // Flush previous entry
    if (currentEntry.length) {
      const target = currentDate && new Date(currentDate).getTime() < cutoff ? toArchive : toKeep;
      target.push(...currentEntry);
    }
    currentDate = dateMatch[1];
    currentEntry = [line];
  } else {
    currentEntry.push(line);
  }
}
// Flush last entry
if (currentEntry.length) {
  const target = currentDate && new Date(currentDate).getTime() < cutoff ? toArchive : toKeep;
  target.push(...currentEntry);
}

if (toArchive.length === 0) {
  console.log(`OK: No decisions older than ${MAX_AGE_DAYS} days to archive`);
  process.exit(0);
}

// Append to archive as JSONL
const archiveEntry = {
  date: new Date().toISOString(),
  content: toArchive.join('\n'),
  source: 'decisions.md',
  archivedAt: Date.now(),
};
fs.mkdirSync(path.dirname(ARCHIVE_PATH), { recursive: true });
fs.appendFileSync(ARCHIVE_PATH, JSON.stringify(archiveEntry) + '\n');
fs.writeFileSync(DECISIONS_PATH, toKeep.join('\n'));
console.log(
  `Archived ${toArchive.length} lines (entries older than ${MAX_AGE_DAYS}d) to ${path.basename(ARCHIVE_PATH)}`
);
