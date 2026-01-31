#!/usr/bin/env node
// migrate-test-files.cjs
//
// Migrates test files from incorrect locations in .claude/ to the correct
// locations in the root tests/ directory per FILE_PLACEMENT_RULES.md v2.0.0.
//
// Migration Rules:
// - .claude/lib/category/name.test.cjs -> tests/lib/category/
// - .claude/hooks/category/name.test.cjs -> tests/hooks/
// - .claude/tools/cli/name.test.cjs -> tests/cli/
// - .claude/workflows/category/name.test.cjs -> tests/workflows/
// - .claude/agents/category/name.test.cjs -> tests/agents/
// - .claude/schemas/name.test.cjs -> tests/schemas/
// - .claude/skills/name/name.test.cjs -> tests/skills/
// - .claude/context/artifacts/name.test.cjs -> tests/artifacts/
// - .claude/templates/name.test.cjs -> tests/templates/
//
// Usage:
//   node scripts/testing/migrate-test-files.cjs [--dry-run] [--verbose]
//
// Options:
//   --dry-run   Show what would be moved without actually moving
//   --verbose   Show detailed output for each file

'use strict';

const fs = require('fs');
const path = require('path');

// Find project root
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// Configuration
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

// File patterns to migrate
const TEST_PATTERNS = ['.test.cjs', '.test.mjs', '.spec.cjs', '.spec.mjs'];

/**
 * Recursively find all test files in a directory
 * @param {string} dir - Directory to search
 * @param {string[]} files - Accumulator array
 * @returns {string[]} Array of test file paths
 */
