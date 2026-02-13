#!/usr/bin/env node

/**
 * Sequential Thinking - Main Script
 * Sequential thinking and structured problem solving. Break down complex problems into steps with revision and branching capabilities. Use for multi-step analysis, planning, and hypothesis verification.
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
Sequential Thinking - Main Script

Usage:
  node main.cjs [options]

Options:
  --help     Show this help message
`);
    process.exit(0);
  }

  const { spawn } = require('child_process');
  const executorPath = path.join(
    PROJECT_ROOT,
    '.claude',
    'tools',
    'optimization',
    'sequential-thinking',
    'executor.py'
  );
  if (fs.existsSync(executorPath)) {
    const child = spawn('python', [executorPath, ...args.filter(a => a !== '--help')], {
      stdio: 'inherit',
      cwd: path.dirname(executorPath),
      shell: false,
      windowsHide: true,
    });
    child.on('close', code => process.exit(code !== null && code !== undefined ? code : 1));
  } else {
    console.log(
      'Sequential Thinking skill provides structured thinking guidance. Invoke via the agent; executor not found.'
    );
    process.exit(0);
  }
}

main();
