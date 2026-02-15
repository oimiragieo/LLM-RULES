#!/usr/bin/env node
/**
 * Comprehensive tests for routing-guard.cjs
 * Tests all enforcement checks with enforcement mode variations
 *
 * Test coverage:
 * - Check 0: Router Bash whitelist (ADR-030)
 * - Check 1: Router self-check (blacklisted tools)
 * - Check 2: Planner-first enforcement
 * - Check 3: TaskCreate restriction
 * - Check 4: Security review enforcement
 * - Check 5: Router write guard
 * - Check 6: Memory pressure check
 * - Check 7: Specialist override warning
 * - Check 8: TaskList-first gate
 * - Check 9: Creator intent guard
 * - Check 10: Intent-agent match
 * - Check 11: Config model validator
 */

'use strict';

const { describe, it, before, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// Import hook functions
const routingGuard = require(
  path.join(PROJECT_ROOT, '.claude', 'hooks', 'routing', 'routing-guard.cjs')
);

// Cleanup state between tests
function cleanupState() {
  routingGuard.invalidateCachedState();

  // Clean router state
  const stateFile = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');
  if (fs.existsSync(stateFile)) {
    fs.unlinkSync(stateFile);
  }

  // Clean creator state
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

  // Clean block dedupe state
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

describe('routing-guard.cjs - Check 0: Router Bash Whitelist (ADR-030)', () => {
  afterEach(() => {
    cleanupState();
    delete process.env.ROUTER_BASH_GUARD;
  });

  it('should allow whitelisted git status command', () => {
    const result = routingGuard.checkRouterBash('Bash', { command: 'git status' });
    assert.equal(result.pass, true);
  });

  it('should allow whitelisted git status -s command', () => {
    const result = routingGuard.checkRouterBash('Bash', { command: 'git status -s' });
    assert.equal(result.pass, true);
  });

  it('should allow whitelisted git log --oneline -5', () => {
    const result = routingGuard.checkRouterBash('Bash', { command: 'git log --oneline -5' });
    assert.equal(result.pass, true);
  });

  it('should block non-whitelisted bash commands in router mode', () => {
    process.env.ROUTER_BASH_GUARD = 'block';
    // Force router mode
    const stateFile = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify({ mode: 'router', taskSpawned: false }));

    const result = routingGuard.checkRouterBash('Bash', { command: 'npm test' });
    assert.equal(result.pass, false);
    assert.equal(result.result, 'block');
    assert.match(result.message, /ROUTER BASH VIOLATION/);
  });

  it('should respect ROUTER_BASH_GUARD=warn enforcement mode', () => {
    process.env.ROUTER_BASH_GUARD = 'warn';

    const stateFile = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify({ mode: 'router', taskSpawned: false }));

    const result = routingGuard.checkRouterBash('Bash', { command: 'npm test' });
    assert.equal(result.pass, true);
    assert.equal(result.result, 'warn');
  });

  it('should respect ROUTER_BASH_GUARD=off enforcement mode', () => {
    process.env.ROUTER_BASH_GUARD = 'off';

    const result = routingGuard.checkRouterBash('Bash', { command: 'rm -rf /' });
    assert.equal(result.pass, true);
  });
});

