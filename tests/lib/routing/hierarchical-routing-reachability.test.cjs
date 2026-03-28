#!/usr/bin/env node
'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

const {
  META_ORCHESTRATION_AGENTS,
  PRESERVED_DIRECT_ROUTE_AGENTS,
  isPreservedDirectRouteAgent,
} = require('../../../.claude/lib/routing/routing-table-hierarchical.cjs');
const {
  SUB_ROUTER_CONFIG,
  validateHierarchicalTaskContext,
} = require('../../../.claude/lib/routing/sub-router-selection.cjs');
const { classifyDomain } = require('../../../.claude/lib/routing/intent-classifier.cjs');

const registry = JSON.parse(
  fs.readFileSync(path.join(PROJECT_ROOT, '.claude', 'context', 'agent-registry.json'), 'utf8')
);

const META_ROUTE_CASES = [
  ['master-orchestrator', 'Orchestrate a multiagent workflow across specialists.'],
  ['swarm-coordinator', 'Run a swarm of parallel agents for this task.'],
  ['party-orchestrator', 'Use party mode debate to reach consensus.'],
  ['evolution-orchestrator', 'Selfimprove the framework with evolution planning.'],
  ['heartbeat-orchestrator', 'Configure heartbeat loops for scheduled tasks.'],
  ['loop-operator', 'Run loop-operator governance with a circuit breaker and iteration limit.'],
  ['artifact-integrator', 'Onboard this repository with the artifact-integrator flow.'],
  ['reflection-agent', 'Run a reflection retrospective on this completed session.'],
  ['memory-manager', 'Run memory maintenance with a memory health check and memory rotation.'],
  ['task-manager', 'task-manager task hygiene stale tasks'],
  ['ecosystem-auditor', 'Audit the ecosystem for missing agents and skills.'],
  ['conductor-validator', 'Validate this CDD conductor workflow.'],
  ['claude-md-auditor', 'Check CLAUDE.md for stale references.'],
];

function getSubRouterRosterMap() {
  return Object.fromEntries(
    Object.entries(SUB_ROUTER_CONFIG).map(([routerName, config]) => [
      routerName,
      config.rules.map(rule => rule.agent),
    ])
  );
}

function computePairwiseIntersections(rosterMap) {
  const intersections = [];
  const routers = Object.keys(rosterMap).sort();

  for (let i = 0; i < routers.length; i++) {
    for (let j = i + 1; j < routers.length; j++) {
      const left = routers[i];
      const right = routers[j];
      const leftSet = new Set(rosterMap[left]);
      const overlap = rosterMap[right].filter(agent => leftSet.has(agent));
      if (overlap.length > 0) {
        intersections.push({ pair: [left, right], overlap });
      }
    }
  }

  return intersections;
}

describe('hierarchical reachability and preserved direct routes', () => {
  afterEach(() => {
    delete process.env.HIERARCHICAL_ROUTING;
  });

  it('keeps all meta-orchestration agents preserved as direct routes', () => {
    assert.equal(META_ORCHESTRATION_AGENTS.length, 14);

    for (const agent of META_ORCHESTRATION_AGENTS) {
      assert.ok(
        isPreservedDirectRouteAgent(agent),
        `expected ${agent} to remain a preserved direct route`
      );
    }

    assert.ok(PRESERVED_DIRECT_ROUTE_AGENTS.length >= 24);
  });

  it('routes canonical meta-orchestration prompts directly instead of through sub-routers', () => {
    process.env.HIERARCHICAL_ROUTING = 'on';

    for (const [expectedAgent, prompt] of META_ROUTE_CASES) {
      const result = classifyDomain(prompt);
      assert.deepStrictEqual(
        result,
        {
          type: 'direct',
          agent: expectedAgent,
          source: result.source,
          keyword: result.keyword ?? null,
        },
        `expected direct route for "${prompt}"`
      );
    }
  });

  it('covers every registered agent through direct routes, sub-router rosters, and router entries', () => {
    const rosterMap = getSubRouterRosterMap();
    const reachable = new Set(PRESERVED_DIRECT_ROUTE_AGENTS);

    for (const routerName of Object.keys(rosterMap)) {
      reachable.add(routerName);
      for (const agent of rosterMap[routerName]) {
        reachable.add(agent);
      }
    }

    const registryIds = Object.keys(registry.agents || {});
    const missing = registryIds.filter(agent => !reachable.has(agent));

    assert.ok(
      registryIds.filter(agent => !agent.startsWith('domain-router-')).length >= 109,
      'expected at least 109 non-sub-router agents in the registry'
    );
    assert.deepStrictEqual(missing, []);
  });

  it('does not duplicate specialists across sub-router rosters', () => {
    const overlaps = computePairwiseIntersections(getSubRouterRosterMap());
    assert.deepStrictEqual(overlaps, []);
  });

  it('keeps explicit agent targets out of hierarchical sub-router rewriting', () => {
    process.env.HIERARCHICAL_ROUTING = 'on';

    const result = validateHierarchicalTaskContext(
      { agent_id: 'router' },
      {
        subagent_type: 'channel-responder',
        description: 'Answer a channel status question',
        prompt: 'Respond directly as channel-responder.',
      }
    );

    assert.equal(result.pass, true);
    assert.equal(result.context.targetAgent, 'channel-responder');
    assert.equal(result.context.targetIsSubRouter, false);
  });
});
