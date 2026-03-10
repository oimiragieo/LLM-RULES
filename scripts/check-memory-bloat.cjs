#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const MEM_DIR = path.join(__dirname, '../.claude/context/memory');
const THRESHOLDS = {
  'learnings.md': { lines: 500, desc: 'archive older entries' },
  'decisions.md': { lines: 800, desc: 'archive older decisions' },
  'issues.md': { lines: 300, desc: 'resolve or archive closed issues' },
  'reflection-log.jsonl': { bytes: 50 * 1024, desc: 'run scripts/prune-reflection-log.cjs' },
};

let bloated = 0;
for (const [file, threshold] of Object.entries(THRESHOLDS)) {
  const fpath = path.join(MEM_DIR, file);
  if (!fs.existsSync(fpath)) continue;
  if (threshold.lines) {
    const lines = fs.readFileSync(fpath, 'utf8').split('\n').length;
    if (lines > threshold.lines) {
      console.error(
        `BLOAT: ${file} has ${lines} lines (threshold: ${threshold.lines}) — ${threshold.desc}`
      );
      bloated++;
    } else {
      console.log(`OK: ${file} has ${lines} lines`);
    }
  } else if (threshold.bytes) {
    const size = fs.statSync(fpath).size;
    if (size > threshold.bytes) {
      console.error(
        `BLOAT: ${file} is ${(size / 1024).toFixed(1)}KB (threshold: ${(threshold.bytes / 1024).toFixed(0)}KB) — ${threshold.desc}`
      );
      bloated++;
    } else {
      console.log(`OK: ${file} is ${(size / 1024).toFixed(1)}KB`);
    }
  }
}
if (bloated > 0) {
  console.error(`\n${bloated} file(s) exceed bloat thresholds. Address before spawning agents.`);
  process.exit(1);
}
console.log('\nAll memory files within thresholds.');
