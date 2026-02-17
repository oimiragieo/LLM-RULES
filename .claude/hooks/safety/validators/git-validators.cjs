'use strict';

/**
 * Git command validators
 * Converted from Auto-Claude git_validators.py
 *
 * Validators for git operations:
 * - Config protection (prevent setting user identity)
 * - Force push prevention
 * - Branch protection
 */

/**
 * Git config keys that agents must NOT modify.
 * These are identity settings that should inherit from the user's global config.
 * @type {Set<string>}
 */
const BLOCKED_GIT_CONFIG_KEYS = new Set([
  'user.name',
  'user.email',
  'author.name',
  'author.email',
  'committer.name',
  'committer.email',
]);

/**
 * Protected branches that should not receive force pushes
 * @type {Set<string>}
 */
const PROTECTED_BRANCHES = new Set([
  'main',
  'master',
  'develop',
  'release',
  'production',
  'staging',
]);

const BLOCKED_CHECKOUT_RESET_PATH_PREFIXES = ['tests/fixtures/', '.claude/context/memory/'];
const BLOCKED_CHECKOUT_RESET_PATH_EXACT = new Set(['.claude/context/agent-registry.json']);

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
 * Validate git config commands - block identity changes.
 *
 * Agents should not set user.name, user.email, etc. as this:
 * 1. Breaks commit attribution
 * 2. Can create fake "Test User" identities
 * 3. Overrides the user's legitimate git identity
 *
 * @param {string} commandString - The full git command string
 * @returns {{valid: boolean, error: string}} Validation result
 */
function validateGitConfig(commandString) {
  const tokens = parseCommand(commandString);

  if (tokens === null) {
    return { valid: false, error: 'Could not parse git command' };
  }

  if (tokens.length < 2 || tokens[0] !== 'git' || tokens[1] !== 'config') {
    return { valid: true, error: '' }; // Not a git config command
  }

  // Check for read-only operations first - these are always allowed
  const readOnlyFlags = new Set(['--get', '--get-all', '--get-regexp', '--list', '-l']);

  for (let i = 2; i < tokens.length; i++) {
    if (readOnlyFlags.has(tokens[i])) {
      return { valid: true, error: '' }; // Read operation, allow it
    }
  }

  // Extract the config key from the command
  let configKey = null;

  for (let i = 2; i < tokens.length; i++) {
    const token = tokens[i];

    // Skip options (start with -)
    if (token.startsWith('-')) {
      continue;
    }

    // First non-option token is the config key
    configKey = token.toLowerCase();
    break;
  }

  if (!configKey) {
    return { valid: true, error: '' }; // No config key specified
  }

  // Check if the exact config key is blocked
  if (BLOCKED_GIT_CONFIG_KEYS.has(configKey)) {
    return {
      valid: false,
      error:
        `BLOCKED: Cannot modify git identity configuration\n\n` +
        `You attempted to set '${configKey}' which is not allowed.\n\n` +
        `WHY: Git identity (user.name, user.email) must inherit from the user's ` +
        `global git configuration. Setting fake identities like 'Test User' breaks ` +
        `commit attribution and causes serious issues.\n\n` +
        `WHAT TO DO: Simply commit without setting any user configuration. ` +
        `The repository will use the correct identity automatically.`,
    };
  }

  return { valid: true, error: '' };
}

/**
 * Check for blocked config keys passed via git -c flag.
 *
 * Git allows inline config with: git -c key=value <command>
 * This bypasses 'git config' validation, so we must check all git commands
 * for -c flags containing blocked identity keys.
 *
 * @param {string[]} tokens - Parsed command tokens
 * @returns {{valid: boolean, error: string}} Validation result
 */
function validateGitInlineConfig(tokens) {
  let i = 1; // Start after 'git'

  while (i < tokens.length) {
    const token = tokens[i];

    // Check for -c flag (can be "-c key=value" or "-c" "key=value")
    if (token === '-c') {
      // Next token should be the key=value
      if (i + 1 < tokens.length) {
        const configPair = tokens[i + 1];

        // Extract the key from key=value
        if (configPair.includes('=')) {
          const configKey = configPair.split('=')[0].toLowerCase();

          if (BLOCKED_GIT_CONFIG_KEYS.has(configKey)) {
            return {
              valid: false,
              error:
                `BLOCKED: Cannot set git identity via -c flag\n\n` +
                `You attempted to use '-c ${configPair}' which sets a blocked ` +
                `identity configuration.\n\n` +
                `WHY: Git identity (user.name, user.email) must inherit from the ` +
                `user's global git configuration. Setting fake identities breaks ` +
                `commit attribution and causes serious issues.\n\n` +
                `WHAT TO DO: Remove the -c flag and commit normally. ` +
                `The repository will use the correct identity automatically.`,
            };
          }
        }
        i += 2; // Skip -c and its value
        continue;
      }
    } else if (token.startsWith('-c')) {
      // Handle -ckey=value format (no space)
      const configPair = token.slice(2); // Remove "-c" prefix

      if (configPair.includes('=')) {
        const configKey = configPair.split('=')[0].toLowerCase();

        if (BLOCKED_GIT_CONFIG_KEYS.has(configKey)) {
          return {
            valid: false,
            error:
              `BLOCKED: Cannot set git identity via -c flag\n\n` +
              `You attempted to use '${token}' which sets a blocked ` +
              `identity configuration.\n\n` +
              `WHY: Git identity (user.name, user.email) must inherit from the ` +
              `user's global git configuration. Setting fake identities breaks ` +
              `commit attribution and causes serious issues.\n\n` +
              `WHAT TO DO: Remove the -c flag and commit normally. ` +
              `The repository will use the correct identity automatically.`,
          };
        }
      }
    }

    i += 1;
  }

  return { valid: true, error: '' };
}

