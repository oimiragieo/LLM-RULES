#!/usr/bin/env node
'use strict';

/**
 * Cross-platform test runner for tools tests.
 * Handles file discovery programmatically since shell globs don't expand on Windows PowerShell.
 */

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = process.cwd();

/**
 * Recursively find all test files matching the pattern
 */
function findTestFiles(dir, patterns) {
  const files = [];

  function walk(currentDir) {
    if (!fs.existsSync(currentDir)) return;

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        for (const pattern of patterns) {
          if (entry.name.endsWith(pattern)) {
            files.push(fullPath);
            break;
          }
        }
      }
    }
  }

  walk(dir);
  return files;
}

// Find test files in tests/tools directory
const toolsTestsDir = path.join(ROOT, 'tests', 'tools');
const testFiles = findTestFiles(toolsTestsDir, ['.test.mjs', '.test.cjs']);

if (testFiles.length === 0) {
  console.error('No test files found in tests/tools/');
  process.exit(0); // Exit 0 if no tests found (not a failure)
}

console.error(`Found ${testFiles.length} test file(s) in tests/tools/`);

// Run tests with Node.js test runner
const args = ['--test', '--test-concurrency=1', ...testFiles];

const proc = spawn(process.execPath, args, {
  stdio: 'inherit',
  windowsHide: true,
});

proc.on('close', (code) => {
  process.exit(code);
});
