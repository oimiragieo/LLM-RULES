/**
 * Tests: Quality gates artifacts contract (Task 26)
 * ==================================================
 *
 * Test 1 – Gate 1 without implementationPlan:
 *   evaluateGate('PHASE_1_DESIGN', state) without artifacts.implementationPlan
 *   → passed === false, blocking includes message about implementation plan
 *
 * Test 2 – Gate 1 with valid path:
 *   Same but artifacts.implementationPlan = '.claude/context/plans/some-plan.md'
 *   and that file exists in a temp dir
 *   Pass projectRoot pointing to temp dir
 *   Assert passed === true
 *
 * Test 3 – Gate 1 with path but file missing:
 *   artifacts.implementationPlan set but file not created
 *   → passed === false
 */

'use strict';

const assert = require('node:assert');
const { describe, it, beforeEach, afterEach } = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const { evaluateGate } = require(`${PROJECT_ROOT}/.claude/lib/workflow/quality-gates.cjs`);

// ─── helpers ────────────────────────────────────────────────────────────────

function makeTempDir() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-gates-test-'));
  return {
    dir: tmpDir,
    cleanup: () => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (_err) {
        // ignore cleanup errors
      }
    },
  };
}

function makeBaseState(overrides = {}) {
  return {
    phases: {},
    artifacts: {},
    complexity: 'MEDIUM',
    ...overrides,
  };
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('quality-gates: Gate 1 (Design -> Implement) artifacts contract', () => {
  let tmp;

  beforeEach(() => {
    tmp = makeTempDir();
  });

  afterEach(() => {
    tmp.cleanup();
  });

  it('Test 1: fails when implementationPlan artifact is missing entirely', () => {
    const state = makeBaseState({ artifacts: {} });

    const result = evaluateGate('PHASE_1_DESIGN', state, tmp.dir);

    assert.strictEqual(result.passed, false, 'should not pass without implementationPlan');
    assert.ok(
      Array.isArray(result.blocking) && result.blocking.length > 0,
      'blocking array should be non-empty'
    );

    // Must mention implementation plan in some blocking message
    const hasMsg = result.blocking.some(msg => msg.toLowerCase().includes('implementation plan'));
    assert.ok(
      hasMsg,
      `blocking messages should mention "implementation plan"; got: ${JSON.stringify(result.blocking)}`
    );
  });

  it('Test 2: passes when implementationPlan path is set and file exists', () => {
    // Create the plan file inside the temp dir
    const plansDir = path.join(tmp.dir, '.claude', 'context', 'plans');
    fs.mkdirSync(plansDir, { recursive: true });
    fs.writeFileSync(path.join(plansDir, 'some-plan.md'), '# Plan\n');

    const state = makeBaseState({
      artifacts: { implementationPlan: '.claude/context/plans/some-plan.md' },
    });

    const result = evaluateGate('PHASE_1_DESIGN', state, tmp.dir);

    assert.strictEqual(result.passed, true, 'should pass when plan file exists');
    assert.deepStrictEqual(result.blocking, [], 'blocking array should be empty');
  });

  it('Test 3: fails when implementationPlan path is set but file does not exist', () => {
    const state = makeBaseState({
      artifacts: { implementationPlan: '.claude/context/plans/missing-plan.md' },
    });

    const result = evaluateGate('PHASE_1_DESIGN', state, tmp.dir);

    assert.strictEqual(result.passed, false, 'should fail when plan file is missing');
    assert.ok(
      Array.isArray(result.blocking) && result.blocking.length > 0,
      'blocking array should be non-empty'
    );

    const hasMsg = result.blocking.some(msg => msg.toLowerCase().includes('implementation plan'));
    assert.ok(
      hasMsg,
      `blocking messages should mention "implementation plan"; got: ${JSON.stringify(result.blocking)}`
    );
  });
});
