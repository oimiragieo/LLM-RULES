#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
  extractFilePath,
  formatResult,
} = require('../../lib/utils/hook-input.cjs');
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const { atomicWriteJSONSync } = require('../../lib/utils/atomic-write.cjs');

const STAMP_PATH = path.join(
  PROJECT_ROOT,
  '.claude/context/runtime/agent-registry-auto-refresh.json'
);
const DEFAULT_DEBOUNCE_MS = Number(process.env.AGENT_REGISTRY_AUTO_REFRESH_DEBOUNCE_MS || 1500);

function isEnabled() {
  return (
    String(process.env.AGENT_REGISTRY_AUTO_REFRESH || 'on')
      .trim()
      .toLowerCase() !== 'off'
  );
}

function normalizeFilePath(filePath) {
  if (!filePath || typeof filePath !== 'string') return '';
  const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(PROJECT_ROOT, filePath);
  return absolute.replace(/\\/g, '/');
}

function shouldRefreshRegistry(toolName, filePath) {
  if (!toolName || !filePath) return false;
  if (!['Edit', 'Write', 'NotebookEdit'].includes(toolName)) return false;
  const normalized = normalizeFilePath(filePath);
  const agentsRoot = path.join(PROJECT_ROOT, '.claude', 'agents').replace(/\\/g, '/');
  if (!normalized.startsWith(agentsRoot + '/')) return false;
  return normalized.toLowerCase().endsWith('.md');
}

function readLastRunMs() {
  try {
    if (!fs.existsSync(STAMP_PATH)) return 0;
    const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
    const parsed = safeParseJSON(fs.readFileSync(STAMP_PATH, 'utf8'), null, null, {});
    return Number(parsed?.lastRunMs || 0);
  } catch (_err) {
    return 0;
  }
}

function writeLastRunMs(nowMs) {
  try {
    atomicWriteJSONSync(STAMP_PATH, { lastRunMs: nowMs });
  } catch (_err) {
    // Non-blocking best effort.
  }
}

function runRegistryRefresh() {
  return spawnSync(process.execPath, ['.claude/tools/cli/generate-agent-registry.cjs'], {
    cwd: PROJECT_ROOT,
    stdio: 'pipe',
    shell: false,
    windowsHide: true,
    encoding: 'utf8',
  });
}

function processHookInput(input, deps = {}) {
  const runRegistryRefreshFn = deps.runRegistryRefreshFn || runRegistryRefresh;
  const nowMs = deps.nowMs ?? Date.now();
  const readLastRunMsFn = deps.readLastRunMsFn || readLastRunMs;
  const writeLastRunMsFn = deps.writeLastRunMsFn || writeLastRunMs;

  const toolName = getToolName(input);
  const toolInput = getToolInput(input);
  const filePath = extractFilePath(toolInput);

  if (!isEnabled() || !shouldRefreshRegistry(toolName, filePath)) {
    return { refreshed: false, reason: 'not_applicable' };
  }

  const lastRunMs = readLastRunMsFn();
  if (nowMs - lastRunMs < DEFAULT_DEBOUNCE_MS) {
    return { refreshed: false, reason: 'debounced' };
  }

  const result = runRegistryRefreshFn();
  writeLastRunMsFn(nowMs);

  if (result.status !== 0) {
    return {
      refreshed: false,
      reason: 'generator_failed',
      stderr: result.stderr || result.stdout || 'unknown error',
    };
  }

  return { refreshed: true, reason: 'ok' };
}

async function main() {
  const input = (await parseHookInputAsync()) || {};
  const outcome = processHookInput(input);
  if (outcome.reason === 'generator_failed') {
    process.stderr.write(
      `[agent-registry-auto-refresh] registry refresh failed (non-blocking): ${outcome.stderr || 'unknown error'}\n`
    );
  }

  process.stdout.write(formatResult('allow'));
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`[agent-registry-auto-refresh] ${error.message}\n`);
    process.stdout.write(formatResult('allow'));
  });
}

module.exports = {
  isEnabled,
  normalizeFilePath,
  shouldRefreshRegistry,
  readLastRunMs,
  writeLastRunMs,
  runRegistryRefresh,
  processHookInput,
  main,
};
