#!/usr/bin/env node

/**
 * Commit Validator - Main Script
 * Validates commit messages against Conventional Commits specification using programmatic validation. Replaces the git-conventional-commit-messages text file with a tool that provides instant feedback.
 *
 * Usage:
 *   node main.cjs [options]
 *
 * Options:
 *   --help     Show this help message
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Find project root
function findProjectRoot() {
  let dir = __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.claude'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();

// Parse command line arguments
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    options[key] = value;
  }
}

/**
 * Main execution
 */
function main() {
  if (options.help) {
    console.log(`
Commit Validator - Main Script

Usage:
  node main.cjs [options]

Options:
  --help     Show this help message
`);
    process.exit(0);
  }

  const message = args.join(' ').trim();
  const validatePath = path.join(PROJECT_ROOT, '.claude', 'tools', 'cli', 'validate-commit.mjs');
  if (!fs.existsSync(validatePath)) {
    console.error('Commit validator tool not found:', validatePath);
    process.exit(1);
  }
  const child = spawn(process.execPath, message ? [validatePath, message] : [validatePath], {
    stdio: message ? ['ignore', 'inherit', 'inherit'] : ['pipe', 'inherit', 'inherit'],
    cwd: PROJECT_ROOT,
  });
  if (!message && process.stdin.isTTY) {
    console.error('Usage: node main.cjs "<commit message>" or echo "<message>" | node main.cjs');
    process.exit(1);
  }
  if (!message) process.stdin.pipe(child.stdin);
  child.on('close', code => process.exit(code !== null && code !== undefined ? code : 1));
}

main();
