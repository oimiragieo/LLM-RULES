#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = process.cwd();

const TARGET_RUNTIME_FILES = [
  '.claude/lib/code-indexing/embedding-generator.cjs',
  '.claude/lib/memory/entity-extractor.cjs',
  '.claude/lib/memory/ingestion/file-watcher.cjs',
  '.claude/lib/memory/lancedb-client-helpers.cjs',
  '.claude/lib/tools/task-tools.cjs',
];

test('runtime library files do not write directly to console.log', () => {
  const offenders = [];

  for (const relPath of TARGET_RUNTIME_FILES) {
    const fullPath = path.join(PROJECT_ROOT, relPath);
    const content = fs.readFileSync(fullPath, 'utf8');
    if (content.includes('console.log')) {
      offenders.push(relPath);
    }
  }

  assert.deepStrictEqual(offenders, []);
});