describe('routing-guard.cjs - Check 1: Router Self-Check (Blacklisted Tools)', () => {
  afterEach(() => {
    cleanupState();
    delete process.env.ROUTER_SELF_CHECK;
    delete process.env.ROUTER_BLOCK_DEDUPE_THRESHOLD;
    delete process.env.ROUTER_BLOCK_DEDUPE_WINDOW_MS;
    delete process.env.CLAUDE_SESSION_ID;
  });

  it('should allow whitelisted tools in router mode', () => {
    const result = routingGuard.checkRouterSelfCheck('Read', {});
    assert.equal(result.pass, true);
  });

  it('should block Glob in router mode', () => {
    const stateFile = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify({ mode: 'router', taskSpawned: false }));

    const result = routingGuard.checkRouterSelfCheck('Glob', {});
    assert.equal(result.pass, false);
    assert.match(result.message, /ROUTER SELF-CHECK VIOLATION/);
  });

  it('should block Grep in router mode', () => {
    const stateFile = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify({ mode: 'router', taskSpawned: false }));

    const result = routingGuard.checkRouterSelfCheck('Grep', {});
    assert.equal(result.pass, false);
  });

  it('should block TaskOutput in router mode', () => {
    const stateFile = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify({ mode: 'router', taskSpawned: false }));

    const result = routingGuard.checkRouterSelfCheck('TaskOutput', {});
    assert.equal(result.pass, false);
    assert.match(result.message, /ROUTER SELF-CHECK VIOLATION/);
  });

  it('should allow blacklisted tools in agent mode', () => {
    const stateFile = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify({ mode: 'agent', taskSpawned: true }));

    const result = routingGuard.checkRouterSelfCheck('Glob', {});
    assert.equal(result.pass, true);
  });

  it('should respect ROUTER_SELF_CHECK=off', () => {
    process.env.ROUTER_SELF_CHECK = 'off';

    const result = routingGuard.checkRouterSelfCheck('Glob', {});
    assert.equal(result.pass, true);
  });
  it('should keep first self-check violation message explicit (non-compact)', () => {
    process.env.ROUTER_SELF_CHECK = 'block';
    process.env.ROUTER_BLOCK_DEDUPE_THRESHOLD = '2';
    process.env.ROUTER_BLOCK_DEDUPE_WINDOW_MS = '60000';
    process.env.CLAUDE_SESSION_ID = 'test-session-selfcheck-first-' + Date.now();

    const stateFile = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify({ mode: 'router', taskSpawned: false }));

    const first = routingGuard.checkRouterSelfCheck('Glob', {});
    assert.equal(first.pass, false);
    assert.equal(first.result, 'block');
    assert.match(first.message, /ROUTER SELF-CHECK VIOLATION/);
    assert.equal(/Repeated block/.test(first.message), false);
  });

  it('should switch to compact self-check fallback message after dedupe threshold', () => {
    process.env.ROUTER_SELF_CHECK = 'block';
    process.env.ROUTER_BLOCK_DEDUPE_THRESHOLD = '2';
    process.env.ROUTER_BLOCK_DEDUPE_WINDOW_MS = '60000';
    process.env.CLAUDE_SESSION_ID = 'test-session-selfcheck-compact-' + Date.now();

    const stateFile = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify({ mode: 'router', taskSpawned: false }));

    const first = routingGuard.checkRouterSelfCheck('Glob', {});
    assert.equal(first.pass, false);

    const second = routingGuard.checkRouterSelfCheck('Glob', {});
    assert.equal(second.pass, false);
    assert.equal(second.result, 'block');
    assert.match(second.message, /Repeated block \(2x\)/);
    assert.match(second.message, /Do not retry the same tool call/);
  });

  it('should dedupe self-check using hookInput.session_id when env session is absent', () => {
    process.env.ROUTER_SELF_CHECK = 'block';
    process.env.ROUTER_BLOCK_DEDUPE_THRESHOLD = '2';
    process.env.ROUTER_BLOCK_DEDUPE_WINDOW_MS = '60000';
    delete process.env.CLAUDE_SESSION_ID;

    const stateFile = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify({ mode: 'router', taskSpawned: false }));

    const first = routingGuard.checkRouterSelfCheck(
      'Glob',
      {},
      { session_id: 'hook-session-selfcheck' }
    );
    assert.equal(first.pass, false);
    assert.equal(first.result, 'block');
    assert.match(first.message, /ROUTER SELF-CHECK VIOLATION/);
    assert.equal(/Repeated block/.test(first.message), false);

    const second = routingGuard.checkRouterSelfCheck(
      'Glob',
      {},
      { session_id: 'hook-session-selfcheck' }
    );
    assert.equal(second.pass, false);
    assert.equal(second.result, 'block');
    assert.match(second.message, /Repeated block \(2x\)/);
    assert.match(second.message, /Do not retry the same tool call/);
  });
});

