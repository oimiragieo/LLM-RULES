#!/usr/bin/env node

/**
 * Diagram Generator - Main Script
 * Generates architecture, database, and system diagrams using Mermaid syntax. Creates visual representations of system architecture, database schemas, component relationships, and data flows.
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
Diagram Generator - Main Script

Usage:
  node main.cjs [options]

Options:
  --help     Show this help message
`);
    process.exit(0);
  }

  const generatePath = path.join(
    PROJECT_ROOT,
    '.claude',
    'tools',
    'visualization',
    'diagram-generator',
    'scripts',
    'generate.mjs'
  );
  if (!fs.existsSync(generatePath)) {
    console.error('Diagram generator not found:', generatePath);
    process.exit(1);
  }
  const child = spawn(process.execPath, [generatePath, ...args], {
    stdio: 'inherit',
    cwd: PROJECT_ROOT,
    windowsHide: true,
  });
  child.on('close', code => process.exit(code !== null && code !== undefined ? code : 1));
}

main();
