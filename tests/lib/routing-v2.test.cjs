/* global performance */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  routeTask,
  RoutingDecision,
  DEFAULT_TRUST_THRESHOLD,
} = require('../../.claude/lib/routing/routing-v2.cjs');

// ─── Constants ──────────────────────────────────────────────────────────────

describe('routing-v2 constants', () => {
  it('exports DEFAULT_TRUST_THRESHOLD', () => {
    assert.equal(typeof DEFAULT_TRUST_THRESHOLD, 'number');
    assert.ok(DEFAULT_TRUST_THRESHOLD > 0 && DEFAULT_TRUST_THRESHOLD <= 1);
  });
});

// ─── RoutingDecision ────────────────────────────────────────────────────────

describe('RoutingDecision', () => {
  it('creates a routing decision', () => {
    const d = new RoutingDecision({
      agentId: 'developer',
      model: 'sonnet',
      reason: 'best match',
    });
    assert.equal(d.agentId, 'developer');
    assert.equal(d.model, 'sonnet');
    assert.equal(d.reason, 'best match');
    assert.equal(d.skipped, false);
  });

  it('creates a skipped decision', () => {
    const d = new RoutingDecision({
      agentId: 'developer',
      skipped: true,
      skipReason: 'condition not met',
    });
    assert.equal(d.skipped, true);
    assert.equal(d.skipReason, 'condition not met');
  });
});

// ─── routeTask ──────────────────────────────────────────────────────────────

describe('routeTask', () => {
  const baseConfig = {
    agents: {
      developer: {
        capabilities: ['implementation', 'bug-fix'],
        model: 'sonnet',
      },
      qa: {
        capabilities: ['testing', 'quality'],
        model: 'sonnet',
      },
      'security-architect': {
        capabilities: ['security-review', 'threat-modeling'],
        model: 'opus',
      },
      architect: {
        capabilities: ['architecture-design', 'system-design'],
        model: 'opus',
      },
    },
    trustScores: {},
    previousTaskContext: null,
  };

  it('routes to best matching agent by capability', () => {
    const task = { intent: 'implementation', description: 'build auth' };
    const decision = routeTask(task, baseConfig);
    assert.equal(decision.agentId, 'developer');
    assert.equal(decision.skipped, false);
  });

  it('routes testing tasks to qa', () => {
    const task = { intent: 'testing', description: 'write unit tests' };
    const decision = routeTask(task, baseConfig);
    assert.equal(decision.agentId, 'qa');
  });

  it('routes security tasks to security-architect', () => {
    const task = { intent: 'security-review', description: 'audit auth' };
    const decision = routeTask(task, baseConfig);
    assert.equal(decision.agentId, 'security-architect');
  });

  it('falls back to developer for unknown intent', () => {
    const task = { intent: 'unknown-intent', description: 'something' };
    const decision = routeTask(task, baseConfig);
    assert.equal(decision.agentId, 'developer');
    assert.ok(decision.reason.includes('fallback'));
  });

  it('uses trust score to prefer higher-trust agent', () => {
    const config = {
      ...baseConfig,
      agents: {
        ...baseConfig.agents,
        'developer-2': {
          capabilities: ['implementation'],
          model: 'sonnet',
        },
      },
      trustScores: {
        developer: 0.9,
        'developer-2': 0.5,
      },
    };
    const task = { intent: 'implementation', description: 'build feature' };
    const decision = routeTask(task, config);
    assert.equal(decision.agentId, 'developer');
  });

  it('skips agent with trust below threshold', () => {
    const config = {
      ...baseConfig,
      trustScores: {
        developer: 0.1, // below threshold
      },
    };
    const task = { intent: 'implementation', description: 'build' };
    const decision = routeTask(task, config);
    // Should still route but note low trust
    assert.ok(decision.agentId); // falls back or routes anyway
    assert.ok(decision.warnings?.length > 0 || decision.agentId !== 'developer');
  });

  it('includes previous task context in decision', () => {
    const config = {
      ...baseConfig,
      previousTaskContext: {
        agentId: 'planner',
        status: 'completed',
        metadata: { summary: 'auth plan ready' },
      },
    };
    const task = { intent: 'implementation', description: 'implement auth' };
    const decision = routeTask(task, config);
    assert.ok(decision.previousContext);
    assert.equal(decision.previousContext.agentId, 'planner');
  });

  it('evaluates condition and skips when false', () => {
    const task = {
      intent: 'testing',
      description: 'run tests',
      condition: {
        type: 'if_success',
        taskId: 'prev-1',
      },
    };
    const config = {
      ...baseConfig,
      previousTaskContext: { status: 'failed' },
    };
    const decision = routeTask(task, config);
    assert.equal(decision.skipped, true);
  });

  it('evaluates condition and routes when true', () => {
    const task = {
      intent: 'testing',
      description: 'run tests',
      condition: {
        type: 'if_success',
        taskId: 'prev-1',
      },
    };
    const config = {
      ...baseConfig,
      previousTaskContext: { status: 'completed' },
    };
    const decision = routeTask(task, config);
    assert.equal(decision.skipped, false);
    assert.equal(decision.agentId, 'qa');
  });

  it('includes model from agent config', () => {
    const task = { intent: 'security-review', description: 'audit' };
    const decision = routeTask(task, baseConfig);
    assert.equal(decision.model, 'opus');
  });

  it('handles empty agents config', () => {
    const task = { intent: 'implementation', description: 'build' };
    const decision = routeTask(task, { agents: {}, trustScores: {} });
    assert.equal(decision.agentId, 'developer'); // fallback
  });

  it('handles null task', () => {
    assert.throws(() => routeTask(null, baseConfig), /task/i);
  });

  it('performance: routes in under 2ms', () => {
    const task = { intent: 'implementation', description: 'build feature' };
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      routeTask(task, baseConfig);
    }
    const elapsed = (performance.now() - start) / 100;
    assert.ok(elapsed < 2, `Avg ${elapsed.toFixed(3)}ms, expected <2ms`);
  });
});
