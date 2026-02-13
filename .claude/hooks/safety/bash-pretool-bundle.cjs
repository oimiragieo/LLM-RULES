#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

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
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
}

function tryParseJson(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed || !trimmed.startsWith('{')) return null;
  try {
    return JSON.parse(trimmed);
  } catch (_err) {
    return null;
  }
}

function applyHookOutput(currentInput, hookStdout) {
  const parsed = tryParseJson(hookStdout);
  if (!parsed || !parsed.tool_input || typeof parsed.tool_input !== 'object') {
    return currentInput;
  }

  const parent = tryParseJson(currentInput);
  if (!parent || typeof parent !== 'object') {
    return currentInput;
  }

  parent.tool_input = parsed.tool_input;
  return JSON.stringify(parent);
}

function main() {
  let currentInput = '';
  try {
    currentInput = require('fs').readFileSync(0, 'utf8');
  } catch (_err) {
    process.exit(0);
  }

  for (const hookPath of HOOKS) {
    const res = runHook(hookPath, currentInput);

    if (res.error) {
      console.error(`[bash-pretool-bundle] Failed to run hook: ${hookPath}`);
      console.error(String(res.error.message || res.error));
      process.exit(1);
    }

    if (res.status !== 0) {
      if (res.stdout) process.stdout.write(res.stdout);
      if (res.stderr) process.stderr.write(res.stderr);
      process.exit(res.status || 1);
    }

    currentInput = applyHookOutput(currentInput, res.stdout);
  }

  // Preserve hook chain behavior by returning potentially transformed input.
  process.stdout.write(currentInput);
}

if (require.main === module) {
  main();
}

module.exports = {
  HOOKS,
  tryParseJson,
  applyHookOutput,
  main,
};
