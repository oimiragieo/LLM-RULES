#!/usr/bin/env node

/**
 * Swarm Coordination - CLI Tool
 * Multi-agent swarm coordination patterns. Orchestrates parallel agent execution, manages agent communication, handles task distribution, and coordinates results aggregation for complex multi-agent workflows.
 *
 * This is a standalone CLI wrapper for the swarm-coordination skill.
 * It can be run directly from the terminal or invoked by other tools.
 *
 * Usage:
 *   node swarm-coordination.cjs [command] [options]
 *   .claude/tools/swarm-coordination/swarm-coordination.cjs [command] [options]
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
 * SEC-009 FIX: Sanitize file path to prevent command injection
 * Only allows alphanumeric, hyphens, underscores, dots, and path separators
 * @param {string} filePath - File path to validate
 * @returns {boolean} True if path is safe
 */
function isPathSafe(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;

  // Reject paths with shell metacharacters
  const dangerousChars = [
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
  return !dangerousChars.some(char => filePath.includes(char));
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
const SKILL_DIR = path.join(CLAUDE_DIR, 'skills', 'swarm-coordination');
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
Swarm Coordination - CLI Tool

Usage:
  node swarm-coordination.cjs [command] [options]

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
  node swarm-coordination.cjs run --verbose

  # Validate inputs only
  node swarm-coordination.cjs validate --input data.json

  # Run with JSON output
  node swarm-coordination.cjs run --json --output result.json

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
    console.log('🔧 Running Swarm Coordination...');
    console.log(`   Skill: ${SKILL_DIR}`);
    console.log(`   Script: ${SKILL_SCRIPT}`);
  }

  // Check if skill script exists
  if (!fs.existsSync(SKILL_SCRIPT)) {
    console.error(`❌ Skill script not found: ${SKILL_SCRIPT}`);
    process.exit(1);
  }

  // Build arguments for skill script
  const skillArgs = [];
  if (options.input) skillArgs.push('--input', options.input);
  if (options.output) skillArgs.push('--output', options.output);
  if (options.config) skillArgs.push('--config', options.config);
  if (options.json) skillArgs.push('--json');
  if (options.verbose) skillArgs.push('--verbose');

  // SEC-009 FIX: Validate SKILL_SCRIPT path
  if (!isPathSafe(SKILL_SCRIPT)) {
    console.error('❌ Invalid skill script path detected');
    process.exit(1);
  }

  // SEC-009 FIX: Use spawnSync with array args to prevent command injection
  try {
    const result = spawnSync('node', [SKILL_SCRIPT, ...skillArgs], {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      stdio: options.json ? 'pipe' : 'inherit',
      shell: false, // CRITICAL: Disable shell to prevent injection
    });

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      throw new Error(`Exit code: ${result.status}`);
    }

    if (options.json && result.stdout) {
      // Try to parse and re-output as formatted JSON
      try {
        const parsed = JSON.parse(result.stdout);
        console.log(JSON.stringify(parsed, null, 2));
      } catch {
        console.log(result.stdout);
      }
    }

    if (options.verbose) {
      console.log('✅ Swarm Coordination completed successfully');
    }
  } catch (error) {
    console.error(`❌ Skill execution failed: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Validate inputs
 */
function validateInputs() {
  if (options.verbose) {
    console.log('🔍 Validating inputs for Swarm Coordination...');
  }

  // Check for pre-execute hook
  const preHook = path.join(SKILL_DIR, 'hooks', 'pre-execute.cjs');
  if (fs.existsSync(preHook)) {
    const input = {
      input: options.input,
      config: options.config ? loadConfig(options.config) : {},
    };

    // SEC-009 FIX: Validate preHook path
    if (!isPathSafe(preHook)) {
      console.error('❌ Invalid pre-hook path detected');
      process.exit(1);
    }

    // SEC-009 FIX: Use spawnSync with array args to prevent command injection
    try {
      const validationResult = spawnSync('node', [preHook, JSON.stringify(input)], {
        cwd: PROJECT_ROOT,
        stdio: 'inherit',
        shell: false, // CRITICAL: Disable shell to prevent injection
      });

      if (validationResult.status === 0) {
        console.log('✅ Validation passed');
      } else {
        console.error('❌ Validation failed');
        process.exit(1);
      }
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