function findTestFiles(dir, files = []) {
  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules and .git
      if (entry.name === 'node_modules' || entry.name === '.git') {
        continue;
      }
      findTestFiles(fullPath, files);
    } else if (entry.isFile()) {
      // Check if it's a test file
      const isTestFile = TEST_PATTERNS.some(pattern => entry.name.endsWith(pattern));
      if (isTestFile) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

/**
 * Determine the target path for a test file
 * @param {string} sourcePath - Source file path
 * @returns {{target: string, category: string}|null}
 */
function getTargetPath(sourcePath) {
  const relativePath = path.relative(path.join(PROJECT_ROOT, '.claude'), sourcePath);
  const normalizedPath = relativePath.replace(/\\/g, '/');
  const fileName = path.basename(sourcePath);

  // .claude/lib/{category}/*.test.cjs -> tests/lib/{category}/
  if (normalizedPath.startsWith('lib/')) {
    const parts = normalizedPath.split('/');
    // lib/{category}/{file}.test.cjs or lib/{category}/{subcategory}/{file}.test.cjs
    if (parts.length >= 3) {
      const category = parts[1];
      // Handle nested paths like lib/party-mode/security/__tests__/
      const subPath = parts.slice(1, -1).join('/');
      return {
        target: path.join(PROJECT_ROOT, 'tests', 'lib', subPath, fileName),
        category: `lib/${category}`,
      };
    }
  }

  // .claude/hooks/{category}/*.test.cjs -> tests/hooks/
  if (normalizedPath.startsWith('hooks/')) {
    const parts = normalizedPath.split('/');
    if (parts.length >= 3) {
      // For hooks/{category}/{file}.test.cjs, flatten to tests/hooks/{file}.test.cjs
      // For hooks/{category}/__tests__/{file}.test.cjs, same flattening
      return {
        target: path.join(PROJECT_ROOT, 'tests', 'hooks', fileName),
        category: 'hooks',
      };
    }
  }

  // .claude/tools/{category}/*.test.cjs -> tests/cli/
  if (normalizedPath.startsWith('tools/')) {
    const parts = normalizedPath.split('/');
    if (parts.length >= 3) {
      // Handle nested paths like tools/runtime/skills-core/
      const subPath = parts.slice(1, -1).join('/');
      return {
        target: path.join(PROJECT_ROOT, 'tests', 'tools', subPath, fileName),
        category: 'tools',
      };
    }
  }

  // .claude/workflows/{category}/*.test.cjs -> tests/workflows/{category}/
  if (normalizedPath.startsWith('workflows/')) {
    const parts = normalizedPath.split('/');
    if (parts.length >= 3) {
      const category = parts[1];
      return {
        target: path.join(PROJECT_ROOT, 'tests', 'workflows', category, fileName),
        category: `workflows/${category}`,
      };
    }
  }

  // .claude/agents/**/*.test.cjs -> tests/agents/
  if (normalizedPath.startsWith('agents/')) {
    const parts = normalizedPath.split('/');
    if (parts.length >= 3) {
      const category = parts[1];
      return {
        target: path.join(PROJECT_ROOT, 'tests', 'agents', category, fileName),
        category: `agents/${category}`,
      };
    }
  }

  // .claude/skills/**/*.test.cjs -> tests/skills/
  if (normalizedPath.startsWith('skills/')) {
    const parts = normalizedPath.split('/');
    if (parts.length >= 2) {
      // skills/{skill-name}/SKILL.test.cjs or skills/{skill-name}/__tests__/...
      return {
        target: path.join(PROJECT_ROOT, 'tests', 'skills', fileName),
        category: 'skills',
      };
    }
  }

  // .claude/schemas/*.test.cjs -> tests/schemas/
  if (normalizedPath.startsWith('schemas/')) {
    return {
      target: path.join(PROJECT_ROOT, 'tests', 'schemas', fileName),
      category: 'schemas',
    };
  }

  // .claude/templates/*.test.cjs -> tests/templates/
  if (normalizedPath.startsWith('templates/')) {
    return {
      target: path.join(PROJECT_ROOT, 'tests', 'templates', fileName),
      category: 'templates',
    };
  }

  // .claude/context/artifacts/*.test.cjs -> tests/artifacts/
  if (normalizedPath.startsWith('context/artifacts/')) {
    return {
      target: path.join(PROJECT_ROOT, 'tests', 'artifacts', fileName),
      category: 'artifacts',
    };
  }

  // Fallback: move to tests/misc/
  return {
    target: path.join(PROJECT_ROOT, 'tests', 'misc', fileName),
    category: 'misc',
  };
}

/**
 * Ensure directory exists
 * @param {string} dir - Directory path
 */
function ensureDir(dir) {
  if (!DRY_RUN && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Move a file from source to target
 * @param {string} source - Source file path
 * @param {string} target - Target file path
 * @returns {boolean} Success
 */
function moveFile(source, target) {
  try {
    if (DRY_RUN) {
      return true;
    }

    // Ensure target directory exists
    ensureDir(path.dirname(target));

    // Check if target already exists
    if (fs.existsSync(target)) {
      console.warn(`  WARNING: Target already exists, skipping: ${target}`);
      return false;
    }

    // Copy then delete (safer than rename across drives)
    fs.copyFileSync(source, target);
    fs.unlinkSync(source);
    return true;
  } catch (error) {
    console.error(`  ERROR moving ${source}: ${error.message}`);
    return false;
  }
}

/**
 * Main migration function
 */
function main() {
  console.log('='.repeat(70));
  console.log('FILE PLACEMENT MIGRATION (ADR-076)');
  console.log('='.repeat(70));
  console.log(`Project root: ${PROJECT_ROOT}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE MIGRATION'}`);
  console.log('');

  // Find all test files in .claude/
  const claudeDir = path.join(PROJECT_ROOT, '.claude');
  const testFiles = findTestFiles(claudeDir);

  console.log(`Found ${testFiles.length} test files in .claude/`);
  console.log('');

  if (testFiles.length === 0) {
    console.log('No test files to migrate. Done.');
    return;
  }

  // Group files by category for reporting
  const byCategory = {};
  const migrations = [];

  for (const sourcePath of testFiles) {
    const result = getTargetPath(sourcePath);
    if (!result) {
      console.warn(`  Could not determine target for: ${sourcePath}`);
      continue;
    }

    const { target, category } = result;
    if (!byCategory[category]) {
      byCategory[category] = [];
    }
    byCategory[category].push({ source: sourcePath, target });
    migrations.push({ source: sourcePath, target, category });
  }

  // Print summary by category
  console.log('Migration Summary by Category:');
  console.log('-'.repeat(50));
  for (const [category, files] of Object.entries(byCategory)) {
    console.log(`  ${category}: ${files.length} files`);
  }
  console.log('');

  // Execute migrations
  console.log('Executing migrations...');
  console.log('-'.repeat(50));

  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;

  for (const { source, target, category } of migrations) {
    const relSource = path.relative(PROJECT_ROOT, source);
    const relTarget = path.relative(PROJECT_ROOT, target);

    if (VERBOSE || DRY_RUN) {
      console.log(`  [${category}] ${relSource}`);
      console.log(`       -> ${relTarget}`);
    }

    if (fs.existsSync(target)) {
      console.log(`  SKIP (exists): ${relTarget}`);
      skipCount++;
      continue;
    }

    const success = moveFile(source, target);
    if (success) {
      successCount++;
      if (!VERBOSE && !DRY_RUN) {
        process.stdout.write('.');
      }
    } else {
      failCount++;
    }
  }

  console.log('');
  console.log('');
  console.log('='.repeat(50));
  console.log('MIGRATION COMPLETE');
  console.log('='.repeat(50));
  console.log(`  Success: ${successCount}`);
  console.log(`  Failed:  ${failCount}`);
  console.log(`  Skipped: ${skipCount}`);
  console.log(`  Total:   ${migrations.length}`);
  console.log('');

  if (DRY_RUN) {
    console.log('This was a DRY RUN. No files were moved.');
    console.log('Run without --dry-run to execute the migration.');
  } else {
    console.log('Migration complete. Please verify tests still pass:');
    console.log('  pnpm test');
  }
}

// Run
main();
