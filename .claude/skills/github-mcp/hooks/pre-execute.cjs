#!/usr/bin/env node
'use strict';

/**
 * github-mcp - Pre-Execute Hook
 * Validates prerequisites before the GitHub MCP skill executes.
 *
 * Checks:
 *   1. GITHUB_PERSONAL_ACCESS_TOKEN environment variable is set
 *   2. Input context is valid JSON (if provided)
 */

const path = require('node:path');
const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');

// ─── Input parsing ─────────────────────────────────────────────────────────────

function parseInput() {
  const raw = process.argv.length > 2 ? process.argv.slice(2).join(' ') : '{}';
  try {
    return safeParseJSON(raw) || {};
  } catch (_err) {
    return {};
  }
}

// ─── Validation ────────────────────────────────────────────────────────────────

function validateInput(input) {
  const errors = [];
  const warnings = [];

  // Check GitHub token is available (required for MCP server)
  if (!process.env.GITHUB_PERSONAL_ACCESS_TOKEN) {
    warnings.push('GITHUB_PERSONAL_ACCESS_TOKEN is not set; GitHub MCP operations may fail');
  }

  // Validate context shape if provided
  if (input && typeof input === 'object') {
    // If toolsets are specified, validate they are an array or string
    if (input.toolsets !== undefined) {
      const ts = input.toolsets;
      if (!Array.isArray(ts) && typeof ts !== 'string') {
        errors.push('toolsets must be an array or comma-separated string');
      }
    }

    // If readOnly mode is specified, validate it's a boolean
    if (input.readOnly !== undefined && typeof input.readOnly !== 'boolean') {
      errors.push('readOnly must be a boolean');
    }
  }

  return { errors, warnings };
}

// ─── Main ──────────────────────────────────────────────────────────────────────

const input = parseInput();
const { errors, warnings } = validateInput(input);

console.log('[GITHUB-MCP] Pre-execute validation...');

if (warnings.length > 0) {
  for (const w of warnings) {
    console.warn(`[GITHUB-MCP] Warning: ${w}`);
  }
}

if (errors.length > 0) {
  console.error('[GITHUB-MCP] Validation failed:');
  for (const e of errors) {
    console.error(`  - ${e}`);
  }
  process.exit(1);
}

console.log('[GITHUB-MCP] Validation passed');
process.exit(0);
