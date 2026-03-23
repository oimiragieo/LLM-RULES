#!/usr/bin/env node
'use strict';
/**
 * wave-executor — Post-Execute Hook
 * Logs wave execution summary to memory.
 */

const fs = require('node:fs');
const path = require('node:path');
const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');

function findProjectRoot() {
  let dir = __dirname;
  const root = path.parse(dir).root;
  while (dir && dir !== root) {
    if (fs.existsSync(path.join(dir, '.claude'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

function parseInput() {
  const raw = process.argv.length > 2 ? process.argv.slice(2).join(' ') : '{}';
  try {
    return safeParseJSON(raw);
  } catch {
    return {};
  }
}

const input = parseInput();
const projectRoot = findProjectRoot();

// Record execution in learnings
try {
  const learningsPath = path.join(projectRoot, '.claude', 'context', 'memory', 'learnings.md');
  if (fs.existsSync(learningsPath)) {
    const timestamp = new Date().toISOString().slice(0, 10);
    const wavesCompleted = input.wavesCompleted || 0;
    const skillsProcessed = input.skillsProcessed || 0;
    const totalCost = input.totalCost || 'N/A';
    const entry = `\n## Wave Executor Run (${timestamp})\n- Waves completed: ${wavesCompleted}\n- Skills processed: ${skillsProcessed}\n- Cost: ${totalCost}\n`;
    fs.appendFileSync(learningsPath, entry, 'utf8');
  }
} catch {
  // Non-fatal — memory logging is best-effort
}

console.log('[wave-executor] Post-execute: execution logged');
