#!/usr/bin/env node
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const ROUTER_STATE_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'router-state.json'
);

const preTaskUnified = require('../../.claude/hooks/routing/pre-task-unified.cjs');

function backupState(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return fs.readFileSync(filePath, 'utf-8');
}

function restoreState(filePath, content) {
  if (content === null) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

function writeState(state) {
  fs.mkdirSync(path.dirname(ROUTER_STATE_FILE), { recursive: true });
  fs.writeFileSync(ROUTER_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

describe('pre-task-unified architect gate for code-simplifier', () => {
  let stateBackup = null;
  let enforcementBackup;

  beforeEach(() => {
    stateBackup = backupState(ROUTER_STATE_FILE);
    enforcementBackup = process.env.CODE_SIMPLIFIER_ARCHITECT_ENFORCEMENT;
    delete process.env.CODE_SIMPLIFIER_ARCHITECT_ENFORCEMENT;
    preTaskUnified.invalidateCachedState();
  });

  afterEach(() => {
    restoreState(ROUTER_STATE_FILE, stateBackup);
    if (enforcementBackup === undefined) {
      delete process.env.CODE_SIMPLIFIER_ARCHITECT_ENFORCEMENT;
    } else {
      process.env.CODE_SIMPLIFIER_ARCHITECT_ENFORCEMENT = enforcementBackup;
    }
    preTaskUnified.invalidateCachedState();
  });

  it('blocks code-simplifier when architect has not been spawned', () => {
    writeState({ mode: 'router', architectSpawned: false });

    const result = preTaskUnified.checkRoutingGuard('Task', {
      subagent_type: 'code-simplifier',
      prompt: 'You are code-simplifier. Simplify this module.',
    });

    assert.equal(result.pass, false);
    assert.equal(result.result, 'block');
    assert.match(result.message, /ARCH-001/);
  });

  it('marks architect spawn when architect agent is selected', () => {
    writeState({ mode: 'router', architectSpawned: false });

    const result = preTaskUnified.checkRoutingGuard('Task', {
      subagent_type: 'architect',
      prompt: 'You are architect. Review architecture before simplification.',
    });

    assert.equal(result.pass, true);
    assert.equal(result.markArchitect, true);
  });

  it('allows code-simplifier after architect has already spawned', () => {
    writeState({ mode: 'router', architectSpawned: true });

    const result = preTaskUnified.checkRoutingGuard('Task', {
      subagent_type: 'code-simplifier',
      prompt: 'You are code-simplifier. Simplify this module.',
    });

    assert.equal(result.pass, true);
  });

  it('blocks high-risk specialist (devops) when architect has not been spawned', () => {
    writeState({ mode: 'router', architectSpawned: false });

    const result = preTaskUnified.checkRoutingGuard('Task', {
      subagent_type: 'devops',
      prompt: 'You are devops. Apply deployment pipeline changes.',
    });

    assert.equal(result.pass, false);
    assert.equal(result.result, 'block');
    assert.match(result.message, /ARCH-002/);
  });

  it('allows high-risk specialist after architect has already spawned', () => {
    writeState({ mode: 'router', architectSpawned: true });

    const result = preTaskUnified.checkRoutingGuard('Task', {
      subagent_type: 'devops-troubleshooter',
      prompt: 'You are devops-troubleshooter. Investigate production drift.',
    });

    assert.equal(result.pass, true);
  });
});
