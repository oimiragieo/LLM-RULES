/* global performance */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  generateInvariants,
  checkInvariant,
  checkAction,
  Verdict,
} = require('../../.claude/lib/validation/invariant-checker.cjs');

// ─── Verdict constants ──────────────────────────────────────────────────────

describe('Verdict constants', () => {
  it('exports trichotomy values', () => {
    assert.equal(Verdict.CLEAR_PASS, 'clear_pass');
    assert.equal(Verdict.CLEAR_FAIL, 'clear_fail');
    assert.equal(Verdict.UNCLEAR, 'unclear');
  });
});

// ─── generateInvariants ─────────────────────────────────────────────────────

describe('generateInvariants', () => {
  it('generates tool invariants from frontmatter', () => {
    const frontmatter = {
      name: 'developer',
      tools: ['Read', 'Write', 'Edit', 'Bash', 'TaskUpdate'],
    };
    const invariants = generateInvariants(frontmatter);
    const toolInvariant = invariants.find(i => i.type === 'allowed_tools');
    assert.ok(toolInvariant);
    assert.deepEqual(toolInvariant.allowedTools, ['Read', 'Write', 'Edit', 'Bash', 'TaskUpdate']);
  });

  it('generates skill invariants from frontmatter', () => {
    const frontmatter = {
      name: 'developer',
      tools: ['Read'],
      skills: ['tdd', 'debugging'],
    };
    const invariants = generateInvariants(frontmatter);
    const skillInvariant = invariants.find(i => i.type === 'allowed_skills');
    assert.ok(skillInvariant);
    assert.deepEqual(skillInvariant.allowedSkills, ['tdd', 'debugging']);
  });

  it('generates model invariant from frontmatter', () => {
    const frontmatter = {
      name: 'security-architect',
      tools: ['Read'],
      model: 'opus',
    };
    const invariants = generateInvariants(frontmatter);
    const modelInvariant = invariants.find(i => i.type === 'required_model');
    assert.ok(modelInvariant);
    assert.equal(modelInvariant.model, 'opus');
  });

  it('handles missing tools gracefully', () => {
    const frontmatter = { name: 'test-agent' };
    const invariants = generateInvariants(frontmatter);
    const toolInvariant = invariants.find(i => i.type === 'allowed_tools');
    assert.ok(toolInvariant);
    assert.deepEqual(toolInvariant.allowedTools, []);
  });

  it('handles missing skills gracefully', () => {
    const frontmatter = { name: 'test-agent', tools: ['Read'] };
    const invariants = generateInvariants(frontmatter);
    const skillInvariant = invariants.find(i => i.type === 'allowed_skills');
    assert.ok(skillInvariant);
    assert.deepEqual(skillInvariant.allowedSkills, []);
  });

  it('returns empty invariants for null frontmatter', () => {
    const invariants = generateInvariants(null);
    assert.ok(Array.isArray(invariants));
    assert.equal(invariants.length, 0);
  });

  it('generates agent name invariant', () => {
    const frontmatter = { name: 'qa', tools: ['Read'] };
    const invariants = generateInvariants(frontmatter);
    const nameInvariant = invariants.find(i => i.type === 'agent_name');
    assert.ok(nameInvariant);
    assert.equal(nameInvariant.name, 'qa');
  });
});

// ─── checkInvariant ─────────────────────────────────────────────────────────

