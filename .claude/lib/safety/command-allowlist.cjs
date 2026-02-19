/**
 * @file Command Allowlist Library
 * @category safety
 * @description Defines safe, approved commands for background Bash execution
 * @phase 3
 */

/**
 * Allowed commands with patterns and restrictions
 * @type {Object.<string, {allowed: boolean, patterns?: Array<RegExp>, dangerous_flags?: Array<string>, must_start_with?: string, reason?: string}>}
 */
const ALLOWED_COMMANDS = {
  // File operations (safe read-only)
  find: {
    allowed: true,
    patterns: [
      // Absolute-ish safe roots
      /^find\s+["']?\$\{?PROJECT_ROOT\}?["']?.*-name/,
      // Relative roots (rely on CWD validator to enforce PROJECT_ROOT for background tasks)
      /^find\s+\./,
      /^find\s+tests\//,
      /^find\s+src\//,
      /^find\s+["'][^/][^"']*["']/,
      /^find\s+[^/\s][^\s]*/,
    ],
    dangerous_flags: ['-delete', '-exec', 'rm'],
    description: 'Find files (restrict -delete, -exec, rm)',
  },
  grep: {
    allowed: true,
    patterns: [/^grep\s+/],
    description: 'Pattern matching',
  },
  rg: {
    allowed: true,
    patterns: [/^rg\s+/],
    description: 'Ripgrep pattern matching',
  },

  // Directory operations (safe read-only)
  ls: {
    allowed: true,
    description: 'List directory contents',
  },
  pwd: {
    allowed: true,
    description: 'Print working directory',
  },
  cd: {
    allowed: true,
    must_start_with: 'cd "$PROJECT_ROOT"',
    description: 'Change directory (must start with PROJECT_ROOT)',
  },

  // File reading (safe read-only)
  cat: {
    allowed: true,
    description: 'Concatenate and display files',
  },
  head: {
    allowed: true,
    description: 'Output first part of files',
  },
  tail: {
    allowed: true,
    description: 'Output last part of files',
  },
  less: {
    allowed: true,
    description: 'File pager',
  },
  more: {
    allowed: true,
    description: 'File pager',
  },

  // Counting/reporting (safe)
  wc: {
    allowed: true,
    description: 'Word, line, character count',
  },
  sort: {
    allowed: true,
    description: 'Sort lines',
  },
  uniq: {
    allowed: true,
    description: 'Report or omit repeated lines',
  },

  // Text processing (safe)
  awk: {
    allowed: true,
    description: 'Pattern scanning and processing',
  },
  sed: {
    allowed: true,
    dangerous_flags: ['-i'], // In-place editing dangerous
    description: 'Stream editor (no -i flag)',
  },

  // JSON processing (safe)
  jq: {
    allowed: true,
    description: 'JSON processor',
  },

  // Version control (read-only git commands)
  git: {
    allowed: true,
    patterns: [
      /^git\s+status/,
      /^git\s+log/,
      /^git\s+diff/,
      /^git\s+show/,
      /^git\s+branch/,
      /^git\s+ls-files/,
    ],
    dangerous_flags: ['reset', 'clean', 'push --force', 'rebase', 'checkout .'],
    description: 'Git (read-only commands)',
  },

  // Package managers (safe read operations)
  npm: {
    allowed: true,
    patterns: [/^npm\s+list/, /^npm\s+ls/, /^npm\s+view/, /^npm\s+outdated/],
    description: 'NPM (list/view only)',
  },
  pnpm: {
    allowed: true,
    patterns: [/^pnpm\s+list/, /^pnpm\s+ls/, /^pnpm\s+outdated/],
    description: 'PNPM (list only)',
  },
  node: {
    allowed: true,
    description: 'Node.js runtime',
  },

  // Testing (safe)
  test: {
    allowed: true,
    description: 'File test command',
  },

  // Environment (safe)
  env: {
    allowed: true,
    description: 'Display environment variables',
  },
  echo: {
    allowed: true,
    description: 'Display text',
  },
  printf: {
    allowed: true,
    description: 'Format and print data',
  },
  exit: {
    allowed: true,
    description: 'Exit shell (used in guard clauses)',
  },
  export: {
    allowed: true,
    description: 'Set environment variables (shell builtin)',
  },
};

/**
 * Blocked commands (dangerous)
 * @type {Object.<string, {allowed: false, reason: string}>}
 */
const BLOCKED_COMMANDS = {
  // Destructive operations
  rm: {
    allowed: false,
    reason: 'Destructive operation - files cannot be recovered',
  },
  rmdir: {
    allowed: false,
    reason: 'Destructive operation - directories cannot be recovered',
  },
  mv: {
    allowed: false,
    reason: 'Can cause data loss if overwriting files',
  },
  cp: {
    allowed: false,
    reason: 'Can overwrite existing files causing data loss',
  },

  // Dangerous low-level operations
  dd: {
    allowed: false,
    reason: 'Dangerous low-level operation - can destroy filesystems',
  },
  mkfs: {
    allowed: false,
    reason: 'Creates filesystems - can destroy data',
  },
  fdisk: {
    allowed: false,
    reason: 'Partition table editor - can destroy data',
  },

  // Code execution risks
  eval: {
    allowed: false,
    reason: 'Code injection risk - executes arbitrary commands',
  },
  exec: {
    allowed: false,
    reason: 'Process replacement risk - can hijack execution',
  },
  source: {
    allowed: false,
    reason: 'Executes arbitrary shell scripts',
  },
  '.': {
    allowed: false,
    reason: 'Executes arbitrary shell scripts',
  },

  // Shell invocation (use specific commands instead)
  sh: {
    allowed: false,
    reason: 'Shell invocation - use specific commands instead',
  },
  bash: {
    allowed: false,
    reason: 'Bash invocation - use specific commands instead',
  },
  zsh: {
    allowed: false,
    reason: 'Zsh invocation - use specific commands instead',
  },

  // System modification
  chmod: {
    allowed: false,
    reason: 'Modifies file permissions - security risk',
  },
  chown: {
    allowed: false,
    reason: 'Modifies file ownership - security risk',
  },
  sudo: {
    allowed: false,
    reason: 'Privilege escalation - requires manual approval',
  },
  su: {
    allowed: false,
    reason: 'User switching - requires manual approval',
  },

  // Network operations
  curl: {
    allowed: false,
    reason: 'Network operations require manual approval',
  },
  wget: {
    allowed: false,
    reason: 'Network operations require manual approval',
  },
  nc: {
    allowed: false,
    reason: 'Network operations require manual approval',
  },
  netcat: {
    allowed: false,
    reason: 'Network operations require manual approval',
  },
};

/**
 * Extract primary command from a shell command string
 * @param {string} command - Full shell command
 * @returns {string} Primary command name
 */
function extractPrimaryCommand(command) {
  // Remove leading whitespace and environment variables
  const trimmed = command.trim().replace(/^(export\s+[A-Z_]+=.*?\s+&&\s+)?/, '');

  // Extract first word (command name)
  const match = trimmed.match(/^([a-zA-Z0-9_.-]+)/);
  return match ? match[1] : '';
}

/**
 * Split a shell command into "segments" separated by control operators.
 * This is intentionally conservative (no full shell parsing) but handles common
 * safe cases and keeps checks from only looking at the first command.
 * @param {string} command
 * @returns {string[]} segments
 */
function splitShellCommandSegments(command) {
  const segments = [];
  let buffer = '';
  let inSingle = false;
  let inDouble = false;
  let escapeNext = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    if (escapeNext) {
      buffer += ch;
      escapeNext = false;
      continue;
    }

    if (ch === '\\') {
      buffer += ch;
      escapeNext = true;
      continue;
    }

    if (!inDouble && ch === "'") {
      inSingle = !inSingle;
      buffer += ch;
      continue;
    }

    if (!inSingle && ch === '"') {
      inDouble = !inDouble;
      buffer += ch;
      continue;
    }

    if (!inSingle && !inDouble) {
      const two = command.slice(i, i + 2);
      if (two === '&&' || two === '||') {
        segments.push(buffer);
        buffer = '';
        i++;
        continue;
      }

      if (ch === ';' || ch === '|' || ch === '\n') {
        segments.push(buffer);
        buffer = '';
        continue;
      }
    }

    buffer += ch;
  }

  segments.push(buffer);
  return segments.map(s => s.trim()).filter(Boolean);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasDangerousFlag(segment, flag) {
  if (!segment || !flag) return false;
  const escaped = escapeRegExp(flag.trim());
  if (!escaped) return false;
  const tokenPattern = new RegExp(`(^|\\s)${escaped}(?=\\s|$)`);
  return tokenPattern.test(segment);
}

function hasCommandSubstitution(command) {
  const text = String(command || '');
  if (text.includes('$(')) return true;
  return /(^|[^\\])`/.test(text);
}

/**
 * Check if command is allowed
 * @param {string} command - Full shell command
 * @returns {{allowed: boolean, reason?: string, command?: string}}
 */
function isCommandAllowed(command) {
  if (hasCommandSubstitution(command)) {
    return {
      allowed: false,
      reason: 'Command substitution is not allowed in background commands',
      command: '',
    };
  }

  const segments = splitShellCommandSegments(command || '');
  if (segments.length === 0) {
    return { allowed: false, reason: 'Could not extract command from input', command: '' };
  }

  for (const segment of segments) {
    const primaryCommand = extractPrimaryCommand(segment);

    if (!primaryCommand) {
      return { allowed: false, reason: 'Could not extract command from input', command: '' };
    }

    // Check if blocked
    if (BLOCKED_COMMANDS[primaryCommand]) {
      return {
        allowed: false,
        reason: BLOCKED_COMMANDS[primaryCommand].reason,
        command: primaryCommand,
      };
    }

    // Check if allowed
    const allowlistEntry = ALLOWED_COMMANDS[primaryCommand];
    if (!allowlistEntry) {
      return {
        allowed: false,
        reason: `Command "${primaryCommand}" not in allowlist. Add to ALLOWED_COMMANDS or use a different command.`,
        command: primaryCommand,
      };
    }

    // Check patterns if defined
    if (allowlistEntry.patterns) {
      const matchesPattern = allowlistEntry.patterns.some(pattern => pattern.test(segment));
      if (!matchesPattern) {
        return {
          allowed: false,
          reason: `Command "${primaryCommand}" does not match allowed patterns. Allowed: ${allowlistEntry.description}`,
          command: primaryCommand,
        };
      }
    }

    // Check dangerous flags
    if (allowlistEntry.dangerous_flags) {
      for (const flag of allowlistEntry.dangerous_flags) {
        if (hasDangerousFlag(segment, flag)) {
          return {
            allowed: false,
            reason: `Command "${primaryCommand}" contains dangerous flag: ${flag}`,
            command: primaryCommand,
          };
        }
      }
    }

    // Check must_start_with
    if (allowlistEntry.must_start_with && !segment.startsWith(allowlistEntry.must_start_with)) {
      return {
        allowed: false,
        reason: `Command "${primaryCommand}" must start with: ${allowlistEntry.must_start_with}`,
        command: primaryCommand,
      };
    }
  }

  return { allowed: true, command: extractPrimaryCommand(segments[0]) };
}

module.exports = {
  ALLOWED_COMMANDS,
  BLOCKED_COMMANDS,
  extractPrimaryCommand,
  splitShellCommandSegments,
  isCommandAllowed,
};
