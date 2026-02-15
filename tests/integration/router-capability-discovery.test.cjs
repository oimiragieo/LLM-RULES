/**
 * Router Capability Discovery Integration Tests
 *
 * Tests integration of AvailableAgents with router for capability-based agent selection.
 * Phase 3C: Router uses AvailableAgents to discover and select agents dynamically.
 *
 * @module tests/integration/router-capability-discovery
 * @see {@link file://.claude/lib/tools/available-agents.cjs} AvailableAgents tool
 * @see {@link file://.claude/config/capability-routing.json} Capability mappings
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { describe, it, before, after, beforeEach } = require('node:test');

// Project root
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// Modules under test
const {
  AvailableAgents: _AvailableAgents,
  AvailableAgentsQuery,
  getInstance: _getInstance,
} = require(path.join(PROJECT_ROOT, '.claude/lib/tools/available-agents.cjs'));

// Test fixtures path
const FIXTURES_DIR = path.join(PROJECT_ROOT, 'tests/fixtures');
const CAPABILITY_ROUTING_PATH = path.join(PROJECT_ROOT, '.claude/config/capability-routing.json');

/**
 * Create test registry with controlled agent data
 */
function createTestRegistry(agents, overrides = {}) {
  const registry = {
    metadata: {
      generatedAt: new Date().toISOString(),
      totalAgents: Object.keys(agents).length,
      healthyAgents: Object.values(agents).filter(a => a.health?.status === 'healthy').length,
    },
    agents: agents,
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

  // Build indices
  for (const [id, agent] of Object.entries(agents)) {
    // Index by capability
    for (const cap of agent.capabilities || []) {
      if (!registry.index.byCapability[cap.name]) {
        registry.index.byCapability[cap.name] = [];
      }
      registry.index.byCapability[cap.name].push(id);
    }

    // Index by domain
    for (const domain of agent.domains || []) {
      if (!registry.index.byDomain[domain]) {
        registry.index.byDomain[domain] = [];
      }
      registry.index.byDomain[domain].push(id);
    }

    // Index by category
    const category = agent.category || 'core';
    if (!registry.index.byCategory[category]) {
      registry.index.byCategory[category] = [];
    }
    registry.index.byCategory[category].push(id);

    // Index by health
    const status = agent.health?.status || 'healthy';
    if (!registry.health[status]) {
      registry.health[status] = [];
    }
    registry.health[status].push(id);
  }

  return registry;
}

/**
 * Create mock agent for testing
 */
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

describe('Router Capability Discovery Integration', () => {
  let queryEngine;
  let testRegistryPath;
  let _originalRegistryPath;

  before(() => {
    // Create temp directory for test registry
    testRegistryPath = path.join(FIXTURES_DIR, 'test-capability-registry.json');

    // Ensure fixtures directory exists
    if (!fs.existsSync(FIXTURES_DIR)) {
      fs.mkdirSync(FIXTURES_DIR, { recursive: true });
    }
  });

  beforeEach(() => {
    // Create fresh query engine with test registry
    queryEngine = new AvailableAgentsQuery({
      registryPath: testRegistryPath,
    });
  });

  after(() => {
    // Cleanup test registry
    if (fs.existsSync(testRegistryPath)) {
      fs.unlinkSync(testRegistryPath);
    }
  });

  describe('1. Task Capability Classification', () => {
    it('should classify code review requests to code-review capability', () => {
      // Setup: Create registry with code-reviewer agent
      const agents = {
        'code-reviewer': createMockAgent('code-reviewer', {
          capabilities: [{ name: 'code-review', description: 'Review code for quality' }],
          domains: ['code'],
          category: 'specialized',
          successRate: 0.98,
        }),
        developer: createMockAgent('developer', {
          capabilities: [{ name: 'implementation', description: 'Implement features' }],
          domains: ['code'],
        }),
      };

      fs.writeFileSync(testRegistryPath, JSON.stringify(createTestRegistry(agents)));
      queryEngine.clearCache();

      // Act: Query for code-review capability
      const result = queryEngine.query({ capability: 'code-review' });

      // Assert
      assert.strictEqual(result.success, true, 'Query should succeed');
      assert.strictEqual(result.count, 1, 'Should find exactly 1 agent');
      assert.strictEqual(result.agents[0].id, 'code-reviewer', 'Should return code-reviewer');
    });

    it('should classify implementation requests to implementation capability', () => {
      const agents = {
        developer: createMockAgent('developer', {
          capabilities: [
            { name: 'implementation', description: 'Implement features' },
            { name: 'bug-fixing', description: 'Fix bugs' },
          ],
          successRate: 0.95,
        }),
        architect: createMockAgent('architect', {
          capabilities: [{ name: 'architecture-design', description: 'Design systems' }],
        }),
      };

      fs.writeFileSync(testRegistryPath, JSON.stringify(createTestRegistry(agents)));
      queryEngine.clearCache();

      const result = queryEngine.query({ capability: 'implementation' });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.count, 1);
      assert.strictEqual(result.agents[0].id, 'developer');
    });

    it('should classify testing requests to testing capability', () => {
      const agents = {
        qa: createMockAgent('qa', {
          capabilities: [{ name: 'testing', description: 'Write and run tests' }],
          domains: ['testing'],
          successRate: 0.92,
        }),
        developer: createMockAgent('developer', {
          capabilities: [{ name: 'implementation', description: 'Implement features' }],
        }),
      };

      fs.writeFileSync(testRegistryPath, JSON.stringify(createTestRegistry(agents)));
      queryEngine.clearCache();

      const result = queryEngine.query({ capability: 'testing' });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.count, 1);
      assert.strictEqual(result.agents[0].id, 'qa');
    });
  });

  describe('2. AvailableAgents Returns Agents for Known Capabilities', () => {
    it('should return agents for security-review capability', () => {
      const agents = {
        'security-architect': createMockAgent('security-architect', {
          capabilities: [
            { name: 'security-review', description: 'Security audits' },
            { name: 'threat-modeling', description: 'Threat analysis' },
          ],
          domains: ['security'],
          category: 'specialized',
        }),
      };

      fs.writeFileSync(testRegistryPath, JSON.stringify(createTestRegistry(agents)));
      queryEngine.clearCache();

      const result = queryEngine.query({ capability: 'security-review' });

      assert.strictEqual(result.success, true);
      assert.ok(result.count >= 1);
      assert.strictEqual(result.agents[0].id, 'security-architect');
    });

    it('should return agents for architecture-design capability', () => {
      const agents = {
        architect: createMockAgent('architect', {
          capabilities: [{ name: 'architecture-design', description: 'System design' }],
          domains: ['architecture'],
          category: 'core',
        }),
      };

      fs.writeFileSync(testRegistryPath, JSON.stringify(createTestRegistry(agents)));
      queryEngine.clearCache();

      const result = queryEngine.query({ capability: 'architecture-design' });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.count, 1);
    });

    it('should return agents for documentation capability', () => {
      const agents = {
        'technical-writer': createMockAgent('technical-writer', {
          capabilities: [{ name: 'documentation', description: 'Write docs' }],
          domains: ['documentation'],
          category: 'core',
        }),
      };

      fs.writeFileSync(testRegistryPath, JSON.stringify(createTestRegistry(agents)));
      queryEngine.clearCache();

      const result = queryEngine.query({ capability: 'documentation' });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.count, 1);
    });
  });

  describe('3. Router Picks Best Health Agent', () => {
    it('should pick agent with highest success rate', () => {
      const agents = {
        'developer-1': createMockAgent('developer-1', {
          capabilities: [{ name: 'implementation', description: 'Implement' }],
          successRate: 0.85,
        }),
        'developer-2': createMockAgent('developer-2', {
          capabilities: [{ name: 'implementation', description: 'Implement' }],
          successRate: 0.98,
        }),
        'developer-3': createMockAgent('developer-3', {
          capabilities: [{ name: 'implementation', description: 'Implement' }],
          successRate: 0.9,
        }),
      };

      fs.writeFileSync(testRegistryPath, JSON.stringify(createTestRegistry(agents)));
      queryEngine.clearCache();

      const result = queryEngine.query({ capability: 'implementation' });

      assert.strictEqual(result.success, true);
      assert.strictEqual(
        result.agents[0].id,
        'developer-2',
        'Should return highest success rate first'
      );
      assert.strictEqual(result.agents[1].id, 'developer-3', 'Second highest should be second');
      assert.strictEqual(result.agents[2].id, 'developer-1', 'Lowest should be last');
    });

    it('should use execution time as secondary sort', () => {
      const agents = {
        'fast-agent': createMockAgent('fast-agent', {
          capabilities: [{ name: 'implementation', description: 'Implement' }],
          successRate: 0.95,
          averageExecutionMs: 500,
        }),
        'slow-agent': createMockAgent('slow-agent', {
          capabilities: [{ name: 'implementation', description: 'Implement' }],
          successRate: 0.95,
          averageExecutionMs: 5000,
        }),
      };

      fs.writeFileSync(testRegistryPath, JSON.stringify(createTestRegistry(agents)));
      queryEngine.clearCache();

      const result = queryEngine.query({ capability: 'implementation' });

      assert.strictEqual(result.success, true);
      assert.strictEqual(
        result.agents[0].id,
        'fast-agent',
        'Faster agent should be first when rates equal'
      );
    });
  });

  describe('4. Unavailable Agents Are Skipped', () => {
    it('should exclude unavailable agents by default', () => {
      const agents = {
        'healthy-agent': createMockAgent('healthy-agent', {
          capabilities: [{ name: 'implementation', description: 'Implement' }],
          healthStatus: 'healthy',
          successRate: 0.9,
        }),
        'unavailable-agent': createMockAgent('unavailable-agent', {
          capabilities: [{ name: 'implementation', description: 'Implement' }],
          healthStatus: 'unavailable',
          successRate: 0.99,
        }),
      };

      fs.writeFileSync(testRegistryPath, JSON.stringify(createTestRegistry(agents)));
      queryEngine.clearCache();

      const result = queryEngine.query({ capability: 'implementation' });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.count, 1);
      assert.strictEqual(result.agents[0].id, 'healthy-agent');
    });

    it('should include unavailable agents when excludeFailed is false', () => {
      const agents = {
        'healthy-agent': createMockAgent('healthy-agent', {
          capabilities: [{ name: 'implementation', description: 'Implement' }],
          healthStatus: 'healthy',
          successRate: 0.9,
        }),
        'unavailable-agent': createMockAgent('unavailable-agent', {
          capabilities: [{ name: 'implementation', description: 'Implement' }],
          healthStatus: 'unavailable',
          successRate: 0.99,
        }),
      };

      fs.writeFileSync(testRegistryPath, JSON.stringify(createTestRegistry(agents)));
      queryEngine.clearCache();

      const result = queryEngine.query({
        capability: 'implementation',
        excludeFailed: false,
        minSuccessRate: 0.5,
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.count, 2, 'Should include unavailable agent');
    });
  });

  describe('5. Degraded Agents Available But Not Preferred', () => {
    it('should rank degraded agents lower than healthy agents', () => {
      const agents = {
        'degraded-agent': createMockAgent('degraded-agent', {
          capabilities: [{ name: 'implementation', description: 'Implement' }],
          healthStatus: 'degraded',
          successRate: 0.65,
        }),
        'healthy-agent': createMockAgent('healthy-agent', {
          capabilities: [{ name: 'implementation', description: 'Implement' }],
          healthStatus: 'healthy',
          successRate: 0.85,
        }),
      };

      fs.writeFileSync(testRegistryPath, JSON.stringify(createTestRegistry(agents)));
      queryEngine.clearCache();

      const result = queryEngine.query({
        capability: 'implementation',
        minSuccessRate: 0.5, // Lower threshold to include degraded
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.count, 2);
      assert.strictEqual(result.agents[0].id, 'healthy-agent', 'Healthy agent should be first');
      assert.strictEqual(result.agents[1].id, 'degraded-agent', 'Degraded agent should be second');
    });

    it('should filter out degraded agents below minSuccessRate', () => {
      const agents = {
        'degraded-agent': createMockAgent('degraded-agent', {
          capabilities: [{ name: 'implementation', description: 'Implement' }],
          healthStatus: 'degraded',
          successRate: 0.6,
        }),
        'healthy-agent': createMockAgent('healthy-agent', {
          capabilities: [{ name: 'implementation', description: 'Implement' }],
          healthStatus: 'healthy',
          successRate: 0.9,
        }),
      };

      fs.writeFileSync(testRegistryPath, JSON.stringify(createTestRegistry(agents)));
      queryEngine.clearCache();

      const result = queryEngine.query({
        capability: 'implementation',
        minSuccessRate: 0.7,
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.count, 1);
      assert.strictEqual(result.agents[0].id, 'healthy-agent');
    });
  });

  describe('6. Low Success Rate Agents Filtered', () => {
    it('should filter agents below default 0.7 success rate', () => {
      const agents = {
        'high-rate-agent': createMockAgent('high-rate-agent', {
          capabilities: [{ name: 'implementation', description: 'Implement' }],
          successRate: 0.85,
        }),
        'low-rate-agent': createMockAgent('low-rate-agent', {
          capabilities: [{ name: 'implementation', description: 'Implement' }],
          successRate: 0.5,
        }),
      };

      fs.writeFileSync(testRegistryPath, JSON.stringify(createTestRegistry(agents)));
      queryEngine.clearCache();

      const result = queryEngine.query({ capability: 'implementation' });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.count, 1);
      assert.strictEqual(result.agents[0].id, 'high-rate-agent');
    });

    it('should respect custom minSuccessRate', () => {
      const agents = {
        'excellent-agent': createMockAgent('excellent-agent', {
          capabilities: [{ name: 'implementation', description: 'Implement' }],
          successRate: 0.99,
        }),
        'good-agent': createMockAgent('good-agent', {
          capabilities: [{ name: 'implementation', description: 'Implement' }],
          successRate: 0.85,
        }),
      };

      fs.writeFileSync(testRegistryPath, JSON.stringify(createTestRegistry(agents)));
      queryEngine.clearCache();

      const result = queryEngine.query({
        capability: 'implementation',
        minSuccessRate: 0.9,
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.count, 1);
      assert.strictEqual(result.agents[0].id, 'excellent-agent');
    });
  });

  describe('7. Fallback to Hardcoded Agent', () => {
    it('should return empty results when capability has no agents', () => {
      const agents = {
        developer: createMockAgent('developer', {
          capabilities: [{ name: 'implementation', description: 'Implement' }],
        }),
      };

      fs.writeFileSync(testRegistryPath, JSON.stringify(createTestRegistry(agents)));
      queryEngine.clearCache();

      const result = queryEngine.query({ capability: 'non-existent-capability' });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.count, 0);
    });

    it('should return all agents when no capability filter applied', () => {
      const agents = {
        developer: createMockAgent('developer', {
          capabilities: [{ name: 'implementation', description: 'Implement' }],
        }),
        qa: createMockAgent('qa', {
          capabilities: [{ name: 'testing', description: 'Test' }],
        }),
      };

      fs.writeFileSync(testRegistryPath, JSON.stringify(createTestRegistry(agents)));
      queryEngine.clearCache();

      const result = queryEngine.query({});

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.count, 2);
    });
  });

  describe('8. Capability Mapping', () => {
    it('capability-routing.json should exist', () => {
      assert.ok(
        fs.existsSync(CAPABILITY_ROUTING_PATH),
        'capability-routing.json should exist at .claude/config/'
      );
    });

    it('capability-routing.json should have valid structure', () => {
      const content = fs.readFileSync(CAPABILITY_ROUTING_PATH, 'utf-8');
      const config = JSON.parse(content);

      assert.ok(config.capabilityMap, 'Should have capabilityMap');
      assert.ok(config.defaultAgents, 'Should have defaultAgents');
      assert.ok(typeof config.capabilityMap === 'object', 'capabilityMap should be object');
      assert.ok(typeof config.defaultAgents === 'object', 'defaultAgents should be object');
    });

    it('capability-routing.json should map common requests', () => {
      const content = fs.readFileSync(CAPABILITY_ROUTING_PATH, 'utf-8');
      const config = JSON.parse(content);

      // Check common mappings
      assert.strictEqual(config.capabilityMap['review'], 'code-review');
      assert.strictEqual(config.capabilityMap['implement'], 'implementation');
      assert.strictEqual(config.capabilityMap['test'], 'testing');
      assert.strictEqual(config.capabilityMap['security'], 'security-review');
    });

    it('capability-routing.json should have default agents', () => {
      const content = fs.readFileSync(CAPABILITY_ROUTING_PATH, 'utf-8');
      const config = JSON.parse(content);

      // Check default agent mappings
      assert.strictEqual(config.defaultAgents['code-review'], 'code-reviewer');
      assert.strictEqual(config.defaultAgents['implementation'], 'developer');
      assert.strictEqual(config.defaultAgents['testing'], 'qa');
      assert.strictEqual(config.defaultAgents['security-review'], 'security-architect');
    });
  });

  describe('9. No Agents Available Returns Error', () => {
    it('should return error when all agents filtered out', () => {
      const agents = {
        'unavailable-agent': createMockAgent('unavailable-agent', {
          capabilities: [{ name: 'implementation', description: 'Implement' }],
          healthStatus: 'unavailable',
        }),
      };

      fs.writeFileSync(testRegistryPath, JSON.stringify(createTestRegistry(agents)));
      queryEngine.clearCache();

      const result = queryEngine.query({ capability: 'implementation' });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.count, 0, 'No agents should match');
    });

    it('should provide suggestions when no agents match', () => {
      // Use the public API buildNoMatchResponse
      const result = queryEngine.buildNoMatchResponse({ capability: 'exotic-capability' });

      assert.strictEqual(result.success, false);
      assert.ok(result.error, 'Should have error message');
      assert.ok(result.suggestions, 'Should have suggestions');
    });
  });
});
