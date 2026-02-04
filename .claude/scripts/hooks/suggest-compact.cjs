#!/usr/bin/env node
'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');

const {
  parseHookInputSync,
  getToolName,
  debugLog,
} = require('../../lib/utils/hook-input.cjs');

const DEFAULT_THRESHOLD = 50;
const DEFAULT_INTERVAL = 25;

function isEnabled() {
  const flag = String(process.env.STRATEGIC_COMPACT_ENABLED || '').toLowerCase();
  return flag === 'true' || flag === '1' || flag === 'yes';
}

function getCounterFile() {
  if (process.env.COMPACT_COUNTER_FILE) {
    return process.env.COMPACT_COUNTER_FILE;
  }
  const sessionId = process.env.CLAUDE_SESSION_ID || String(process.ppid || 'default');
  return path.join(os.tmpdir(), `claude-tool-count-${sessionId}`);
}

function readCount(filePath) {
  try {
    if (!fs.existsSync(filePath)) return 0;
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch (_err) {
    return 0;
  }
}

function writeCount(filePath, count) {
  try {
    fs.writeFileSync(filePath, String(count), 'utf8');
  } catch (err) {
    debugLog('suggest-compact', 'Failed to write counter file', err);
  }
}

function maybeSuggestCompact() {
  if (!isEnabled()) return null;

  const threshold = Number.parseInt(process.env.COMPACT_THRESHOLD || `${DEFAULT_THRESHOLD}`, 10);
  const interval = Number.parseInt(process.env.COMPACT_REMINDER_INTERVAL || `${DEFAULT_INTERVAL}`, 10);
  const counterFile = getCounterFile();

  const current = readCount(counterFile);
  const next = current + 1;
  writeCount(counterFile, next);

  if (next === threshold) {
    return `[StrategicCompact] ${threshold} tool calls reached - consider /compact if transitioning phases`;
  }

  if (next > threshold && interval > 0 && next % interval === 0) {
    return `[StrategicCompact] ${next} tool calls - good checkpoint for /compact if context is stale`;
  }

  return null;
}

function handleHookInput(input) {
  if (!input) return;
  const toolName = getToolName(input);
  if (toolName !== 'Edit' && toolName !== 'Write' && toolName !== 'NotebookEdit') return;

  const message = maybeSuggestCompact();
  if (message) {
    console.error(message);
  }
}

function main() {
  const input = parseHookInputSync();
  if (!input) process.exit(0);
  handleHookInput(input);
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
  handleHookInput,
  maybeSuggestCompact,
  getCounterFile,
};
