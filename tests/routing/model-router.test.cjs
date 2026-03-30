#!/usr/bin/env node
'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { ModelRouter } = require('../../.claude/lib/routing/model-router.cjs');
const { ModelRegistry } = require('../../.claude/lib/routing/model-registry.cjs');
const { CostPredictor } = require('../../.claude/lib/routing/cost-predictor.cjs');

// ---------------------------------------------------------------------------
// Helpers — stubs & factories
// ---------------------------------------------------------------------------

/** Build a ModelRegistry using the real config file */
function makeRegistry() {
  return new ModelRegistry(path.join(__dirname, '../../.claude/config/model-registry.json'));
}

/**
 * Build a minimal stub TokenAccountant.
 * @param {{ costUSD?: number }} opts
 */
function makeStubAccountant({ costUSD = 0 } = {}) {
  return {
    getSessionTotal() {
      return { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUSD, taskCount: 0 };
    },
    toJSON() {
      return { tasks: {}, session: { costUSD, taskCount: 0 }, records: {} };
    },
  };
}

/**
 * Build a stub intentClassifier.
 * @param {{ intent?: string, defaultAgent?: string|null, confidence?: string }} opts
 */
function makeStubClassifier({ intent = 'general', defaultAgent = null, confidence = 'low' } = {}) {
  return {
    classifyIntent(_prompt) {
      return {
        intent,
        capability: null,
        defaultAgent,
        confidence,
        source: 'test',
        alternatives: [],
      };
    },
  };
}

/** Build a ModelRouter with sensible defaults */
function makeRouter({ registry, predictor, classifier, config = {} } = {}) {
  const reg = registry || makeRegistry();
  const pred = predictor || new CostPredictor(reg, makeStubAccountant());
  const cls = classifier || makeStubClassifier();
  return new ModelRouter({
    modelRegistry: reg,
    costPredictor: pred,
    intentClassifier: cls,
    config,
  });
}

// ---------------------------------------------------------------------------
// ModelRouter — selectModel
// ---------------------------------------------------------------------------

