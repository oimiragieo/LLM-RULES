'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateFindings,
  classifyFindings,
  detectLazyApproval,
  shouldReAnalyze,
  formatAdversarialPrompt,
} = require('../../../.claude/lib/review/adversarial-evaluator.cjs');

describe('evaluateFindings', () => {
  it('triggers re-analysis when findings array is empty', () => {
    const result = evaluateFindings([]);
    assert.equal(result.reAnalysisRequired, true, 'empty findings should require re-analysis');
  });

  it('accepts and classifies findings when 3+ findings provided', () => {
    const findings = [
      { severity: 'critical', description: 'SQL injection in user login' },
      { severity: 'high', description: 'Missing auth check on admin endpoint' },
      { severity: 'medium', description: 'Sensitive data logged in plaintext' },
    ];
    const result = evaluateFindings(findings);
    assert.equal(result.reAnalysisRequired, false, '3+ findings should not require re-analysis');
    assert.ok(result.classified, 'result should include classified findings');
    assert.equal(result.totalFindings, 3, 'total findings count should be 3');
  });

  it('returns reAnalysisRequired: false for valid terminal state with reAnalyzed flag', () => {
    const findings = [{ severity: 'low', description: 'Minor style issue' }];
    const result = evaluateFindings(findings, { reAnalyzed: true, noLegitimateIssues: false });
    assert.equal(
      result.reAnalysisRequired,
      false,
      'reAnalyzed state should not require further re-analysis'
    );
  });

  it('accepts valid terminal state when noLegitimateIssues is true after re-analysis', () => {
    const result = evaluateFindings([], { reAnalyzed: true, noLegitimateIssues: true });
    assert.equal(
      result.reAnalysisRequired,
      false,
      'confirmed-clean after re-analysis is a valid terminal state'
    );
  });
});

describe('classifyFindings', () => {
  it('groups findings by severity into critical/high/medium/low buckets', () => {
    const findings = [
      { severity: 'critical', description: 'RCE via deserialization' },
      { severity: 'critical', description: 'Auth bypass' },
      { severity: 'high', description: 'XSS in search' },
      { severity: 'medium', description: 'Missing rate limiting' },
      { severity: 'low', description: 'Verbose error messages' },
    ];
    const result = classifyFindings(findings);
    assert.equal(result.critical.length, 2, 'should have 2 critical findings');
    assert.equal(result.high.length, 1, 'should have 1 high finding');
    assert.equal(result.medium.length, 1, 'should have 1 medium finding');
    assert.equal(result.low.length, 1, 'should have 1 low finding');
  });

  it('returns empty arrays for missing severity levels', () => {
    const findings = [{ severity: 'high', description: 'some issue' }];
    const result = classifyFindings(findings);
    assert.deepEqual(result.critical, [], 'critical should be empty array');
    assert.deepEqual(result.medium, [], 'medium should be empty array');
    assert.deepEqual(result.low, [], 'low should be empty array');
  });
});

describe('detectLazyApproval', () => {
  it('detects "looks good" as lazy approval', () => {
    assert.equal(detectLazyApproval('looks good'), true);
  });

  it('detects "LGTM" as lazy approval (case-insensitive)', () => {
    assert.equal(detectLazyApproval('LGTM'), true);
  });

  it('detects "no issues" as lazy approval', () => {
    assert.equal(detectLazyApproval('no issues'), true);
  });

  it('does not flag substantive review as lazy approval', () => {
    assert.equal(
      detectLazyApproval(
        'Found 3 issues: SQL injection on line 42, missing auth on /admin, and unvalidated redirect'
      ),
      false
    );
  });

  it('detects "ship it" as lazy approval', () => {
    assert.equal(detectLazyApproval('ship it'), true);
  });

  it('detects "approved" standalone as lazy approval', () => {
    assert.equal(detectLazyApproval('approved'), true);
  });

  it('does not flag text that merely contains an approval word in context', () => {
    assert.equal(
      detectLazyApproval('I approved of the approach but found 2 high-severity issues'),
      false
    );
  });
});

describe('shouldReAnalyze', () => {
  it('returns true when findings count is below default threshold (1)', () => {
    assert.equal(shouldReAnalyze([]), true);
  });

  it('returns false when findings meet or exceed default threshold', () => {
    const findings = [{ severity: 'high', description: 'issue' }];
    assert.equal(shouldReAnalyze(findings), false);
  });

  it('returns true when findings count is below custom minFindings threshold', () => {
    const findings = [{ severity: 'low', description: 'minor' }];
    assert.equal(shouldReAnalyze(findings, 3), true);
  });

  it('returns false when findings meet custom minFindings threshold', () => {
    const findings = [
      { severity: 'high', description: 'issue 1' },
      { severity: 'medium', description: 'issue 2' },
      { severity: 'low', description: 'issue 3' },
    ];
    assert.equal(shouldReAnalyze(findings, 3), false);
  });
});

describe('formatAdversarialPrompt', () => {
  it('returns a non-empty string prompt', () => {
    const prompt = formatAdversarialPrompt({ code: 'function foo() {}', context: 'auth module' });
    assert.ok(typeof prompt === 'string', 'should return a string');
    assert.ok(prompt.length > 0, 'prompt should not be empty');
  });

  it('includes adversarial framing to find issues', () => {
    const prompt = formatAdversarialPrompt({ code: 'const x = 1;', context: 'test' });
    const lower = prompt.toLowerCase();
    const hasAdversarialFrame =
      lower.includes('find') ||
      lower.includes('issue') ||
      lower.includes('vulnerabilit') ||
      lower.includes('problem');
    assert.ok(hasAdversarialFrame, 'prompt should contain adversarial framing language');
  });
});
