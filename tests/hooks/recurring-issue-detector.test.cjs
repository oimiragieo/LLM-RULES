#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  processHookInput,
  readCounter,
  writeCounter,
  hashPattern,
  INVOCATION_THRESHOLD,
  MIN_OCCURRENCES: _MIN_OCCURRENCES,
} = require('../../.claude/hooks/monitoring/recurring-issue-detector.cjs');

function mkProjectRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recurring-issue-detector-'));
  fs.mkdirSync(path.join(root, '.claude', 'context', 'metrics'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(root, '.claude', 'context', 'runtime'), {
    recursive: true,
  });
  return root;
}

function writeJsonl(filePath, entries) {
  fs.writeFileSync(filePath, entries.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf8');
}

test('skips when not at threshold', () => {
  const root = mkProjectRoot();
  const result = processHookInput({ tool_name: 'Read' }, root, {
    counterOverride: 1,
  });
  assert.equal(result.scanned, false);
  assert.equal(result.reason, 'not_threshold');
});

test('scans at threshold (50th invocation)', () => {
  const root = mkProjectRoot();
  // counterOverride of 49 means the hook increments to 50 internally,
  // but we use counterOverride to set the value directly. Since processHookInput
  // writes the counter directly when counterOverride is set, 50 % 50 === 0.
  const result = processHookInput({ tool_name: 'Read' }, root, {
    counterOverride: INVOCATION_THRESHOLD,
  });
  assert.equal(result.scanned, true);
  assert.equal(result.reason, 'no_errors');
});

test('detects recurring errors at threshold', () => {
  const root = mkProjectRoot();
  const metricsDir = path.join(root, '.claude', 'context', 'metrics');

  // Create 4 identical errors (above MIN_OCCURRENCES=3)
  const errors = [];
  for (let i = 0; i < 4; i++) {
    errors.push({
      tool: 'Edit',
      errorType: 'file_not_found',
      message: 'File not found: src/missing.js',
      timestamp: `2026-01-01T00:0${i}:00Z`,
    });
  }
  // Add 2 unique errors (below threshold)
  errors.push({
    tool: 'Bash',
    errorType: 'timeout',
    message: 'Command timed out',
    timestamp: '2026-01-01T01:00:00Z',
  });
  errors.push({
    tool: 'Bash',
    errorType: 'timeout',
    message: 'Command timed out',
    timestamp: '2026-01-01T01:01:00Z',
  });

  writeJsonl(path.join(metricsDir, 'error-metrics.jsonl'), errors);

  const result = processHookInput({ tool_name: 'Read' }, root, {
    counterOverride: INVOCATION_THRESHOLD,
  });
  assert.equal(result.scanned, true);
  assert.equal(result.newIssues, 1); // Only the Edit pattern (4 >= 3)

  // Verify the file was written
  const issuesPath = path.join(root, '.claude', 'context', 'runtime', 'detected-issues.jsonl');
  assert.ok(fs.existsSync(issuesPath));
  const lines = fs.readFileSync(issuesPath, 'utf8').split('\n').filter(Boolean);
  assert.equal(lines.length, 1);
  const issue = JSON.parse(lines[0]);
  assert.equal(issue.tool, 'Edit');
  assert.equal(issue.errorType, 'file_not_found');
  assert.equal(issue.occurrences, 4);
  assert.ok(issue.hash);
});

test('deduplicates already-detected issues', () => {
  const root = mkProjectRoot();
  const metricsDir = path.join(root, '.claude', 'context', 'metrics');
  const runtimeDir = path.join(root, '.claude', 'context', 'runtime');

  // Create recurring errors
  const errors = [];
  for (let i = 0; i < 5; i++) {
    errors.push({
      tool: 'Write',
      errorType: 'permission_denied',
      message: 'Permission denied: /etc/passwd',
      timestamp: `2026-01-01T00:0${i}:00Z`,
    });
  }
  writeJsonl(path.join(metricsDir, 'error-metrics.jsonl'), errors);

  // Pre-populate detected-issues.jsonl with the same hash
  const existingHash = hashPattern('Write', 'permission_denied', 'Permission denied: /etc/passwd');
  const existing = {
    hash: existingHash,
    detectedAt: '2026-01-01T00:00:00Z',
    tool: 'Write',
    errorType: 'permission_denied',
  };
  fs.writeFileSync(
    path.join(runtimeDir, 'detected-issues.jsonl'),
    JSON.stringify(existing) + '\n',
    'utf8'
  );

  const result = processHookInput({ tool_name: 'Read' }, root, {
    counterOverride: INVOCATION_THRESHOLD,
  });
  assert.equal(result.scanned, true);
  assert.equal(result.newIssues, 0); // Already detected

  // File should still have only 1 line
  const lines = fs
    .readFileSync(path.join(runtimeDir, 'detected-issues.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean);
  assert.equal(lines.length, 1);
});

test('counter file increments correctly', () => {
  const root = mkProjectRoot();
  const counterPath = path.join(
    root,
    '.claude',
    'context',
    'runtime',
    'issue-detector-counter.txt'
  );

  assert.equal(readCounter(counterPath), 0);
  writeCounter(counterPath, 5);
  assert.equal(readCounter(counterPath), 5);
  writeCounter(counterPath, 100);
  assert.equal(readCounter(counterPath), 100);
});

test('hashPattern is deterministic', () => {
  const h1 = hashPattern('Edit', 'file_not_found', 'File not found');
  const h2 = hashPattern('Edit', 'file_not_found', 'File not found');
  const h3 = hashPattern('Edit', 'timeout', 'File not found');
  assert.equal(h1, h2);
  assert.notEqual(h1, h3);
  assert.equal(h1.length, 16);
});

test('handles missing error-metrics file gracefully', () => {
  const root = mkProjectRoot();
  // No error-metrics.jsonl exists
  const result = processHookInput({ tool_name: 'Read' }, root, {
    counterOverride: INVOCATION_THRESHOLD,
  });
  assert.equal(result.scanned, true);
  assert.equal(result.newIssues, 0);
  assert.equal(result.reason, 'no_errors');
});

test('handles malformed JSONL lines gracefully', () => {
  const root = mkProjectRoot();
  const metricsDir = path.join(root, '.claude', 'context', 'metrics');

  // Mix valid and invalid lines
  const content = [
    JSON.stringify({
      tool: 'Edit',
      errorType: 'err',
      message: 'fail',
    }),
    'not valid json {{{',
    JSON.stringify({
      tool: 'Edit',
      errorType: 'err',
      message: 'fail',
    }),
    '',
    JSON.stringify({
      tool: 'Edit',
      errorType: 'err',
      message: 'fail',
    }),
  ].join('\n');

  fs.writeFileSync(path.join(metricsDir, 'error-metrics.jsonl'), content, 'utf8');

  const result = processHookInput({ tool_name: 'Read' }, root, {
    counterOverride: INVOCATION_THRESHOLD,
  });
  assert.equal(result.scanned, true);
  assert.equal(result.newIssues, 1); // 3 valid entries with same pattern
});
