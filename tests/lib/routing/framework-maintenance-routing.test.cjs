#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

const { classifyIntent } = require('../../../.claude/lib/routing/intent-classifier.cjs');

describe('framework-maintenance-routing', () => {
  it('should route .claude/hooks/ paths to devops', () => {
    const result = classifyIntent(
      'Fix logic in .claude/hooks/routing/user-prompt-unified.core.cjs'
    );
    assert.strictEqual(result.intent, 'framework_maintenance');
    assert.strictEqual(result.defaultAgent, 'devops');
  });

  it('should route .claude/tools/ paths to devops', () => {
    const result = classifyIntent('Update .claude/tools/cli/worktree-prune.cjs to support --force');
    assert.strictEqual(result.intent, 'framework_maintenance');
    assert.strictEqual(result.defaultAgent, 'devops');
  });

  it('should route .claude/agents/ paths to devops', () => {
    const result = classifyIntent('Modify .claude/agents/core/developer.md frontmatter');
    assert.strictEqual(result.intent, 'framework_maintenance');
    assert.strictEqual(result.defaultAgent, 'devops');
  });

  it('should route .claude/skills/ paths to devops', () => {
    const result = classifyIntent('Improve .claude/skills/tdd/SKILL.md documentation');
    assert.strictEqual(result.intent, 'framework_maintenance');
    assert.strictEqual(result.defaultAgent, 'devops');
  });

  it('should route "framework maintenance" keyword to devops', () => {
    const result = classifyIntent('Perform some framework maintenance tasks');
    assert.strictEqual(result.intent, 'framework_maintenance');
    assert.strictEqual(result.defaultAgent, 'devops');
  });

  it('should route "internal hooks" to devops', () => {
    const result = classifyIntent('We need to audit our internal hooks for security');
    assert.strictEqual(result.intent, 'framework_maintenance');
    assert.strictEqual(result.defaultAgent, 'devops');
  });
});