/**
 * Validate git push commands - prevent force push to protected branches.
 *
 * @param {string} commandString - The full git command string
 * @returns {{valid: boolean, error: string}} Validation result
 */
function validateGitPush(commandString) {
  const tokens = parseCommand(commandString);

  if (tokens === null) {
    return { valid: false, error: 'Could not parse git command' };
  }

  if (tokens.length < 2 || tokens[0] !== 'git' || tokens[1] !== 'push') {
    return { valid: true, error: '' }; // Not a git push command
  }

  // Check for force flags
  const forceFlags = new Set(['-f', '--force', '--force-with-lease']);
  let hasForce = false;
  let targetBranch = null;

  for (let i = 2; i < tokens.length; i++) {
    const token = tokens[i];

    if (forceFlags.has(token)) {
      hasForce = true;
    } else if (!token.startsWith('-')) {
      // Could be remote or branch
      // In "git push origin main", "origin" is remote, "main" is branch
      // In "git push -f origin main", same pattern
      if (targetBranch === null) {
        // First non-flag might be remote, second might be branch
        // We simplify: if it looks like a protected branch, block it
        if (PROTECTED_BRANCHES.has(token.toLowerCase())) {
          targetBranch = token;
        }
      } else {
        // Second positional arg - likely the branch
        if (PROTECTED_BRANCHES.has(token.toLowerCase())) {
          targetBranch = token;
        }
      }
    }
  }

  if (hasForce && targetBranch) {
    return {
      valid: false,
      error:
        `BLOCKED: Force push to protected branch '${targetBranch}' is not allowed.\n\n` +
        `Protected branches: ${Array.from(PROTECTED_BRANCHES).join(', ')}\n\n` +
        `Use regular push or create a PR instead.`,
    };
  }

  return { valid: true, error: '' };
}

function normalizePathToken(token) {
  return String(token || '')
    .trim()
    .replaceAll('\\', '/')
    .replace(/^["']|["']$/g, '')
    .toLowerCase();
}

function isDangerousCheckoutResetPath(pathToken) {
  const normalized = normalizePathToken(pathToken);
  if (!normalized) return false;
  if (BLOCKED_CHECKOUT_RESET_PATH_EXACT.has(normalized)) return true;
  return BLOCKED_CHECKOUT_RESET_PATH_PREFIXES.some(prefix => normalized.startsWith(prefix));
}

function validateGitCheckout(commandString, tokens) {
  if (!tokens || tokens.length < 2 || tokens[0] !== 'git') {
    return { valid: true, error: '' };
  }

  const checkoutCommand = tokens.includes('checkout') || tokens.includes('restore');
  if (!checkoutCommand) {
    return { valid: true, error: '' };
  }

  const separatorIndex = tokens.indexOf('--');
  if (separatorIndex === -1 || separatorIndex >= tokens.length - 1) {
    return { valid: true, error: '' };
  }

  const resetTargets = tokens.slice(separatorIndex + 1);
  const blocked = resetTargets.find(isDangerousCheckoutResetPath);
  if (!blocked) {
    return { valid: true, error: '' };
  }

  return {
    valid: false,
    error:
      `BLOCKED: Destructive git checkout/restore reset is not allowed for protected path "${blocked}".\n\n` +
      `Protected prefixes: ${BLOCKED_CHECKOUT_RESET_PATH_PREFIXES.join(', ')}\n` +
      `Protected files: ${Array.from(BLOCKED_CHECKOUT_RESET_PATH_EXACT).join(', ')}\n\n` +
      `Use targeted edits via Write/Edit tools instead of mass reset commands.`,
  };
}

/**
 * Main git validator that checks all git security rules.
 *
 * Currently validates:
 * - git -c: Block identity changes via inline config on ANY git command
 * - git config: Block identity changes
 * - git push: Block force push to protected branches
 *
 * @param {string} commandString - The full git command string
 * @returns {{valid: boolean, error: string}} Validation result
 */
function validateGitCommand(commandString) {
  const tokens = parseCommand(commandString);

  if (tokens === null) {
    return { valid: false, error: 'Could not parse git command' };
  }

  if (!tokens.length || tokens[0] !== 'git') {
    return { valid: true, error: '' };
  }

  if (tokens.length < 2) {
    return { valid: true, error: '' }; // Just "git" with no subcommand
  }

  // Check for blocked -c flags on ANY git command (security bypass prevention)
  const inlineResult = validateGitInlineConfig(tokens);
  if (!inlineResult.valid) {
    return inlineResult;
  }

  // Find the actual subcommand (skip global options like -c, -C, --git-dir, etc.)
  let subcommand = null;

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];

    // Skip options and their values
    if (token.startsWith('-')) {
      continue;
    }

    subcommand = token;
    break;
  }

  if (!subcommand) {
    return { valid: true, error: '' }; // No subcommand found
  }

  // Check git config commands
  if (subcommand === 'config') {
    return validateGitConfig(commandString);
  }

  // Check git push commands
  if (subcommand === 'push') {
    return validateGitPush(commandString);
  }

  // Check git checkout/restore resets on protected runtime/test paths
  if (subcommand === 'checkout' || subcommand === 'restore') {
    return validateGitCheckout(commandString, tokens);
  }

  return { valid: true, error: '' };
}

module.exports = {
  BLOCKED_GIT_CONFIG_KEYS,
  PROTECTED_BRANCHES,
  validateGitConfig,
  validateGitInlineConfig,
  validateGitPush,
  validateGitCheckout,
  validateGitCommand,
};
