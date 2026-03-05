'use strict';
/**
 * Tests for Memory Curation Validation in post-completion-chain.cjs
 *
 * Validates the Step 5.5 Memory Curation Contract advisory check that warns
 * when a reflection-agent completes without curationDecisions in metadata.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');

// ---------------------------------------------------------------------------
// Helpers: build minimal hook input objects
// ---------------------------------------------------------------------------

function buildHookInput({ subagentType = '', metadata = {} } = {}) {
  return {
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId: 'test-task-99',
      status: 'completed',
      subagent_type: subagentType,
      metadata,
    },
  };
}

// ---------------------------------------------------------------------------
// Unit-level extraction: test the curation-check logic in isolation
// ---------------------------------------------------------------------------

/**
 * Extracted curation-check logic (mirrors the hook implementation).
 * Returns { warned, successMsg } for assertion.
 */
function runCurationCheck(toolInput) {
  const metadata = toolInput.metadata || {};
  const agentPrompt = toolInput?.prompt || toolInput?.metadata?.prompt || '';
  const subagentType =
    toolInput?.subagent_type ||
    toolInput?.metadata?.subagent_type ||
    toolInput?.metadata?.agent ||
    '';

  const isReflectionAgent =
    subagentType === 'reflection-agent' ||
    (typeof agentPrompt === 'string' && agentPrompt.includes('reflection'));

  let warned = false;
  let successMsg = null;

  if (isReflectionAgent) {
    const curationDecisions = Array.isArray(metadata.curationDecisions)
      ? metadata.curationDecisions
      : [];

    if (curationDecisions.length === 0) {
      warned = true;
    } else {
      successMsg = `Curation decisions recorded: ${curationDecisions.length} entries`;
    }
  }

  return { warned, successMsg, isReflectionAgent };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Memory Curation Validation', () => {
  it('warns when reflection-agent completes without curationDecisions', () => {
    const input = buildHookInput({ subagentType: 'reflection-agent', metadata: {} });
    const result = runCurationCheck(input.tool_input);

    assert.strictEqual(result.isReflectionAgent, true, 'should detect reflection-agent');
    assert.strictEqual(result.warned, true, 'should warn when curationDecisions missing');
    assert.strictEqual(result.successMsg, null, 'should not emit success message');
  });

  it('does NOT warn when curationDecisions are present and non-empty', () => {
    const curationDecisions = [
      {
        entry: 'Pattern: shell:false for child_process',
        decision: 'retain',
        score: 0.9,
        rationale: 'High reuse, strong evidence, critical safety pattern',
      },
    ];
    const input = buildHookInput({
      subagentType: 'reflection-agent',
      metadata: { curationDecisions },
    });
    const result = runCurationCheck(input.tool_input);

    assert.strictEqual(result.isReflectionAgent, true, 'should detect reflection-agent');
    assert.strictEqual(result.warned, false, 'should NOT warn when curationDecisions present');
    assert.ok(result.successMsg, 'should emit success message');
    assert.match(result.successMsg, /1 entries/, 'success message should include count');
  });

  it('does NOT warn for non-reflection-agent completions', () => {
    const input = buildHookInput({ subagentType: 'developer', metadata: {} });
    const result = runCurationCheck(input.tool_input);

    assert.strictEqual(
      result.isReflectionAgent,
      false,
      'should not classify developer as reflection'
    );
    assert.strictEqual(result.warned, false, 'should not warn for non-reflection agent');
    assert.strictEqual(
      result.successMsg,
      null,
      'should not emit success message for non-reflection'
    );
  });

  it('validates curationDecisions schema: array of {entry, decision, score, rationale}', () => {
    const validEntry = {
      entry: 'Debug log from session 2026-01-20',
      decision: 'archive',
      score: 0.2,
      rationale: 'One-off debug context, low retrieval value',
    };

    // Validate shape
    assert.ok(typeof validEntry.entry === 'string', 'entry must be a string');
    assert.ok(
      ['retain', 'compress', 'archive'].includes(validEntry.decision),
      'decision must be retain|compress|archive'
    );
    assert.ok(
      typeof validEntry.score === 'number' && validEntry.score >= 0 && validEntry.score <= 1,
      'score must be a number between 0 and 1'
    );
    assert.ok(typeof validEntry.rationale === 'string', 'rationale must be a string');

    // A valid array of decisions should not trigger warning
    const input = buildHookInput({
      subagentType: 'reflection-agent',
      metadata: { curationDecisions: [validEntry] },
    });
    const result = runCurationCheck(input.tool_input);
    assert.strictEqual(result.warned, false, 'valid curationDecisions array should not warn');
  });

  it('warns when reflection-agent is detected via prompt content', () => {
    const input = buildHookInput({ subagentType: '', metadata: {} });
    // Inject reflection keyword in prompt (alternative detection path)
    input.tool_input.prompt = 'You are running the reflection workflow for this session.';
    const result = runCurationCheck(input.tool_input);

    assert.strictEqual(
      result.isReflectionAgent,
      true,
      'should detect reflection via prompt content'
    );
    assert.strictEqual(
      result.warned,
      true,
      'should warn for prompt-detected reflection without curationDecisions'
    );
  });

  it('logs correct count when multiple curation decisions are recorded', () => {
    const decisions = [
      { entry: 'A', decision: 'retain', score: 0.9, rationale: 'strong signal' },
      { entry: 'B', decision: 'compress', score: 0.5, rationale: 'verbose evidence' },
      { entry: 'C', decision: 'archive', score: 0.1, rationale: 'stale' },
    ];
    const input = buildHookInput({
      subagentType: 'reflection-agent',
      metadata: { curationDecisions: decisions },
    });
    const result = runCurationCheck(input.tool_input);

    assert.strictEqual(result.warned, false, 'should not warn with 3 curation decisions');
    assert.ok(result.successMsg, 'should emit success message');
    assert.match(result.successMsg, /3 entries/, 'should report count of 3');
  });

  it('treats empty curationDecisions array the same as missing field', () => {
    const input = buildHookInput({
      subagentType: 'reflection-agent',
      metadata: { curationDecisions: [] },
    });
    const result = runCurationCheck(input.tool_input);

    assert.strictEqual(result.warned, true, 'empty array should still trigger warning');
    assert.strictEqual(result.successMsg, null, 'should not emit success for empty array');
  });

  it('does NOT warn for qa or devops completions without curationDecisions', () => {
    const agentTypes = ['qa', 'devops', 'developer', 'code-reviewer', 'architect'];
    for (const agentType of agentTypes) {
      const input = buildHookInput({ subagentType: agentType, metadata: {} });
      const result = runCurationCheck(input.tool_input);

      assert.strictEqual(
        result.isReflectionAgent,
        false,
        `${agentType} should not be classified as reflection-agent`
      );
      assert.strictEqual(result.warned, false, `${agentType} should not trigger curation warning`);
    }
  });
});
