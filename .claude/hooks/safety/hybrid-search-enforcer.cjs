#!/usr/bin/env node
/**
 * Hybrid Search Enforcer (PreToolUse: Grep)
 *
 * Goal: Bias agents toward hybrid search tooling (`pnpm search:code`, semantic/structural skills)
 * while keeping Grep available as a last-resort fallback.
 *
 * Exit codes:
 * - 0: allow
 * - 2: block
 */

'use strict';

const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
  formatResult,
  auditLog,
} = require('../../lib/utils/hook-input.cjs');

function getMode() {
  const mode = String(process.env.HYBRID_GREP_ENFORCEMENT || 'warn')
    .trim()
    .toLowerCase();
  if (mode === 'off' || mode === 'warn' || mode === 'block') return mode;
  return 'warn';
}

function hasAdvancedRegex(pattern) {
  if (!pattern || typeof pattern !== 'string') return false;
  return (
    /\(\?[=!<]/.test(pattern) || // lookahead/lookbehind
    /\\[1-9]/.test(pattern) || // backrefs
    /\\[pP]\{/.test(pattern) || // unicode classes
    /\\R|\\K|\\X/.test(pattern) || // PCRE special classes
    /\\n|\n/.test(pattern) // multiline intent
  );
}

function isTargetedSingleFile(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return false;
  const path = toolInput.path || toolInput.file_path || toolInput.filePath;
  if (!path || typeof path !== 'string') return false;
  // Treat explicit concrete file paths as targeted fallback.
  return !/[*?[\]{}]/.test(path);
}

function hasUnsupportedTypeAlias(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return false;

  const candidates = [toolInput.type, toolInput.file_type, toolInput.fileType];
  return candidates.some(
    value => typeof value === 'string' && value.trim().toLowerCase() === 'cjs'
  );
}

function sanitizeUnsupportedTypeAlias(toolInput) {
  const input = toolInput && typeof toolInput === 'object' ? { ...toolInput } : {};
  const keys = ['type', 'file_type', 'fileType'];
  for (const key of keys) {
    if (typeof input[key] === 'string' && input[key].trim().toLowerCase() === 'cjs') {
      delete input[key];
    }
  }
  return input;
}

function decide(toolInput) {
  if (hasUnsupportedTypeAlias(toolInput)) {
    return { allow: false, reason: 'unsupported_type_alias' };
  }
  const pattern = toolInput?.pattern;
  if (hasAdvancedRegex(pattern)) {
    return { allow: true, reason: 'advanced_regex' };
  }
  if (isTargetedSingleFile(toolInput)) {
    return { allow: true, reason: 'single_file_fallback' };
  }
  return { allow: false, reason: 'use_hybrid_search_first' };
}

function blockMessage() {
  return [
    'Grep blocked by hybrid-search-enforcer.',
    'Use hybrid search first: `pnpm search:code "<query>"` or `Skill({ skill: "ripgrep" })`.',
    'Allowed Grep fallbacks: advanced PCRE patterns or explicit single-file targeted searches.',
    'Do not use `type: "cjs"`; use a glob/path filter like `**/*.cjs` instead.',
  ].join(' ');
}

async function main() {
  try {
    const input = await parseHookInputAsync();
    if (!input) return process.exit(0);

    const toolName = getToolName(input);
    if (toolName !== 'Grep') return process.exit(0);

    const mode = getMode();
    if (mode === 'off') return process.exit(0);

    const toolInput = getToolInput(input) || {};
    const decision = decide(toolInput);

    if (decision.allow) {
      auditLog('hybrid-search-enforcer', 'allow', { reason: decision.reason });
      return process.exit(0);
    }

    const message = blockMessage();
    if (decision.reason === 'unsupported_type_alias' && mode === 'warn') {
      const normalizedInput = sanitizeUnsupportedTypeAlias(toolInput);
      auditLog('hybrid-search-enforcer', 'warn_normalized', { reason: decision.reason });
      console.log(
        formatResult({
          permissionDecision: 'allow',
          result: 'warn',
          message,
          permissionDecisionReason: message,
          tool_input: normalizedInput,
        })
      );
      return process.exit(0);
    }
    if (mode === 'warn') {
      auditLog('hybrid-search-enforcer', 'warn', { reason: decision.reason });
      console.log(formatResult('warn', message));
      return process.exit(0);
    }

    auditLog('hybrid-search-enforcer', 'block', { reason: decision.reason });
    console.log(formatResult('block', message));
    return process.exit(2);
  } catch (err) {
    if (process.env.HOOK_FAIL_OPEN === 'true') {
      auditLog('hybrid-search-enforcer', 'fail_open_override', { error: err.message });
      return process.exit(0);
    }
    auditLog('hybrid-search-enforcer', 'error_fail_closed', { error: err.message });
    return process.exit(2);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  hasAdvancedRegex,
  isTargetedSingleFile,
  hasUnsupportedTypeAlias,
  sanitizeUnsupportedTypeAlias,
  decide,
  getMode,
  blockMessage,
  main,
};
