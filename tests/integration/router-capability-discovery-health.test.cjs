'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { describe, it, before, after, beforeEach } = require('node:test');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const { AvailableAgentsQuery } = require(
  path.join(PROJECT_ROOT, '.claude/lib/tools/available-agents.cjs')
);
const FIXTURES_DIR = path.join(PROJECT_ROOT, 'tests/fixtures');
const CAPABILITY_ROUTING_PATH = path.join(PROJECT_ROOT, '.claude/config/capability-routing.json');

function createTestRegistry(agents, overrides = {}) {
  const registry = {
    metadata: {
      generatedAt: new Date().toISOString(),
      totalAgents: Object.keys(agents).length,
      healthyAgents: Object.values(agents).filter(a => a.health?.status === 'healthy').length,
    },
    agents,
    index: {
      byCapability: {},
      byDomain: {},
      byCategory: {},
    },
    health: {
      healthy: [],
      degraded: [],
      unavailable: [],
    },
    ...overrides,
  };

  for (const [id, agent] of Object.entries(agents)) {
    for (const cap of agent.capabilities || []) {
      if (!registry.index.byCapability[cap.name]) {
        registry.index.byCapability[cap.name] = [];
      }
      registry.index.byCapability[cap.name].push(id);
    }

    for (const domain of agent.domains || []) {
      if (!registry.index.byDomain[domain]) {
        registry.index.byDomain[domain] = [];
      }
      registry.index.byDomain[domain].push(id);
    }

    const category = agent.category || 'core';
    if (!registry.index.byCategory[category]) {
      registry.index.byCategory[category] = [];
    }
    registry.index.byCategory[category].push(id);

    const status = agent.health?.status || 'healthy';
    if (!registry.health[status]) {
      registry.health[status] = [];
    }
    registry.health[status].push(id);
  }

  return registry;
}

function createMockAgent(id, options = {}) {
  return {
    id,
    name: options.name || id,
    description: options.description || `Mock ${id} agent`,
    category: options.category || 'core',
    capabilities: options.capabilities || [
      { name: 'implementation', description: 'Basic implementation' },
    ],
    domains: options.domains || ['code'],
    tools: options.tools || ['Read', 'Write', 'Edit', 'Bash'],
    skills: options.skills || ['tdd', 'debugging'],
    model: options.model || 'sonnet',
    path: options.path || `.claude/agents/core/${id}.md`,
    triggers: options.triggers || [],
    health: {
      status: options.healthStatus || 'healthy',
      successRate: options.successRate ?? 0.95,
      successCount: options.successCount || 100,
      failureCount: options.failureCount || 5,
      consecutiveFailures: options.consecutiveFailures || 0,
      averageExecutionMs: options.averageExecutionMs || 1500,
      lastSuccess: new Date().toISOString(),
      lastFailure: null,
      isolatedAt: null,
      isolatedReason: null,
    },
  };
}

