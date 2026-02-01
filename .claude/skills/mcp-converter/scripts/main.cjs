#!/usr/bin/env node

/**
 * Mcp Converter - Main Script
 * Converts MCP servers to Claude Skills to save tokens. Runs the introspection tool to generate skill wrappers.
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
Mcp Converter - Main Script

Usage:
  node main.cjs [options]

Options:
  --help     Show this help message
`);
    process.exit(0);
  }

  const { spawn } = require('child_process');
  const integrationDir = path.join(
    PROJECT_ROOT,
    '.claude',
    'tools',
    'integrations',
    'mcp-converter'
  );
  const batchPath = path.join(integrationDir, 'batch_converter.py');
  if (!fs.existsSync(batchPath)) {
    console.error('MCP batch converter not found:', batchPath);
    process.exit(1);
  }
  const child = spawn('python', [batchPath, ...args.filter(a => a !== '--help')], {
    stdio: 'inherit',
    cwd: integrationDir,
    shell: true,
  });
  child.on('close', code => process.exit(code !== null && code !== undefined ? code : 1));
}

main();
