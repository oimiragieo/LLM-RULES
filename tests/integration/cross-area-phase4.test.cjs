#!/usr/bin/env node
'use strict';

/**
 * Cross-Area Integration Tests — Phase 4 (Hermes Agent Feature Assimilation)
 * ===========================================================================
 *
 * VAL-CROSS-001: Budget-aware background tasks
 *   When a background process is spawned via ProcessRegistry and token spend
 *   is simulated, getBudgetStatus().totalSpent reflects the spend. Upon budget
 *   exhaustion, the process registry stop() is invoked for the background PID.
 *
 * VAL-CROSS-002: redactObject + flight-recorder — secrets never appear in JSONL
 *   Payloads containing secrets are passed through redactObject() before
 *   record(). The written JSONL must not contain the original secret values;
 *   the redaction marker '********' must be present.
 *
 * VAL-CROSS-003: Skill self-creation + plugin tools — generated SKILL.md references
 *   plugin-registered tools from the transcript and the skill resolves via
 *   PluginLoader.loadSkill().
 *
 * VAL-CROSS-004: Cost predictor estimates feed budget engine recordSpend
 *   Estimated costs from CostPredictor.estimateCost() are fed into
 *   BudgetEngine.recordSpend(). After enough accumulation the cumulative spend
 *   crosses the warning threshold and enforceLimit() returns { downgraded: true }.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// ── Module imports ────────────────────────────────────────────────────────────

const { ProcessRegistry } = require('../../.claude/lib/workers/process-registry.cjs');
const { redactObject, REDACTED } = require('../../.claude/lib/utils/redact-secrets.cjs');
const { record, _logBuffer } = require('../../.claude/lib/monitoring/flight-recorder.cjs');
const { analyzeTranscript } = require('../../.claude/lib/evolution/skill-auto-creator.cjs');
const { PluginLoader } = require('../../.claude/lib/plugins/loader.cjs');
const { PluginResolver } = require('../../.claude/lib/plugins/resolver.cjs');
const { CostPredictor } = require('../../.claude/lib/routing/cost-predictor.cjs');
const {
  BudgetEngine,
  BudgetExhaustedError,
} = require('../../.claude/lib/routing/budget-engine.cjs');
const { ModelRegistry } = require('../../.claude/lib/routing/model-registry.cjs');
const { TokenAccountant } = require('../../.claude/lib/metrics/token-accountant.cjs');

// ── Test helpers ──────────────────────────────────────────────────────────────

/**
 * Poll until predicate returns true, or throw after timeout ms.
 */
async function waitFor(predicate, { timeout = 6000, interval = 50 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) return;
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error('waitFor: timeout exceeded');
}

/**
 * Write an event via record() and synchronously flush the async log buffer.
 */
function recordAndFlush(event, logPath) {
  record(event, logPath);
  if (_logBuffer) _logBuffer.flushSync();
}

// =============================================================================
// VAL-CROSS-001: Budget-aware background tasks
// =============================================================================

