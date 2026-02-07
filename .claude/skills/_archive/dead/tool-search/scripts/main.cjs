#!/usr/bin/env node

/**
 * Tool Search - Main Script
 * Semantic tool search with embeddings for scalable tool discovery. Enables on-demand tool loading to reduce context usage by 90%+ for large tool libraries.
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
Tool Search - Main Script

Usage:
  node main.cjs [options]

Options:
  --help     Show this help message
`);
    process.exit(0);
  }

  const toolSearchPath = path.join(PROJECT_ROOT, '.claude', 'tools', 'cli', 'tool_search.mjs');
  if (!fs.existsSync(toolSearchPath)) {
    console.error('Tool search not found:', toolSearchPath);
    process.exit(1);
  }
  const child = spawn(process.execPath, [toolSearchPath, ...args], {
    stdio: 'inherit',
    cwd: PROJECT_ROOT,
  });
  child.on('close', code => process.exit(code !== null && code !== undefined ? code : 1));
}

main();
