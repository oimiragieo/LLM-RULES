#!/usr/bin/env node
'use strict';

/**
 * github-ops companion tool
 *
 * Workflow for repository reconnaissance and operations using GitHub CLI (gh).
 * Wraps `gh` CLI commands and returns structured JSON output.
 *
 * Usage:
 *   node github-ops.cjs --help
 *   node github-ops.cjs --list-prs [--state open|closed|merged|all]
 *   node github-ops.cjs --pr-status <number>
 *   node github-ops.cjs --pr-diff <number>
 *   node github-ops.cjs --repo-info
 */

const { spawnSync } = require('node:child_process');

// ─── Argument parsing ──────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    opts[key] = next && !next.startsWith('--') ? (++i, next) : true;
  }
  return opts;
}

// ─── gh CLI helper ─────────────────────────────────────────────────────────────

/**
 * Run a gh CLI command and return parsed output.
 * @param {string[]} args
 * @returns {{ ok: boolean, data: unknown, stderr: string }}
 */
function gh(args) {
  const result = spawnSync('gh', args, { encoding: 'utf8' });
  if (result.error) {
    return { ok: false, data: null, stderr: result.error.message };
  }
  if (result.status !== 0) {
    return { ok: false, data: null, stderr: (result.stderr || '').trim() };
  }
  const stdout = (result.stdout || '').trim();
  // Try to parse as JSON; fall back to raw string
  try {
    return { ok: true, data: JSON.parse(stdout), stderr: '' };
  } catch (_) {
    return { ok: true, data: stdout, stderr: '' };
  }
}

// ─── Commands ─────────────────────────────────────────────────────────────────

function listPRs(state) {
  const s = state || 'open';
  const validStates = ['open', 'closed', 'merged', 'all'];
  if (!validStates.includes(s)) {
    return { ok: false, error: `Invalid state "${s}". Valid: ${validStates.join(', ')}` };
  }
  const result = gh([
    'pr',
    'list',
    '--state',
    s,
    '--json',
    'number,title,state,author,createdAt,headRefName',
  ]);
  if (!result.ok) {
    return { ok: false, error: result.stderr || 'gh pr list failed' };
  }
  return { ok: true, prs: result.data };
}

function getPRStatus(prNumber) {
  const num = parseInt(prNumber, 10);
  if (!Number.isInteger(num) || num < 1) {
    return { ok: false, error: 'prNumber must be a positive integer' };
  }
  const result = gh([
    'pr',
    'view',
    String(num),
    '--json',
    'number,title,state,author,body,baseRefName,headRefName,mergeable,createdAt,updatedAt',
  ]);
  if (!result.ok) {
    return { ok: false, error: result.stderr || `gh pr view ${num} failed` };
  }
  return { ok: true, pr: result.data };
}

function getPRDiff(prNumber) {
  const num = parseInt(prNumber, 10);
  if (!Number.isInteger(num) || num < 1) {
    return { ok: false, error: 'prNumber must be a positive integer' };
  }
  const result = gh(['pr', 'diff', String(num)]);
  if (!result.ok) {
    return { ok: false, error: result.stderr || `gh pr diff ${num} failed` };
  }
  return { ok: true, diff: result.data };
}

function getRepoInfo() {
  const result = gh([
    'repo',
    'view',
    '--json',
    'name,owner,description,defaultBranchRef,isPrivate,url',
  ]);
  if (!result.ok) {
    return { ok: false, error: result.stderr || 'gh repo view failed' };
  }
  return { ok: true, repo: result.data };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    console.log(`
github-ops — GitHub CLI companion tool

Usage:
  node github-ops.cjs --help
  node github-ops.cjs --list-prs [--state open|closed|merged|all]
  node github-ops.cjs --pr-status <number>
  node github-ops.cjs --pr-diff <number>
  node github-ops.cjs --repo-info

Output:
  All commands output JSON to stdout.
  Exit 0 on success, 1 on error.

Prerequisites:
  - gh CLI installed and authenticated (gh auth login)
  - Run from within a git repository
`);
    process.exit(0);
  }

  let output;

  if (opts['list-prs'] !== undefined) {
    output = listPRs(opts.state);
  } else if (opts['pr-status'] !== undefined) {
    output = getPRStatus(opts['pr-status']);
  } else if (opts['pr-diff'] !== undefined) {
    output = getPRDiff(opts['pr-diff']);
  } else if (opts['repo-info'] !== undefined) {
    output = getRepoInfo();
  } else {
    // Default: show repo info
    output = getRepoInfo();
  }

  console.log(JSON.stringify(output, null, 2));

  if (!output.ok) {
    process.exit(1);
  }
  process.exit(0);
}

main();
