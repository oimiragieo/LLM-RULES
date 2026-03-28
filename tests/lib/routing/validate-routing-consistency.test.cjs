#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

const {
  validateRoutingConsistency,
} = require('../../../.claude/scripts/validate-routing-consistency.cjs');

describe('validate-routing-consistency', () => {
  it('flags unknown agents from ROUTING_TABLE and INTENT_TO_AGENT', () => {
    const issues = validateRoutingConsistency({
      routingTable: { bug: 'developer', feature: 'missing-agent' },
      intentToAgent: { qa: 'qa', phantom_intent: 'ghost-agent' },
      capabilityRouting: { capabilityMap: {}, defaultAgents: {}, domainFallbacks: {} },
      agentIds: new Set(['developer', 'qa']),
    });

    assert.ok(
      issues.includes('ROUTING_TABLE references unknown agent: missing-agent'),
      'expected unknown agent from ROUTING_TABLE to be reported'
    );
    assert.ok(
      issues.includes('INTENT_TO_AGENT references unknown agent: ghost-agent'),
      'expected unknown agent from INTENT_TO_AGENT to be reported'
    );
  });

  it('returns no issues for internally consistent maps', () => {
    const issues = validateRoutingConsistency({
      routingTable: { bug: 'developer', feature: 'planner' },
      hierarchicalRoutingTable: {
        bug: { type: 'direct', agent: 'developer' },
        feature: { type: 'domain', domain: 'core', router: 'domain-router-core' },
      },
      intentToAgent: { qa: 'qa', security: 'security-architect' },
      capabilityRouting: {
        capabilityMap: { fix: 'implementation' },
        defaultAgents: { implementation: 'developer' },
        domainFallbacks: { core: ['planner'] },
      },
      agentIds: new Set(['developer', 'planner', 'qa', 'security-architect', 'domain-router-core']),
    });

    assert.deepStrictEqual(issues, []);
  });

  it('flags hierarchical routing gaps and invalid targets', () => {
    const issues = validateRoutingConsistency({
      routingTable: { bug: 'developer', feature: 'planner' },
      hierarchicalRoutingTable: {
        bug: { type: 'direct', agent: 'developer' },
      },
      intentToAgent: { qa: 'qa' },
      capabilityRouting: { capabilityMap: {}, defaultAgents: {}, domainFallbacks: {} },
      agentIds: new Set(['developer', 'planner', 'qa']),
    });

    assert.ok(
      issues.some(issue => issue.includes('DOMAIN_ROUTING_TABLE missing flat keywords: feature')),
      'expected missing flat keyword issue'
    );
  });

  it('returns an array of issues for current repo state', () => {
    const issues = validateRoutingConsistency();
    assert.ok(Array.isArray(issues), 'issues should be an array');
  });
});
