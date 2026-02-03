#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

const {
  getAgentForCapability,
  getAgentsForCapabilityWithFallbacks,
} = require('../../../.claude/lib/routing/agent-registry-resolver.cjs');

describe('agent-registry-resolver', () => {
  it('should return default agent for capability', () => {
    assert.strictEqual(getAgentForCapability('code-review'), 'code-reviewer');
  });

  it('should include fallbacks for capability domain', () => {
    const agents = getAgentsForCapabilityWithFallbacks('devops');
    assert.ok(agents.includes('devops'));
    assert.ok(agents.includes('devops-troubleshooter'));
  });

  it('should filter unhealthy agents when excludeUnhealthy is true', () => {
    const registry = {
      agents: {
        devops: { health: { status: 'unavailable' } },
        'devops-troubleshooter': { health: { status: 'ok' } },
      },
    };
    const agents = getAgentsForCapabilityWithFallbacks('devops', {
      registry,
      excludeUnhealthy: true,
    });
    assert.deepStrictEqual(agents, ['devops-troubleshooter']);
  });
});
