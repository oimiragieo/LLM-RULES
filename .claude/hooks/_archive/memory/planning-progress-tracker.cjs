#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const {
  parseHookInputSync,
  getToolName,
  getToolInput,
  extractFilePath,
  debugLog,
} = require('../../lib/utils/hook-input.cjs');

const PLAN_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'plans');
const STAMP_FILE = path.join(PLAN_DIR, '.last-plan-update.txt');
const TRACKED_FILES = new Set(['task_plan.md', 'progress.md']);

function isTrackedPlanFile(filePath) {
  if (!filePath) return false;
  const normalized = path.normalize(filePath);
  const planDirNormalized = path.normalize(PLAN_DIR);
  if (!normalized.startsWith(planDirNormalized)) return false;
  const base = path.basename(normalized);
  return TRACKED_FILES.has(base);
}

function appendStamp(filePath) {
  try {
    if (!fs.existsSync(PLAN_DIR)) {
      fs.mkdirSync(PLAN_DIR, { recursive: true });
    }
    const base = path.basename(filePath);
    const line = `${new Date().toISOString()} ${base}\n`;
    fs.appendFileSync(STAMP_FILE, line, 'utf8');
  } catch (err) {
    debugLog('planning-progress-tracker', 'Failed to append update stamp', err);
  }
}

function handleHookInput(input) {
  if (!input) return;
  const toolName = getToolName(input);
  if (toolName !== 'Edit' && toolName !== 'Write' && toolName !== 'NotebookEdit') return;
  const toolInput = getToolInput(input);
  const filePath = extractFilePath(toolInput);
  if (!isTrackedPlanFile(filePath)) return;
  appendStamp(filePath);
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

module.exports = { main, handleHookInput, isTrackedPlanFile };
