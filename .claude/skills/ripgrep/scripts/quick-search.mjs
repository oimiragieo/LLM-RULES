#!/usr/bin/env node
/**
 * Quick Search Presets for Ripgrep
 * =================================
 *
 * Provides preset-based searches for common patterns.
 *
 * Usage:
 *   node quick-search.mjs <preset> "pattern" [extra-options]
 *
 * Presets:
 *   js       - JavaScript files (.js, .mjs, .cjs)
 *   ts       - TypeScript files (.ts, .mts, .cts)
 *   mjs      - ES modules only (.mjs)
 *   cjs      - CommonJS modules only (.cjs)
 *   hooks    - .claude/hooks/ directory
 *   skills   - .claude/skills/ directory
 *   tools    - .claude/tools/ directory
 *   agents   - .claude/agents/ directory
 *   all      - All files (no filter)
 *
 * Examples:
 *   node quick-search.mjs js "function"
 *   node quick-search.mjs hooks "PreToolUse"
 *   node quick-search.mjs ts "interface" -i
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { resolveRipgrepBinary } = require('../../../lib/utils/binary-resolver.cjs');

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
let vscodeRgPath = null;
try {
  const { rgPath: npmRgPath } = require('@vscode/ripgrep');
  vscodeRgPath = npmRgPath;
} catch (_err) {
  // Continue with resolver fallbacks (Scoop shims / node_modules/.bin / PATH).
}

const rgPath = resolveRipgrepBinary({
  projectRoot: PROJECT_ROOT,
  preferredPath: process.env.RG_BIN,
  vscodeRgPath,
});

if (!rgPath) {
  console.error('❌ Unable to resolve ripgrep binary.');
  console.error('   Install @vscode/ripgrep or ensure rg is available (Scoop/PATH).');
  process.exit(1);
}

// Optional: Check for .ripgreprc config file (backward compatibility)
const RIPGREPRC = path.join(PROJECT_ROOT, 'bin', '.ripgreprc');
const configExists = fs.existsSync(RIPGREPRC);

// Parse arguments
const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('Usage: node quick-search.mjs <preset> "pattern" [extra-options]');
  console.error('');
  console.error('Presets:');
  console.error('  js       - JavaScript files (.js, .mjs, .cjs)');
  console.error('  ts       - TypeScript files (.ts, .mts, .cts)');
  console.error('  mjs      - ES modules only (.mjs)');
  console.error('  cjs      - CommonJS modules only (.cjs)');
  console.error('  hooks    - .claude/hooks/ directory');
  console.error('  skills   - .claude/skills/ directory');
  console.error('  tools    - .claude/tools/ directory');
  console.error('  agents   - .claude/agents/ directory');
  console.error('  all      - All files (no filter)');
  console.error('');
  console.error('Examples:');
  console.error('  node quick-search.mjs js "function"');
  console.error('  node quick-search.mjs hooks "PreToolUse"');
  console.error('  node quick-search.mjs ts "interface" -i');
  process.exit(1);
}

const preset = args[0];
const pattern = args[1];
const extraArgs = args.slice(2);

// Map presets to ripgrep arguments
const presets = {
  js: ['-tjs'],
  ts: ['-tts'],
  mjs: ['-g', '*.mjs'],
  cjs: ['-g', '*.cjs'],
  mts: ['-g', '*.mts'],
  cts: ['-g', '*.cts'],
  hooks: ['-g', '.claude/hooks/**'],
  skills: ['-g', '.claude/skills/**'],
  tools: ['-g', '.claude/tools/**'],
  agents: ['-g', '.claude/agents/**'],
  all: [],
};

if (!presets[preset]) {
  console.error(`❌ Unknown preset: ${preset}`);
  console.error('   Valid presets: ' + Object.keys(presets).join(', '));
  process.exit(1);
}

// Build final args: [pattern, ...preset-args, ...extra-args]
// Note: `.claude/`-prefixed paths are treated as "hidden" by ripgrep, so include `--hidden`
// to make presets like `hooks`, `skills`, etc. work by default.
const rgArgs = ['--hidden', ...presets[preset], ...extraArgs, pattern];

// Set environment variable for config if it exists
const env = {
  ...process.env,
};
if (configExists) {
  env.RIPGREP_CONFIG_PATH = RIPGREPRC;
}

// Spawn ripgrep
const rg = spawn(rgPath, rgArgs, {
  stdio: 'inherit',
  env,
  shell: false, // SECURITY: Prevent shell interpretation
  windowsHide: true,
});

rg.on('error', error => {
  console.error(`❌ Failed to execute ripgrep: ${error.message}`);
  process.exit(1);
});

rg.on('close', code => {
  process.exit(code);
});
