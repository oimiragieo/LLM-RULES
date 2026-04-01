'use strict';

const { validateCommand } = require('./registry.cjs');
const { parseCommand } = require('./shell-validators.cjs');

const CLAUDE_CODE_DANGEROUS_PATTERNS = [
  { label: 'python', tokens: ['python'] },
  { label: 'python3', tokens: ['python3'] },
  { label: 'node', tokens: ['node'] },
  { label: 'deno', tokens: ['deno'] },
  { label: 'tsx', tokens: ['tsx'] },
  { label: 'ruby', tokens: ['ruby'] },
  { label: 'perl', tokens: ['perl'] },
  { label: 'php', tokens: ['php'] },
  { label: 'lua', tokens: ['lua'] },
  { label: 'npx', tokens: ['npx'] },
  { label: 'bunx', tokens: ['bunx'] },
  { label: 'npm run', tokens: ['npm', 'run'] },
  { label: 'yarn run', tokens: ['yarn', 'run'] },
  { label: 'pnpm run', tokens: ['pnpm', 'run'] },
  { label: 'bun run', tokens: ['bun', 'run'] },
  { label: 'bash', tokens: ['bash'] },
  { label: 'sh', tokens: ['sh'] },
  { label: 'zsh', tokens: ['zsh'] },
  { label: 'fish', tokens: ['fish'] },
  { label: 'eval', tokens: ['eval'] },
  { label: 'exec', tokens: ['exec'] },
  { label: 'env', tokens: ['env'] },
  { label: 'xargs', tokens: ['xargs'] },
  { label: 'sudo', tokens: ['sudo'] },
  { label: 'ssh', tokens: ['ssh'] },
];

function isCommandSubstitutionStart(command, index) {
  return command[index] === '$' && command[index + 1] === '(' && command[index + 2] !== '(';
}

function isSingleAmpersandSeparator(command, index) {
  if (command[index] !== '&') {
    return false;
  }

  const prevChar = command[index - 1] || '';
  const nextChar = command[index + 1] || '';

  if (prevChar === '&' || nextChar === '&') {
    return false;
  }

  if (prevChar === '>' || prevChar === '<' || nextChar === '>' || nextChar === '<') {
    return false;
  }

  return true;
}

function readDollarCommandSubstitution(command, startIndex) {
  let content = '';
  let depth = 1;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktickSubstitution = false;
  let escaped = false;

  for (let i = startIndex + 2; i < command.length; i++) {
    const char = command[i];

    if (escaped) {
      content += char;
      escaped = false;
      continue;
    }

    if (char === '\\' && !inSingleQuote) {
      content += char;
      escaped = true;
      continue;
    }

    if (!inBacktickSubstitution && char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      content += char;
      continue;
    }

    if (!inBacktickSubstitution && char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      content += char;
      continue;
    }

    if (!inSingleQuote && char === '`') {
      inBacktickSubstitution = !inBacktickSubstitution;
      content += char;
      continue;
    }

    if (!inSingleQuote && !inBacktickSubstitution && isCommandSubstitutionStart(command, i)) {
      depth++;
      content += '$(';
      i++;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && !inBacktickSubstitution && char === ')') {
      depth--;
      if (depth === 0) {
        return {
          content,
          endIndex: i,
        };
      }
    }

    content += char;
  }

  return null;
}

function readBacktickCommandSubstitution(command, startIndex) {
  let content = '';
  let escaped = false;

  for (let i = startIndex + 1; i < command.length; i++) {
    const char = command[i];

    if (escaped) {
      content += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      content += char;
      escaped = true;
      continue;
    }

    if (char === '`') {
      return {
        content,
        endIndex: i,
      };
    }

    content += char;
  }

  return null;
}

