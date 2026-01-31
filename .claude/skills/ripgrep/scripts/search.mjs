#!/usr/bin/env node
/**
 * Ripgrep Search Wrapper
 * ======================
 *
 * Uses @vscode/ripgrep npm package for cross-platform ripgrep binary.
 * Optionally uses .ripgreprc config file if present.
 *
 * Usage:
 *   node search.mjs "pattern" [options]
 *   node search.mjs "pattern" -tjs
 *   node search.mjs "pattern" -i -C 3
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find project root (where .claude folder is)
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

// Get ripgrep binary path from @vscode/ripgrep npm package
let rgPath;
try {
  const { rgPath: npmRgPath } = require('@vscode/ripgrep');
  rgPath = npmRgPath;
} catch (_err) {
  console.error('❌ @vscode/ripgrep package not found.');
  console.error('   Install with: pnpm add @vscode/ripgrep');
  process.exit(1);
}

// Optional: Check for .ripgreprc config file (backward compatibility)
const RIPGREPRC = path.join(PROJECT_ROOT, 'bin', '.ripgreprc');
const configExists = fs.existsSync(RIPGREPRC);

// Get search pattern and args from command line
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: node search.mjs "pattern" [options]');
  console.error('');
  console.error('Examples:');
  console.error('  node search.mjs "function" -tjs');
  console.error('  node search.mjs "TaskUpdate" -tjs -tts');
  console.error('  node search.mjs "pattern" -i -C 3');
  process.exit(1);
}

// Set environment variable for config if it exists
const env = {
  ...process.env,
};
if (configExists) {
  env.RIPGREP_CONFIG_PATH = RIPGREPRC;
}

// Spawn ripgrep with all args passed through
const rg = spawn(rgPath, args, {
  stdio: 'inherit',
  env,
  shell: false, // SECURITY: Prevent shell interpretation
});

rg.on('error', error => {
  console.error(`❌ Failed to execute ripgrep: ${error.message}`);
  process.exit(1);
});

rg.on('close', code => {
  process.exit(code);
});
