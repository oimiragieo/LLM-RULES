'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');

const HOOK_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'monitoring',
  'context-window-monitor.cjs'
);

const RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
const BUDGET_TRACKER = path.join(RUNTIME_DIR, 'budget-tracker.json');
const SESSION_ID_FILE = path.join(RUNTIME_DIR, 'session-id.json');

let savedBudgetTracker = null;
let savedSessionId = null;

/**
 * Run the hook process with a given stdin payload and optional env overrides.
 */
function runHook(input = '{}', env = {}) {
  return spawnSync(process.execPath, [HOOK_PATH], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env, ...env },
  });
}

/**
 * Write a session + budget tracker fixture so the hook sees a known token count.
 */
function setTokenUsage(tokensUsed, budget = 200000) {
  const sessionId = 'test-session-abc123';
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });

  fs.writeFileSync(SESSION_ID_FILE, JSON.stringify({ sessionId }), 'utf8');
  fs.writeFileSync(
    BUDGET_TRACKER,
    JSON.stringify({
      [sessionId]: { totalTokens: tokensUsed, budget },
    }),
    'utf8'
  );

  return sessionId;
}

beforeEach(() => {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });

  // Back up existing files
  savedBudgetTracker = fs.existsSync(BUDGET_TRACKER)
    ? fs.readFileSync(BUDGET_TRACKER, 'utf8')
    : null;
  savedSessionId = fs.existsSync(SESSION_ID_FILE)
    ? fs.readFileSync(SESSION_ID_FILE, 'utf8')
    : null;
});

afterEach(() => {
  // Restore original files
  if (savedBudgetTracker !== null) {
    fs.writeFileSync(BUDGET_TRACKER, savedBudgetTracker, 'utf8');
  } else if (fs.existsSync(BUDGET_TRACKER)) {
    fs.rmSync(BUDGET_TRACKER);
  }

  if (savedSessionId !== null) {
    fs.writeFileSync(SESSION_ID_FILE, savedSessionId, 'utf8');
  } else if (fs.existsSync(SESSION_ID_FILE)) {
    fs.rmSync(SESSION_ID_FILE);
  }
});

test('should exit 0 with no additionalContext when usage is below 65%', () => {
  // 50% used = 100K / 200K
  setTokenUsage(100_000, 200_000);

  const result = runHook(JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Bash' }));

  assert.strictEqual(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);

  const output = JSON.parse(result.stdout);
  assert.ok(!output.additionalContext, 'Should not inject additionalContext below threshold');
});

test('should inject warning additionalContext when context usage exceeds 65%', () => {
  // 70% used = 140K / 200K → above 65% threshold
  setTokenUsage(140_000, 200_000);

  const result = runHook(JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Bash' }));

  assert.strictEqual(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);

  const output = JSON.parse(result.stdout);
  assert.ok(output.additionalContext, 'Should inject additionalContext at 65% threshold');
  assert.ok(
    typeof output.additionalContext === 'string',
    'additionalContext should be a string'
  );
  assert.ok(
    output.additionalContext.length > 0,
    'additionalContext should not be empty'
  );
  // Should mention context/compression
  assert.ok(
    /context|compress|remaining/i.test(output.additionalContext),
    `Warning message should mention context/compression. Got: ${output.additionalContext}`
  );
});

test('should inject critical warning additionalContext when context usage exceeds 75%', () => {
  // 80% used = 160K / 200K → above 75% threshold
  setTokenUsage(160_000, 200_000);

  const result = runHook(JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Edit' }));

  assert.strictEqual(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);

  const output = JSON.parse(result.stdout);
  assert.ok(output.additionalContext, 'Should inject additionalContext at 75% threshold');
  assert.ok(
    /critical|CRITICAL|urgent|URGENT|25%|20%/i.test(output.additionalContext),
    `Critical warning should mention critical/urgent level. Got: ${output.additionalContext}`
  );
});

test('should exit 0 gracefully when token metrics are unavailable (missing budget file)', () => {
  // Remove budget tracker so metrics are unavailable
  if (fs.existsSync(BUDGET_TRACKER)) {
    fs.rmSync(BUDGET_TRACKER);
  }
  if (fs.existsSync(SESSION_ID_FILE)) {
    fs.rmSync(SESSION_ID_FILE);
  }

  const result = runHook(JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Bash' }));

  assert.strictEqual(
    result.status,
    0,
    `Hook should fail-open when metrics unavailable. status: ${result.status}, stderr: ${result.stderr}`
  );
  // Should not throw or crash — output should still be parseable JSON
  let output;
  assert.doesNotThrow(() => {
    output = JSON.parse(result.stdout);
  }, 'Output should be valid JSON even when metrics are unavailable');
  // Should not inject a warning when metrics are unavailable
  assert.ok(!output.additionalContext, 'Should not inject additionalContext when metrics unavailable');
});

test('should exit 0 gracefully when stdin contains malformed JSON', () => {
  const result = runHook('NOT VALID JSON {{{');

  assert.strictEqual(
    result.status,
    0,
    `Hook should fail-open on malformed stdin. status: ${result.status}`
  );
  // Should output valid JSON
  assert.doesNotThrow(() => {
    JSON.parse(result.stdout);
  }, 'Output should be valid JSON even on malformed input');
});
