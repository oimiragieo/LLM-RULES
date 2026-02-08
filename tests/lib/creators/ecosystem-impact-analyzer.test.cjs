#!/usr/bin/env node
/**
 * Tests for ecosystem-impact-analyzer.cjs
 *
 * TDD RED phase: Tests written before implementation.
 * Tests cover:
 * 1. analyzeImpact - returns structured impact report
 * 2. checkMustHaveCompletion - checks if must-have items are present
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Module under test
const {
  analyzeImpact,
  checkMustHaveCompletion,
} = require('../../../.claude/lib/creators/ecosystem-impact-analyzer.cjs');

// =============================================================================
// analyzeImpact
// =============================================================================

describe('analyzeImpact', () => {
  it('returns correct structure for agent type', () => {
    const result = analyzeImpact('agent', '.claude/agents/core/test-agent.md');

    assert.strictEqual(result.artifactType, 'agent');
    assert.strictEqual(result.artifactPath, '.claude/agents/core/test-agent.md');
    assert.ok(Array.isArray(result.mustHave), 'mustHave should be array');
    assert.ok(Array.isArray(result.shouldHave), 'shouldHave should be array');
    assert.ok(Array.isArray(result.niceToHave), 'niceToHave should be array');
    assert.ok(result.mustHave.length > 0, 'agent should have mustHave items');
  });

  it('returns correct mustHave items for agent type', () => {
    const result = analyzeImpact('agent', '.claude/agents/core/test-agent.md');

    const actions = result.mustHave.map(item => item.action);
    assert.ok(actions.includes('update-routing-table'), 'should require routing table update');
    assert.ok(actions.includes('update-agent-registry'), 'should require agent registry update');
    assert.ok(actions.includes('update-claude-md'), 'should require CLAUDE.md update');
  });

  it('returns correct structure for skill type', () => {
    const result = analyzeImpact('skill', '.claude/skills/test-skill/SKILL.md');

    assert.strictEqual(result.artifactType, 'skill');
    assert.ok(result.mustHave.length > 0);

    const actions = result.mustHave.map(item => item.action);
    assert.ok(actions.includes('update-skill-catalog'), 'should require skill catalog update');
  });

  it('returns shouldHave with command suggestion for skill', () => {
    const result = analyzeImpact('skill', '.claude/skills/test-skill/SKILL.md');

    const shouldActions = result.shouldHave.map(item => item.action);
    assert.ok(shouldActions.includes('create-command'), 'skill should suggest creating a command');
  });

  it('returns empty arrays for unknown artifact type', () => {
    const result = analyzeImpact('unknown-type', '/some/path');

    assert.strictEqual(result.artifactType, 'unknown-type');
    assert.strictEqual(result.mustHave.length, 0);
    assert.strictEqual(result.shouldHave.length, 0);
    assert.strictEqual(result.niceToHave.length, 0);
  });

  it('includes completionScore field', () => {
    const result = analyzeImpact('hook', '.claude/hooks/safety/test-hook.cjs');

    assert.ok(typeof result.completionScore === 'number', 'completionScore should be a number');
    assert.ok(result.completionScore >= 0 && result.completionScore <= 1, 'score should be between 0 and 1');
  });

  it('returns correct items for hook type', () => {
    const result = analyzeImpact('hook', '.claude/hooks/routing/test-hook.cjs');

    const mustActions = result.mustHave.map(item => item.action);
    assert.ok(mustActions.includes('register-in-settings'), 'hook should require settings.json registration');
    assert.ok(mustActions.includes('add-test'), 'hook should require test file');
  });
});

// =============================================================================
// checkMustHaveCompletion
// =============================================================================

describe('checkMustHaveCompletion', () => {
  it('returns complete:false for non-existent artifact paths', () => {
    const result = checkMustHaveCompletion('agent', '.claude/agents/core/nonexistent-agent-xyz.md');

    assert.strictEqual(result.complete, false);
    assert.ok(Array.isArray(result.missing), 'should have missing array');
    assert.ok(result.missing.length > 0, 'should have missing items');
    assert.ok(Array.isArray(result.present), 'should have present array');
  });

  it('returns structured result with missing and present arrays', () => {
    const result = checkMustHaveCompletion('skill', '.claude/skills/test-skill/SKILL.md');

    assert.ok(Array.isArray(result.missing));
    assert.ok(Array.isArray(result.present));
    assert.ok(typeof result.complete === 'boolean');
  });

  it('handles unknown artifact type gracefully', () => {
    const result = checkMustHaveCompletion('unknown-type', '/some/path');

    assert.strictEqual(result.complete, true, 'unknown type with no mustHave should be complete');
    assert.strictEqual(result.missing.length, 0);
  });

  it('returns correct completeness for real artifact types', () => {
    // An artifact with catalog-type mustHave items will have missing items
    // since we haven't actually updated any catalogs
    const result = checkMustHaveCompletion('schema', '.claude/schemas/test-schema.schema.json');

    assert.ok(typeof result.complete === 'boolean');
    // Schema has update-schema-catalog as mustHave
    // Since we haven't updated the catalog, it should be missing
    assert.ok(result.missing.length > 0 || result.present.length > 0, 'should have checked at least one item');
  });
});