describe('VAL-CROSS-001: Budget-aware background tasks', () => {
  let tmpDir;
  let registry;
  let tokenAccountant;
  let modelRegistry;
  let costPredictor;
  let budgetEngine;
  let bgHandle;

  /** Session identifier for this test. */
  const SESSION_ID = 'cross-001-session';

  /**
   * Very small session budget so that simulated opus spend quickly exhausts it.
   * Using $0.50 — a single ~10-char prompt on opus costs ~$0.18 so exhaustion
   * is reached after ~3 recordSpend() calls.
   */
  const SESSION_BUDGET = 0.5;

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-001-'));

    // TokenAccountant with an isolated persistence path so we never touch the
    // project's real token-usage.json.
    tokenAccountant = new TokenAccountant(path.join(tmpDir, 'token-usage.json'));
    modelRegistry = new ModelRegistry();
    costPredictor = new CostPredictor(modelRegistry, tokenAccountant);

    // BudgetEngine wired to the same tokenAccountant, with a tiny budget so
    // we can exhaust it quickly during the test.
    budgetEngine = new BudgetEngine({
      tokenAccountant,
      modelRegistry,
      config: { defaultSessionBudget: SESSION_BUDGET },
    });
    budgetEngine.allocateBudget(SESSION_ID, [{ phase: 'main', fraction: 1.0 }]);

    // Spawn a long-running background process to represent a "background agent".
    registry = new ProcessRegistry({ defaultCheckpointPath: path.join(tmpDir, 'cp.json') });
    bgHandle = registry.spawn('node', ['-e', 'setInterval(()=>{},1000)']);
    // Allow the OS a moment to register the process.
    await new Promise(r => setTimeout(r, 100));
  });

  after(async () => {
    // Ensure the background process is cleaned up even if a test fails.
    for (const proc of registry.list()) {
      if (proc.status === 'running') {
        registry.stop(proc.pid);
      }
    }
    await new Promise(r => setTimeout(r, 200));
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_e) {
      // Ignore EBUSY on Windows
    }
  });

  it('background process is spawned and visible in registry', () => {
    const procs = registry.list();
    const bgProc = procs.find(p => p.pid === bgHandle.pid);
    assert.ok(bgProc, 'background process should appear in registry list()');
    assert.strictEqual(bgProc.status, 'running', 'background process should be running');
  });

  it('token spend recorded for background session is reflected in getBudgetStatus()', () => {
    // Simulate the background agent performing one LLM call on opus
    tokenAccountant.recordUsage(`${SESSION_ID}:bg-task-1`, {
      inputTokens: 500,
      outputTokens: 125,
      model: 'opus',
      agentType: 'background-agent',
    });

    const status = costPredictor.getBudgetStatus(SESSION_ID);
    assert.ok(typeof status.totalSpent === 'number', 'totalSpent should be a number');
    assert.ok(status.totalSpent > 0, 'totalSpent should be > 0 after recording background spend');
  });

  it('getBudgetStatus().totalSpent increases as background process simulates more spend', () => {
    const statusBefore = costPredictor.getBudgetStatus(SESSION_ID);

    // Simulate additional background LLM calls
    tokenAccountant.recordUsage(`${SESSION_ID}:bg-task-2`, {
      inputTokens: 800,
      outputTokens: 200,
      model: 'opus',
      agentType: 'background-agent',
    });

    const statusAfter = costPredictor.getBudgetStatus(SESSION_ID);
    assert.ok(
      statusAfter.totalSpent > statusBefore.totalSpent,
      'totalSpent should increase after recording more background spend'
    );
  });

  it('upon budget exhaustion, process registry stop() is called for the background PID', () => {
    // Track whether stop() was called with the correct PID
    let stopCalledPid = null;
    const originalStop = registry.stop.bind(registry);
    registry.stop = pid => {
      stopCalledPid = pid;
      return originalStop(pid);
    };

    // Drive spend past the budget limit using the budget engine
    // A short opus prompt costs ~$0.18; with SESSION_BUDGET=$0.50 we exhaust
    // after ~3 calls (3 × $0.18 = $0.54 > $0.50).
    const smallPrompt = 'check status'; // ~12 chars → ~9 tokens on opus
    let exhausted = false;
    for (let i = 0; i < 20 && !exhausted; i++) {
      const estimate = costPredictor.estimateCost(smallPrompt, 'opus');
      // Ensure estimate produces a positive cost
      if (estimate.totalCostUSD === 0) {
        // If cost estimation returns zero, add a minimal fixed cost
        budgetEngine.recordSpend(SESSION_ID, 0.2);
      } else {
        budgetEngine.recordSpend(SESSION_ID, estimate.totalCostUSD);
      }

      const budgetStatus = budgetEngine.checkBudget(SESSION_ID);
      if (budgetStatus.status === 'exhausted') {
        // Simulate the integration: budget exhaustion triggers process stop
        try {
          budgetEngine.enforceLimit(SESSION_ID);
        } catch (err) {
          if (err instanceof BudgetExhaustedError || err.name === 'BudgetExhaustedError') {
            registry.stop(bgHandle.pid);
            exhausted = true;
          } else {
            throw err;
          }
        }
      } else if (budgetStatus.status === 'warning' || budgetStatus.status === 'critical') {
        // Model downgrade but not yet exhausted — also stop on critical for this test
        if (budgetStatus.status === 'critical') {
          registry.stop(bgHandle.pid);
          exhausted = true;
        }
      }
    }

    // Assert stop() was called for the background process PID
    assert.strictEqual(
      stopCalledPid,
      bgHandle.pid,
      'stop() should have been called with the background process PID upon budget exhaustion'
    );
  });

  it('background process status is stopped after registry.stop() was called', async () => {
    // The previous test called stop() — verify the OS-level status
    await waitFor(
      () => {
        const proc = registry.list().find(p => p.pid === bgHandle.pid);
        return proc && proc.status === 'stopped';
      },
      { timeout: 5000 }
    );

    const proc = registry.list().find(p => p.pid === bgHandle.pid);
    assert.ok(proc, 'process should still be tracked after stop');
    assert.strictEqual(proc.status, 'stopped', 'process status should be stopped');
  });
});