describe('routing-guard.cjs - Check 2: Planner-First Enforcement', () => {
  afterEach(() => {
    cleanupState();
    delete process.env.PLANNER_FIRST_ENFORCEMENT;
  });

  it('should allow Task spawn when planner not required', () => {
    const stateFile = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify({ requiresPlannerFirst: false }));

    const result = routingGuard.checkPlannerFirst('Task', {
      prompt: 'You are developer. Fix bug.',
    });
    assert.equal(result.pass, true);
  });

  it('should block non-planner Task when planner required', () => {
    const stateFile = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(
      stateFile,
      JSON.stringify({
        requiresPlannerFirst: true,
        plannerSpawned: false,
        complexity: 'HIGH',
      })
    );

    const result = routingGuard.checkPlannerFirst('Task', {
      prompt: 'You are developer. Fix bug.',
    });
    assert.equal(result.pass, false);
    assert.match(result.message, /PLANNER-FIRST VIOLATION/);
  });

  it('should allow planner spawn when planner required', () => {
    const stateFile = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(
      stateFile,
      JSON.stringify({ requiresPlannerFirst: true, plannerSpawned: false })
    );

    const result = routingGuard.checkPlannerFirst('Task', {
      prompt: 'You are planner. Create plan.',
    });
    assert.equal(result.pass, true);
    assert.equal(result.markPlanner, true);
  });

  it('should allow Task after planner spawned', () => {
    const stateFile = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(
      stateFile,
      JSON.stringify({ requiresPlannerFirst: true, plannerSpawned: true })
    );

    const result = routingGuard.checkPlannerFirst('Task', {
      prompt: 'You are developer. Implement.',
    });
    assert.equal(result.pass, true);
  });
});

describe('routing-guard.cjs - Check 3: TaskCreate Restriction', () => {
  afterEach(() => {
    cleanupState();
  });

  it('should allow TaskCreate when planner not required', () => {
    const stateFile = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify({ requiresPlannerFirst: false }));

    const result = routingGuard.checkTaskCreate('TaskCreate');
    assert.equal(result.pass, true);
  });

  it('should block TaskCreate when planner required but not spawned', () => {
    const stateFile = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(
      stateFile,
      JSON.stringify({
        requiresPlannerFirst: true,
        plannerSpawned: false,
        complexity: 'HIGH',
      })
    );

    const result = routingGuard.checkTaskCreate('TaskCreate');
    assert.equal(result.pass, false);
    assert.match(result.message, /TASK-CREATE VIOLATION/);
  });

  it('should degrade repeated TaskCreate block into warning loop-breaker', () => {
    const prevSessionId = process.env.CLAUDE_SESSION_ID;
    process.env.ROUTER_BLOCK_DEDUPE_THRESHOLD = '2';
    process.env.ROUTER_BLOCK_DEDUPE_WINDOW_MS = '60000';
    process.env.CLAUDE_SESSION_ID = `test-session-taskcreate-dedupe-${Date.now()}`;

    const stateFile = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(
      stateFile,
      JSON.stringify({
        requiresPlannerFirst: true,
        plannerSpawned: false,
        complexity: 'HIGH',
      })
    );

    const first = routingGuard.checkTaskCreate('TaskCreate');
    assert.equal(first.pass, false);
    assert.equal(first.result, 'block');

    const second = routingGuard.checkTaskCreate('TaskCreate');
    assert.equal(second.pass, true);
    assert.equal(second.result, 'warn');
    assert.match(second.message, /Repeated block/);

    if (prevSessionId === undefined) {
      delete process.env.CLAUDE_SESSION_ID;
    } else {
      process.env.CLAUDE_SESSION_ID = prevSessionId;
    }
  });

  it('should dedupe TaskCreate using hookInput.session_id when env session is absent', () => {
    const prevSessionId = process.env.CLAUDE_SESSION_ID;
    delete process.env.CLAUDE_SESSION_ID;
    process.env.ROUTER_BLOCK_DEDUPE_THRESHOLD = '2';
    process.env.ROUTER_BLOCK_DEDUPE_WINDOW_MS = '60000';
    process.env.TASKLIST_FIRST_ENFORCEMENT = 'off';

    const stateFile = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(
      stateFile,
      JSON.stringify({
        requiresPlannerFirst: true,
        plannerSpawned: false,
        complexity: 'HIGH',
        taskListCalledSincePrompt: true,
      })
    );

    const first = routingGuard.runAllChecks(
      'TaskCreate',
      {},
      { session_id: 'hook-session-taskcreate' }
    );
    assert.equal(first.pass, false);
    assert.equal(first.result, 'block');

    const second = routingGuard.runAllChecks(
      'TaskCreate',
      {},
      { session_id: 'hook-session-taskcreate' }
    );
    assert.equal(second.pass, true);
    assert.equal(second.result, 'allow');
    assert.ok(Array.isArray(second.warnings));
    const dedupeWarning = second.warnings.find(
      w => w.checkName === 'task-create-guard' && /Repeated block/.test(w.message || '')
    );
    assert.ok(dedupeWarning);

    if (prevSessionId !== undefined) {
      process.env.CLAUDE_SESSION_ID = prevSessionId;
    }
  });
});

