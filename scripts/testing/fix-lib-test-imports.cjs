#!/usr/bin/env node
// fix-lib-test-imports.cjs
//
// Fixes imports in tests/lib/ test files.
// These tests had relative requires like require('./xxx.cjs') that worked
// when they were co-located in .claude/lib/, but need to be updated
// after migration to tests/lib/.
//
// Usage:
//   node scripts/testing/fix-lib-test-imports.cjs [--dry-run] [--verbose]

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

// Mapping of test file paths to their source paths
// Format: { 'tests/lib/X/Y.test.cjs': '.claude/lib/X/Y.cjs' }
const LIB_MAPPINGS = {
  // lib/utils/
  'utils/agent-config-reader': '.claude/lib/utils/agent-config-reader.cjs',
  'utils/atomic-write': '.claude/lib/utils/atomic-write.cjs',
  'utils/atomic-write-async': '.claude/lib/utils/atomic-write-async.cjs',
  'utils/error-sanitizer': '.claude/lib/utils/error-sanitizer.cjs',
  'utils/hook-input': '.claude/lib/utils/hook-input.cjs',
  'utils/platform': '.claude/lib/utils/platform.cjs',
  'utils/project-root': '.claude/lib/utils/project-root.cjs',
  'utils/safe-json': '.claude/lib/utils/safe-json.cjs',
  'utils/state-cache': '.claude/lib/utils/state-cache.cjs',
  'utils/feature-flags': '.claude/lib/utils/feature-flags.cjs',
  'utils/knowledge-base-index': '.claude/lib/utils/knowledge-base-index.cjs',

  // lib/memory/
  'memory/audit-trail-integration': '.claude/lib/memory/audit-trail-integration.cjs',
  'memory/learnings-parser': '.claude/lib/memory/learnings-parser.cjs',
  'memory/memory-dashboard': '.claude/lib/memory/memory-dashboard.cjs',
  'memory/memory-manager': '.claude/lib/memory/memory-manager.cjs',
  'memory/memory-rotator': '.claude/lib/memory/memory-rotator.cjs',
  'memory/memory-scheduler': '.claude/lib/memory/memory-scheduler.cjs',
  'memory/memory-scheduler-perf-009': '.claude/lib/memory/memory-scheduler.cjs',
  'memory/memory-tiers': '.claude/lib/memory/memory-tiers.cjs',
  'memory/semantic-archival': '.claude/lib/memory/semantic-archival.cjs',
  'memory/smart-pruner': '.claude/lib/memory/smart-pruner.cjs',
  'memory/smart-pruner-perf-009': '.claude/lib/memory/smart-pruner.cjs',

  // lib/workflow/
  'workflow/checkpoint-manager': '.claude/lib/workflow/checkpoint-manager.cjs',
  'workflow/cross-workflow-trigger': '.claude/lib/workflow/cross-workflow-trigger.cjs',
  'workflow/saga-coordinator': '.claude/lib/workflow/saga-coordinator.cjs',
  'workflow/step-validators': '.claude/lib/workflow/step-validators.cjs',
  'workflow/step-validators.security': '.claude/lib/workflow/step-validators.cjs',
  'workflow/workflow-cli': '.claude/lib/workflow/workflow-cli.cjs',
  'workflow/workflow-engine': '.claude/lib/workflow/workflow-engine.cjs',
  'workflow/workflow-integration': '.claude/lib/workflow/workflow-integration.cjs',
  'workflow/workflow-validator': '.claude/lib/workflow/workflow-validator.cjs',

  // lib/self-healing/
  'self-healing/dashboard': '.claude/lib/self-healing/dashboard.cjs',
  'self-healing/rollback-manager': '.claude/lib/self-healing/rollback-manager.cjs',
  'self-healing/validator': '.claude/lib/self-healing/validator.cjs',

  // lib/integration/
  'integration/system-registration-handler': '.claude/lib/integration/system-registration-handler.cjs',
};

// Find all test files recursively
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

// Determine the depth of a file from tests/lib/
function getDepthFromTestsLib(filePath) {
  const rel = path.relative(path.join(PROJECT_ROOT, 'tests', 'lib'), filePath).replace(/\\/g, '/');
  return rel.split('/').length - 1; // -1 because we don't count the file itself
}

// Fix imports in a single file
function fixFileImports(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  const relFromRoot = path.relative(PROJECT_ROOT, filePath).replace(/\\/g, '/');

  // Determine how many levels deep we are from tests/lib/
  const depth = getDepthFromTestsLib(filePath);

  // Calculate the prefix needed to get back to PROJECT_ROOT
  // tests/lib/utils/x.test.cjs -> depth 1 -> ../../.. to get to root
  // tests/lib/party-mode/security/__tests__/x.test.cjs -> depth 4 -> ../../../../../ to get to root
  const backToRoot = '../'.repeat(depth + 2); // +2 for tests/ and lib/

  // Replace require('./xxx.cjs') with require('path/to/.claude/lib/xxx.cjs')
  content = content.replace(/require\(['"]\.\/([a-z0-9-]+\.cjs)['"]\)/g, (match, filename) => {
    // Determine the category from the file path
    const parts = relFromRoot.split('/');
    // tests/lib/utils/agent-config-reader.test.cjs -> parts[2] = 'utils'
    if (parts.length >= 3) {
      const category = parts[2];
      const baseName = filename.replace('.cjs', '');
      const key = `${category}/${baseName}`;

      if (LIB_MAPPINGS[key]) {
        modified = true;
        return `require('${backToRoot}${LIB_MAPPINGS[key]}')`;
      }
    }
    return match;
  });

  // Also fix require.resolve patterns
  content = content.replace(/require\.resolve\(['"]\.\/([a-z0-9-]+\.cjs)['"]\)/g, (match, filename) => {
    const parts = relFromRoot.split('/');
    if (parts.length >= 3) {
      const category = parts[2];
      const baseName = filename.replace('.cjs', '');
      const key = `${category}/${baseName}`;

      if (LIB_MAPPINGS[key]) {
        modified = true;
        return `require.resolve('${backToRoot}${LIB_MAPPINGS[key]}')`;
      }
    }
    return match;
  });

  if (modified && !DRY_RUN) {
    fs.writeFileSync(filePath, content, 'utf8');
  }

  return modified;
}

// Main
function main() {
  console.log('='.repeat(60));
  console.log('FIX LIB TEST IMPORTS');
  console.log('='.repeat(60));
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('');

  const libDir = path.join(PROJECT_ROOT, 'tests', 'lib');
  const testFiles = findTestFiles(libDir);

  let fixed = 0;
  for (const filePath of testFiles) {
    const wasFixed = fixFileImports(filePath);
    if (wasFixed) {
      fixed++;
      if (VERBOSE) {
        console.log(`  Fixed: ${path.relative(PROJECT_ROOT, filePath)}`);
      }
    }
  }

  console.log(`\nFixed ${fixed} files out of ${testFiles.length} in tests/lib/`);
  if (DRY_RUN) {
    console.log('This was a DRY RUN.');
  }
}

main();