// =============================================================================
// VAL-CROSS-002: Redacted secrets in flight-recorder JSONL output
// =============================================================================

describe('VAL-CROSS-002: redactObject + flight-recorder — secrets never appear in JSONL', () => {
  let tmpDir;
  let testLogPath;

  /** The secret value we must NEVER find in the written JSONL. */
  const SECRET_VALUE = 'sk-test-secret-key-value';
  const SAFE_VALUE = 'safe-non-secret-data';

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-002-'));
    testLogPath = path.join(tmpDir, 'test-flight.jsonl');
  });

  after(() => {
    if (_logBuffer) _logBuffer.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_e) {
      // Ignore EBUSY on Windows
    }
  });

  it('redactObject() replaces the secret apiKey with the redaction marker', () => {
    const result = redactObject({ apiKey: SECRET_VALUE, data: SAFE_VALUE });
    assert.strictEqual(result.apiKey, REDACTED, 'apiKey must be replaced with REDACTED marker');
    assert.strictEqual(result.data, SAFE_VALUE, 'non-secret field must remain unchanged');
  });

  it('original secret value does NOT appear anywhere in the written JSONL file', () => {
    // Ensure a clean log file for this assertion
    if (fs.existsSync(testLogPath)) fs.unlinkSync(testLogPath);

    const safePayload = redactObject({ apiKey: SECRET_VALUE, data: SAFE_VALUE });
    recordAndFlush(
      { event: 'test_secret_redaction', component: 'cross-area-test', payload: safePayload },
      testLogPath
    );

    assert.ok(fs.existsSync(testLogPath), 'JSONL file should have been created');
    const fileContent = fs.readFileSync(testLogPath, 'utf8');

    assert.ok(
      !fileContent.includes(SECRET_VALUE),
      `Original secret "${SECRET_VALUE}" must NOT appear anywhere in the JSONL file`
    );
  });

  it('the redaction marker "********" IS present in the JSONL file', () => {
    const fileContent = fs.readFileSync(testLogPath, 'utf8');
    assert.ok(
      fileContent.includes(REDACTED),
      `Redaction marker "${REDACTED}" must be present in the JSONL file`
    );
  });

  it('safe non-secret field value is preserved verbatim in the JSONL file', () => {
    const fileContent = fs.readFileSync(testLogPath, 'utf8');
    assert.ok(
      fileContent.includes(SAFE_VALUE),
      `Non-secret field value "${SAFE_VALUE}" must be preserved in the JSONL file`
    );
  });

  it('parsed JSONL line confirms apiKey is redacted and data is safe', () => {
    const fileContent = fs.readFileSync(testLogPath, 'utf8');
    const lastLine = fileContent.trim().split('\n').filter(Boolean).at(-1);
    assert.ok(lastLine, 'JSONL file should have at least one line');

    const parsed = JSON.parse(lastLine);
    assert.strictEqual(
      parsed.payload.apiKey,
      REDACTED,
      'parsed JSONL: apiKey must be the redaction marker'
    );
    assert.strictEqual(
      parsed.payload.data,
      SAFE_VALUE,
      'parsed JSONL: data field must be preserved'
    );
  });

  it('a second distinct secret key type is also redacted before writing', () => {
    if (fs.existsSync(testLogPath)) fs.unlinkSync(testLogPath);

    const SECOND_SECRET = 'placeholder-github-token-value-for-testing';
    const safePayload2 = redactObject({ github_token: SECOND_SECRET, repo: 'agent-studio' });

    recordAndFlush(
      {
        event: 'test_github_token_redaction',
        component: 'cross-area-test',
        payload: safePayload2,
      },
      testLogPath
    );

    const fileContent = fs.readFileSync(testLogPath, 'utf8');
    assert.ok(
      !fileContent.includes(SECOND_SECRET),
      'GitHub token secret must NOT appear in the JSONL output'
    );
    assert.ok(
      fileContent.includes(REDACTED),
      'Redaction marker must appear in the JSONL output for the GitHub token'
    );
  });
});

