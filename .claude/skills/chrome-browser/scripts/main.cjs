#!/usr/bin/env node

/**
 * Chrome Browser - Main Script
 * Browser automation using Claude in Chrome extension. Enables web testing, debugging, form filling, data extraction, and authenticated web app interaction.
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
    if (path.basename(dir) === '.claude') {
      return path.dirname(dir);
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const _CLAUDE_DIR = path.join(PROJECT_ROOT, '.claude');

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
Chrome Browser - Main Script

Usage:
  node main.cjs [options]

Options:
  --help     Show this help message
`);
    process.exit(0);
  }

  const { spawn } = require('child_process');
  const toolPath = path.join(
    PROJECT_ROOT,
    '.claude',
    'tools',
    'chrome-browser',
    'chrome-browser.cjs'
  );
  if (!fs.existsSync(toolPath)) {
    console.error('Chrome browser tool not found:', toolPath);
    process.exit(1);
  }
  const child = spawn(process.execPath, [toolPath, ...args.filter(a => a !== '--help')], {
    stdio: 'inherit',
    cwd: PROJECT_ROOT,
  });
  child.on('close', code => process.exit(code !== null && code !== undefined ? code : 1));
}

main();
