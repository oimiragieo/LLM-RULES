#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const HOOKS = [
  path.join(PROJECT_ROOT, '.claude', 'hooks', 'safety', 'bash-command-validator.cjs'),
  path.join(PROJECT_ROOT, '.claude', 'hooks', 'safety', 'shell-injection-validator.cjs'),
  path.join(PROJECT_ROOT, '.claude', 'hooks', 'safety', 'windows-null-sanitizer.cjs'),
  path.join(PROJECT_ROOT, '.claude', 'hooks', 'routing', 'routing-guard.cjs'),
];

function runHook(scriptPath, input) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd: PROJECT_ROOT,
    input,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
}

function tryParseJson(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed || !trimmed.startsWith('{')) return null;
  const parsed = safeParseJSON(trimmed, null);
  // safeParseJSON returns the parsed object directly (not {success, data})
  if (!parsed || typeof parsed !== 'object') return null;
  return parsed;
}

function applyHookOutput(currentInput, hookStdout) {
  const parsed = tryParseJson(hookStdout);
  if (!parsed) {
    return currentInput;
  }

  const parent = tryParseJson(currentInput);
  if (!parent || typeof parent !== 'object') {
    return currentInput;
  }

  if (parsed.tool_input && typeof parsed.tool_input === 'object') {
    parent.tool_input = parsed.tool_input;
    return JSON.stringify(parent);
  }

  const updatedInput = parsed.hookSpecificOutput?.updatedInput;
  if (!updatedInput || typeof updatedInput !== 'object') {
    return currentInput;
  }

  parent.tool_input = {
    ...(parent.tool_input || {}),
    ...updatedInput,
  };
  return JSON.stringify(parent);
}

function formatBlockedOutput(parsed, hookPath) {
  const message =
    parsed?.hookSpecificOutput?.permissionDecisionReason ||
    parsed?.permissionDecisionReason ||
    parsed?.message ||
    `Command blocked by safety sub-hook (${path.basename(hookPath)}). See debug trace for details.`;

  return {
    ...(parsed && typeof parsed === 'object' ? parsed : {}),
    permissionDecision: 'deny',
    permissionDecisionReason: message,
    result: 'block',
    message,
  };
}

function formatUpdatedInputOutput(originalInput, transformedInput) {
  const original = tryParseJson(originalInput);
  const transformed = tryParseJson(transformedInput);

  if (
    !original ||
    !transformed ||
    typeof original !== 'object' ||
    typeof transformed !== 'object'
  ) {
    return transformedInput;
  }

  const originalToolInput = original.tool_input;
  const transformedToolInput = transformed.tool_input;

  if (
    !originalToolInput ||
    !transformedToolInput ||
    typeof originalToolInput !== 'object' ||
    typeof transformedToolInput !== 'object'
  ) {
    return transformedInput;
  }

  if (JSON.stringify(originalToolInput) === JSON.stringify(transformedToolInput)) {
    return transformedInput;
  }

  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      updatedInput: transformedToolInput,
    },
  });
}

function main() {
  let currentInput = '';
  try {
    currentInput = require('fs').readFileSync(0, 'utf8');
  } catch (_err) {
    process.exit(0);
  }

  const originalInput = currentInput;

  for (const hookPath of HOOKS) {
    const res = runHook(hookPath, currentInput);
    const parsedStdout = tryParseJson(res.stdout);

    if (res.error) {
      console.error(`[bash-pretool-bundle] Failed to run hook: ${hookPath}`);
      console.error(String(res.error.message || res.error));
      process.exit(2);
    }

    if (res.status !== 0) {
      if (res.stderr) process.stderr.write(res.stderr);
      process.stdout.write(JSON.stringify(formatBlockedOutput(parsedStdout, hookPath)));
      process.exit(2);
    }

    currentInput = applyHookOutput(currentInput, res.stdout);
  }

  // Preserve hook chain behavior by returning potentially transformed input.
  process.stdout.write(formatUpdatedInputOutput(originalInput, currentInput));
}

if (require.main === module) {
  main();
}

module.exports = {
  HOOKS,
  tryParseJson,
  applyHookOutput,
  formatBlockedOutput,
  formatUpdatedInputOutput,
  main,
};
