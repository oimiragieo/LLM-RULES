'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const HOOK = path.resolve(__dirname, '../../../.claude/hooks/session/analysis-paralysis-guard.cjs');

/**
 * Creates a temp project dir with a pre-seeded paralysis-state.json.
 * Returns { tmpDir, stateFile, cleanup }.
 */
function createTempProject(readCount) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paralysis-test-'));
  const runtimeDir = path.join(tmpDir, '.claude', 'context', 'runtime');
  fs.mkdirSync(runtimeDir, { recursive: true });
  const stateFile = path.join(runtimeDir, 'paralysis-state.json');
  fs.writeFileSync(stateFile, JSON.stringify({ readCount, lastTool: 'Read' }));
  return {
    tmpDir,
    stateFile,
    cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }),
  };
}

/**
 * Builds a minimal PostToolUse:Read hook payload.
 */
function makeReadPayload() {
  return JSON.stringify({ tool_name: 'Read', tool_input: { file_path: '/tmp/test.txt' } });
}

/**
 * Runs the hook with the given stdin payload, env overrides, and a CWD pointing
 * at a temp project directory that has a pre-seeded state file.
 */
function runHook(stdinData, envOverrides = {}, tmpDir = null) {
  return spawnSync(process.execPath, [HOOK], {
    input: stdinData,
    env: { ...process.env, ...envOverrides },
    encoding: 'utf8',
    cwd: tmpDir || process.cwd(),
    timeout: 8000,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test('investigative mode: executor agent does NOT warn at 6 reads when INVESTIGATIVE=true', () => {
  // executor warn threshold is 5 — without investigative mode, 6 reads would warn.
  // In investigative mode, hunter thresholds apply: warn at 25, block at 40.
  // So 6 reads should pass silently.
  const { tmpDir, cleanup } = createTempProject(5); // state has 5 reads; hook increments to 6
  try {
    const result = runHook(makeReadPayload(), { ANALYSIS_PARALYSIS_INVESTIGATIVE: 'true' }, tmpDir);
    assert.equal(
      result.status,
      0,
      `Hook should exit 0 (allow), got ${result.status}. stderr: ${result.stderr}`
    );
    assert.equal(
      result.stderr || '',
      '',
      `Should NOT emit any warning at 6 reads in investigative mode, but got stderr: ${result.stderr}`
    );
  } finally {
    cleanup();
  }
});

test('investigative mode: executor agent DOES warn at 26 reads when INVESTIGATIVE=true', () => {
  // hunter warn threshold is 25. With 25 prior reads, hook increments to 26 — should warn.
  const { tmpDir, cleanup } = createTempProject(25); // state has 25 reads; hook increments to 26
  try {
    const result = runHook(makeReadPayload(), { ANALYSIS_PARALYSIS_INVESTIGATIVE: 'true' }, tmpDir);
    assert.equal(result.status, 0, `Hook should exit 0 (warn, not block), got ${result.status}`);
    assert.match(
      result.stderr || '',
      /analysis-paralysis-guard/i,
      `Should emit a warning at 26 reads in investigative mode, but got stderr: "${result.stderr}"`
    );
  } finally {
    cleanup();
  }
});

test('investigative mode: env var "1" also activates investigative mode', () => {
  // ANALYSIS_PARALYSIS_INVESTIGATIVE=1 (truthy string) should behave same as "true"
  const { tmpDir, cleanup } = createTempProject(5); // 5 reads + 1 = 6, below hunter warn (25)
  try {
    const result = runHook(makeReadPayload(), { ANALYSIS_PARALYSIS_INVESTIGATIVE: '1' }, tmpDir);
    assert.equal(result.status, 0, `Hook should exit 0`);
    assert.equal(
      result.stderr || '',
      '',
      `Should NOT warn at 6 reads when INVESTIGATIVE=1, got: ${result.stderr}`
    );
  } finally {
    cleanup();
  }
});

test('investigative mode: orchestrator tier also gets hunter thresholds', () => {
  // orchestrator warn is 20 — without investigative mode, 21 reads would warn.
  // With investigative mode (hunter: warn 25), 21 reads should be silent.
  const { tmpDir, cleanup } = createTempProject(20); // state has 20 reads; hook increments to 21
  try {
    const result = runHook(
      makeReadPayload(),
      { ANALYSIS_PARALYSIS_INVESTIGATIVE: 'true', AGENT_TYPE: 'planner' },
      tmpDir
    );
    assert.equal(result.status, 0, `Hook should exit 0`);
    assert.equal(
      result.stderr || '',
      '',
      `orchestrator (planner) at 21 reads should be silent in investigative mode, got: ${result.stderr}`
    );
  } finally {
    cleanup();
  }
});

test('normal mode: executor agent DOES warn at 6 reads WITHOUT investigative mode', () => {
  // Confirm baseline still works: without investigative mode, executor warns at 6
  const { tmpDir, cleanup } = createTempProject(5); // state has 5 reads; hook increments to 6
  try {
    const result = runHook(
      makeReadPayload(),
      { AGENT_TYPE: 'developer', ANALYSIS_PARALYSIS_INVESTIGATIVE: '' },
      tmpDir
    );
    assert.equal(result.status, 0, `Hook should exit 0`);
    assert.match(
      result.stderr || '',
      /analysis-paralysis-guard/i,
      `Should warn at 6 reads in normal mode for executor (developer), got: "${result.stderr}"`
    );
  } finally {
    cleanup();
  }
});
