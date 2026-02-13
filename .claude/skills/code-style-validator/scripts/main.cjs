#!/usr/bin/env node

/**
 * Code Style Validator - Main Script
 * Programmatic code style validation using AST analysis. Complements (not replaces) code-style rules by providing automated checking and instant feedback.
 *
 * Usage:
 *   node main.cjs [options]
 *
 * Options:
 *   --help     Show this help message
 */

const fs = require('fs');
const path = require('path');

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
Code Style Validator - Main Script

Usage:
  node main.cjs [options]

Options:
  --help     Show this help message
`);
    process.exit(0);
  }

  const { spawn } = require('child_process');
  const securityLintPath = path.join(PROJECT_ROOT, '.claude', 'tools', 'cli', 'security-lint.cjs');
  if (!fs.existsSync(securityLintPath)) {
    console.error('Security lint tool not found:', securityLintPath);
    process.exit(1);
  }
  const child = spawn(process.execPath, [securityLintPath, ...args.filter(a => a !== '--help')], {
    stdio: 'inherit',
    cwd: PROJECT_ROOT,
    windowsHide: true,
  });
  child.on('close', code => process.exit(code !== null && code !== undefined ? code : 1));
}

main();