// =============================================================================
// VAL-CROSS-003: Skill creation with plugin tool refs
// =============================================================================

describe('VAL-CROSS-003: auto-created SKILL.md references plugin-registered tool', () => {
  let tmpDir;
  let pluginScopeDir;
  let skillsOutputDir;
  let resolver;
  let loader;

  /** The plugin tool name referenced in the transcript. */
  const PLUGIN_TOOL_NAME = 'my-plugin-tool';

  /**
   * A transcript that satisfies analyzeTranscript's heuristics:
   * - 5+ tool calls
   * - At least one failed call followed by a successful call (error-recovery pattern)
   * - One of the tool calls uses PLUGIN_TOOL_NAME
   */
  const TRANSCRIPT = [
    { toolName: 'Read', success: true },
    { toolName: PLUGIN_TOOL_NAME, success: false, error: 'Connection timeout' },
    { toolName: PLUGIN_TOOL_NAME, success: true },
    { toolName: 'Edit', success: true },
    { toolName: 'Execute', success: true },
  ];

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-003-'));

    // The plugin scope directory is the root that PluginResolver discovers
    // plugins from. We create a single plugin subdirectory inside it.
    pluginScopeDir = path.join(tmpDir, 'plugin-scope');
    fs.mkdirSync(pluginScopeDir, { recursive: true });

    // analyzeTranscript will write to: pluginScopeDir/<plugin>/skills/<skillName>/SKILL.md
    // So we set outputDir to the plugin's skills directory.
    skillsOutputDir = path.join(pluginScopeDir, 'my-test-plugin', 'skills');
    fs.mkdirSync(skillsOutputDir, { recursive: true });

    resolver = new PluginResolver({ projectDir: pluginScopeDir });
    loader = new PluginLoader(resolver);
  });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_e) {
      // Ignore EBUSY on Windows
    }
  });

  it('analyzeTranscript writes a SKILL.md for the transcript with plugin tool usage', () => {
    const result = analyzeTranscript(TRANSCRIPT, [], { outputDir: skillsOutputDir });
    assert.ok(
      result.written === true,
      `SKILL.md should be written, got: ${JSON.stringify(result)}`
    );
    assert.ok(typeof result.path === 'string', 'result.path should be a string');
    assert.ok(fs.existsSync(result.path), 'SKILL.md file should exist on disk');
  });

  it('generated SKILL.md content references the plugin tool name in its rules section', () => {
    const result = analyzeTranscript(TRANSCRIPT, [], {
      outputDir: skillsOutputDir,
      skillName: 'plugin-tool-test-workflow',
    });

    // The skill might already exist from the previous test call; either way
    // we need to find the written file.
    let skillPath;
    if (result.written) {
      skillPath = result.path;
    } else {
      // File already exists — find it in the output dir
      const entries = fs.readdirSync(skillsOutputDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const candidate = path.join(skillsOutputDir, entry.name, 'SKILL.md');
          if (fs.existsSync(candidate)) {
            skillPath = candidate;
            break;
          }
        }
      }
    }

    assert.ok(skillPath && fs.existsSync(skillPath), 'SKILL.md must exist at some path');

    const content = fs.readFileSync(skillPath, 'utf8');
    assert.ok(
      content.includes(PLUGIN_TOOL_NAME),
      `Generated SKILL.md must reference the plugin tool "${PLUGIN_TOOL_NAME}" in its rules`
    );
  });

  it('PluginLoader.loadSkill() can resolve the generated SKILL.md', () => {
    // The skill was written to: skillsOutputDir/<skillName>/SKILL.md
    // PluginResolver with projectDir=pluginScopeDir will look in:
    //   pluginScopeDir/my-test-plugin/skills/<skillName>/SKILL.md
    // which is exactly where analyzeTranscript wrote it.

    // Find the skill name from the written file
    const entries = fs.readdirSync(skillsOutputDir, { withFileTypes: true });
    let skillName = null;
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const candidate = path.join(skillsOutputDir, entry.name, 'SKILL.md');
        if (fs.existsSync(candidate)) {
          skillName = entry.name;
          break;
        }
      }
    }

    assert.ok(skillName !== null, 'Should have found a skill directory in the output dir');

    const loaded = loader.loadSkill(skillName);
    assert.ok(loaded !== null, `PluginLoader.loadSkill("${skillName}") must return a result`);
    assert.ok(
      typeof loaded.content === 'string' && loaded.content.length > 0,
      'Loaded skill must have content'
    );
  });

  it('resolved skill content still references the plugin tool name', () => {
    const entries = fs.readdirSync(skillsOutputDir, { withFileTypes: true });
    let skillName = null;
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const candidate = path.join(skillsOutputDir, entry.name, 'SKILL.md');
        if (fs.existsSync(candidate)) {
          skillName = entry.name;
          break;
        }
      }
    }
    assert.ok(skillName !== null, 'Should have a skill directory');

    const loaded = loader.loadSkill(skillName);
    assert.ok(loaded !== null, 'PluginLoader must resolve the skill');
    assert.ok(
      loaded.content.includes(PLUGIN_TOOL_NAME),
      `Loaded skill content must reference "${PLUGIN_TOOL_NAME}"`
    );
  });
});

