'use strict';

/**
 * Token Reference Resolver — Unit Tests (TR-001)
 *
 * Run: node --test tests/lib/token-reference/resolver.test.cjs
 *
 * TDD slice TR — RED tests written before implementation. Tests cover:
 *   1. Known skill token resolves to registry value
 *   2. Unknown skill token → literal preserved + warning emitted
 *   3. Non-token string → unchanged, no warnings
 *   4. Object with nested token → recursively resolved
 *   5. Array of tokens → each resolved
 *   6. Mixed agent/skill/hook tokens → resolved from correct registries
 *   7. Unrecognized prefix {foo.bar} → literal unchanged (not resolved)
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveTokenReferences,
  auditAgentSkillRefs,
} = require('../../../.claude/lib/token-reference/resolver.cjs');

// ─── Shared registry fixture ──────────────────────────────────────────────────

const REGISTRY = {
  skills: {
    tdd: 'tdd',
    ripgrep: 'ripgrep',
    'code-semantic-search': 'code-semantic-search',
  },
  agents: {
    developer: 'developer',
    planner: 'planner',
  },
  hooks: {
    'pre-tool-use': 'pre-tool-use',
    'post-tool-use': 'post-tool-use',
  },
};

// ─── Test 1: known skill token resolves ──────────────────────────────────────

test('Test 1: {skill.tdd} resolves to actual skill id', () => {
  const { resolved, warnings } = resolveTokenReferences('{skill.tdd}', REGISTRY);
  assert.strictEqual(resolved, 'tdd', 'should resolve to skill id');
  assert.deepEqual(warnings, [], 'no warnings expected for known skill');
});

// ─── Test 2: unknown skill token → literal + warning ─────────────────────────

test('Test 2: unknown {skill.nonexistent} preserved as literal with warning', () => {
  const { resolved, warnings } = resolveTokenReferences('{skill.nonexistent}', REGISTRY);
  assert.strictEqual(resolved, '{skill.nonexistent}', 'literal should be preserved');
  assert.ok(warnings.length > 0, 'at least one warning should be emitted');
  assert.ok(
    warnings[0].includes('nonexistent'),
    `warning should mention the unknown name, got: ${warnings[0]}`
  );
});

// ─── Test 3: non-token string → unchanged, no warnings ───────────────────────

test('Test 3: plain string without tokens passes through unchanged', () => {
  const input = 'just a plain string with no curly braces';
  const { resolved, warnings } = resolveTokenReferences(input, REGISTRY);
  assert.strictEqual(resolved, input, 'string should be unchanged');
  assert.deepEqual(warnings, [], 'no warnings expected');
});

// ─── Test 4: object with nested token → resolved ─────────────────────────────

test('Test 4: object with nested token is recursively resolved', () => {
  const input = {
    name: 'my-agent',
    skills: ['{skill.tdd}'],
    meta: {
      primarySkill: '{skill.ripgrep}',
    },
  };
  const { resolved, warnings } = resolveTokenReferences(input, REGISTRY);
  assert.strictEqual(resolved.skills[0], 'tdd', 'nested array token resolved');
  assert.strictEqual(resolved.meta.primarySkill, 'ripgrep', 'deeply nested token resolved');
  assert.deepEqual(warnings, [], 'no warnings for known tokens');
  // Original not mutated
  assert.strictEqual(input.skills[0], '{skill.tdd}', 'original not mutated');
});

// ─── Test 5: array of tokens → each resolved ─────────────────────────────────

test('Test 5: array of mixed known/unknown tokens — each resolved independently', () => {
  const input = ['{skill.tdd}', '{skill.nonexistent}', '{skill.ripgrep}'];
  const { resolved, warnings } = resolveTokenReferences(input, REGISTRY);
  assert.strictEqual(resolved[0], 'tdd', 'first token resolved');
  assert.strictEqual(resolved[1], '{skill.nonexistent}', 'unknown token preserved as literal');
  assert.strictEqual(resolved[2], 'ripgrep', 'third token resolved');
  assert.strictEqual(warnings.length, 1, 'exactly one warning for the unknown token');
});

// ─── Test 6: mixed agent/skill/hook tokens ────────────────────────────────────

test('Test 6: mixed {agent.*}, {skill.*}, {hook.*} tokens resolved from correct registries', () => {
  const input = {
    myAgent: '{agent.developer}',
    mySkill: '{skill.code-semantic-search}',
    myHook: '{hook.pre-tool-use}',
  };
  const { resolved, warnings } = resolveTokenReferences(input, REGISTRY);
  assert.strictEqual(resolved.myAgent, 'developer', 'agent token resolved');
  assert.strictEqual(resolved.mySkill, 'code-semantic-search', 'skill token resolved');
  assert.strictEqual(resolved.myHook, 'pre-tool-use', 'hook token resolved');
  assert.deepEqual(warnings, [], 'no warnings for all known tokens');
});

// ─── Test 7: unrecognized prefix {foo.bar} → literal unchanged ───────────────

test('Test 7: unrecognized prefix {foo.bar} is left as literal (not resolved, no warning)', () => {
  const input = 'prefix {foo.bar} should not be touched';
  const { resolved, warnings } = resolveTokenReferences(input, REGISTRY);
  assert.ok(resolved.includes('{foo.bar}'), 'unknown prefix literal preserved');
  // No warning emitted for unrecognized prefixes (they may be template syntax)
  assert.deepEqual(warnings, [], 'no warnings for unrecognized prefix');
});

// ─── auditAgentSkillRefs ──────────────────────────────────────────────────────

test('auditAgentSkillRefs: returns empty array for plain skill names (no tokens)', () => {
  const warnings = auditAgentSkillRefs('developer', ['tdd', 'ripgrep'], REGISTRY.skills);
  assert.deepEqual(warnings, [], 'plain skill names produce no warnings');
});

test('auditAgentSkillRefs: warns on unresolvable {skill.*} token in skills[]', () => {
  const warnings = auditAgentSkillRefs(
    'test-agent',
    ['{skill.tdd}', '{skill.phantom}'],
    REGISTRY.skills
  );
  // tdd is in registry → no warn; phantom is not → 1 warning
  assert.strictEqual(warnings.length, 1, 'one warning for phantom');
  assert.ok(warnings[0].includes('phantom'), 'warning mentions the unknown skill name');
});
