#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = process.cwd();
const ACTIVE_PLUGIN_ROOTS = [
  '.claude/lib/plugins',
  '.claude/plugins',
  '.cursor/plugins',
  '.factory/plugins',
];
const DORMANT_PLUGIN_NAMES = ['feature-dev', 'pr-review-toolkit', 'marketing-skills'];

function walk(dir, matches = []) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_err) {
    return matches;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (DORMANT_PLUGIN_NAMES.includes(entry.name)) {
        matches.push(fullPath);
      }
      walk(fullPath, matches);
    }
  }

  return matches;
}

function isArchiveOrTempPath(fullPath) {
  const rel = path.relative(PROJECT_ROOT, fullPath).replace(/\\/g, '/');
  return rel.includes('.claude.archive/') || rel.includes('/.tmp/') || rel.startsWith('.tmp/');
}

test('known dormant plugin imports are absent from active plugin roots', () => {
  const matches = [];

  for (const relRoot of ACTIVE_PLUGIN_ROOTS) {
    const fullRoot = path.join(PROJECT_ROOT, relRoot);
    if (!fs.existsSync(fullRoot)) continue;
    walk(fullRoot, matches);
  }

  const activeMatches = matches.filter(match => !isArchiveOrTempPath(match));

  assert.deepStrictEqual(
    activeMatches.map(match => path.relative(PROJECT_ROOT, match).replace(/\\/g, '/')),
    []
  );
});