describe('Router capability discovery health and helpers', () => {
  let queryEngine;
  let testRegistryPath;

  before(() => {
    testRegistryPath = path.join(FIXTURES_DIR, 'test-capability-registry.json');
    if (!fs.existsSync(FIXTURES_DIR)) {
      fs.mkdirSync(FIXTURES_DIR, { recursive: true });
    }
  });

  beforeEach(() => {
    queryEngine = new AvailableAgentsQuery({ registryPath: testRegistryPath });
  });

  after(() => {
    if (fs.existsSync(testRegistryPath)) {
      fs.unlinkSync(testRegistryPath);
    }
  });

  it('should correctly parse health status from registry', () => {
    const agents = {
      'agent-1': createMockAgent('agent-1', {
        capabilities: [{ name: 'implementation', description: 'Implement' }],
        healthStatus: 'healthy',
        successRate: 0.95,
        consecutiveFailures: 0,
      }),
      'agent-2': createMockAgent('agent-2', {
        capabilities: [{ name: 'implementation', description: 'Implement' }],
        healthStatus: 'degraded',
        successRate: 0.65,
        consecutiveFailures: 1,
      }),
      'agent-3': createMockAgent('agent-3', {
        capabilities: [{ name: 'implementation', description: 'Implement' }],
        healthStatus: 'unavailable',
        successRate: 0.3,
        consecutiveFailures: 3,
      }),
    };

    fs.writeFileSync(testRegistryPath, JSON.stringify(createTestRegistry(agents)));
    queryEngine.clearCache();

    const result = queryEngine.query({
      capability: 'implementation',
      excludeFailed: false,
      minSuccessRate: 0.0,
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.count, 3);
    assert.strictEqual(result.agents.find(a => a.id === 'agent-1').health.status, 'healthy');
    assert.strictEqual(result.agents.find(a => a.id === 'agent-2').health.status, 'degraded');
    assert.strictEqual(result.agents.find(a => a.id === 'agent-3').health.status, 'unavailable');
  });

  it('should track consecutive failures in health data', () => {
    const agents = {
      'failing-agent': createMockAgent('failing-agent', {
        capabilities: [{ name: 'implementation', description: 'Implement' }],
        healthStatus: 'degraded',
        consecutiveFailures: 2,
        successRate: 0.7,
      }),
    };

    fs.writeFileSync(testRegistryPath, JSON.stringify(createTestRegistry(agents)));
    queryEngine.clearCache();

    const result = queryEngine.query({ capability: 'implementation' });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.count, 1);
    assert.strictEqual(result.agents[0].health.consecutiveFailures, 2);
  });

  it('getAgent should return specific agent by ID', () => {
    const agents = {
      developer: createMockAgent('developer', {
        capabilities: [{ name: 'implementation', description: 'Implement' }],
      }),
    };

    fs.writeFileSync(testRegistryPath, JSON.stringify(createTestRegistry(agents)));
    queryEngine.clearCache();
    const agent = queryEngine.getAgent('developer');
    assert.ok(agent);
    assert.strictEqual(agent.id, 'developer');
  });

  it('isAvailable should check agent availability', () => {
    const agents = {
      'healthy-agent': createMockAgent('healthy-agent', {
        capabilities: [{ name: 'implementation', description: 'Implement' }],
        healthStatus: 'healthy',
      }),
      'unavailable-agent': createMockAgent('unavailable-agent', {
        capabilities: [{ name: 'testing', description: 'Test' }],
        healthStatus: 'unavailable',
      }),
    };

    fs.writeFileSync(testRegistryPath, JSON.stringify(createTestRegistry(agents)));
    queryEngine.clearCache();

    assert.strictEqual(queryEngine.isAvailable('healthy-agent'), true);
    assert.strictEqual(queryEngine.isAvailable('unavailable-agent'), false);
    assert.strictEqual(queryEngine.isAvailable('non-existent'), false);
  });

  it('isAvailable should check capability when provided', () => {
    const agents = {
      developer: createMockAgent('developer', {
        capabilities: [{ name: 'implementation', description: 'Implement' }],
        healthStatus: 'healthy',
      }),
    };

    fs.writeFileSync(testRegistryPath, JSON.stringify(createTestRegistry(agents)));
    queryEngine.clearCache();

    assert.strictEqual(queryEngine.isAvailable('developer', 'implementation'), true);
    assert.strictEqual(queryEngine.isAvailable('developer', 'testing'), false);
  });

  it('getBestAgent should return highest rated agent', () => {
    const agents = {
      'agent-1': createMockAgent('agent-1', {
        capabilities: [{ name: 'implementation', description: 'Implement' }],
        successRate: 0.8,
      }),
      'agent-2': createMockAgent('agent-2', {
        capabilities: [{ name: 'implementation', description: 'Implement' }],
        successRate: 0.95,
      }),
    };

    fs.writeFileSync(testRegistryPath, JSON.stringify(createTestRegistry(agents)));
    queryEngine.clearCache();

    const best = queryEngine.getBestAgent('implementation');
    assert.ok(best);
    assert.strictEqual(best.id, 'agent-2');
  });

  it('getAvailableFilters should return filter metadata', () => {
    const agents = {
      developer: createMockAgent('developer', {
        capabilities: [{ name: 'implementation', description: 'Implement' }],
        domains: ['code'],
        category: 'core',
      }),
      qa: createMockAgent('qa', {
        capabilities: [{ name: 'testing', description: 'Test' }],
        domains: ['testing'],
        category: 'core',
      }),
    };

    fs.writeFileSync(testRegistryPath, JSON.stringify(createTestRegistry(agents)));
    queryEngine.clearCache();

    const filters = queryEngine.getAvailableFilters();
    assert.ok(filters.capabilities.includes('implementation'));
    assert.ok(filters.capabilities.includes('testing'));
    assert.ok(filters.domains.includes('code'));
    assert.ok(filters.domains.includes('testing'));
    assert.ok(filters.categories.includes('core'));
    assert.strictEqual(filters.totalAgents, 2);
  });

  it('should find agents by domain when capability not found', () => {
    const agents = {
      developer: createMockAgent('developer', {
        capabilities: [{ name: 'implementation', description: 'Implement' }],
        domains: ['code', 'backend'],
      }),
      'frontend-pro': createMockAgent('frontend-pro', {
        capabilities: [{ name: 'ui-development', description: 'Build UIs' }],
        domains: ['code', 'frontend'],
      }),
    };

    fs.writeFileSync(testRegistryPath, JSON.stringify(createTestRegistry(agents)));
    queryEngine.clearCache();

    const result = queryEngine.query({ domain: 'code' });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.count, 2);
  });
});

describe('Capability routing configuration', () => {
  it('capability-routing.json should have all required sections', () => {
    const content = fs.readFileSync(CAPABILITY_ROUTING_PATH, 'utf-8');
    const config = JSON.parse(content);

    assert.ok(config.capabilityMap);
    assert.ok(config.defaultAgents);

    const requiredMappings = ['review', 'implement', 'test', 'security', 'document'];
    for (const mapping of requiredMappings) {
      assert.ok(config.capabilityMap[mapping], `Should have mapping for '${mapping}'`);
    }
  });
});
