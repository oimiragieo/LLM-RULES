#!/usr/bin/env node
/**
 * Recurring Issue Detector Hook
 * ==============================
 *
 * PostToolUse hook on all tools. Every 50th invocation, scans recent
 * error-metrics.jsonl for recurring patterns (3+ occurrences of same
 * tool+errorType). New patterns are appended to detected-issues.jsonl
 * with deduplication via hash.
 *
 * Fail-open: exits 0 on all errors (advisory hook).
 *
 * Trigger: PostToolUse (all tools)
 *
 * @module recurring-issue-detector
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const { parseHookInputAsync, formatResult, debugLog } = require('../../lib/utils/hook-input.cjs');

const HOOK_NAME = 'recurring-issue-detector';
const INVOCATION_THRESHOLD = 50;
const MIN_OCCURRENCES = 3;
const MAX_ERROR_LINES = 100;

/**
 * Read the last N lines of a file.
 */
function readLastLines(filePath, maxLines) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.trim()) return [];
    const lines = content.split('\n').filter(Boolean);
    return lines.slice(-maxLines);
  } catch (_err) {
    return [];
  }
}

/**
 * Parse JSONL lines into objects.
 */
function parseJsonlLines(lines) {
  const results = [];
  for (const line of lines) {
    const parsed = safeParseJSON(line, null);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      results.push(parsed);
    }
  }
  return results;
}

/**
 * Read the invocation counter. Returns the current count.
 */
function readCounter(counterPath) {
  try {
    if (!fs.existsSync(counterPath)) return 0;
    const content = fs.readFileSync(counterPath, 'utf8').trim();
    const num = parseInt(content, 10);
    return Number.isFinite(num) ? num : 0;
  } catch (_err) {
    return 0;
  }
}

/**
 * Write the invocation counter.
 */
function writeCounter(counterPath, value) {
  fs.mkdirSync(path.dirname(counterPath), { recursive: true });
  fs.writeFileSync(counterPath, String(value), 'utf8');
}

/**
 * Create a deterministic hash for a recurring pattern.
 */
function hashPattern(tool, errorType, messagePrefix) {
  const input = `${tool}|${errorType}|${messagePrefix}`;
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}

/**
 * Extract first 80 chars of a message for grouping.
 */
function messagePrefix(msg) {
  const str = String(msg || '').trim();
  return str.length > 80 ? str.slice(0, 80) : str;
}

/**
 * Read existing hashes from detected-issues.jsonl for dedup.
 */
function readExistingHashes(issuesPath) {
  const hashes = new Set();
  const lines = readLastLines(issuesPath, 500);
  const entries = parseJsonlLines(lines);
  for (const entry of entries) {
    if (entry.hash) {
      hashes.add(entry.hash);
    }
  }
  return hashes;
}

/**
 * Core processing logic — exported for testability.
 *
 * @param {Object} _hookInput - Parsed hook input (unused beyond triggering)
 * @param {string} [projectRoot] - Override for project root (testing)
 * @param {Object} [options] - Test overrides
 * @param {number} [options.counterOverride] - Force counter value
 * @returns {{ scanned: boolean, newIssues: number, reason: string }}
 */
function processHookInput(_hookInput, projectRoot, options) {
  const root = projectRoot || PROJECT_ROOT;
  const runtimeDir = path.join(root, '.claude', 'context', 'runtime');
  const metricsDir = path.join(root, '.claude', 'context', 'metrics');

  const counterPath = path.join(runtimeDir, 'issue-detector-counter.txt');

  // --- 1. Increment counter ---
  let count;
  if (options && typeof options.counterOverride === 'number') {
    count = options.counterOverride;
  } else {
    count = readCounter(counterPath) + 1;
  }
  writeCounter(counterPath, count);

  // --- 2. Check if this is the Nth invocation ---
  if (count % INVOCATION_THRESHOLD !== 0) {
    return { scanned: false, newIssues: 0, reason: 'not_threshold' };
  }

  // --- 3. Read last 100 lines of error-metrics.jsonl ---
  const errorMetricsPath = path.join(metricsDir, 'error-metrics.jsonl');
  const lines = readLastLines(errorMetricsPath, MAX_ERROR_LINES);
  const errors = parseJsonlLines(lines);

  if (errors.length === 0) {
    return { scanned: true, newIssues: 0, reason: 'no_errors' };
  }

  // --- 4. Group by tool+errorType+messagePrefix ---
  const groups = Object.create(null);
  for (const err of errors) {
    const tool = err.tool || err.tool_name || 'unknown';
    const errorType = err.errorType || err.type || 'unknown';
    const msgPfx = messagePrefix(err.message || err.error);
    const key = `${tool}|${errorType}|${msgPfx}`;
    if (!groups[key]) {
      groups[key] = {
        tool,
        errorType,
        messagePrefix: msgPfx,
        count: 0,
        firstSeen: err.timestamp || null,
        lastSeen: err.timestamp || null,
      };
    }
    groups[key].count += 1;
    groups[key].lastSeen = err.timestamp || groups[key].lastSeen;
  }

  // --- 5. Filter for 3+ occurrences ---
  const recurring = Object.values(groups).filter(g => g.count >= MIN_OCCURRENCES);

  if (recurring.length === 0) {
    return { scanned: true, newIssues: 0, reason: 'no_recurring' };
  }

  // --- 6. Dedup against existing detected-issues.jsonl ---
  fs.mkdirSync(runtimeDir, { recursive: true });
  const issuesPath = path.join(runtimeDir, 'detected-issues.jsonl');
  const existingHashes = readExistingHashes(issuesPath);

  let newIssues = 0;
  const newEntries = [];
  for (const pattern of recurring) {
    const hash = hashPattern(pattern.tool, pattern.errorType, pattern.messagePrefix);
    if (existingHashes.has(hash)) continue;

    const entry = {
      hash,
      detectedAt: new Date().toISOString(),
      tool: pattern.tool,
      errorType: pattern.errorType,
      messagePrefix: pattern.messagePrefix,
      occurrences: pattern.count,
      firstSeen: pattern.firstSeen,
      lastSeen: pattern.lastSeen,
    };
    newEntries.push(JSON.stringify(entry));
    newIssues += 1;
  }

  // --- 7. Append new issues ---
  if (newEntries.length > 0) {
    fs.appendFileSync(issuesPath, newEntries.join('\n') + '\n', 'utf8');
  }

  return { scanned: true, newIssues, reason: 'ok' };
}

async function main() {
  try {
    const hookInput = await parseHookInputAsync();
    if (!hookInput) {
      console.log(formatResult({}));
      process.exit(0);
      return;
    }

    const result = processHookInput(hookInput);
    if (process.env.DEBUG_HOOKS === 'true') {
      debugLog(HOOK_NAME, 'processed', result);
    }

    console.log(formatResult({}));
    process.exit(0);
  } catch (err) {
    if (process.env.DEBUG_HOOKS === 'true') {
      debugLog(HOOK_NAME, 'error', err);
    }
    // Fail-open
    console.log(formatResult({}));
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  processHookInput,
  readCounter,
  writeCounter,
  hashPattern,
  INVOCATION_THRESHOLD,
  MIN_OCCURRENCES,
};
