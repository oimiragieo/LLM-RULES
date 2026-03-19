'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  QuickFlow,
  FlowMode,
  classifyComplexity,
} = require('../../.claude/lib/orchestration/quick-flow.cjs');

// ─── FlowMode ───────────────────────────────────────────────────────────────

describe('FlowMode', () => {
  it('exports mode values', () => {
    assert.equal(FlowMode.SOLO, 'solo');
    assert.equal(FlowMode.STANDARD, 'standard');
    assert.equal(FlowMode.ENTERPRISE, 'enterprise');
  });
});

// ─── classifyComplexity ─────────────────────────────────────────────────────

describe('classifyComplexity', () => {
  it('single-file change is TRIVIAL', () => {
    assert.equal(classifyComplexity({ fileCount: 1, hasArchDecision: false }).level, 'trivial');
  });

  it('multi-file no arch is LOW', () => {
    assert.equal(classifyComplexity({ fileCount: 3, hasArchDecision: false }).level, 'low');
  });

  it('arch decision bumps to MEDIUM', () => {
    assert.equal(classifyComplexity({ fileCount: 2, hasArchDecision: true }).level, 'medium');
  });

  it('many files is HIGH', () => {
    assert.equal(classifyComplexity({ fileCount: 15, hasArchDecision: false }).level, 'high');
  });

  it('many files + arch is EPIC', () => {
    assert.equal(classifyComplexity({ fileCount: 20, hasArchDecision: true }).level, 'epic');
  });

  it('handles zero files', () => {
    assert.equal(classifyComplexity({ fileCount: 0 }).level, 'trivial');
  });
});

// ─── QuickFlow ──────────────────────────────────────────────────────────────

describe('QuickFlow', () => {
  it('creates in solo mode', () => {
    const qf = new QuickFlow({ mode: FlowMode.SOLO });
    assert.equal(qf.mode, FlowMode.SOLO);
  });

  it('solo mode skips planner', () => {
    const qf = new QuickFlow({ mode: FlowMode.SOLO });
    assert.equal(qf.shouldUsePlanner(), false);
  });

  it('standard mode uses planner for non-trivial', () => {
    const qf = new QuickFlow({ mode: FlowMode.STANDARD });
    assert.equal(qf.shouldUsePlanner({ level: 'medium' }), true);
  });

  it('standard mode skips planner for trivial', () => {
    const qf = new QuickFlow({ mode: FlowMode.STANDARD });
    assert.equal(qf.shouldUsePlanner({ level: 'trivial' }), false);
  });

  it('enterprise mode always uses planner', () => {
    const qf = new QuickFlow({ mode: FlowMode.ENTERPRISE });
    assert.equal(qf.shouldUsePlanner({ level: 'trivial' }), true);
  });

  it('solo mode skips code review', () => {
    const qf = new QuickFlow({ mode: FlowMode.SOLO });
    assert.equal(qf.shouldReview(), false);
  });

  it('standard mode reviews non-trivial', () => {
    const qf = new QuickFlow({ mode: FlowMode.STANDARD });
    assert.equal(qf.shouldReview({ level: 'low' }), true);
  });

  it('enterprise mode always reviews', () => {
    const qf = new QuickFlow({ mode: FlowMode.ENTERPRISE });
    assert.equal(qf.shouldReview({ level: 'trivial' }), true);
  });

  it('solo mode skips security review', () => {
    const qf = new QuickFlow({ mode: FlowMode.SOLO });
    assert.equal(qf.shouldSecurityReview({ level: 'low', hasSecurity: false }), false);
  });

  it('any mode requires security review when hasSecurity', () => {
    const qf = new QuickFlow({ mode: FlowMode.SOLO });
    assert.equal(qf.shouldSecurityReview({ level: 'low', hasSecurity: true }), true);
  });

  it('getPhases returns correct phases for solo trivial', () => {
    const qf = new QuickFlow({ mode: FlowMode.SOLO });
    const phases = qf.getPhases({ level: 'trivial' });
    assert.ok(phases.includes('implement'));
    assert.ok(!phases.includes('plan'));
    assert.ok(!phases.includes('review'));
  });

  it('getPhases returns all phases for enterprise epic', () => {
    const qf = new QuickFlow({ mode: FlowMode.ENTERPRISE });
    const phases = qf.getPhases({ level: 'epic' });
    assert.ok(phases.includes('plan'));
    assert.ok(phases.includes('implement'));
    assert.ok(phases.includes('review'));
    assert.ok(phases.includes('deploy'));
  });

  it('getRecommendedMode for complexity', () => {
    assert.equal(QuickFlow.getRecommendedMode('trivial'), FlowMode.SOLO);
    assert.equal(QuickFlow.getRecommendedMode('low'), FlowMode.STANDARD);
    assert.equal(QuickFlow.getRecommendedMode('high'), FlowMode.ENTERPRISE);
    assert.equal(QuickFlow.getRecommendedMode('epic'), FlowMode.ENTERPRISE);
  });
});
