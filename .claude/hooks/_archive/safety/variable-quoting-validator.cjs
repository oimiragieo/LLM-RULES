/**
 * @file variable-quoting-validator.cjs
 * @hook-type PreToolUse(Bash)
 * @description Detects unquoted variables in Bash commands and warns about dangerous contexts
 * @enforcement warn (default) | block | off (via VARIABLE_QUOTING_VALIDATOR env var)
 * @related ADR-077 Shell Command Security Architecture (Phase 2)
 * @related SHELL-SECURITY-003
 *
 * **Purpose:**
 * Unquoted variables in Bash commands can cause:
 * - Word splitting: `cd $DIR` fails if DIR contains spaces
 * - Glob expansion: `rm $FILES` expands wildcard patterns
 * - Security vulnerabilities: Uncontrolled expansion in dangerous contexts
 *
 * **Required Pattern:**
 * ALL variables MUST be quoted: "$VAR" instead of $VAR
 *
 * **Dangerous Contexts (HIGH priority warnings):**
 * - cd $VAR (path traversal if VAR contains malicious path)
 * - find $VAR (filesystem search with wrong path)
 * - rm $VAR (deletion with unintended targets)
 * - cp/mv $VAR (file operations with wrong paths)
 *
 * **Safe Contexts (lower priority):**
 * - echo $VAR (output only, limited impact)
 * - Special variables: $$, $?, $!, $0-$9 (shell built-ins, safe unquoted)
 *
 * **Examples:**
 * ✅ PASS: cd "$PROJECT_ROOT" && find tests/
 * ✅ PASS: cd '${PROJECT_ROOT}' && find "$DIR"
 * ⚠️  WARN: cd $PROJECT_ROOT (unquoted variable)
 * ⚠️  HIGH: find $DIR -name "*.txt" (dangerous context + unquoted)
 *
 * **Environment Variables:**
 * - VARIABLE_QUOTING_VALIDATOR=warn (default) - Log warning but allow
 * - VARIABLE_QUOTING_VALIDATOR=block - Block commands with unquoted variables
 * - VARIABLE_QUOTING_VALIDATOR=off - Disable validation
 */

/**
 * Validates that Bash variables are properly quoted
 * @param {object} input - Hook input
 * @param {string} input.command - Bash command to execute
 * @returns {Promise<{allowed: boolean, reason?: string, warning?: string, fix?: string}>}
 */
async function handler(input) {
  const { command } = input;

  // Check enforcement mode
  const mode = process.env.VARIABLE_QUOTING_VALIDATOR || 'warn';

  if (mode === 'off') {
    return { allowed: true };
  }

  // Detect unquoted variables
  const unquotedVars = detectUnquotedVariables(command);

  if (unquotedVars.length === 0) {
    return { allowed: true };
  }

  // Check if any unquoted variables are in dangerous contexts
  const dangerousContexts = detectDangerousContexts(command, unquotedVars);

  const varList = unquotedVars.map(v => v.original).join(', '); // Use original ($VAR) instead of just name (VAR)
  const priority = dangerousContexts.length > 0 ? 'HIGH' : '';
  const contextInfo =
    dangerousContexts.length > 0 ? ` (dangerous contexts: ${dangerousContexts.join(', ')})` : '';

  const message = `[VARIABLE-QUOTING${priority ? `-${priority}` : ''}] unquoted variables detected: ${varList}${contextInfo}. Use "$VAR" instead of $VAR`;
  const fix = `Quote variables: ${unquotedVars.map(v => `"${v.original}"`).join(', ')}`;

  if (mode === 'warn') {
    return {
      allowed: true,
      warning: message,
      fix,
    };
  }

  // block mode
  return {
    allowed: false,
    reason: message,
    fix,
  };
}

/**
 * Detects unquoted variables in command
 * @param {string} command - Bash command
 * @returns {Array<{name: string, original: string}>} - Unquoted variables
 */
function detectUnquotedVariables(command) {
  const unquoted = [];

  // Pattern: $VAR or ${VAR} NOT within quotes
  // Negative lookbehind/lookahead for quotes
  const varPattern = /(?<!["'])\$(\{)?([A-Z_][A-Z0-9_]*)(\})?(?!["'])/g;

  let match;
  while ((match = varPattern.exec(command)) !== null) {
    const [original, _openBrace, varName, _closeBrace] = match;

    // Skip special shell variables ($$, $?, $!, $0-$9)
    if (isSpecialVariable(varName)) {
      continue;
    }

    // Check if this variable is actually within quotes (regex can miss some cases)
    const beforeVar = command.substring(0, match.index);
    const inDoubleQuotes = (beforeVar.match(/"/g) || []).length % 2 === 1;
    const inSingleQuotes = (beforeVar.match(/'/g) || []).length % 2 === 1;

    if (inDoubleQuotes || inSingleQuotes) {
      continue;
    }

    unquoted.push({
      name: varName,
      original: original,
    });
  }

  return unquoted;
}

/**
 * Checks if variable is a special shell variable (safe unquoted)
 * @param {string} varName - Variable name
 * @returns {boolean}
 */
function isSpecialVariable(varName) {
  const specialVars = [
    '$$', // Process ID
    '$?', // Exit status
    '$!', // Last background process
    '$0', // Script name
    '$1',
    '$2',
    '$3',
    '$4',
    '$5',
    '$6',
    '$7',
    '$8',
    '$9', // Positional params
  ];

  return specialVars.includes(`$${varName}`);
}

/**
 * Detects if unquoted variables are used in dangerous contexts
 * @param {string} command - Bash command
 * @param {Array<{name: string, original: string}>} unquotedVars - Unquoted variables
 * @returns {Array<string>} - Dangerous contexts found
 */
function detectDangerousContexts(command, _unquotedVars) {
  const contexts = [];

  // Dangerous commands that should NEVER have unquoted variables
  const dangerousCommands = [
    { pattern: /\bcd\s+\$[A-Z_][A-Z0-9_]*/gi, context: 'cd' },
    { pattern: /\bfind\s+\$[A-Z_][A-Z0-9_]*/gi, context: 'find' },
    { pattern: /\brm\s+.*\$[A-Z_][A-Z0-9_]*/gi, context: 'rm' },
    { pattern: /\bmv\s+.*\$[A-Z_][A-Z0-9_]*/gi, context: 'mv' },
    { pattern: /\bcp\s+.*\$[A-Z_][A-Z0-9_]*/gi, context: 'cp' },
    { pattern: /\bchmod\s+.*\$[A-Z_][A-Z0-9_]*/gi, context: 'chmod' },
    { pattern: /\bchown\s+.*\$[A-Z_][A-Z0-9_]*/gi, context: 'chown' },
  ];

  for (const { pattern, context: ctx } of dangerousCommands) {
    if (pattern.test(command)) {
      contexts.push(ctx);
    }
  }

  return [...new Set(contexts)]; // Deduplicate
}

module.exports = {
  handler,
  detectUnquotedVariables, // Export for testing
  detectDangerousContexts, // Export for testing
};
