#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, '../.claude/context/memory/reflection-log.jsonl');
const ARCHIVE_DIR = path.join(__dirname, '../.claude/context/memory/archive');
const MAX_BYTES = 50 * 1024; // 50KB
const KEEP_LINES = 50;

if (!fs.existsSync(LOG_PATH)) {
  console.log('OK: reflection-log.jsonl not found');
  process.exit(0);
}
const stat = fs.statSync(LOG_PATH);
if (stat.size <= MAX_BYTES) {
  console.log(`OK: reflection-log.jsonl is ${(stat.size / 1024).toFixed(1)}KB, no pruning needed`);
  process.exit(0);
}

const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean);
const keep = lines.slice(-KEEP_LINES);
const archive = lines.slice(0, lines.length - KEEP_LINES);
const date = new Date().toISOString().slice(0, 10);
const archivePath = path.join(ARCHIVE_DIR, `reflection-log-pruned-${date}.jsonl`);
fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
fs.appendFileSync(archivePath, archive.join('\n') + '\n');
fs.writeFileSync(LOG_PATH, keep.join('\n') + '\n');
console.log(
  `Pruned: ${archive.length} lines archived to ${path.basename(archivePath)}, ${keep.length} lines kept (was ${(stat.size / 1024).toFixed(1)}KB)`
);