function extractCommandSubstitutions(command) {
  if (!command || typeof command !== 'string') {
    return [];
  }

  const substitutions = [];
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (let i = 0; i < command.length; i++) {
    const char = command[i];

    if (escaped) {
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

    if (inSingleQuote) {
      continue;
    }

    if (isCommandSubstitutionStart(command, i)) {
      const substitution = readDollarCommandSubstitution(command, i);
      if (substitution) {
        const content = substitution.content.trim();
        if (content) {
          substitutions.push(content);
        }
        i = substitution.endIndex;
      }
      continue;
    }

    if (char === '`') {
      const substitution = readBacktickCommandSubstitution(command, i);
      if (substitution) {
        const content = substitution.content.trim();
        if (content) {
          substitutions.push(content);
        }
        i = substitution.endIndex;
      }
    }
  }

  return substitutions;
}

function splitTopLevelCompoundCommand(command) {
  if (!command || typeof command !== 'string') {
    return [];
  }

  const segments = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  function pushCurrent() {
    const segment = current.trim();
    if (segment) {
      segments.push(segment);
    }
    current = '';
  }

  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    const nextChar = command[i + 1];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\' && !inSingleQuote) {
      current += char;
      escaped = true;
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      current += char;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      current += char;
      continue;
    }

    if (!inSingleQuote && isCommandSubstitutionStart(command, i)) {
      const substitution = readDollarCommandSubstitution(command, i);
      if (substitution) {
        current += `$(${substitution.content})`;
        i = substitution.endIndex;
        continue;
      }
    }

    if (!inSingleQuote && char === '`') {
      const substitution = readBacktickCommandSubstitution(command, i);
      if (substitution) {
        current += `\`${substitution.content}\``;
        i = substitution.endIndex;
        continue;
      }
    }

    if (!inSingleQuote && !inDoubleQuote) {
      if ((char === '&' || char === '|') && nextChar === char) {
        pushCurrent();
        i++;
        continue;
      }

      if (isSingleAmpersandSeparator(command, i)) {
        pushCurrent();
        continue;
      }

      if (char === '|') {
        pushCurrent();
        continue;
      }

      if (char === ';' || char === '\n') {
        pushCurrent();
        continue;
      }

      if (char === '\r') {
        pushCurrent();
        if (nextChar === '\n') {
          i++;
        }
        continue;
      }
    }

    current += char;
  }

  pushCurrent();
  return segments;
}

function splitCompoundCommand(command) {
  const segments = splitTopLevelCompoundCommand(command);
  const expandedSegments = [];

  for (const segment of segments) {
    expandedSegments.push(segment);

    for (const substitution of extractCommandSubstitutions(segment)) {
      expandedSegments.push(...splitCompoundCommand(substitution));
    }
  }

  return expandedSegments;
}

function normalizeCommandToken(token) {
  if (!token || typeof token !== 'string') {
    return '';
  }

  const trimmed = token.trim();
  if (!trimmed) {
    return '';
  }

  const baseName = trimmed.includes('/')
    ? trimmed.split('/').pop()
    : trimmed.includes('\\')
      ? trimmed.split('\\').pop()
      : trimmed;

  return baseName.replace(/\.(?:exe|cmd|bat|com|ps1)$/i, '').toLowerCase();
}

function getLeadingCommandTokens(segment) {
  if (!segment || typeof segment !== 'string') {
    return [];
  }

  const parsed = parseCommand(segment, { skipDangerousCheck: true });
  if (!parsed || !Array.isArray(parsed.tokens)) {
    return [];
  }

  const tokens = parsed.tokens;
  let startIndex = 0;

  while (startIndex < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[startIndex] || '')) {
    startIndex++;
  }

  return tokens.slice(startIndex).map(normalizeCommandToken).filter(Boolean);
}

function findClaudeCodeDangerousPattern(segment) {
  const commandTokens = getLeadingCommandTokens(segment);
  if (commandTokens.length === 0) {
    return null;
  }

  for (const pattern of CLAUDE_CODE_DANGEROUS_PATTERNS) {
    const matches = pattern.tokens.every((token, index) => commandTokens[index] === token);
    if (matches) {
      return pattern;
    }
  }

  return null;
}

function formatDangerousPatternWarning(matches) {
  if (!Array.isArray(matches) || matches.length === 0) {
    return '';
  }

  const summary = matches
    .map(match => `segment ${match.segmentIndex} (${match.pattern.label})`)
    .join(', ');
  return (
    'Claude Code dangerous command pattern detected in Bash input: ' +
    `${summary}. Review the command carefully before execution.`
  );
}

function analyzeClaudeCodeDangerousPatterns(command) {
  const segments = splitCompoundCommand(command);
  const matches = [];

  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    const result = validateCommand(segment);
    if (!result.valid) {
      return {
        blocked: {
          segment,
          segmentIndex: index + 1,
          error: result.error || 'Unknown safety violation',
        },
        matches,
      };
    }

    const pattern = findClaudeCodeDangerousPattern(segment);
    if (pattern) {
      matches.push({
        pattern,
        segment,
        segmentIndex: index + 1,
      });
    }
  }

  return {
    blocked: null,
    matches,
  };
}

module.exports = {
  CLAUDE_CODE_DANGEROUS_PATTERNS,
  isCommandSubstitutionStart,
  isSingleAmpersandSeparator,
  readDollarCommandSubstitution,
  readBacktickCommandSubstitution,
  extractCommandSubstitutions,
  splitTopLevelCompoundCommand,
  splitCompoundCommand,
  normalizeCommandToken,
  getLeadingCommandTokens,
  findClaudeCodeDangerousPattern,
  formatDangerousPatternWarning,
  analyzeClaudeCodeDangerousPatterns,
};
