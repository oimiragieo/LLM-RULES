#!/usr/bin/env node
'use strict';
/**
 * wave-executor — Pre-Execute Hook
 * Validates that plan file is provided and the SDK is available.
 */

const fs = require('node:fs');
const path = require('node:path');

function parseInput() {
  const raw = process.argv.length > 2 ? process.argv.slice(2).join(' ') : '{}';
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function findProjectRoot() {
  let dir = __dirname;
  const root = path.parse(dir).root;
  while (dir && dir !== root) {
    if (fs.existsSync(path.join(dir, '.claude'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

function validateInput(input) {
  const errors = [];
  const warnings = [];

  if (input && typeof input !== 'object') {
    errors.push('Input must be an object');
    return { errors, warnings };
  }

  // Validate plan file
  if (input.plan) {
    const resolved = path.resolve(input.plan);
    if (!fs.existsSync(resolved)) {
      errors.push(`Plan file not found: ${resolved}`);
    } else {
      try {
        const content = JSON.parse(fs.readFileSync(resolved, 'utf8'));
        if (!content.waves || !Array.isArray(content.waves)) {
          errors.push('Plan file must contain a "waves" array');
        } else if (content.waves.length === 0) {
          errors.push('Plan file "waves" array is empty');
        } else {
          warnings.push(`Plan loaded: ${content.waves.length} waves, ${content.waves.reduce((sum, w) => sum + (w.skills?.length || 0), 0)} total skills`);
        }
      } catch (err) {
        errors.push(`Invalid plan file: ${err.message}`);
      }
    }
  }

  // Check SDK availability
  try {
    require.resolve('@anthropic-ai/claude-agent-sdk');
  } catch {
    errors.push('Claude Agent SDK not installed. Run: pnpm add @anthropic-ai/claude-agent-sdk');
  }

  // Check CLI tool exists
  const projectRoot = findProjectRoot();
  const cliTool = path.join(projectRoot, '.claude', 'tools', 'cli', 'wave-executor.mjs');
  if (!fs.existsSync(cliTool)) {
    errors.push(`CLI tool not found: ${cliTool}`);
  }

  return { errors, warnings };
}

const input = parseInput();
const { errors, warnings } = validateInput(input);

if (warnings.length > 0) {
  console.log('[wave-executor] Pre-execute:');
  for (const w of warnings) console.log(`  - ${w}`);
}

if (errors.length > 0) {
  console.error('[wave-executor] Pre-execute validation failed:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log('[wave-executor] Pre-execute validation passed');
