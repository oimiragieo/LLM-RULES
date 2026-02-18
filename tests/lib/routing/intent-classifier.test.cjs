#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

const {
  classifyIntent,
  recordIntentFeedback,
} = require('../../../.claude/lib/routing/intent-classifier.cjs');

describe('intent-classifier', () => {
  it('should detect architect intent and capability from intent keywords', () => {
    const result = classifyIntent('We need a system architecture review for auth.');
    assert.strictEqual(result.intent, 'architect');
    assert.strictEqual(result.capability, 'architecture-design');
    assert.strictEqual(result.defaultAgent, 'architect');
    assert.strictEqual(result.confidence, 'high');
  });

  it('should fall back to routing table for simple keywords', () => {
    const result = classifyIntent('Need a context_diagram for this system.');
    assert.strictEqual(result.intent, 'context_diagram');
    assert.strictEqual(result.defaultAgent, 'c4-context');
  });

  it('should return general for very short prompts', () => {
    const result = classifyIntent('ok');
    assert.strictEqual(result.intent, 'general');
    assert.strictEqual(result.confidence, 'low');
  });

  it('should include alternatives when requested', () => {
    const result = classifyIntent('review the code', {
      includeAlternatives: true,
      maxAlternatives: 2,
    });
    assert.ok(Array.isArray(result.alternatives));
    assert.ok(result.alternatives.length <= 2);
  });

  it('routes feature prompts to planner', () => {
    const result = classifyIntent('We need to plan a new feature rollout.');
    assert.strictEqual(result.defaultAgent, 'planner');
  });

  it('keeps refactor routing on code-simplifier (not architect pattern override)', () => {
    const result = classifyIntent('Please refactor this legacy module for clarity.');
    assert.strictEqual(result.defaultAgent, 'code-simplifier');
  });

  it('routes party mode prompts to party-orchestrator', () => {
    const result = classifyIntent(
      'Use party mode for a structured multi-agent collaboration session.'
    );
    assert.strictEqual(result.defaultAgent, 'party-orchestrator');
  });

  it('should record intent feedback to a custom path', () => {
    const tmpPath = require('path').join(__dirname, 'intent-feedback.test.json');
    process.env.INTENT_FEEDBACK_PATH = tmpPath;
    recordIntentFeedback('code-reviewer', true, { maxEntries: 10 });
    const payload = JSON.parse(require('fs').readFileSync(tmpPath, 'utf8'));
    assert.ok(Array.isArray(payload.entries));
    assert.equal(payload.entries[payload.entries.length - 1].intentId, 'code-reviewer');
    require('fs').unlinkSync(tmpPath);
    delete process.env.INTENT_FEEDBACK_PATH;
  });
});
