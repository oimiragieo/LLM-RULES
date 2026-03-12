/**
 * @file shell-injection-validator.cjs
 * @hook-type PreToolUse(Bash)
 * @description Blocks Bash commands with shell injection patterns
 * @enforcement block (default) | warn | off (via SHELL_INJECTION_VALIDATOR env var)
 * @related ADR-077 Shell Command Security Architecture
 * @related SHELL-SECURITY-002
 *
 * **Purpose:**
 * Prevents arbitrary command execution via:
 * - Chained commands: `; rm -rf /`, `&& malicious`, `| dangerous`
 * - Command substitution: `$(rm -rf /)`, `` `malicious` ``
 * - Dangerous targets: `rm -rf /`, `rm -rf ~`, `rm -rf *`
 * - Code injection: `eval`, redirects to `/dev/`
 *
 * **Examples:**
 * ❌ BLOCK: find tests/; rm -rf /
 * ❌ BLOCK: eval "malicious"
 * ❌ BLOCK: echo $(rm -rf /)
 * ❌ BLOCK: cat data >> /dev/sda
 * ✅ PASS: find tests/ -name "*.test.*"
 * ✅ PASS: cd tests/ && npm test
 *
 * **Environment Variables:**
 * - SHELL_INJECTION_VALIDATOR=block (default) - Block dangerous commands
 * - SHELL_INJECTION_VALIDATOR=warn - Log warning but allow (NOT RECOMMENDED)
 * - SHELL_INJECTION_VALIDATOR=off - Disable validation (DANGEROUS)
 */