describe('checkInvariant', () => {
  it('CLEAR_PASS when tool is in allowed list', () => {
    const invariant = { type: 'allowed_tools', allowedTools: ['Read', 'Write', 'Edit'] };
    const action = { tool: 'Read' };
    const result = checkInvariant(invariant, action);
    assert.equal(result.verdict, Verdict.CLEAR_PASS);
  });

  it('CLEAR_FAIL when tool is not in allowed list', () => {
    const invariant = { type: 'allowed_tools', allowedTools: ['Read'] };
    const action = { tool: 'Write' };
    const result = checkInvariant(invariant, action);
    assert.equal(result.verdict, Verdict.CLEAR_FAIL);
    assert.ok(result.reason.includes('Write'));
  });

  it('UNCLEAR when tool is unknown/missing', () => {
    const invariant = { type: 'allowed_tools', allowedTools: ['Read'] };
    const action = {};
    const result = checkInvariant(invariant, action);
    assert.equal(result.verdict, Verdict.UNCLEAR);
  });

  it('CLEAR_PASS for skill in allowed list', () => {
    const invariant = { type: 'allowed_skills', allowedSkills: ['tdd', 'debugging'] };
    const action = { skill: 'tdd' };
    const result = checkInvariant(invariant, action);
    assert.equal(result.verdict, Verdict.CLEAR_PASS);
  });

  it('UNCLEAR for skill not in list (advisory)', () => {
    const invariant = { type: 'allowed_skills', allowedSkills: ['tdd'] };
    const action = { skill: 'unknown-skill' };
    const result = checkInvariant(invariant, action);
    assert.equal(result.verdict, Verdict.UNCLEAR);
  });

  it('CLEAR_PASS for model check matching', () => {
    const invariant = { type: 'required_model', model: 'opus' };
    const action = { model: 'opus' };
    const result = checkInvariant(invariant, action);
    assert.equal(result.verdict, Verdict.CLEAR_PASS);
  });

  it('CLEAR_FAIL for model mismatch', () => {
    const invariant = { type: 'required_model', model: 'opus' };
    const action = { model: 'haiku' };
    const result = checkInvariant(invariant, action);
    assert.equal(result.verdict, Verdict.CLEAR_FAIL);
  });

  it('UNCLEAR for unknown invariant type', () => {
    const invariant = { type: 'unknown_type' };
    const action = { tool: 'Read' };
    const result = checkInvariant(invariant, action);
    assert.equal(result.verdict, Verdict.UNCLEAR);
  });
});

// ─── checkAction ────────────────────────────────────────────────────────────

describe('checkAction', () => {
  it('returns CLEAR_PASS when all invariants pass', () => {
    const invariants = [
      { type: 'allowed_tools', allowedTools: ['Read', 'Write'] },
      { type: 'agent_name', name: 'developer' },
    ];
    const action = { tool: 'Read' };
    const result = checkAction(invariants, action);
    assert.equal(result.verdict, Verdict.CLEAR_PASS);
    assert.equal(result.checks.length, 2);
  });

  it('returns CLEAR_FAIL when any invariant fails', () => {
    const invariants = [
      { type: 'allowed_tools', allowedTools: ['Read'] },
      { type: 'required_model', model: 'opus' },
    ];
    const action = { tool: 'Write', model: 'opus' };
    const result = checkAction(invariants, action);
    assert.equal(result.verdict, Verdict.CLEAR_FAIL);
  });

  it('returns UNCLEAR when no fail but some unclear', () => {
    const invariants = [
      { type: 'allowed_tools', allowedTools: ['Read'] },
      { type: 'unknown_type' },
    ];
    const action = { tool: 'Read' };
    const result = checkAction(invariants, action);
    assert.equal(result.verdict, Verdict.UNCLEAR);
  });

  it('handles empty invariants', () => {
    const result = checkAction([], { tool: 'Read' });
    assert.equal(result.verdict, Verdict.CLEAR_PASS);
  });

  it('includes agent name in result', () => {
    const invariants = [{ type: 'agent_name', name: 'qa' }];
    const result = checkAction(invariants, { tool: 'Read' });
    assert.equal(result.agentName, 'qa');
  });

  it('performance: checks 100 invariants under 5ms', () => {
    const invariants = [];
    for (let i = 0; i < 100; i++) {
      invariants.push({ type: 'allowed_tools', allowedTools: ['Read', 'Write', 'Edit'] });
    }
    const start = performance.now();
    checkAction(invariants, { tool: 'Read' });
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 5, `Took ${elapsed.toFixed(2)}ms, expected <5ms`);
  });
});
