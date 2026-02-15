#!/usr/bin/env node
/**
 * Focused tests for routing-guard.cjs checks moved from the comprehensive suite.
 * - Check 7: Specialist override warning
 * - Check 8: TaskList-first gate
 */

'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const routingGuard = require(
  path.join(PROJECT_ROOT, '.claude', 'hooks', 'routing', 'routing-guard.cjs')
);

function cleanupState() {
  routingGuard.invalidateCachedState();

  const stateFile = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');
  if (fs.existsSync(stateFile)) {
    fs.unlinkSync(stateFile);
  }

  const creatorStateFile = path.join(
    PROJECT_ROOT,
    '.claude',
    'context',
    'runtime',
    'active-creators.json'
  );
  if (fs.existsSync(creatorStateFile)) {
    fs.unlinkSync(creatorStateFile);
  }

  const dedupeStateFile = path.join(
    PROJECT_ROOT,
    '.claude',
    'context',
    'runtime',
    'routing-block-dedupe.json'
  );
  if (fs.existsSync(dedupeStateFile)) {
    fs.unlinkSync(dedupeStateFile);
  }
}

describe('routing-guard.cjs - Check 7: Specialist Override Warning', () => {
  afterEach(() => {
    cleanupState();
    delete process.env.SPECIALIST_ROUTING_ENFORCEMENT;
  });

  it('should warn when developer spawned for documentation task', () => {
    process.env.SPECIALIST_ROUTING_ENFORCEMENT = 'warn';
    const result = routingGuard.checkSpecialistOverride('Task', {
      prompt: 'You are developer. Update documentation for the API.',
      description: 'Update docs',
    });
    assert.equal(result.pass, true);
    assert.equal(result.result, 'warn');
    assert.match(result.message, /SPECIALIST-OVERRIDE/);
    assert.match(result.message, /technical-writer/);
  });

  it('should warn when developer spawned for refactoring task', () => {
    process.env.SPECIALIST_ROUTING_ENFORCEMENT = 'warn';
    const result = routingGuard.checkSpecialistOverride('Task', {
      prompt: 'You are developer. Refactor the code for clarity.',
      description: 'Refactor',
    });
    assert.equal(result.pass, true);
    assert.equal(result.result, 'warn');
    assert.match(result.message, /code-simplifier/);
  });

  it('should warn when developer spawned for testing task', () => {
    process.env.SPECIALIST_ROUTING_ENFORCEMENT = 'warn';
    const result = routingGuard.checkSpecialistOverride('Task', {
      prompt: 'You are developer. Write tests for the API.',
      description: 'Add tests',
    });
    assert.equal(result.pass, true);
    assert.equal(result.result, 'warn');
    assert.match(result.message, /\bqa\b/);
  });

  it('should allow developer for implementation tasks', () => {
    const result = routingGuard.checkSpecialistOverride('Task', {
      prompt: 'You are developer. Implement feature X.',
      description: 'New feature',
    });
    assert.equal(result.pass, true);
    assert.equal(result.result, undefined);
  });

  it('should respect SPECIALIST_ROUTING_ENFORCEMENT=block', () => {
    process.env.SPECIALIST_ROUTING_ENFORCEMENT = 'block';

    const result = routingGuard.checkSpecialistOverride('Task', {
      prompt: 'You are developer. Update documentation.',
      description: 'Docs',
    });
    assert.equal(result.pass, false);
    assert.equal(result.result, 'block');
  });

  it('should respect SPECIALIST_ROUTING_ENFORCEMENT=off', () => {
    process.env.SPECIALIST_ROUTING_ENFORCEMENT = 'off';

    const result = routingGuard.checkSpecialistOverride('Task', {
      prompt: 'You are developer. Update documentation.',
      description: 'Docs',
    });
    assert.equal(result.pass, true);
    assert.equal(result.result, undefined);
  });
});

describe('routing-guard.cjs - Check 8: TaskList-First Gate', () => {
  afterEach(() => {
    cleanupState();
    delete process.env.TASKLIST_FIRST_ENFORCEMENT;
    delete process.env.TASKLIST_FIRST_AUTOREROUTE;
    delete process.env.TASKLIST_FIRST_AUTOREROUTE_THRESHOLD;
  });

  it('should allow tools after TaskList called', () => {
    const stateFile = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(
      stateFile,
      JSON.stringify({
        mode: 'router',
        taskSpawned: false,
        taskListCalledSincePrompt: true,
      })
    );

    const result = routingGuard.checkTaskListFirstGate('Task');
    assert.equal(result.pass, true);
  });

  it('should block Task when TaskList not called', () => {
    const stateFile = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(
      stateFile,
      JSON.stringify({
        mode: 'router',
        taskSpawned: false,
        taskListCalledSincePrompt: false,
      })
    );

    const result = routingGuard.checkTaskListFirstGate('Task');
    assert.equal(result.pass, false);
    assert.equal(result.result, 'block');
    assert.match(result.message, /TASKLIST-FIRST VIOLATION/);
  });

  it('should allow tools in agent mode without TaskList', () => {
    const stateFile = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(
      stateFile,
      JSON.stringify({
        mode: 'agent',
        taskSpawned: true,
      })
    );

    const result = routingGuard.checkTaskListFirstGate('Task');
    assert.equal(result.pass, true);
  });

  it('should auto-reroute repeated block-mode violations to warning loop-breaker', () => {
    process.env.TASKLIST_FIRST_ENFORCEMENT = 'block';
    process.env.TASKLIST_FIRST_AUTOREROUTE = 'true';
    process.env.TASKLIST_FIRST_AUTOREROUTE_THRESHOLD = '2';
    process.env.CLAUDE_SESSION_ID = 'session-tasklist-autoroute';

    const stateFile = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(
      stateFile,
      JSON.stringify({
        mode: 'router',
        taskSpawned: false,
        taskListCalledSincePrompt: false,
      })
    );

    const first = routingGuard.checkTaskListFirstGate('Bash');
    assert.equal(first.pass, false);
    assert.equal(first.result, 'block');

    const second = routingGuard.checkTaskListFirstGate('Bash');
    assert.equal(second.pass, true);
    assert.equal(second.result, 'warn');
    assert.match(second.message || '', /TASKLIST-FIRST AUTO-REROUTE/);

    delete process.env.CLAUDE_SESSION_ID;
  });
});
