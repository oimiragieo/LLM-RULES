#!/usr/bin/env node

/**
 * tdd - Pre-Execute Hook
 * Validates TDD invocation shape and surfaces lightweight memory hints.
 */

const fs = require('node:fs');
const path = require('node:path');

const MAX_PROFILE_BYTES = 16 * 1024;

function parseInput() {
  const raw = process.argv.length > 2 ? process.argv.slice(2).join(' ') : '{}';
  try {
    return JSON.parse(raw);
  } catch (_err) {
    return {};
  }
}

function validateInput(input) {
  const errors = [];
  const warnings = [];

  if (input && typeof input !== 'object') {
    errors.push('Input must be an object');
    return { errors, warnings };
  }

  if (Array.isArray(input.scenarioBacklog) && input.scenarioBacklog.length === 0) {
    warnings.push('scenarioBacklog is present but empty');
  }

  if (input.repairBudget !== undefined) {
    if (!Number.isInteger(input.repairBudget) || input.repairBudget < 1 || input.repairBudget > 5) {
      errors.push('repairBudget must be an integer between 1 and 5');
    }
  }

  if (input.mode !== undefined && !['single_cycle', 'full_task'].includes(input.mode)) {
    errors.push('mode must be one of: single_cycle, full_task');
  }

  return { errors, warnings };
}

function findProjectRoot() {
  let dir = __dirname;
  const root = path.parse(dir).root;
  while (dir && dir !== root) {
    if (fs.existsSync(path.join(dir, '.claude'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

function resolveProfilePath() {
  if (process.env.TDD_MEMORY_PROFILE_PATH) {
    return process.env.TDD_MEMORY_PROFILE_PATH;
  }
  return path.join(findProjectRoot(), '.claude', 'context', 'runtime', 'tdd-memory-profile.json');
}

function loadMemoryWarnings() {
  const warnings = [];
  const profilePath = resolveProfilePath();
  if (!fs.existsSync(profilePath)) {
    return warnings;
  }

  try {
    const stat = fs.statSync(profilePath);
    if (stat.size > MAX_PROFILE_BYTES) {
      warnings.push(`tdd-memory-profile exceeds ${MAX_PROFILE_BYTES} bytes; trim stale entries`);
      return warnings;
    }

    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    const commandHints = profile.commandHints || {};
    if (typeof commandHints.testCommand === 'string' && commandHints.testCommand.trim()) {
      warnings.push(`memory hint: test command -> ${commandHints.testCommand}`);
    }
    if (typeof commandHints.lintCommand === 'string' && commandHints.lintCommand.trim()) {
      warnings.push(`memory hint: lint command -> ${commandHints.lintCommand}`);
    }
    if (typeof commandHints.formatCommand === 'string' && commandHints.formatCommand.trim()) {
      warnings.push(`memory hint: format command -> ${commandHints.formatCommand}`);
    }
  } catch (_err) {
    warnings.push('tdd-memory-profile is invalid JSON; ignoring memory acceleration');
  }

  return warnings;
}

const input = parseInput();
const { errors, warnings } = validateInput(input);
const allWarnings = [...warnings, ...loadMemoryWarnings()];

if (allWarnings.length > 0) {
  console.log('[TDD] Pre-execute warnings:');
  for (const warning of allWarnings) {
    console.log(`- ${warning}`);
  }
}

if (errors.length > 0) {
  console.error('[TDD] Pre-execute validation failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('[TDD] Pre-execute validation passed');