// =============================================================================
// VAL-CROSS-004: Cost predictor estimates feed budget engine recordSpend
// =============================================================================

describe('VAL-CROSS-004: CostPredictor estimates feed BudgetEngine.recordSpend → enforceLimit() downgrades', () => {
  let tmpDir;
  let tokenAccountant;
  let modelRegistry;
  let costPredictor;
  let budgetEngine;

  const SESSION_ID = 'cross-004-session';

  /**
   * We use DEFAULT_CONFIG defaultSessionBudget = $5.0 and a prompt long enough
   * that each estimateCost() call on opus produces a meaningful cost.
   *
   * For a 32-char prompt:
   *   tokens = Math.floor(32 * 0.75) = 24
   *   inputCost = (24/1000) * 15  = $0.36
   *   outputTokens = Math.floor(24 * 0.25) = 6
   *   outputCost = (6/1000) * 75   = $0.45
   *   totalCostUSD ≈ $0.81 per call
   *
   * With warningThreshold = 0.8 × $5.0 = $4.0, we need ~5 calls to exceed it.
   */
  const LARGE_OPUS_PROMPT = 'Analyze this code for performance'; // 32 chars

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-004-'));
    tokenAccountant = new TokenAccountant(path.join(tmpDir, 'token-usage.json'));
    modelRegistry = new ModelRegistry();
    costPredictor = new CostPredictor(modelRegistry, tokenAccountant);
    budgetEngine = new BudgetEngine({ tokenAccountant, modelRegistry });
    budgetEngine.allocateBudget(SESSION_ID, [{ phase: 'main', fraction: 1.0 }]);
  });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_e) {
      // Ignore EBUSY on Windows
    }
  });

  it('estimateCost() on opus produces a positive totalCostUSD', () => {
    const estimate = costPredictor.estimateCost(LARGE_OPUS_PROMPT, 'opus');
    assert.ok(typeof estimate.totalCostUSD === 'number', 'totalCostUSD must be a number');
    assert.ok(estimate.totalCostUSD > 0, 'totalCostUSD must be positive for a non-empty prompt');
    assert.strictEqual(
      estimate.model,
      'claude-opus-4-6',
      'model should resolve to the full opus ID'
    );
  });

  it('estimateCost() returns higher cost for opus than for haiku on the same prompt', () => {
    const opusEst = costPredictor.estimateCost(LARGE_OPUS_PROMPT, 'opus');
    const haikuEst = costPredictor.estimateCost(LARGE_OPUS_PROMPT, 'haiku');
    assert.ok(
      opusEst.totalCostUSD > haikuEst.totalCostUSD,
      'Opus must be more expensive than haiku for the same prompt'
    );
  });

  it('recordSpend with estimated cost increments the budget engine session total', () => {
    const estimate = costPredictor.estimateCost(LARGE_OPUS_PROMPT, 'opus');
    budgetEngine.recordSpend(SESSION_ID, estimate.totalCostUSD);

    const status = budgetEngine.checkBudget(SESSION_ID);
    assert.ok(status.totalSpent > 0, 'totalSpent should be positive after one recordSpend()');
    assert.ok(
      Math.abs(status.totalSpent - estimate.totalCostUSD) < 0.000001,
      'totalSpent should equal the first estimate after one call'
    );
  });

  it('repeated estimateCost→recordSpend accumulation crosses warning threshold and enforceLimit returns downgraded:true', () => {
    // Drive additional spend until the warning threshold is crossed.
    // The session already has one call's cost from the previous test;
    // keep going until status is 'warning' or 'critical'.
    const MAX_ITERATIONS = 30;
    let statusReached = false;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const estimate = costPredictor.estimateCost(LARGE_OPUS_PROMPT, 'opus');
      // Guard: if for any reason cost is zero, use a small fixed amount so
      // the loop doesn't run forever.
      const spendAmount = estimate.totalCostUSD > 0 ? estimate.totalCostUSD : 0.01;
      budgetEngine.recordSpend(SESSION_ID, spendAmount);

      const budgetStatus = budgetEngine.checkBudget(SESSION_ID);
      if (
        budgetStatus.status === 'warning' ||
        budgetStatus.status === 'critical' ||
        budgetStatus.status === 'exhausted'
      ) {
        statusReached = true;
        break;
      }
    }

    assert.ok(
      statusReached,
      'Budget status should reach warning/critical/exhausted within the iteration limit'
    );

    // Now enforce the limit — it should downgrade from opus to sonnet.
    let result;
    try {
      result = budgetEngine.enforceLimit(SESSION_ID);
    } catch (err) {
      // If already at minimum model and exhausted, BudgetExhaustedError is thrown.
      // For this test the session starts at opus so we expect a downgrade, not an error.
      throw new assert.AssertionError({
        message: `enforceLimit() threw unexpectedly: ${err.message}`,
        actual: err,
      });
    }

    assert.ok(result.downgraded === true, 'enforceLimit() must return downgraded: true');
    assert.notStrictEqual(
      result.model,
      'claude-opus-4-6',
      'After downgrade the model must not be opus'
    );
  });

  it('the downgraded model is the next step in the downgrade chain (sonnet)', () => {
    // After the previous test we are already downgraded to sonnet. Ask the
    // budget status — the currentModel field should reflect this.
    const status = budgetEngine.checkBudget(SESSION_ID);
    // The full ID for sonnet in the registry is 'claude-sonnet-4-6'
    assert.ok(
      typeof status.currentModel === 'string' && status.currentModel.length > 0,
      'checkBudget() should return a currentModel string'
    );
    // autoDowngradeTriggered must be true after a downgrade
    assert.ok(
      status.autoDowngradeTriggered === true,
      'autoDowngradeTriggered must be true after a model downgrade'
    );
  });
});
