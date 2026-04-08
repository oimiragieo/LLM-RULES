'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// We need to override BUDGET_STATE_PATH so tests don't pollute production state.
// The module uses PROJECT_ROOT internally, so we mock via temp files.

const MOD_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '.claude',
  'lib',
  'utils',
  'token-budget-tracker.cjs'
);

let mod;
let tmpDir;

function freshLoad() {
  // Clear module cache so each test gets fresh state
  for (const key of Object.keys(require.cache)) {
    if (key.includes('token-budget-tracker')) delete require.cache[key];
  }
  mod = require(MOD_PATH);
}

describe('Token budget enforcement (opt-in)', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-budget-'));
    freshLoad();
  });

  afterEach(() => {
    delete process.env.TOKEN_BUDGET_ENFORCE;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('shouldEnforceStop returns stop=false when under 90%', () => {
    process.env.TOKEN_BUDGET_ENFORCE = 'on';
    // Use unique agent ID to avoid state leaks from prior runs
    const id = `enforce-under-${Date.now()}`;
    mod.trackAgentUsage(id, { inputTokens: 50000, outputTokens: 50000, toolResults: '' });

    const result = mod.shouldEnforceStop(id);
    assert.equal(result.stop, false);
  });

  it('shouldEnforceStop returns stop=true at 90% budget', () => {
    process.env.TOKEN_BUDGET_ENFORCE = 'on';
    // Track 90% of 200K budget
    const id2 = `enforce-cap-${Date.now()}`;
    mod.trackAgentUsage(id2, { inputTokens: 90000, outputTokens: 90000, toolResults: '' });

    const result = mod.shouldEnforceStop(id2);
    assert.equal(result.stop, true);
    assert.ok(result.reason.includes('budget'), `Reason should mention budget: ${result.reason}`);
  });

  it('shouldEnforceStop returns stop=true after 3 low-delta continuations', () => {
    process.env.TOKEN_BUDGET_ENFORCE = 'on';
    const id3 = `enforce-dim-${Date.now()}`;
    mod.trackAgentUsage(id3, { inputTokens: 1000, outputTokens: 0, toolResults: '' });

    mod.recordContinuation(id3, 200);
    mod.recordContinuation(id3, 300);
    mod.recordContinuation(id3, 100);

    const result = mod.shouldEnforceStop(id3);
    assert.equal(result.stop, true);
    assert.ok(
      result.reason.includes('diminishing'),
      `Reason should mention diminishing: ${result.reason}`
    );
  });

  it('high-delta continuation resets the counter', () => {
    process.env.TOKEN_BUDGET_ENFORCE = 'on';
    const id4 = `enforce-reset-${Date.now()}`;
    mod.trackAgentUsage(id4, { inputTokens: 1000, outputTokens: 0, toolResults: '' });

    mod.recordContinuation(id4, 200);
    mod.recordContinuation(id4, 200);
    // High delta resets
    mod.recordContinuation(id4, 1000);
    // Only 1 low delta after reset
    mod.recordContinuation(id4, 200);

    const result = mod.shouldEnforceStop(id4);
    assert.equal(result.stop, false);
  });

  it('enforcement disabled by default', () => {
    delete process.env.TOKEN_BUDGET_ENFORCE;
    const id5 = `enforce-off-${Date.now()}`;
    mod.trackAgentUsage(id5, { inputTokens: 100000, outputTokens: 95000, toolResults: '' });

    const result = mod.shouldEnforceStop(id5);
    assert.equal(result.stop, false);
    assert.ok(result.reason.includes('disabled'));
  });

  it('enforcement activates when TOKEN_BUDGET_ENFORCE=on', () => {
    process.env.TOKEN_BUDGET_ENFORCE = 'on';
    const id6 = `enforce-on-${Date.now()}`;
    mod.trackAgentUsage(id6, { inputTokens: 100000, outputTokens: 95000, toolResults: '' });

    const result = mod.shouldEnforceStop(id6);
    assert.equal(result.stop, true);
  });

  it('exports recordContinuation and shouldEnforceStop', () => {
    assert.equal(typeof mod.recordContinuation, 'function');
    assert.equal(typeof mod.shouldEnforceStop, 'function');
  });
});
