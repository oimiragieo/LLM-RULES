#!/usr/bin/env node

/**
 * Chrome Browser - CLI Tool
 * Browser automation using Claude in Chrome extension. Enables web testing, debugging, form filling, data extraction, and authenticated web app interaction.
 *
 * This is a standalone CLI wrapper for the chrome-browser skill.
 * It can be run directly from the terminal or invoked by other tools.
 *
 * Usage:
 *   node chrome-browser.cjs [command] [options]
 *   .claude/tools/chrome-browser/chrome-browser.cjs [command] [options]
 *
 * Commands:
 *   run       Execute the skill (default)
 *   validate  Validate inputs before execution
 *   help      Show this help message
 *
 * Options:
 *   --input <file>   Input file path
 *   --output <file>  Output file path
 *   --config <file>  Configuration file
 *   --json           Output results as JSON
 *   --verbose        Verbose output
 *   --help           Show this help message
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

/**
 * SEC-009 FIX: Security validation for paths to prevent command injection
 */
const DANGEROUS_CHARS = [
  '$',
  '`',
  '|',
  '&',
  ';',
  '(',
  ')',
  '<',
  '>',
  '!',
  '*',
  '?',
  '[',
  ']',
  '{',
  '}',
  '\n',
  '\r',
];

function isPathSafe(filePath) {
  if (typeof filePath !== 'string') return false;
  return !DANGEROUS_CHARS.some(char => filePath.includes(char));
}

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
const CLAUDE_DIR = path.join(PROJECT_ROOT, '.claude');
const SKILL_DIR = path.join(CLAUDE_DIR, 'skills', 'chrome-browser');
const SKILL_SCRIPT = path.join(SKILL_DIR, 'scripts', 'main.cjs');

// Parse command line arguments
const args = process.argv.slice(2);
let command = 'run';
const options = {};

for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    options[key] = value;
  } else if (!command || command === 'run') {
    command = args[i];
  }
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
Chrome Browser - CLI Tool

Usage:
  node chrome-browser.cjs [command] [options]

Commands:
  run       Execute the skill (default)
  validate  Validate inputs before execution
  help      Show this help message

Options:
  --input <file>   Input file path
  --output <file>  Output file path
  --config <file>  Configuration file (JSON)
  --json           Output results as JSON
  --verbose        Verbose output
  --help           Show this help message

Examples:
  # Run the skill
  node chrome-browser.cjs run --verbose

  # Validate inputs only
  node chrome-browser.cjs validate --input data.json

  # Run with JSON output
  node chrome-browser.cjs run --json --output result.json

Skill Location:
  ${SKILL_DIR}

Script Location:
  ${SKILL_SCRIPT}
`);
}

/**
 * Load configuration from file
 */
function loadConfig(configPath) {
  if (!configPath) return {};

  const fullPath = path.isAbsolute(configPath) ? configPath : path.join(process.cwd(), configPath);

  if (!fs.existsSync(fullPath)) {
    console.error(`❌ Config file not found: ${fullPath}`);
    process.exit(1);
  }

  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
  } catch (e) {
    console.error(`❌ Failed to parse config file: ${e.message}`);
    process.exit(1);
  }
}

/**
 * Run the skill
 */
function runSkill() {
  if (options.verbose) {
    console.log('🔧 Running Chrome Browser...');
    console.log(`   Skill: ${SKILL_DIR}`);
    console.log(`   Script: ${SKILL_SCRIPT}`);
  }

  // Check if skill script exists
  if (!fs.existsSync(SKILL_SCRIPT)) {
    console.error(`❌ Skill script not found: ${SKILL_SCRIPT}`);
    process.exit(1);
  }

  // SEC-009: Validate script path before execution
  if (!isPathSafe(SKILL_SCRIPT)) {
    console.error('❌ Invalid skill script path (contains unsafe characters)');
    process.exit(1);
  }

  // Build arguments for skill script - SEC-009: args are now array elements
  const skillArgs = [SKILL_SCRIPT];
  if (options.input) {
    if (!isPathSafe(options.input)) {
      console.error('❌ Invalid input path (contains unsafe characters)');
      process.exit(1);
    }
    skillArgs.push('--input', options.input);
  }
  if (options.output) {
    if (!isPathSafe(options.output)) {
      console.error('❌ Invalid output path (contains unsafe characters)');
      process.exit(1);
    }
    skillArgs.push('--output', options.output);
  }
  if (options.config) {
    if (!isPathSafe(options.config)) {
      console.error('❌ Invalid config path (contains unsafe characters)');
      process.exit(1);
    }
    skillArgs.push('--config', options.config);
  }
  if (options.json) skillArgs.push('--json');
  if (options.verbose) skillArgs.push('--verbose');

  // Execute skill script - SEC-009: Use spawnSync with shell:false
  try {
    const spawnResult = spawnSync('node', skillArgs, {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      stdio: options.json ? 'pipe' : 'inherit',
      shell: false, // CRITICAL: Prevents shell interpretation
      windowsHide: true, // Prevents console flashing + argument leakage on Windows
    });

    if (spawnResult.status !== 0) {
      const errorMsg = spawnResult.stderr || 'Unknown error';
      throw new Error(errorMsg);
    }

    if (options.json && spawnResult.stdout) {
      // Try to parse and re-output as formatted JSON
      try {
        const parsed = JSON.parse(spawnResult.stdout);
        console.log(JSON.stringify(parsed, null, 2));
      } catch {
        console.log(spawnResult.stdout);
      }
    }

    if (options.verbose) {
      console.log('✅ Chrome Browser completed successfully');
    }
  } catch (error) {
    console.error(`❌ Skill execution failed: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Validate inputs
 * SEC-009 FIX: Uses spawnSync with shell:false to prevent command injection
 */
function validateInputs() {
  if (options.verbose) {
    console.log('🔍 Validating inputs for Chrome Browser...');
  }

  // Check for pre-execute hook
  const preHook = path.join(SKILL_DIR, 'hooks', 'pre-execute.cjs');
  if (fs.existsSync(preHook)) {
    // SEC-009: Validate hook path before execution
    if (!isPathSafe(preHook)) {
      console.error('❌ Invalid hook path (contains unsafe characters)');
      process.exit(1);
    }

    const input = {
      input: options.input,
      config: options.config ? loadConfig(options.config) : {},
    };

    try {
      // SEC-009: Use spawnSync with shell:false and pass JSON as arg
      const spawnResult = spawnSync('node', [preHook, JSON.stringify(input)], {
        cwd: PROJECT_ROOT,
        stdio: 'inherit',
        shell: false, // CRITICAL: Prevents shell interpretation
      });

      if (spawnResult.status !== 0) {
        throw new Error('Hook returned non-zero exit code');
      }
      console.log('✅ Validation passed');
    } catch (_error) {
      console.error('❌ Validation failed');
      process.exit(1);
    }
  } else {
    // Basic validation
    if (options.input && !fs.existsSync(options.input)) {
      console.error(`❌ Input file not found: ${options.input}`);
      process.exit(1);
    }
    console.log('✅ Basic validation passed (no pre-execute hook found)');
  }
}

// Main execution
switch (command) {
  case 'help':
  case '--help':
    showHelp();
    break;
  case 'validate':
    validateInputs();
    break;
  case 'run':
  default:
    if (options.help) {
      showHelp();
    } else {
      runSkill();
    }
    break;
}
