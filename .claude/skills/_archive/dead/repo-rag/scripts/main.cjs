#!/usr/bin/env node

/**
 * Repo Rag - Main Script
 * Perform high-recall codebase retrieval using semantic search and symbol indexing. Use when you need to find specific code, understand project structure, or verify architectural patterns before editing.
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
Repo Rag - Main Script

Usage:
  node main.cjs [options]

Options:
  --help     Show this help message
`);
    process.exit(0);
  }

  const searchPath = path.join(
    PROJECT_ROOT,
    '.claude',
    'tools',
    'analysis',
    'repo-rag',
    'scripts',
    'search.mjs'
  );
  if (!fs.existsSync(searchPath)) {
    console.error('Repo RAG search tool not found:', searchPath);
    process.exit(1);
  }
  const child = spawn(process.execPath, [searchPath, ...args], {
    stdio: 'inherit',
    cwd: PROJECT_ROOT,
  });
  child.on('close', code => process.exit(code !== null && code !== undefined ? code : 1));
}

main();
