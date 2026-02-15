#!/usr/bin/env node
'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const ROUTER_STATE_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'router-state.json'
);

const routingGuard = require(
  path.join(PROJECT_ROOT, '.claude', 'hooks', 'routing', 'routing-guard.cjs')
);

function cleanupState() {
  routingGuard.invalidateCachedState();
  if (fs.existsSync(ROUTER_STATE_FILE)) {
    fs.unlinkSync(ROUTER_STATE_FILE);
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(ROUTER_STATE_FILE), { recursive: true });
  fs.writeFileSync(ROUTER_STATE_FILE, JSON.stringify(state), 'utf-8');
}

describe('routing-guard architect gates', () => {
  afterEach(() => {
    cleanupState();
    delete process.env.CODE_SIMPLIFIER_ARCHITECT_ENFORCEMENT;
    delete process.env.HIGH_RISK_SPECIALIST_ARCHITECT_ENFORCEMENT;
  });

  it('blocks code-simplifier when architect not spawned', () => {
    writeState({ architectSpawned: false });
    const result = routingGuard.checkCodeSimplifierArchitectReview('Task', {
      subagent_type: 'code-simplifier',
      prompt: 'You are code-simplifier. Simplify this module.',
    });
    assert.equal(result.pass, false);
    assert.equal(result.result, 'block');
    assert.match(result.message, /ARCH-001/);
  });

  it('allows code-simplifier when architect already spawned', () => {
    writeState({ architectSpawned: true });
    const result = routingGuard.checkCodeSimplifierArchitectReview('Task', {
      subagent_type: 'code-simplifier',
      prompt: 'You are code-simplifier. Simplify this module.',
    });
    assert.equal(result.pass, true);
  });

  it('marks architect spawn when architect is selected', () => {
    writeState({ architectSpawned: false });
    const result = routingGuard.checkCodeSimplifierArchitectReview('Task', {
      subagent_type: 'architect',
      prompt: 'You are architect. Review structure first.',
    });
    assert.equal(result.pass, true);
    assert.equal(result.markArchitect, true);
  });

  it('blocks high-risk specialist when architect not spawned', () => {
    writeState({ architectSpawned: false });
    const result = routingGuard.checkHighRiskSpecialistArchitectReview('Task', {
      subagent_type: 'devops',
      prompt: 'You are devops. Apply infrastructure deployment changes.',
    });
    assert.equal(result.pass, false);
    assert.equal(result.result, 'block');
    assert.match(result.message, /ARCH-002/);
  });

  it('allows high-risk specialist when architect already spawned', () => {
    writeState({ architectSpawned: true });
    const result = routingGuard.checkHighRiskSpecialistArchitectReview('Task', {
      subagent_type: 'chaos-engineer',
      prompt: 'You are chaos-engineer. Run resilience scenarios.',
    });
    assert.equal(result.pass, true);
  });
});
