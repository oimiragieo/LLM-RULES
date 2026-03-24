#!/usr/bin/env node
'use strict';

/**
 * channel-management/hooks/pre-execute.cjs
 *
 * Pre-execution validation hook for the channel-management skill.
 * Validates input against schemas/input.schema.json before any channel
 * lifecycle operation runs.
 *
 * Exit codes:
 *   0 — validation passed, allow execution
 *   2 — validation failed, block execution
 */

const path = require('path');
const fs = require('fs');

const SCHEMA_PATH = path.resolve(__dirname, '../schemas/input.schema.json');

function preExecute(input = {}) {
  // Load schema
  if (!fs.existsSync(SCHEMA_PATH)) {
    process.stderr.write('[channel-management/pre-execute] Schema not found — allowing\n');
    return { continue: true };
  }

  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  const errors = [];

  // Validate required: action
  if (!input.action) {
    errors.push('"action" is required');
  } else {
    const validActions = schema.properties.action.enum;
    if (!validActions.includes(input.action)) {
      errors.push(`"action" must be one of: ${validActions.join(', ')} — got: "${input.action}"`);
    }
  }

  // For "start" action, warn if TELEGRAM_BOT_TOKEN is absent
  if (input.action === 'start') {
    const envPath = path.resolve(__dirname, '../../../../.env');
    let token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token && fs.existsSync(envPath)) {
      for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('TELEGRAM_BOT_TOKEN=')) {
          token = trimmed.slice('TELEGRAM_BOT_TOKEN='.length).trim();
          break;
        }
      }
    }
    if (!token) {
      process.stderr.write(
        '[channel-management/pre-execute] WARNING: TELEGRAM_BOT_TOKEN not set — start action will be skipped\n'
      );
      // Not a hard block — channel-manager handles this gracefully
    }
  }

  if (errors.length > 0) {
    process.stderr.write(
      `[channel-management/pre-execute] Input validation failed:\n  ${errors.join('\n  ')}\n`
    );
    process.exit(2);
  }

  return { continue: true };
}

// If run directly from CLI
if (require.main === module) {
  let rawInput = '';
  process.stdin.on('data', chunk => {
    rawInput += chunk;
  });
  process.stdin.on('end', () => {
    try {
      const input = rawInput.trim() ? JSON.parse(rawInput) : {};
      preExecute(input);
      process.exit(0);
    } catch (err) {
      process.stderr.write(`[channel-management/pre-execute] Parse error: ${err.message}\n`);
      process.exit(0); // fail-open on parse error
    }
  });
}

module.exports = { preExecute };
