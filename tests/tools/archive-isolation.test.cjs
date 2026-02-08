/**
 * Archive Isolation Test
 *
 * Verifies that no active code imports from _archive/ directory.
 * This prevents accidentally depending on archived (dead) code.
 *
 * Created: 2026-02-07
 * Related: ADR-089 Tools System Overhaul
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const ARCHIVE_DIR = path.join(PROJECT_ROOT, '.claude/tools/_archive');

/**
 * Recursively find all .cjs, .mjs, .js, .ts files in a directory
 */
function findSourceFiles(dir, exclude = []) {
  const files = [];

  function walk(currentDir) {
    if (exclude.some(ex => currentDir.includes(ex))) return;

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (/\.(cjs|mjs|js|ts)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

/**
 * Extract import/require statements from file content
 */
function extractImports(content) {
  const imports = [];

  // Match require() calls
  const requireRegex = /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  let match;
  while ((match = requireRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  // Match import statements
  const importRegex = /import\s+.*?\s+from\s+['"`]([^'"`]+)['"`]/g;
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  // Match dynamic imports
  const dynamicImportRegex = /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  while ((match = dynamicImportRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  return imports;
}

/**
 * Check if an import path references the archive directory
 */
function isArchiveImport(importPath) {
  // Normalize path separators
  const normalized = importPath.replace(/\\/g, '/');

  // Check for archive references
  return normalized.includes('tools/_archive/') || normalized.includes('tools\\_archive\\');
}

test('No active code imports from _archive/', () => {
  // Skip test if archive doesn't exist
  if (!fs.existsSync(ARCHIVE_DIR)) {
    return;
  }

  // Find all active source files (exclude archive, node_modules, tests)
  const excludeDirs = ['node_modules', '.git', 'tools/_archive', 'tools\\_archive'];

  const activeFiles = findSourceFiles(PROJECT_ROOT, excludeDirs);
  const violations = [];

  // Check each file for archive imports
  for (const file of activeFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const imports = extractImports(content);

    const archiveImports = imports.filter(isArchiveImport);

    if (archiveImports.length > 0) {
      violations.push({
        file: path.relative(PROJECT_ROOT, file),
        imports: archiveImports,
      });
    }
  }

  if (violations.length > 0) {
    console.error('\n❌ Archive import violations found:');
    for (const v of violations) {
      console.error(`\n  File: ${v.file}`);
      console.error(`  Imports from archive:`);
      for (const imp of v.imports) {
        console.error(`    - ${imp}`);
      }
    }
    console.error('\n  Archive directory should not be imported by active code.');
    console.error('  Either restore the file or remove the import.\n');
  }

  assert.deepStrictEqual(violations, []);
});

test('Archive directory exists', () => {
  assert.ok(fs.existsSync(ARCHIVE_DIR));
});

test('Archive README exists', () => {
  const readmePath = path.join(ARCHIVE_DIR, 'README.md');
  assert.ok(fs.existsSync(readmePath));

  const content = fs.readFileSync(readmePath, 'utf8');
  assert.ok(content.includes('Archived Tools'));
  assert.ok(content.includes('ADR-089'));
  assert.ok(content.includes('Restoration Instructions'));
});
