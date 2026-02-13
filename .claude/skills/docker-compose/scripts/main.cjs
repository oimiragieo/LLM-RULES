#!/usr/bin/env node

/**
 * Docker Compose - Main Script
 * Docker Compose container orchestration and management. Manage multi-container applications, services, networks, and volumes. Use for local development, testing, and orchestration of containerized applications.
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
Docker Compose - Main Script

Usage:
  node main.cjs [options]

Options:
  --help     Show this help message
`);
    process.exit(0);
  }

  const { spawn } = require('child_process');
  const composeArgs = args.filter(a => a !== '--help');
  const child = spawn('docker', ['compose', ...composeArgs], {
    stdio: 'inherit',
    cwd: PROJECT_ROOT,
    shell: false,
    windowsHide: true,
  });
  child.on('close', (code, signal) => {
    if (code === 127)
      console.error(
        'Docker not found. Install: see this skill\'s SKILL.md, section "Installation".'
      );
    if (code !== null && code !== undefined) process.exit(code);
    if (signal) process.exit(1);
    process.exit(0);
  });
}

main();