describe('routing-guard.cjs - Delegation to pre-task-unified for Task checks', () => {
  afterEach(() => {
    cleanupState();
    delete process.env.ROUTING_GUARD_TASK_CHECKS;
  });

  it('should delegate Task planner/security checks by default', () => {
    const stateFile = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(
      stateFile,
      JSON.stringify({
        mode: 'router',
        taskSpawned: false,
        taskListCalledSincePrompt: true,
        requiresPlannerFirst: true,
        plannerSpawned: false,
        requiresSecurityReview: true,
        securitySpawned: false,
        complexity: 'high',
      })
    );

    const result = routingGuard.runAllChecks('Task', {
      prompt: 'You are developer. Implement feature.',
      subagent_type: 'developer',
    });
    assert.equal(result.pass, true);
  });

  it('should enforce Task planner checks when force mode is enabled', () => {
    process.env.ROUTING_GUARD_TASK_CHECKS = 'force';
    const stateFile = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(
      stateFile,
      JSON.stringify({
        mode: 'router',
        taskSpawned: false,
        taskListCalledSincePrompt: true,
        requiresPlannerFirst: true,
        plannerSpawned: false,
        complexity: 'high',
      })
    );

    const result = routingGuard.runAllChecks('Task', {
      prompt: 'You are developer. Implement feature.',
      subagent_type: 'developer',
    });
    assert.equal(result.pass, false);
    assert.equal(result.checkName, 'planner-first-guard');
  });
});

describe('routing-guard.cjs - Check 4: Security Review Enforcement', () => {
  afterEach(() => {
    cleanupState();
    delete process.env.SECURITY_REVIEW_ENFORCEMENT;
  });

  it('should allow Task when security not required', () => {
    const stateFile = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify({ requiresSecurityReview: false }));

    const result = routingGuard.checkSecurityReview('Task', {
      prompt: 'You are developer. Add feature.',
    });
    assert.equal(result.pass, true);
  });

  it('should block implementation agent when security required but not spawned', () => {
    const stateFile = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(
      stateFile,
      JSON.stringify({
        requiresSecurityReview: true,
        securitySpawned: false,
      })
    );

    const result = routingGuard.checkSecurityReview('Task', {
      prompt: 'You are developer. Add auth.',
    });
    assert.equal(result.pass, false);
    assert.match(result.message, /SEC-004/);
  });

  it('should allow security-architect spawn when required', () => {
    const stateFile = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(
      stateFile,
      JSON.stringify({ requiresSecurityReview: true, securitySpawned: false })
    );

    const result = routingGuard.checkSecurityReview('Task', {
      prompt: 'You are security-architect. Review.',
    });
    assert.equal(result.pass, true);
    assert.equal(result.markSecurity, true);
  });
});
