#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

const { classifyIntent } = require('../../../.claude/lib/routing/intent-classifier.cjs');

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
});
