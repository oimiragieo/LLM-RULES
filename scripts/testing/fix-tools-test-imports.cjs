#!/usr/bin/env node
// fix-tools-test-imports.cjs
//
// Fixes imports in tests/tools/ test files.

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

const TOOLS_MAPPINGS = {
  'cli/error-report': '.claude/tools/cli/error-report.cjs',
  'cli/security-lint': '.claude/tools/cli/security-lint.cjs',
  'cli/validate-agent-routing': '.claude/tools/cli/validate-agent-routing.cjs',
  'cli/validate-integration': '.claude/tools/cli/validate-integration.cjs',
  'cli/pre-commit-security': '.claude/tools/cli/pre-commit-security.cjs',
  'runtime/skills-core/skills-core': '.claude/tools/runtime/skills-core/skills-core.cjs',
};

function findTestFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findTestFiles(fullPath, files);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.test.cjs') || entry.name.endsWith('.test.mjs'))
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

function getDepthFromTestsTools(filePath) {
  const rel = path
    .relative(path.join(PROJECT_ROOT, 'tests', 'tools'), filePath)
    .replace(/\\/g, '/');
  return rel.split('/').length - 1;
}

function fixFileImports(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  const relFromRoot = path.relative(PROJECT_ROOT, filePath).replace(/\\/g, '/');

  const depth = getDepthFromTestsTools(filePath);
  const backToRoot = '../'.repeat(depth + 2);

  // tests/tools/cli/x.test.cjs -> depth 1, back = ../../..
  content = content.replace(/require\(['"]\.\/([a-z0-9-]+\.cjs)['"]\)/g, (match, filename) => {
    const parts = relFromRoot.split('/');
    if (parts.length >= 3) {
      const category = parts.slice(2, -1).join('/'); // tools/cli, tools/runtime/skills-core
      const baseName = filename.replace('.cjs', '');
      const key = `${category}/${baseName}`;

      if (TOOLS_MAPPINGS[key]) {
        modified = true;
        return `require('${backToRoot}${TOOLS_MAPPINGS[key]}')`;
      }
    }
    return match;
  });

  content = content.replace(
    /require\.resolve\(['"]\.\/([a-z0-9-]+\.cjs)['"]\)/g,
    (match, filename) => {
      const parts = relFromRoot.split('/');
      if (parts.length >= 3) {
        const category = parts.slice(2, -1).join('/');
        const baseName = filename.replace('.cjs', '');
        const key = `${category}/${baseName}`;

        if (TOOLS_MAPPINGS[key]) {
          modified = true;
          return `require.resolve('${backToRoot}${TOOLS_MAPPINGS[key]}')`;
        }
      }
      return match;
    }
  );

  if (modified && !DRY_RUN) {
    fs.writeFileSync(filePath, content, 'utf8');
  }

  return modified;
}

function main() {
  console.log('='.repeat(60));
  console.log('FIX TOOLS TEST IMPORTS');
  console.log('='.repeat(60));
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('');

  const toolsDir = path.join(PROJECT_ROOT, 'tests', 'tools');
  const testFiles = findTestFiles(toolsDir);

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

  console.log(`\nFixed ${fixed} files out of ${testFiles.length} in tests/tools/`);
  if (DRY_RUN) {
    console.log('This was a DRY RUN.');
  }
}

main();
