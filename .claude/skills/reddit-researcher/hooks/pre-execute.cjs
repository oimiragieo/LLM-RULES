#!/usr/bin/env node
'use strict';
const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');

/**
 * reddit-researcher pre-execute hook
 * Validates input against schema (AJV) and enforces SSRF allowlist.
 * Fail-closed: exits with code 2 on any violation.
 *
 * Usage (hook protocol — input passed as first CLI argument):
 *   node pre-execute.cjs '{"action":"search","query":"test"}'
 */

// ---------------------------------------------------------------------------
// SSRF allowlist
// ---------------------------------------------------------------------------
const ALLOWED_REDDIT_HOSTS = new Set(['reddit.com', 'www.reddit.com', 'old.reddit.com']);

function validateUrl(href) {
  let parsed;
  try {
    parsed = new URL(href);
  } catch {
    return `Invalid URL: ${href}`;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return `Protocol not allowed: ${parsed.protocol}`;
  }
  if (!ALLOWED_REDDIT_HOSTS.has(parsed.hostname)) {
    return `Hostname not in SSRF allowlist: ${parsed.hostname}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Minimal schema validation (no AJV dependency — validates key constraints)
// ---------------------------------------------------------------------------
const VALID_ACTIONS = new Set(['search', 'subreddit', 'post']);
const SUBREDDIT_RE = /^[A-Za-z0-9_]{1,50}$/;
const POST_ID_RE = /^[a-z0-9]{4,10}$/;

function validateBase(input, errors) {
  if (!input || typeof input !== 'object') {
    errors.push('Input must be an object');
    return false;
  }
  if (!input.action) {
    errors.push('action is required');
  } else if (!VALID_ACTIONS.has(input.action)) {
    errors.push(`action must be one of: ${[...VALID_ACTIONS].join(', ')}`);
  }
  return true;
}

function validateFormat(input, errors) {
  if (
    input.subreddit !== undefined &&
    (typeof input.subreddit !== 'string' || !SUBREDDIT_RE.test(input.subreddit))
  ) {
    errors.push('subreddit must match pattern ^[A-Za-z0-9_]{1,50}$');
  }
  if (input.query !== undefined) {
    if (typeof input.query !== 'string') errors.push('query must be a string');
    else if (input.query.length > 200) errors.push('query must be 200 characters or less');
  }
  if (
    input.postId !== undefined &&
    (typeof input.postId !== 'string' || !POST_ID_RE.test(input.postId))
  ) {
    errors.push('postId must match pattern ^[a-z0-9]{4,10}$');
  }
  if (input.limit !== undefined) {
    const limit = Number(input.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 25)
      errors.push('limit must be an integer between 1 and 25');
  }
}

function validateActionSpecific(input, errors) {
  if (input.action === 'search' && !input.query) errors.push('query is required for search action');
  if (input.action === 'subreddit' && !input.subreddit)
    errors.push('subreddit is required for subreddit action');
  if (input.action === 'post') {
    if (!input.subreddit) errors.push('subreddit is required for post action');
    if (!input.postId) errors.push('postId is required for post action');
  }
}

function validateInput(input) {
  const errors = [];
  if (!validateBase(input, errors)) return errors;

  validateFormat(input, errors);

  // SSRF check: validate any url field
  if (input.url) {
    const urlError = validateUrl(input.url);
    if (urlError) errors.push(urlError);
  }

  validateActionSpecific(input, errors);
  return errors;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
try {
  const rawInput = process.argv[2] || '{}';
  let input;
  try {
    input = safeParseJSON(rawInput);
  } catch {
    process.stderr.write('[reddit-researcher/pre-execute] Invalid JSON input\n');
    process.exit(2);
  }

  const errors = validateInput(input);
  if (errors.length > 0) {
    process.stderr.write(
      `[reddit-researcher/pre-execute] Validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}\n`
    );
    process.exit(2);
  }

  process.stdout.write('[reddit-researcher/pre-execute] Validation passed\n');
  process.exit(0);
} catch (err) {
  // Fail-closed on unexpected errors
  process.stderr.write(`[reddit-researcher/pre-execute] Unexpected error: ${err.message}\n`);
  process.exit(2);
}
