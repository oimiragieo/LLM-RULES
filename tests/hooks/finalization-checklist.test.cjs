/**
 * Tests for the finalization-checklist.cjs module
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

describe('Finalization Checklist', () => {
  it('should export FINALIZATION_STEPS array with required steps', () => {
    const { FINALIZATION_STEPS } = require('../../.claude/lib/routing/finalization-checklist.cjs');

    assert.ok(Array.isArray(FINALIZATION_STEPS), 'FINALIZATION_STEPS should be an array');
    assert.ok(FINALIZATION_STEPS.length > 0, 'Should have at least one step');

    // Must include all required steps
    const required = ['pnpm lint:fix', 'pnpm format', 'pnpm test', 'git commit'];
    for (const step of required) {
      assert.ok(
        FINALIZATION_STEPS.some(s => s.includes(step) || step.includes(s)),
        `Should include step: ${step}`
      );
    }
  });

  it('should detect finalization required when allPhasesComplete is true', () => {
    const {
      isFinalizationRequired,
    } = require('../../.claude/lib/routing/finalization-checklist.cjs');

    assert.ok(
      isFinalizationRequired({ allPhasesComplete: true }),
      'Should require finalization when allPhasesComplete=true'
    );
  });

  it('should detect finalization not required when finalizationDone is true', () => {
    const {
      isFinalizationRequired,
    } = require('../../.claude/lib/routing/finalization-checklist.cjs');

    assert.ok(
      !isFinalizationRequired({ allPhasesComplete: true, finalizationDone: true }),
      'Should not require finalization when finalizationDone=true'
    );
  });

  it('should detect finalization required when devops phase complete without finalization', () => {
    const {
      isFinalizationRequired,
    } = require('../../.claude/lib/routing/finalization-checklist.cjs');

    assert.ok(
      isFinalizationRequired({ completedPhases: ['design', 'implement', 'review', 'devops'] }),
      'Should require finalization after devops without finalization phase'
    );

    assert.ok(
      !isFinalizationRequired({
        completedPhases: ['design', 'implement', 'review', 'devops', 'finalization'],
      }),
      'Should not require finalization if finalization already in completedPhases'
    );
  });

  it('should return valid prompt text from getFinalizationPrompt', () => {
    const {
      getFinalizationPrompt,
      FINALIZATION_STEPS,
    } = require('../../.claude/lib/routing/finalization-checklist.cjs');

    const prompt = getFinalizationPrompt();

    assert.ok(typeof prompt === 'string', 'Prompt should be a string');
    assert.ok(prompt.length > 0, 'Prompt should not be empty');
    assert.ok(prompt.includes('Finalization Checklist'), 'Prompt should include title');

    // Verify all steps appear in prompt
    for (const step of FINALIZATION_STEPS) {
      assert.ok(prompt.includes(step), `Prompt should include step: ${step}`);
    }
  });

  it('should handle null/undefined pipelineState gracefully', () => {
    const {
      isFinalizationRequired,
    } = require('../../.claude/lib/routing/finalization-checklist.cjs');

    assert.ok(!isFinalizationRequired(null), 'null should return false');
    assert.ok(!isFinalizationRequired(undefined), 'undefined should return false');
    assert.ok(!isFinalizationRequired({}), 'empty object should return false');
  });
});
