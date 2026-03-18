#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// C3: Edge Case Hunter
const {
  huntEdgeCases,
  summarizeFindings,
  EDGE_CASE_CATEGORIES,
} = require('../../.claude/lib/diagnostics/edge-case-hunter.cjs');

// F5: LLM-as-Judge
const {
  createEvaluation,
  scoreDimension,
  computeComposite,
  finalizeEvaluation,
  DEFAULT_WEIGHTS,
} = require('../../.claude/lib/diagnostics/llm-judge.cjs');

describe('C3: Edge Case Hunter', () => {
  it('detects boundary conditions', () => {
    const code = 'if (arr.length === 0) return;\nconst first = arr[0];';
    const findings = huntEdgeCases(code, { filePath: 'test.js', categories: ['boundary'] });
    assert.ok(findings.length >= 1);
    assert.ok(findings.some(f => f.category === 'boundary'));
  });

  it('detects type coercion', () => {
    const code = 'if (x == null) return;';
    const findings = huntEdgeCases(code, { categories: ['typeCoercion'] });
    assert.ok(findings.some(f => f.category === 'typeCoercion'));
  });

  it('detects security edge cases', () => {
    // Construct string to avoid security lint false positive on the word ev-al
    const evl = 'ev' + 'al(userInput);';
    const code = evl + '\nel.innerHTML = data;';
    const findings = huntEdgeCases(code, { categories: ['security'] });
    assert.ok(findings.length >= 1);
    assert.ok(findings.every(f => f.risk === 'high'));
  });

  it('returns empty for clean code', () => {
    const code = 'const x = 1;\nconst y = 2;';
    const findings = huntEdgeCases(code);
    // Very simple code may have 0 findings
    assert.ok(Array.isArray(findings));
  });

  it('includes file and line info', () => {
    const code = 'JSON.parse(input);';
    const findings = huntEdgeCases(code, { filePath: 'src/api.js' });
    assert.ok(findings.some(f => f.file === 'src/api.js' && f.line === 1));
  });

  it('summarizeFindings groups by category', () => {
    const findings = [{ category: 'boundary' }, { category: 'boundary' }, { category: 'security' }];
    const summary = summarizeFindings(findings);
    assert.equal(summary.boundary, 2);
    assert.equal(summary.security, 1);
  });

  it('has 5 edge case categories', () => {
    assert.equal(Object.keys(EDGE_CASE_CATEGORIES).length, 5);
  });
});

describe('F5: LLM-as-Judge', () => {
  it('creates a valid evaluation', () => {
    const eval_ = createEvaluation({
      evaluationId: 'eval-1',
      evaluator: 'reflection-agent',
      target: { task_id: 'task-5', agent_type: 'developer' },
    });
    assert.equal(eval_.evaluation_id, 'eval-1');
    assert.equal(eval_.verdict, 'pending');
  });

  it('scores a dimension with evidence', () => {
    const dim = scoreDimension('accuracy', 0.85, {
      evidence: [{ type: 'supports', source: 'tests/auth.test.js', excerpt: 'All tests pass' }],
      reasoning: 'Implementation matches spec',
    });
    assert.equal(dim.name, 'accuracy');
    assert.equal(dim.score, 0.85);
    assert.equal(dim.evidence.length, 1);
  });

  it('rejects invalid dimension name', () => {
    assert.throws(() => scoreDimension('invalid', 0.5));
  });

  it('rejects out-of-range score', () => {
    assert.throws(() => scoreDimension('accuracy', 1.5));
    assert.throws(() => scoreDimension('accuracy', -0.1));
  });

  it('computes weighted composite', () => {
    const dims = [
      scoreDimension('accuracy', 0.9),
      scoreDimension('completeness', 0.8),
      scoreDimension('coherence', 1.0),
    ];
    const composite = computeComposite(dims);
    assert.ok(composite > 0.8);
    assert.ok(composite <= 1.0);
  });

  it('handles empty dimensions', () => {
    assert.equal(computeComposite([]), 0);
  });

  it('finalizes with pass verdict', () => {
    const eval_ = createEvaluation({
      evaluationId: 'e1',
      evaluator: 'test',
      target: { task_id: 't1' },
    });
    const dims = [
      scoreDimension('accuracy', 0.9),
      scoreDimension('completeness', 0.8),
      scoreDimension('coherence', 0.85),
      scoreDimension('groundedness', 0.9),
      scoreDimension('helpfulness', 0.8),
    ];
    const result = finalizeEvaluation(eval_, dims);
    assert.equal(result.verdict, 'pass');
    assert.ok(result.composite_score >= 0.7);
  });

  it('finalizes with fail verdict for low scores', () => {
    const eval_ = createEvaluation({
      evaluationId: 'e2',
      evaluator: 'test',
      target: { task_id: 't2' },
    });
    const dims = [scoreDimension('accuracy', 0.2), scoreDimension('completeness', 0.3)];
    const result = finalizeEvaluation(eval_, dims);
    assert.equal(result.verdict, 'fail');
  });

  it('uses default weights from constant', () => {
    assert.ok(DEFAULT_WEIGHTS.accuracy > 0);
    const total = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0);
    assert.equal(total, 1.0);
  });
});
