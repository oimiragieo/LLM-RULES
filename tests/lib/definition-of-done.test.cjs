'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

let checkDefinitionOfDone;
try {
  ({ checkDefinitionOfDone } = require('../../.claude/lib/utils/definition-of-done.cjs'));
} catch {
  checkDefinitionOfDone = null;
}

describe('definition-of-done', () => {
  it('exports checkDefinitionOfDone function', () => {
    assert.strictEqual(typeof checkDefinitionOfDone, 'function');
  });

  it('returns { passed, checklist, score } structure', () => {
    const result = checkDefinitionOfDone({});
    assert.strictEqual(typeof result.passed, 'boolean');
    assert.ok(Array.isArray(result.checklist));
    assert.ok(typeof result.score === 'number');
  });

  it('checklist has exactly 26 items', () => {
    const result = checkDefinitionOfDone({});
    assert.strictEqual(result.checklist.length, 26);
  });

  it('each checklist item has id, category, description, checked', () => {
    const result = checkDefinitionOfDone({});
    result.checklist.forEach(item => {
      assert.ok(
        typeof item.id === 'string' && item.id.length > 0,
        `Missing id: ${JSON.stringify(item)}`
      );
      assert.ok(typeof item.category === 'string', `Missing category: ${JSON.stringify(item)}`);
      assert.ok(
        typeof item.description === 'string',
        `Missing description: ${JSON.stringify(item)}`
      );
      assert.ok(typeof item.checked === 'boolean', `Missing checked: ${JSON.stringify(item)}`);
    });
  });

  it('checklist covers exactly 5 categories', () => {
    const { CATEGORIES } = require('../../.claude/lib/utils/definition-of-done.cjs');
    assert.strictEqual(CATEGORIES.length, 5);
    CATEGORIES.forEach(c => assert.strictEqual(typeof c, 'string'));
  });

  it('score is 0 when no items checked', () => {
    const result = checkDefinitionOfDone({});
    assert.strictEqual(result.score, 0);
    assert.strictEqual(result.passed, false);
  });

  it('score is 1 when all items checked', () => {
    // Build a context that satisfies all checks
    const { CHECKLIST_ITEMS } = require('../../.claude/lib/utils/definition-of-done.cjs');
    const context = {};
    CHECKLIST_ITEMS.forEach(item => {
      context[item.contextKey] = true;
    });
    const result = checkDefinitionOfDone(context);
    assert.strictEqual(result.score, 1);
    assert.strictEqual(result.passed, true);
    result.checklist.forEach(item => assert.strictEqual(item.checked, true));
  });

  it('passed is false when score < 1', () => {
    const { CHECKLIST_ITEMS } = require('../../.claude/lib/utils/definition-of-done.cjs');
    const context = {};
    // Mark only half
    CHECKLIST_ITEMS.slice(0, 13).forEach(item => {
      context[item.contextKey] = true;
    });
    const result = checkDefinitionOfDone(context);
    assert.strictEqual(result.passed, false);
    assert.ok(result.score > 0 && result.score < 1);
  });

  it('score is a fraction between 0 and 1 inclusive', () => {
    const result = checkDefinitionOfDone({});
    assert.ok(result.score >= 0 && result.score <= 1);
  });

  it('all 5 categories are represented in checklist', () => {
    const { CATEGORIES } = require('../../.claude/lib/utils/definition-of-done.cjs');
    const result = checkDefinitionOfDone({});
    const foundCategories = new Set(result.checklist.map(i => i.category));
    CATEGORIES.forEach(cat => {
      assert.ok(foundCategories.has(cat), `Category "${cat}" missing from checklist`);
    });
  });
});
