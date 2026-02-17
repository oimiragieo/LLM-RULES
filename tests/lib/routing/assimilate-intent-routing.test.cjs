'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');

const { INTENT_KEYWORDS } = require(
  path.join(PROJECT_ROOT, '.claude/lib/routing/routing-table-intent-keywords.cjs')
);
const { INTENT_TO_AGENT } = require(
  path.join(PROJECT_ROOT, '.claude/lib/routing/routing-table-intent-agents.cjs')
);
const { fuzzyMatchIntent } = require(
  path.join(PROJECT_ROOT, '.claude/lib/routing/fuzzy-intent-matcher.cjs')
);

describe('assimilate intent routing', () => {
  // Test 1: New keywords exist in INTENT_KEYWORDS
  it('has assimilate intent with extraction keywords', () => {
    assert.ok(INTENT_KEYWORDS.assimilate, 'INTENT_KEYWORDS.assimilate must be defined');
    assert.ok(
      Array.isArray(INTENT_KEYWORDS.assimilate),
      'INTENT_KEYWORDS.assimilate must be an array'
    );
    assert.ok(
      INTENT_KEYWORDS.assimilate.length >= 6,
      `assimilate keywords must have at least 6 entries, got ${INTENT_KEYWORDS.assimilate ? INTENT_KEYWORDS.assimilate.length : 0}`
    );
    const required = [
      'assimilate',
      'extract from codebase',
      'deep dive codebase',
      'benchmark against',
      'adopt best ideas',
      'pull features',
    ];
    for (const kw of required) {
      assert.ok(
        INTENT_KEYWORDS.assimilate.includes(kw),
        `assimilate keywords must include '${kw}'`
      );
    }
  });

  // Test 2: New intent maps to evolution-orchestrator
  it('maps assimilate intent to evolution-orchestrator', () => {
    assert.strictEqual(
      INTENT_TO_AGENT.assimilate,
      'evolution-orchestrator',
      'INTENT_TO_AGENT.assimilate must map to evolution-orchestrator'
    );
  });

  // Test 3: Fuzzy matcher matches "deep dive this codebase and extract" -> assimilate
  it('fuzzy matches codebase extraction prompt to assimilate intent', () => {
    const prompt = 'deep dive this codebase and see what we can extract';
    const result = fuzzyMatchIntent(prompt, INTENT_KEYWORDS, { threshold: 0.3 });
    assert.ok(result !== null, `Expected fuzzyMatchIntent to return a match for: "${prompt}"`);
    assert.strictEqual(
      result.intent,
      'assimilate',
      `Expected intent 'assimilate', got '${result ? result.intent : null}' (confidence: ${result ? result.confidence : 'N/A'})`
    );
  });

  // Test 4: Fuzzy matcher matches "benchmark against other frameworks" -> assimilate
  it('fuzzy matches benchmark prompt to assimilate intent', () => {
    const prompt = 'benchmark against other frameworks';
    const result = fuzzyMatchIntent(prompt, INTENT_KEYWORDS, { threshold: 0.3 });
    assert.ok(result !== null, `Expected fuzzyMatchIntent to return a match for: "${prompt}"`);
    assert.strictEqual(
      result.intent,
      'assimilate',
      `Expected intent 'assimilate', got '${result ? result.intent : null}' (confidence: ${result ? result.confidence : 'N/A'})`
    );
  });

  // Test 5: Existing evolution_orchestrator keywords still match — and assimilate also exists
  it('preserves existing evolution_orchestrator keywords', () => {
    // The assimilate intent must exist before we can assert coexistence
    assert.ok(
      INTENT_KEYWORDS.assimilate,
      'assimilate intent must exist alongside evolution_orchestrator (RED: not yet added)'
    );
    assert.ok(
      Array.isArray(INTENT_KEYWORDS.evolution_orchestrator),
      'evolution_orchestrator keywords must remain defined'
    );
    const originalKeywords = [
      'create agent',
      'create skill',
      'evolve',
      'capability gap',
      'self-improvement',
      'extend capabilities',
    ];
    for (const kw of originalKeywords) {
      assert.ok(
        INTENT_KEYWORDS.evolution_orchestrator.includes(kw),
        `evolution_orchestrator must still contain original keyword '${kw}'`
      );
    }
  });

  // Test 6: No keyword collision between assimilate and evolution_orchestrator
  it('assimilate keywords do not collide with evolution_orchestrator keywords', () => {
    assert.ok(
      INTENT_KEYWORDS.assimilate,
      'assimilate intent must exist for collision check (RED: not yet added)'
    );
    assert.ok(Array.isArray(INTENT_KEYWORDS.assimilate), 'assimilate keywords must be an array');
    assert.ok(
      Array.isArray(INTENT_KEYWORDS.evolution_orchestrator),
      'evolution_orchestrator keywords must be an array'
    );
    const assimilateSet = new Set(INTENT_KEYWORDS.assimilate);
    const collisions = INTENT_KEYWORDS.evolution_orchestrator.filter(kw => assimilateSet.has(kw));
    assert.strictEqual(
      collisions.length,
      0,
      `Found keyword collisions between assimilate and evolution_orchestrator: [${collisions.join(', ')}]`
    );
  });
});
