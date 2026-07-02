'use strict';

/**
 * Process management validators
 * Converted from Auto-Claude process_validators.py
 *
 * Validators for process management commands (pkill, kill, killall).
 * Only allows killing development-related processes.
 */

/**
 * Allowed development process names that can be killed
 * @type {Set<string>}
 */
const ALLOWED_PROCESS_NAMES = new Set([
  // Node.js ecosystem
  'node',
  'npm',
  'npx',
  'yarn',
  'pnpm',
  'bun',
  'deno',
  'vite',
  'next',
  'nuxt',
  'webpack',
  'esbuild',
  'rollup',
  'tsx',
  'ts-node',

  // Python ecosystem
  'python',
  'python3',
  'flask',
  'uvicorn',
  'gunicorn',
  'django',
  'celery',
  'streamlit',
  'gradio',
  'pytest',
  'mypy',
  'ruff',

  // Other languages
  'cargo',
  'rustc',
  'go',
  'ruby',
  'rails',
  'php',

  // Databases (local dev)
  'postgres',
  'mysql',
  'mongod',
  'redis-server',
]);

/**
 * Parse a command string into tokens, handling quotes.
 *
 * @param {string} commandString - The command string to parse
 * @returns {string[]|null} Array of tokens or null if parsing fails
 */
function parseCommand(commandString) {
  const tokens = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (let i = 0; i < commandString.length; i++) {
    const char = commandString[i];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\' && !inSingleQuote) {
      escaped = true;
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (char === ' ' && !inSingleQuote && !inDoubleQuote) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (inSingleQuote || inDoubleQuote) {
    return null;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Validate pkill commands - only allow killing dev-related processes.
 *
 * @param {string} commandString - The full pkill command string
 * @returns {{valid: boolean, error: string}} Validation result
 */
function validatePkillCommand(commandString) {
  const tokens = parseCommand(commandString);

  if (tokens === null) {
    return { valid: false, error: 'Could not parse pkill command' };
  }

  if (tokens.length === 0) {
    return { valid: false, error: 'Empty pkill command' };
  }

  // Separate flags from arguments
  const args = [];

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token.startsWith('-')) {
      args.push(token);
    }
  }

  if (args.length === 0) {
    return { valid: false, error: 'pkill requires a process name' };
  }

  // The target is typically the last non-flag argument
  let target = args[args.length - 1];

  // For -f flag (full command line match), extract the first word
  if (target.includes(' ')) {
    target = target.split(' ')[0];
  }

  if (ALLOWED_PROCESS_NAMES.has(target)) {
    return { valid: true, error: '' };
  }

  const sampleProcesses = Array.from(ALLOWED_PROCESS_NAMES).slice(0, 10).join(', ');

  return {
    valid: false,
    error: `pkill only allowed for dev processes: ${sampleProcesses}...`,
  };
}

/**
 * Validate kill commands - allow killing by PID but block dangerous patterns.
 *
 * @param {string} commandString - The full kill command string
 * @returns {{valid: boolean, error: string}} Validation result
 */
function validateKillCommand(commandString) {
  const tokens = parseCommand(commandString);

  if (tokens === null) {
    return { valid: false, error: 'Could not parse kill command' };
  }

  if (tokens.length === 0) {
    return { valid: false, error: 'Empty kill command' };
  }

  const targets = [];

  // Allow kill with specific PIDs or signal + PID.
  // Block process-group/all-process targets and PID 1 (init/system process).
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    const isLeadingSignal = i === 1 && /^-(?:\d+|[A-Za-z][A-Za-z0-9]*)$/.test(token);

    if (isLeadingSignal && tokens.length > 2) {
      continue;
    }

    if (token === '-1' || token === '0' || token === '-0') {
      return {
        valid: false,
        error: 'kill -1 and kill 0 are not allowed (affects all processes)',
      };
    }

    if (token === '1') {
      return {
        valid: false,
        error: 'killing PID 1 is not allowed',
      };
    }

    if (/^\d+$/.test(token)) {
      targets.push(token);
      continue;
    }

    if (/^-(?:\d+|[A-Za-z][A-Za-z0-9]*)$/.test(token)) {
      return { valid: false, error: 'kill requires at least one PID target' };
    }

    return { valid: false, error: `Invalid kill target: ${token}` };
  }

  if (targets.length === 0) {
    return { valid: false, error: 'kill requires at least one PID target' };
  }

  return { valid: true, error: '' };
}

/**
 * Validate killall commands - same rules as pkill.
 *
 * @param {string} commandString - The full killall command string
 * @returns {{valid: boolean, error: string}} Validation result
 */
function validateKillallCommand(commandString) {
  return validatePkillCommand(commandString);
}

module.exports = {
  ALLOWED_PROCESS_NAMES,
  validatePkillCommand,
  validateKillCommand,
  validateKillallCommand,
};