describe('ModelRouter', () => {
  let registry;
  let predictor;

  before(() => {
    registry = makeRegistry();
    predictor = new CostPredictor(registry, makeStubAccountant());
  });

  // -------------------------------------------------------------------------
  // Constructor & basic shape
  // -------------------------------------------------------------------------
  describe('constructor', () => {
    it('creates instance with required dependencies', () => {
      const router = makeRouter();
      assert.ok(router instanceof ModelRouter);
    });

    it('accepts optional config parameter', () => {
      const router = makeRouter({ config: { qualityFloor: 'haiku' } });
      assert.ok(router instanceof ModelRouter);
    });
  });

  // -------------------------------------------------------------------------
  // selectModel — return shape
  // -------------------------------------------------------------------------
  describe('selectModel — return shape', () => {
    it('returns a ModelSelection with all required fields', () => {
      const router = makeRouter({ registry, predictor });
      const result = router.selectModel('write some code');

      assert.ok(typeof result === 'object' && result !== null, 'result should be object');
      assert.ok(typeof result.model === 'string', 'model should be string');
      assert.ok(typeof result.shorthand === 'string', 'shorthand should be string');
      assert.ok(typeof result.reason === 'string', 'reason should be string');
      assert.ok(
        ['intent', 'cost-override', 'budget-downgrade', 'complexity-default', 'config'].includes(
          result.source
        ),
        `source '${result.source}' should be one of the allowed values`
      );
      assert.ok(typeof result.originalModel === 'string', 'originalModel should be string');
      assert.ok(typeof result.estimatedCostUSD === 'number', 'estimatedCostUSD should be number');
      assert.ok(typeof result.confidence === 'string', 'confidence should be string');
    });

    it('returned model exists in ModelRegistry (VAL-MR-010)', () => {
      const router = makeRouter({ registry, predictor });
      const result = router.selectModel('plan a large system architecture');
      const entry = registry.getModel(result.model);
      assert.ok(entry !== null, `model '${result.model}' should exist in registry`);
    });

    it('estimatedCostUSD is a non-negative number (VAL-MR-010)', () => {
      const router = makeRouter({ registry, predictor });
      const result = router.selectModel('fix this bug');
      assert.ok(result.estimatedCostUSD >= 0, 'estimatedCostUSD should be non-negative');
    });

    it('originalModel equals model when no downgrade occurs', () => {
      const router = makeRouter({ registry, predictor });
      const result = router.selectModel('hello');
      assert.strictEqual(result.originalModel, result.model);
    });
  });

  // -------------------------------------------------------------------------
  // selectModel — intent-based routing (VAL-MR-010)
  // -------------------------------------------------------------------------
  describe('selectModel — intent-based routing (VAL-MR-010)', () => {
    it('high-confidence intent with planner agent routes to opus (VAL-MR-010)', () => {
      const classifier = makeStubClassifier({
        intent: 'planning',
        defaultAgent: 'planner',
        confidence: 'high',
      });
      const router = makeRouter({ registry, predictor, classifier });
      const result = router.selectModel('plan a complex system migration');

      assert.strictEqual(result.shorthand, 'opus', 'planner should resolve to opus');
      assert.ok(
        result.source === 'intent' || result.source === 'complexity-default',
        `source should be intent or complexity-default, got '${result.source}'`
      );
    });

    it('high-confidence intent with architect agent routes to opus (VAL-MR-010)', () => {
      const classifier = makeStubClassifier({
        intent: 'architecture',
        defaultAgent: 'architect',
        confidence: 'high',
      });
      const router = makeRouter({ registry, predictor, classifier });
      const result = router.selectModel('design the full system architecture');

      assert.strictEqual(result.shorthand, 'opus', 'architect should resolve to opus');
    });

    it('low-confidence intent routes to a cheaper model (VAL-MR-010)', () => {
      const classifier = makeStubClassifier({
        intent: 'general',
        defaultAgent: null,
        confidence: 'low',
      });
      const router = makeRouter({ registry, predictor, classifier });
      const result = router.selectModel('hi there');

      assert.notStrictEqual(result.shorthand, 'opus', 'low-confidence should not route to opus');
    });

    it('medium-confidence routes to sonnet or below (VAL-MR-010)', () => {
      const classifier = makeStubClassifier({
        intent: 'coding',
        defaultAgent: null,
        confidence: 'medium',
      });
      const router = makeRouter({ registry, predictor, classifier });
      const result = router.selectModel('write a helper function');

      assert.ok(
        ['sonnet', 'haiku'].includes(result.shorthand),
        `medium-confidence should use sonnet or haiku, got '${result.shorthand}'`
      );
    });

    it('context-compressor agent routes to haiku (VAL-MR-010)', () => {
      const classifier = makeStubClassifier({
        intent: 'compression',
        defaultAgent: 'context-compressor',
        confidence: 'high',
      });
      const router = makeRouter({ registry, predictor, classifier });
      const result = router.selectModel('compress this context');

      assert.strictEqual(result.shorthand, 'haiku', 'context-compressor should resolve to haiku');
    });

    it('source is "intent" when defaultAgent is provided (VAL-MR-010)', () => {
      const classifier = makeStubClassifier({
        intent: 'planning',
        defaultAgent: 'planner',
        confidence: 'high',
      });
      const router = makeRouter({ registry, predictor, classifier });
      const result = router.selectModel('plan this project');

      assert.strictEqual(result.source, 'intent');
    });

    it('source is "complexity-default" when no defaultAgent (VAL-MR-010)', () => {
      const classifier = makeStubClassifier({
        intent: 'general',
        defaultAgent: null,
        confidence: 'low',
      });
      const router = makeRouter({ registry, predictor, classifier });
      const result = router.selectModel('something simple');

      assert.strictEqual(result.source, 'complexity-default');
    });

    it('confidence field is passed through from intent classifier (VAL-MR-010)', () => {
      const classifier = makeStubClassifier({
        intent: 'planning',
        defaultAgent: 'planner',
        confidence: 'high',
      });
      const router = makeRouter({ registry, predictor, classifier });
      const result = router.selectModel('plan this');

      assert.strictEqual(result.confidence, 'high');
    });
  });

  // -------------------------------------------------------------------------
  // selectModel — context parameters
  // -------------------------------------------------------------------------
  describe('selectModel — context parameters', () => {
    it('agentType in context overrides intent classification', () => {
      const classifier = makeStubClassifier({
        intent: 'general',
        defaultAgent: null,
        confidence: 'low',
      });
      const router = makeRouter({ registry, predictor, classifier });
      const result = router.selectModel('do something', { agentType: 'planner' });

      assert.strictEqual(result.shorthand, 'opus', 'agentType=planner should resolve to opus');
    });

    it('agentType=context-compressor resolves to haiku', () => {
      const router = makeRouter({ registry, predictor });
      const result = router.selectModel('summarize', { agentType: 'context-compressor' });
      assert.strictEqual(result.shorthand, 'haiku');
    });

    it('agentType=developer resolves to sonnet (default)', () => {
      const router = makeRouter({ registry, predictor });
      const result = router.selectModel('write code', { agentType: 'developer' });
      assert.strictEqual(result.shorthand, 'sonnet');
    });
  });

  // -------------------------------------------------------------------------
  // selectModel — config overrides (VAL-MR-010)
  // -------------------------------------------------------------------------
  describe('selectModel — config overrides take precedence', () => {
    it('config.model overrides intent-based routing', () => {
      const classifier = makeStubClassifier({
        intent: 'planning',
        defaultAgent: 'planner',
        confidence: 'high',
      });
      // Even though planner → opus, config says use haiku
      const router = makeRouter({ registry, predictor, classifier, config: { model: 'haiku' } });
      const result = router.selectModel('plan this project');

      assert.strictEqual(result.shorthand, 'haiku', 'config.model should take precedence');
      assert.strictEqual(result.source, 'config', 'source should be config');
    });

    it('config.model with full ID is resolved correctly', () => {
      const router = makeRouter({
        registry,
        predictor,
        config: { model: 'claude-sonnet-4-6' },
      });
      const result = router.selectModel('do something');
      assert.strictEqual(result.shorthand, 'sonnet');
      assert.strictEqual(result.source, 'config');
    });

    it('config-selected model exists in registry', () => {
      const router = makeRouter({
        registry,
        predictor,
        config: { model: 'opus' },
      });
      const result = router.selectModel('complex task');
      const entry = registry.getModel(result.model);
      assert.ok(entry !== null, 'config model should exist in registry');
    });

    it('invalid config.model falls back to dynamic routing', () => {
      const classifier = makeStubClassifier({
        intent: 'planning',
        defaultAgent: 'planner',
        confidence: 'high',
      });
      const router = makeRouter({
        registry,
        predictor,
        classifier,
        config: { model: 'nonexistent-model-xyz' },
      });
      const result = router.selectModel('plan this');
      // Should fall through to dynamic routing
      assert.notStrictEqual(result.source, 'config', 'invalid config model should fall back');
    });
  });

  // -------------------------------------------------------------------------
  // applyBudgetConstraint (VAL-MR-011)
  // -------------------------------------------------------------------------
  describe('applyBudgetConstraint (VAL-MR-011)', () => {
    it('does not downgrade when remaining budget >= threshold', () => {
      const router = makeRouter({ registry, predictor });
      const selection = {
        model: 'claude-opus-4-6',
        shorthand: 'opus',
        reason: 'intent routing',
        source: 'intent',
        originalModel: 'claude-opus-4-6',
        estimatedCostUSD: 0.5,
        confidence: 'high',
      };
      const budget = { remaining: 5.0, threshold: 1.0, qualityFloor: 'haiku' };
      const result = router.applyBudgetConstraint(selection, budget);

      assert.strictEqual(result.shorthand, 'opus', 'should not downgrade when budget is fine');
      assert.strictEqual(result.source, 'intent', 'source should not change');
    });

    it('downgrades opus to sonnet when budget is below threshold (VAL-MR-011)', () => {
      const router = makeRouter({ registry, predictor });
      const selection = {
        model: 'claude-opus-4-6',
        shorthand: 'opus',
        reason: 'intent routing',
        source: 'intent',
        originalModel: 'claude-opus-4-6',
        estimatedCostUSD: 2.0,
        confidence: 'high',
      };
      const budget = { remaining: 0.5, threshold: 1.0, qualityFloor: 'haiku' };
      const result = router.applyBudgetConstraint(selection, budget);

      assert.strictEqual(result.shorthand, 'sonnet', 'opus should downgrade to sonnet');
      assert.strictEqual(result.source, 'budget-downgrade', 'source should be budget-downgrade');
      assert.strictEqual(
        result.originalModel,
        'claude-opus-4-6',
        'originalModel should be preserved'
      );
    });

    it('downgrades sonnet to haiku when budget is below threshold (VAL-MR-011)', () => {
      const router = makeRouter({ registry, predictor });
      const selection = {
        model: 'claude-sonnet-4-6',
        shorthand: 'sonnet',
        reason: 'complexity default',
        source: 'complexity-default',
        originalModel: 'claude-sonnet-4-6',
        estimatedCostUSD: 0.5,
        confidence: 'medium',
      };
      const budget = { remaining: 0.1, threshold: 0.5, qualityFloor: 'haiku' };
      const result = router.applyBudgetConstraint(selection, budget);

      assert.strictEqual(result.shorthand, 'haiku', 'sonnet should downgrade to haiku');
      assert.strictEqual(result.source, 'budget-downgrade');
      assert.strictEqual(result.originalModel, 'claude-sonnet-4-6', 'originalModel preserved');
    });

    it('does not downgrade below qualityFloor (VAL-MR-011)', () => {
      const router = makeRouter({ registry, predictor });
      const selection = {
        model: 'claude-opus-4-6',
        shorthand: 'opus',
        reason: 'intent',
        source: 'intent',
        originalModel: 'claude-opus-4-6',
        estimatedCostUSD: 2.0,
        confidence: 'high',
      };
      // qualityFloor = sonnet, so should only downgrade to sonnet, not haiku
      const budget = { remaining: 0.01, threshold: 1.0, qualityFloor: 'sonnet' };
      const result = router.applyBudgetConstraint(selection, budget);

      assert.strictEqual(result.shorthand, 'sonnet', 'should not downgrade below sonnet floor');
    });

    it('does not downgrade when already at qualityFloor (VAL-MR-011)', () => {
      const router = makeRouter({ registry, predictor });
      const selection = {
        model: 'claude-sonnet-4-6',
        shorthand: 'sonnet',
        reason: 'complexity',
        source: 'complexity-default',
        originalModel: 'claude-sonnet-4-6',
        estimatedCostUSD: 0.3,
        confidence: 'medium',
      };
      // qualityFloor = sonnet, already at floor
      const budget = { remaining: 0.01, threshold: 1.0, qualityFloor: 'sonnet' };
      const result = router.applyBudgetConstraint(selection, budget);

      assert.strictEqual(result.shorthand, 'sonnet', 'should not downgrade past floor');
      assert.notStrictEqual(result.source, 'budget-downgrade', 'should not change source');
    });

    it('haiku cannot be downgraded further (VAL-MR-011)', () => {
      const router = makeRouter({ registry, predictor });
      const selection = {
        model: 'claude-haiku-4-5-20251001',
        shorthand: 'haiku',
        reason: 'complexity',
        source: 'complexity-default',
        originalModel: 'claude-haiku-4-5-20251001',
        estimatedCostUSD: 0.01,
        confidence: 'low',
      };
      const budget = { remaining: 0.001, threshold: 1.0, qualityFloor: 'haiku' };
      const result = router.applyBudgetConstraint(selection, budget);

      assert.strictEqual(result.shorthand, 'haiku', 'haiku cannot be downgraded');
      assert.notStrictEqual(result.source, 'budget-downgrade', 'source should not change');
    });

    it('sets source="budget-downgrade" on downgrade (VAL-MR-011)', () => {
      const router = makeRouter({ registry, predictor });
      const selection = {
        model: 'claude-opus-4-6',
        shorthand: 'opus',
        reason: 'intent',
        source: 'intent',
        originalModel: 'claude-opus-4-6',
        estimatedCostUSD: 1.0,
        confidence: 'high',
      };
      const budget = { remaining: 0.3, threshold: 1.0, qualityFloor: 'haiku' };
      const result = router.applyBudgetConstraint(selection, budget);

      assert.strictEqual(result.source, 'budget-downgrade');
    });

    it('preserves originalModel field on downgrade (VAL-MR-011)', () => {
      const router = makeRouter({ registry, predictor });
      const selection = {
        model: 'claude-opus-4-6',
        shorthand: 'opus',
        reason: 'intent',
        source: 'intent',
        originalModel: 'claude-opus-4-6',
        estimatedCostUSD: 1.0,
        confidence: 'high',
      };
      const budget = { remaining: 0.3, threshold: 1.0, qualityFloor: 'haiku' };
      const result = router.applyBudgetConstraint(selection, budget);

      assert.strictEqual(
        result.originalModel,
        'claude-opus-4-6',
        'originalModel should be preserved'
      );
    });

    it('downgraded model exists in ModelRegistry (VAL-MR-011)', () => {
      const router = makeRouter({ registry, predictor });
      const selection = {
        model: 'claude-opus-4-6',
        shorthand: 'opus',
        reason: 'intent',
        source: 'intent',
        originalModel: 'claude-opus-4-6',
        estimatedCostUSD: 1.0,
        confidence: 'high',
      };
      const budget = { remaining: 0.3, threshold: 1.0, qualityFloor: 'haiku' };
      const result = router.applyBudgetConstraint(selection, budget);

      const entry = registry.getModel(result.model);
      assert.ok(entry !== null, `downgraded model '${result.model}' should exist in registry`);
    });

    it('returns selection unchanged when budget is null', () => {
      const router = makeRouter({ registry, predictor });
      const selection = {
        model: 'claude-opus-4-6',
        shorthand: 'opus',
        reason: 'intent',
        source: 'intent',
        originalModel: 'claude-opus-4-6',
        estimatedCostUSD: 1.0,
        confidence: 'high',
      };
      const result = router.applyBudgetConstraint(selection, null);
      assert.strictEqual(result.shorthand, 'opus', 'null budget should not change selection');
    });
  });

  // -------------------------------------------------------------------------
  // selectModel + budget in context
  // -------------------------------------------------------------------------
  describe('selectModel with budget context', () => {
    it('applies budget constraint when context.budget is provided', () => {
      const classifier = makeStubClassifier({
        intent: 'planning',
        defaultAgent: 'planner',
        confidence: 'high',
      });
      const router = makeRouter({ registry, predictor, classifier });

      const result = router.selectModel('plan the system', {
        budget: { remaining: 0.3, threshold: 1.0, qualityFloor: 'haiku' },
      });

      // planner would select opus, but budget is low so it should downgrade
      assert.strictEqual(result.source, 'budget-downgrade', 'should apply budget downgrade');
      assert.notStrictEqual(result.shorthand, 'opus', 'should not stay at opus with low budget');
    });

    it('preserves originalModel when budget triggers downgrade via selectModel', () => {
      const classifier = makeStubClassifier({
        intent: 'planning',
        defaultAgent: 'planner',
        confidence: 'high',
      });
      const router = makeRouter({ registry, predictor, classifier });

      const result = router.selectModel('plan the system', {
        budget: { remaining: 0.3, threshold: 1.0, qualityFloor: 'haiku' },
      });

      assert.strictEqual(result.originalModel, 'claude-opus-4-6');
    });
  });

  // -------------------------------------------------------------------------
  // All returned models exist in registry
  // -------------------------------------------------------------------------
  describe('all returned models exist in ModelRegistry', () => {
    const prompts = [
      'plan a complex system architecture',
      'write a simple hello world',
      'compress context data',
      'review security implications',
      'debug this code',
    ];

    for (const prompt of prompts) {
      it(`model for prompt "${prompt}" exists in registry`, () => {
        const router = makeRouter({ registry, predictor });
        const result = router.selectModel(prompt);
        const entry = registry.getModel(result.model);
        assert.ok(
          entry !== null,
          `model '${result.model}' for "${prompt}" should exist in registry`
        );
      });
    }
  });
});