const INJECTION_PATTERNS = [
  { pattern: /;\s*rm\s+-rf/, message: 'Chained rm -rf command detected' },
  { pattern: /\|\s*rm\s+-rf/, message: 'Piped rm -rf command detected' },
  { pattern: /&&\s*rm\s+-rf/, message: 'Conditional rm -rf command detected' },
  { pattern: /\beval\s+/, message: 'eval command injection risk' },
  { pattern: />>\s*\/dev\//, message: 'System device redirect detected' },
];

/**
 * Dangerous targets for rm commands
 */
const DANGEROUS_TARGETS = [
  { pattern: /rm\s+-rf\s+\/(?!\w)/, message: 'rm -rf / (root deletion)' },
  { pattern: /rm\s+-rf\s+~/, message: 'rm -rf ~ (home deletion)' },
  { pattern: /rm\s+-rf\s+\*/, message: 'rm -rf * (wildcard deletion)' },
];

function buildViolation(message, detected, mode) {
  const payload = {
    message: `[SHELL-INJECTION] ${message}`,
    detected,
  };
  if (mode === 'warn') {
    return {
      allowed: true,
      warning: payload.message,
      detected: payload.detected,
    };
  }
  return {
    allowed: false,
    reason: payload.message,
    detected: payload.detected,
  };
}

function isWordBoundaryChar(ch) {
  return !ch || /\s|[;|&()<>]/.test(ch);
}

function extractAndSanitizeShell(command) {
  const substitutions = [];
  let output = '';
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  function collectBacktick(startIndex) {
    let j = startIndex + 1;
    let localEscaped = false;
    let content = '';
    let iterCount = 0;
    const maxIter = 10000;
    while (j < command.length) {
      const ch = command[j];
      if (localEscaped) {
        content += ch;
        localEscaped = false;
        j++;
        iterCount++;
        if (iterCount >= maxIter) {
          break;
        }
        continue;
      }
      if (ch === '\\') {
        localEscaped = true;
        j++;
        iterCount++;
        if (iterCount >= maxIter) {
          break;
        }
        continue;
      }
      if (ch === '`') {
        return { endIndex: j, content };
      }
      content += ch;
      j++;
      iterCount++;
      if (iterCount >= maxIter) {
        break;
      }
    }
    return null;
  }

  function collectCommandSub(startIndex) {
    let j = startIndex + 2;
    let depth = 1;
    let localEscaped = false;
    let localSingle = false;
    let localDouble = false;
    let content = '';
    let iterCount = 0;
    const maxIter = 10000;

    while (j < command.length) {
      const ch = command[j];
      if (localEscaped) {
        content += ch;
        localEscaped = false;
        j++;
        iterCount++;
        if (iterCount >= maxIter) {
          break;
        }
        continue;
      }
      if (ch === '\\') {
        localEscaped = true;
        content += ch;
        j++;
        iterCount++;
        if (iterCount >= maxIter) {
          break;
        }
        continue;
      }
      if (!localDouble && ch === "'") {
        localSingle = !localSingle;
        content += ch;
        j++;
        iterCount++;
        if (iterCount >= maxIter) {
          break;
        }
        continue;
      }
      if (!localSingle && ch === '"') {
        localDouble = !localDouble;
        content += ch;
        j++;
        iterCount++;
        if (iterCount >= maxIter) {
          break;
        }
        continue;
      }
      if (!localSingle && !localDouble) {
        if (ch === '(') {
          depth++;
        } else if (ch === ')') {
          depth--;
          if (depth === 0) {
            return { endIndex: j, content };
          }
        }
      }
      content += ch;
      j++;
      iterCount++;
      if (iterCount >= maxIter) {
        break;
      }
    }
    return null;
  }

  while (i < command.length) {
    const ch = command[i];

    if (escaped) {
      output += inSingle || inDouble ? ' ' : ch;
      escaped = false;
      i++;
      continue;
    }

    if (ch === '\\') {
      escaped = true;
      output += inSingle || inDouble ? ' ' : ch;
      i++;
      continue;
    }

    if (!inDouble && ch === "'") {
      inSingle = !inSingle;
      output += ' ';
      i++;
      continue;
    }
    if (!inSingle && ch === '"') {
      inDouble = !inDouble;
      output += ' ';
      i++;
      continue;
    }

    if (inSingle || inDouble) {
      output += ' ';
      i++;
      continue;
    }

    if (!inSingle && !inDouble && ch === '`') {
      const backtick = collectBacktick(i);
      if (backtick) {
        substitutions.push({ type: 'backtick', content: backtick.content });
        output += ' '.repeat(backtick.endIndex - i + 1);
        i = backtick.endIndex + 1;
        continue;
      }
    }

    if (!inSingle && !inDouble && ch === '$' && command[i + 1] === '(') {
      const sub = collectCommandSub(i);
      if (sub) {
        substitutions.push({ type: 'substitution', content: sub.content });
        output += ' '.repeat(sub.endIndex - i + 1);
        i = sub.endIndex + 1;
        continue;
      }
    }

    if (!inSingle && !inDouble && ch === '#') {
      const prev = i > 0 ? command[i - 1] : '';
      if (isWordBoundaryChar(prev)) {
        // Add iteration limit to prevent DoS on malformed input
        let iterCount = 0;
        const maxIter = 10000;
        while (i < command.length && command[i] !== '\n') {
          output += ' ';
          i++;
          iterCount++;
          if (iterCount >= maxIter) {
            // Malformed input: comment too long, stop processing
            break;
          }
        }
        continue;
      }
    }

    output += ch;
    i++;
  }

  return { sanitized: output, substitutions };
}

function analyzeSubstitution(content) {
  const normalized = content.toLowerCase();
  if (/\brm\s+-rf\b/.test(normalized)) {
    return { message: 'Command substitution with rm', detected: '/\\brm\\s+-rf\\b/' };
  }
  if (/\beval\b/.test(normalized)) {
    return { message: 'Command substitution with eval', detected: '/\\beval\\b/' };
  }
  const decodedExec = analyzeDecodedExecution(content);
  if (decodedExec) {
    return decodedExec;
  }
  return null;
}

function analyzeDecodedExecution(content) {
  const normalized = content.toLowerCase();
  const hasBase64Decode =
    /\bbase64\b/.test(normalized) && /(?:\s|^)-(?:d)\b|--decode\b/.test(normalized);
  const hasHexDecode =
    /printf\s+['"][^'"]*\\x[0-9a-f]{2}/.test(normalized) ||
    /\bxxd\s+-r\s+-p\b/.test(normalized) ||
    /\bpack\(\s*["']h\*["']/.test(normalized) ||
    /\bfromhex\s*\(/.test(normalized) ||
    /\bbinascii\.unhexlify\s*\(/.test(normalized);
  const hasDecode = hasBase64Decode || hasHexDecode;
  const pipesToShell =
    /\|\s*(?:env\s+)?(?:\/bin\/)?(?:sh|bash|zsh|ksh)\b/.test(normalized) ||
    /\|\s*(?:["'])?\$shell(?:["'])?\b/.test(normalized) ||
    /\|\s*\$\{shell\}/.test(normalized);
  const hasShellDashC = /(?:^|[;|&]\s*)(?:\/bin\/)?(?:sh|bash|zsh|ksh)\s+-c\b/.test(normalized);
  if (hasDecode && (pipesToShell || hasShellDashC)) {
    return {
      message: 'Encoded payload decode and shell execution in substitution',
      detected:
        '/(?:base64 -d|--decode|printf \\\\x..|xxd -r -p|pack("H*")|fromhex).*(?:\\|\\s*(?:env )?(?:sh|bash|zsh|ksh|\\$SHELL)|(?:sh|bash|zsh|ksh) -c)/',
    };
  }
  return null;
}

function analyzeInlineInterpreterExecution(command) {
  const normalized = command.toLowerCase();
  const pipesToShell =
    /\|\s*(?:env\s+)?(?:\/bin\/)?(?:sh|bash|zsh|ksh)\b/.test(normalized) ||
    /\|\s*(?:["'])?\$shell(?:["'])?\b/.test(normalized) ||
    /\|\s*\$\{shell\}/.test(normalized);
  if (!pipesToShell) {
    return null;
  }

  const hasPythonInlineCode = /\bpython(?:\d+(?:\.\d+)?)?\b[\s\S]*\s-c\s+['"]/.test(normalized);
  if (!hasPythonInlineCode) {
    return null;
  }

  const hasDecodeInInlineCode =
    /\bfromhex\s*\(/.test(normalized) ||
    /\bbinascii\.unhexlify\s*\(/.test(normalized) ||
    /\bbase64\.b64decode\s*\(/.test(normalized);
  if (!hasDecodeInInlineCode) {
    return null;
  }

  return {
    message: 'Inline interpreter decode payload piped to shell',
    detected:
      '/python -c .* (fromhex|binascii.unhexlify|base64.b64decode) .*\\|\\s*(?:sh|bash|zsh|ksh|\\$SHELL)/',
  };
}

/**
 * Validates Bash command for shell injection patterns
 * @param {object} input - Hook input
 * @param {string} input.command - Bash command to execute
 * @returns {{allowed: boolean, reason?: string, warning?: string, detected?: string}}
 */
function handler(input) {
  // Input validation: check for null/undefined and command property
  if (!input || typeof input !== 'object') {
    return { allowed: false, reason: '[SHELL-INJECTION] Invalid hook input: expected object' };
  }

  if (typeof input.command !== 'string') {
    return { allowed: false, reason: '[SHELL-INJECTION] Invalid command: expected string' };
  }

  const { command } = input;

  // Check enforcement mode
  const mode = process.env.SHELL_INJECTION_VALIDATOR || 'block';

  if (mode === 'off') {
    return { allowed: true };
  }

  const inlineInterpreterFinding = analyzeInlineInterpreterExecution(command);
  if (inlineInterpreterFinding) {
    return buildViolation(
      inlineInterpreterFinding.message,
      inlineInterpreterFinding.detected,
      mode
    );
  }

  const { sanitized, substitutions } = extractAndSanitizeShell(command);

  const topLevelDecodedExec = analyzeDecodedExecution(sanitized);
  if (topLevelDecodedExec) {
    return buildViolation(topLevelDecodedExec.message, topLevelDecodedExec.detected, mode);
  }

  for (const sub of substitutions) {
    const finding = analyzeSubstitution(sub.content);
    if (finding) {
      return buildViolation(finding.message, finding.detected, mode);
    }
  }

  for (const { pattern, message } of INJECTION_PATTERNS) {
    if (pattern.test(sanitized)) {
      return buildViolation(message, pattern.toString(), mode);
    }
  }

  for (const { pattern, message } of DANGEROUS_TARGETS) {
    if (pattern.test(sanitized)) {
      return buildViolation(message, pattern.toString(), mode);
    }
  }

  return { allowed: true };
}

module.exports = {
  handler,
  INJECTION_PATTERNS, // Export for testing
  DANGEROUS_TARGETS, // Export for testing
  extractAndSanitizeShell,
  analyzeSubstitution,
  analyzeDecodedExecution,
  analyzeInlineInterpreterExecution,
};

if (require.main === module) {
  const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

  let raw = '';
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', chunk => {
    raw += chunk;
  });
  process.stdin.on('end', () => {
    // Validate input exists before parsing
    if (!raw) {
      process.stdout.write(
        JSON.stringify({ allowed: false, reason: '[SHELL-INJECTION] Invalid JSON input' })
      );
      process.exit(2);
    }

    // Use safeParseJSON for prototype-pollution-safe parsing
    const input = safeParseJSON(raw, null);
    if (!input) {
      process.stdout.write(
        JSON.stringify({ allowed: false, reason: '[SHELL-INJECTION] Invalid JSON input' })
      );
      process.exit(2);
    }

    // Extract command from Claude Code hook payload structure
    // The hook receives: { tool_name, tool_input: { command } }
    const command =
      (input && input.tool_input && input.tool_input.command) || (input && input.command) || null;

    const hookInput = command !== null ? { command } : input;
    const result = handler(hookInput);

    process.stdout.write(JSON.stringify(result));
    process.exit(result.allowed ? 0 : 2);
  });
}
