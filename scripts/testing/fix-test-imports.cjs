#!/usr/bin/env node
// fix-test-imports.cjs
//
// Fixes relative imports in migrated test files.
// Test files that were moved from .claude/ to tests/ need their imports updated.
//
// Usage:
//   node scripts/testing/fix-test-imports.cjs [--dry-run] [--verbose]

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

// Pattern replacements for different test file locations
// Map from old relative path pattern to new path
const IMPORT_FIXES = [
  // tests/hooks/*.test.cjs - imports that were relative to .claude/hooks/
  {
    testDir: 'tests/hooks',
    patterns: [
      // ../../lib/utils/X -> ../../.claude/lib/utils/X
      { from: /require\(['"]\.\.\/\.\.\/lib\//g, to: "require('../../.claude/lib/" },
      // ../../../lib/utils/X -> ../../.claude/lib/utils/X
      { from: /require\(['"]\.\.\/\.\.\/\.\.\/lib\//g, to: "require('../../.claude/lib/" },
    ],
  },
  // tests/lib/**/*.test.cjs - imports that were relative to .claude/lib/
  {
    testDir: 'tests/lib',
    patterns: [
      // ../../lib/X -> ../../.claude/lib/X (for tests that moved from .claude/lib/X to tests/lib/X)
      { from: /require\(['"]\.\.\/\.\.\/lib\//g, to: "require('../../.claude/lib/" },
      // ../X (sibling in .claude/lib/) -> ../../../.claude/lib/X
      { from: /require\(['"]\.\.\/([a-z0-9-]+\.cjs)['"](?=[),;\s])/g, to: "require('../../../.claude/lib/$1'" },
      // ./X (same dir in .claude/lib/category/) -> ../../../.claude/lib/category/X
      // This needs to be context-aware, handled separately
    ],
  },
  // tests/workflows/**/*.test.cjs
  {
    testDir: 'tests/workflows',
    patterns: [
      { from: /require\(['"]\.\.\/\.\.\/lib\//g, to: "require('../../.claude/lib/" },
    ],
  },
  // tests/tools/**/*.test.cjs
  {
    testDir: 'tests/tools',
    patterns: [
      { from: /require\(['"]\.\.\/\.\.\/lib\//g, to: "require('../../../.claude/lib/" },
      { from: /require\(['"]\.\.\/\.\.\/\.\.\/lib\//g, to: "require('../../../.claude/lib/" },
    ],
  },
  // tests/agents/**/*.test.cjs
  {
    testDir: 'tests/agents',
    patterns: [
      { from: /require\(['"]\.\.\/\.\.\/lib\//g, to: "require('../../.claude/lib/" },
    ],
  },
  // tests/schemas/*.test.cjs
  {
    testDir: 'tests/schemas',
    patterns: [
      { from: /require\(['"]\.\.\/\.\.\/lib\//g, to: "require('../../.claude/lib/" },
      { from: /require\(['"]\.\.\/([a-z0-9-]+\.schema\.json)/g, to: "require('../../.claude/schemas/$1" },
    ],
  },
  // tests/skills/*.test.cjs
  {
    testDir: 'tests/skills',
    patterns: [
      { from: /require\(['"]\.\.\/\.\.\/lib\//g, to: "require('../../.claude/lib/" },
    ],
  },
  // tests/templates/*.test.cjs
  {
    testDir: 'tests/templates',
    patterns: [
      { from: /require\(['"]\.\.\/\.\.\/lib\//g, to: "require('../../.claude/lib/" },
    ],
  },
  // tests/artifacts/*.test.cjs
  {
    testDir: 'tests/artifacts',
    patterns: [
      { from: /require\(['"]\.\.\/\.\.\/lib\//g, to: "require('../../.claude/lib/" },
    ],
  },
  // tests/misc/*.test.cjs
  {
    testDir: 'tests/misc',
    patterns: [
      { from: /require\(['"]\.\.\/\.\.\/lib\//g, to: "require('../../.claude/lib/" },
      { from: /require\(['"]\.\.\/([a-z0-9-]+\.cjs)['"](?=[),;\s])/g, to: "require('../../.claude/lib/$1'" },
    ],
  },
];

// Find all test files in a directory
function findTestFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findTestFiles(fullPath, files);
    } else if (entry.isFile() && (entry.name.endsWith('.test.cjs') || entry.name.endsWith('.test.mjs'))) {
      files.push(fullPath);
    }
  }
  return files;
}

// Fix imports in a single file
function fixFileImports(filePath, patterns) {
  const content = fs.readFileSync(filePath, 'utf8');
  let newContent = content;
  let changed = false;

  for (const { from, to } of patterns) {
    if (from.test(newContent)) {
      newContent = newContent.replace(from, to);
      changed = true;
    }
  }

  if (changed && !DRY_RUN) {
    fs.writeFileSync(filePath, newContent, 'utf8');
  }

  return changed;
}

// Main
function main() {
  console.log('='.repeat(60));
  console.log('FIX TEST IMPORTS');
  console.log('='.repeat(60));
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('');

  let totalFixed = 0;

  for (const { testDir, patterns } of IMPORT_FIXES) {
    const fullDir = path.join(PROJECT_ROOT, testDir);
    if (!fs.existsSync(fullDir)) {
      if (VERBOSE) console.log(`Skipping (not found): ${testDir}`);
      continue;
    }

    const testFiles = findTestFiles(fullDir);
    let fixedInDir = 0;

    for (const filePath of testFiles) {
      const relPath = path.relative(PROJECT_ROOT, filePath);
      const wasFixed = fixFileImports(filePath, patterns);

      if (wasFixed) {
        fixedInDir++;
        totalFixed++;
        if (VERBOSE) {
          console.log(`  Fixed: ${relPath}`);
        }
      }
    }

    if (fixedInDir > 0 || VERBOSE) {
      console.log(`${testDir}: ${fixedInDir} files fixed`);
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log(`Total files fixed: ${totalFixed}`);

  if (DRY_RUN) {
    console.log('This was a DRY RUN. No files were modified.');
  }
}

main();
