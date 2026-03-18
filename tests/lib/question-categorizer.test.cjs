'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Lazy require so the test fails clearly if file doesn't exist yet
let categorizeQuestion;
try {
  ({ categorizeQuestion } = require('../../.claude/lib/utils/question-categorizer.cjs'));
} catch {
  categorizeQuestion = null;
}

describe('question-categorizer', () => {
  it('exports categorizeQuestion function', () => {
    assert.strictEqual(typeof categorizeQuestion, 'function');
  });

  it('categorizes scope questions', () => {
    const result = categorizeQuestion('What is included in the project scope?');
    assert.strictEqual(result.category, 'Scope');
    assert.ok(result.confidence >= 0 && result.confidence <= 1);
    assert.strictEqual(typeof result.reason, 'string');
  });

  it('categorizes architecture questions', () => {
    const result = categorizeQuestion('Which design pattern should we use for the API layer?');
    assert.strictEqual(result.category, 'Architecture');
  });

  it('categorizes dependency questions', () => {
    const result = categorizeQuestion('What external libraries or packages are required?');
    assert.strictEqual(result.category, 'Dependencies');
  });

  it('categorizes risk questions', () => {
    const result = categorizeQuestion('What could go wrong with this approach?');
    assert.strictEqual(result.category, 'Risk');
  });

  it('categorizes acceptance criteria questions', () => {
    const result = categorizeQuestion('What does done look like for this feature?');
    assert.strictEqual(result.category, 'AcceptanceCriteria');
  });

  it('returns all five categories in CATEGORIES export', () => {
    const { CATEGORIES } = require('../../.claude/lib/utils/question-categorizer.cjs');
    assert.deepStrictEqual(
      [...CATEGORIES].sort(),
      ['AcceptanceCriteria', 'Architecture', 'Dependencies', 'Risk', 'Scope'].sort()
    );
  });

  it('categorizes batch of questions', () => {
    const { categorizeQuestions } = require('../../.claude/lib/utils/question-categorizer.cjs');
    const questions = [
      'What is in scope?',
      'Which framework to use?',
      'What packages are needed?',
      'What risks exist?',
      'How will we verify it works?',
    ];
    const results = categorizeQuestions(questions);
    assert.strictEqual(results.length, 5);
    results.forEach(r => {
      assert.ok(r.question);
      assert.ok(r.category);
      assert.ok(r.confidence >= 0 && r.confidence <= 1);
    });
  });

  it('handles empty string gracefully', () => {
    const result = categorizeQuestion('');
    assert.ok(result.category);
    assert.ok(result.confidence >= 0);
  });
});
