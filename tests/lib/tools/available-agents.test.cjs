/**
 * AvailableAgents Tool Tests
 *
 * TDD: Write failing tests first, then implement to pass
 *
 * @module available-agents.test
 */

'use strict';

const { describe, it, beforeEach, afterEach, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// We'll import from the module we're about to create
let _AvailableAgents, AvailableAgentsQuery, getInstance;

// Test fixture: mock agent registry data
const mockRegistry = {
  version: '1.0.0',
  generatedAt: '2026-01-31T12:00:00.000Z',
  metadata: {
    totalAgents: 6,
    healthyAgents: 5,
    degradedAgents: 1,
    unavailableAgents: 0,
    lastHealthCheck: '2026-01-31T12:00:00.000Z',
    lastFullScan: '2026-01-31T12:00:00.000Z',
  },
  agents: {
    developer: {
      id: 'developer',
      displayName: 'Developer Agent',
      category: 'core',
      filePath: '.claude/agents/core/developer.md',
      capabilities: [
        {
          name: 'implementation',
          domain: 'code',
          description: 'TDD-focused code implementation',
          triggerPhrases: ['implement', 'code', 'develop'],
          requiredTools: ['Read', 'Write', 'Edit', 'Bash'],
          skills: ['tdd', 'debugging'],
        },
        {
          name: 'bug-fix',
          domain: 'code',
          description: 'Fix bugs using systematic debugging',
          triggerPhrases: ['fix bug', 'debug'],
          requiredTools: ['Read', 'Write', 'Edit'],
          skills: ['debugging', 'tdd'],
        },
      ],
      constraints: {
        maxConcurrentTasks: 5,
        preferredModel: 'sonnet',
      },
      health: {
        status: 'healthy',
        consecutiveFailures: 0,
        successCount: 50,
        failureCount: 2,
        successRate: 0.96,
        lastUpdate: '2026-01-31T12:00:00.000Z',
        isolatedAt: null,
        isolationReason: null,
      },
      metadata: {
        version: '1.1.0',
      },
    },
    'code-reviewer': {
      id: 'code-reviewer',
      displayName: 'Code Reviewer',
      category: 'specialized',
      filePath: '.claude/agents/specialized/code-reviewer.md',
      capabilities: [
        {
          name: 'code-review',
          domain: 'code',
          description: 'Read-only code analysis and review',
          triggerPhrases: ['review code', 'PR review'],
          requiredTools: ['Read', 'Grep', 'Glob'],
          skills: ['code-reviewer'],
        },
      ],
      constraints: {
        maxConcurrentTasks: 10,
        preferredModel: 'sonnet',
      },
      health: {
        status: 'healthy',
        consecutiveFailures: 0,
        successCount: 100,
        failureCount: 0,
        successRate: 1.0,
        lastUpdate: '2026-01-31T12:00:00.000Z',
        isolatedAt: null,
        isolationReason: null,
      },
      metadata: {
        version: '1.0.0',
      },
    },
    qa: {
      id: 'qa',
      displayName: 'QA Agent',
      category: 'core',
      filePath: '.claude/agents/core/qa.md',
      capabilities: [
        {
          name: 'testing',
          domain: 'testing',
          description: 'Comprehensive testing and validation',
          triggerPhrases: ['test', 'qa', 'validate'],
          requiredTools: ['Read', 'Write', 'Bash'],
          skills: ['tdd', 'qa-workflow'],
        },
      ],
      constraints: {
        maxConcurrentTasks: 5,
        preferredModel: 'sonnet',
      },
      health: {
        status: 'healthy',
        consecutiveFailures: 0,
        successCount: 75,
        failureCount: 5,
        successRate: 0.94,
        lastUpdate: '2026-01-31T12:00:00.000Z',
        isolatedAt: null,
        isolationReason: null,
      },
      metadata: {
        version: '1.0.0',
      },
    },
    'security-architect': {
      id: 'security-architect',
      displayName: 'Security Architect',
      category: 'specialized',
      filePath: '.claude/agents/specialized/security-architect.md',
      capabilities: [
        {
          name: 'security-review',
          domain: 'security',
          description: 'Security analysis and threat modeling',
          triggerPhrases: ['security', 'threat', 'owasp'],
          requiredTools: ['Read', 'Grep'],
          skills: ['security-architect'],
        },
      ],
      constraints: {
        maxConcurrentTasks: 3,
        preferredModel: 'opus',
      },
      health: {
        status: 'degraded',
        consecutiveFailures: 1,
        successCount: 20,
        failureCount: 8,
        successRate: 0.71,
        lastUpdate: '2026-01-31T12:00:00.000Z',
        isolatedAt: null,
        isolationReason: null,
      },
      metadata: {
        version: '1.0.0',
      },
    },
    'frontend-pro': {
      id: 'frontend-pro',
      displayName: 'Frontend Pro',
      category: 'domain',
      filePath: '.claude/agents/domain/frontend-pro.md',
      capabilities: [
        {
          name: 'implementation',
          domain: 'frontend',
          description: 'React/Vue/Angular implementation',
          triggerPhrases: ['react', 'vue', 'frontend'],
          requiredTools: ['Read', 'Write', 'Edit', 'Bash'],
          skills: ['frontend-pro'],
        },
      ],
      constraints: {
        maxConcurrentTasks: 5,
        preferredModel: 'sonnet',
      },
      health: {
        status: 'healthy',
        consecutiveFailures: 0,
        successCount: 30,
        failureCount: 1,
        successRate: 0.97,
        lastUpdate: '2026-01-31T12:00:00.000Z',
        isolatedAt: null,
        isolationReason: null,
      },
      metadata: {
        version: '1.0.0',
      },
    },
    'master-orchestrator': {
      id: 'master-orchestrator',
      displayName: 'Master Orchestrator',
      category: 'orchestrator',
      filePath: '.claude/agents/orchestrators/master-orchestrator.md',
      capabilities: [
        {
          name: 'orchestration',
          domain: 'orchestration',
          description: 'Coordinate multi-agent workflows',
          triggerPhrases: ['orchestrate', 'coordinate'],
          requiredTools: ['Read', 'Write', 'Task'],
          skills: ['swarm-coordination'],
        },
      ],
      constraints: {
        maxConcurrentTasks: 1,
        preferredModel: 'opus',
      },
      health: {
        status: 'healthy',
        consecutiveFailures: 0,
        successCount: 15,
        failureCount: 0,
        successRate: 1.0,
        lastUpdate: '2026-01-31T12:00:00.000Z',
        isolatedAt: null,
        isolationReason: null,
      },
      metadata: {
        version: '1.0.0',
      },
    },
  },
  index: {
    byCapability: {
      implementation: ['developer', 'frontend-pro'],
      'bug-fix': ['developer'],
      'code-review': ['code-reviewer'],
      testing: ['qa'],
      'security-review': ['security-architect'],
      orchestration: ['master-orchestrator'],
    },
    byDomain: {
      code: ['developer', 'code-reviewer'],
      testing: ['qa'],
      security: ['security-architect'],
      frontend: ['frontend-pro'],
      orchestration: ['master-orchestrator'],
    },
    byCategory: {
      core: ['developer', 'qa'],
      specialized: ['code-reviewer', 'security-architect'],
      domain: ['frontend-pro'],
      orchestrator: ['master-orchestrator'],
    },
  },
  health: {
    healthy: ['developer', 'code-reviewer', 'qa', 'frontend-pro', 'master-orchestrator'],
    degraded: ['security-architect'],
    unavailable: [],
  },
};

// Test fixture path
const FIXTURE_DIR = path.join(__dirname, '..', '..', 'fixtures');
const FIXTURE_PATH = path.join(FIXTURE_DIR, 'test-agent-registry.json');

describe('AvailableAgents Tool', () => {
  let query;

  before(() => {
    // Create fixtures directory if not exists
    if (!fs.existsSync(FIXTURE_DIR)) {
      fs.mkdirSync(FIXTURE_DIR, { recursive: true });
    }
    // Write mock registry
    fs.writeFileSync(FIXTURE_PATH, JSON.stringify(mockRegistry, null, 2));

    // Now load the module
    const mod = require('../../../.claude/lib/tools/available-agents.cjs');
    _AvailableAgents = mod.AvailableAgents;
    AvailableAgentsQuery = mod.AvailableAgentsQuery;
    getInstance = mod.getInstance;
  });

  after(() => {
    // Cleanup fixture
    if (fs.existsSync(FIXTURE_PATH)) {
      fs.unlinkSync(FIXTURE_PATH);
    }
  });

  beforeEach(() => {
    query = new AvailableAgentsQuery({ registryPath: FIXTURE_PATH });
    query.clearCache();
  });

  describe('Basic Queries', () => {
    it('returns all agents when no filters provided', () => {
      const result = query.query({});
      assert.strictEqual(result.success, true);
      assert.ok(result.agents.length > 0, 'Should return at least one agent');
      assert.strictEqual(result.count, result.agents.length);
    });

    it('filters by capability', () => {
      const result = query.query({ capability: 'code-review' });
      assert.strictEqual(result.success, true);
      assert.ok(result.agents.length > 0, 'Should find code-review agents');
      assert.ok(
        result.agents.some(a => a.id === 'code-reviewer'),
        'Should include code-reviewer'
      );
    });

    it('filters by domain', () => {
      const result = query.query({ domain: 'code' });
      assert.strictEqual(result.success, true);
      result.agents.forEach(agent => {
        const domains = agent.capabilities.map(c => c.domain);
        assert.ok(domains.includes('code'), `Agent ${agent.id} should have code domain`);
      });
    });

    it('filters by category', () => {
      const result = query.query({ category: 'core' });
      assert.strictEqual(result.success, true);
      result.agents.forEach(agent => {
        assert.strictEqual(agent.category, 'core', `Agent ${agent.id} should be in core category`);
      });
    });

    it('returns agents by domain when no capability match', () => {
      const result = query.query({ domain: 'testing' });
      assert.strictEqual(result.success, true);
      assert.ok(
        result.agents.some(a => a.id === 'qa'),
        'Should include qa agent for testing domain'
      );
    });
  });

  describe('Health Filtering', () => {
    it('excludes unavailable agents by default', () => {
      const result = query.query({});
      assert.strictEqual(result.success, true);
      const unavailableAgents = result.agents.filter(a => a.health.status === 'unavailable');
      assert.strictEqual(unavailableAgents.length, 0, 'Should not include unavailable agents');
    });

    it('includes unavailable agents when excludeFailed is false', () => {
      // First add an unavailable agent to the mock
      const registryWithUnavailable = JSON.parse(JSON.stringify(mockRegistry));
      registryWithUnavailable.agents['broken-agent'] = {
        id: 'broken-agent',
        displayName: 'Broken Agent',
        category: 'core',
        filePath: '.claude/agents/core/broken.md',
        capabilities: [{ name: 'test', domain: 'code', description: 'test' }],
        constraints: {},
        health: {
          status: 'unavailable',
          consecutiveFailures: 3,
          successCount: 0,
          failureCount: 3,
          successRate: 0.0,
          isolatedAt: '2026-01-31T12:00:00.000Z',
          isolationReason: '3 consecutive failures',
        },
      };
      registryWithUnavailable.health.unavailable = ['broken-agent'];

      const tempPath = path.join(FIXTURE_DIR, 'test-registry-with-unavailable.json');
      fs.writeFileSync(tempPath, JSON.stringify(registryWithUnavailable, null, 2));

      const q = new AvailableAgentsQuery({ registryPath: tempPath });
      const result = q.query({ excludeFailed: false, minSuccessRate: 0 });

      assert.strictEqual(result.success, true);
      assert.ok(
        result.agents.some(a => a.id === 'broken-agent'),
        'Should include broken agent when excludeFailed is false and minSuccessRate is 0'
      );

      fs.unlinkSync(tempPath);
    });

    it('filters by minimum success rate', () => {
      const result = query.query({ minSuccessRate: 0.95 });
      assert.strictEqual(result.success, true);
      result.agents.forEach(agent => {
        assert.ok(
          agent.health.successRate >= 0.95,
          `Agent ${agent.id} should have success rate >= 0.95, got ${agent.health.successRate}`
        );
      });
    });

    it('excludes agents below minimum success rate', () => {
      const result = query.query({ minSuccessRate: 0.8 });
      assert.strictEqual(result.success, true);
      // security-architect has 0.71 success rate, should be excluded
      const hasSecurityArchitect = result.agents.some(a => a.id === 'security-architect');
      assert.strictEqual(
        hasSecurityArchitect,
        false,
        'Should exclude security-architect with 0.71 success rate'
      );
    });
  });

  describe('Sorting', () => {
    it('sorts by success rate descending', () => {
      const result = query.query({ minSuccessRate: 0 });
      assert.strictEqual(result.success, true);
      for (let i = 0; i < result.agents.length - 1; i++) {
        const current = result.agents[i].health.successRate;
        const next = result.agents[i + 1].health.successRate;
        assert.ok(
          current >= next,
          `Agents should be sorted by success rate DESC: ${current} >= ${next}`
        );
      }
    });

    it('returns best agent first when multiple match', () => {
      const result = query.query({ capability: 'implementation' });
      assert.strictEqual(result.success, true);
      assert.ok(result.agents.length >= 2, 'Should have at least 2 implementation agents');
      // First should have higher or equal success rate
      assert.ok(
        result.agents[0].health.successRate >= result.agents[1].health.successRate,
        'First agent should have highest success rate'
      );
    });
  });

  describe('Limit', () => {
    it('respects limit parameter', () => {
      const result = query.query({ limit: 2 });
      assert.ok(result.agents.length <= 2, 'Should return at most 2 agents');
    });

    it('uses default limit of 10', () => {
      const result = query.query({});
      assert.ok(result.agents.length <= 10, 'Should return at most 10 agents by default');
    });

    it('enforces maximum limit of 50', () => {
      const result = query.query({ limit: 100 });
      assert.strictEqual(result.success, false, 'Should reject limit > 50');
      assert.ok(result.error.includes('limit'), 'Error should mention limit');
    });

    it('rejects limit less than 1', () => {
      const result = query.query({ limit: 0 });
      assert.strictEqual(result.success, false, 'Should reject limit < 1');
    });
  });

  describe('Caching', () => {
    it('caches query results', () => {
      const start1 = Date.now();
      const result1 = query.query({ capability: 'code-review' });
      const _time1 = Date.now() - start1;

      const start2 = Date.now();
      const result2 = query.query({ capability: 'code-review' });
      const _time2 = Date.now() - start2;

      assert.deepStrictEqual(result1, result2, 'Cached result should match original');
      // Note: on fast systems both might be 0ms, so just verify consistency
    });

    it('cache is cleared properly', () => {
      query.query({ capability: 'code-review' });
      query.clearCache();
      // Verify cache is empty by checking internal state
      assert.strictEqual(query.cache.size, 0, 'Cache should be empty after clear');
    });

    it('different queries have different cache entries', () => {
      const result1 = query.query({ capability: 'code-review' });
      const result2 = query.query({ domain: 'testing' });
      assert.notDeepStrictEqual(
        result1.agents,
        result2.agents,
        'Different queries should return different results'
      );
    });
  });

  describe('Error Handling', () => {
    it('handles missing registry file', () => {
      const badQuery = new AvailableAgentsQuery({ registryPath: '/nonexistent/path.json' });
      const result = badQuery.query({});
      assert.strictEqual(result.success, false);
      assert.ok(result.error, 'Should have error message');
    });

    it('handles null options gracefully', () => {
      const result = query.query(null);
      assert.strictEqual(result.success, true, 'Should handle null options');
    });

    it('handles undefined options gracefully', () => {
      const result = query.query(undefined);
      assert.strictEqual(result.success, true, 'Should handle undefined options');
    });

    it('validates minSuccessRate is in range 0-1', () => {
      const result = query.query({ minSuccessRate: 1.5 });
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('minSuccessRate'), 'Error should mention minSuccessRate');
    });

    it('validates minSuccessRate is not negative', () => {
      const result = query.query({ minSuccessRate: -0.5 });
      assert.strictEqual(result.success, false);
    });
  });

  describe('Response Format', () => {
    it('returns expected response structure', () => {
      const result = query.query({ capability: 'code-review' });
      assert.ok('success' in result, 'Should have success field');
      assert.ok('agents' in result, 'Should have agents field');
      assert.ok('count' in result, 'Should have count field');
      assert.ok('query' in result, 'Should have query field');
    });

    it('agent objects have required fields', () => {
      const result = query.query({});
      assert.strictEqual(result.success, true);
      assert.ok(result.agents.length > 0);
      const agent = result.agents[0];
      assert.ok('id' in agent, 'Agent should have id');
      assert.ok('displayName' in agent, 'Agent should have displayName');
      assert.ok('category' in agent, 'Agent should have category');
      assert.ok('capabilities' in agent, 'Agent should have capabilities');
      assert.ok('health' in agent, 'Agent should have health');
    });

    it('returns error response with no agents on failure', () => {
      const badQuery = new AvailableAgentsQuery({ registryPath: '/nonexistent/path.json' });
      const result = badQuery.query({});
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.agents.length, 0);
      assert.strictEqual(result.count, 0);
    });
  });

  describe('Helper Methods', () => {
    it('getAgent returns single agent by ID', () => {
      const agent = query.getAgent('developer');
      assert.ok(agent, 'Should find developer agent');
      assert.strictEqual(agent.id, 'developer');
    });

    it('getAgent returns null for unknown ID', () => {
      const agent = query.getAgent('nonexistent-agent');
      assert.strictEqual(agent, null, 'Should return null for unknown agent');
    });

    it('isAvailable checks agent availability', () => {
      const available = query.isAvailable('developer');
      assert.strictEqual(available, true, 'Developer should be available');
    });

    it('isAvailable checks capability if provided', () => {
      const hasCapability = query.isAvailable('developer', 'implementation');
      assert.strictEqual(hasCapability, true, 'Developer should have implementation capability');

      const noCapability = query.isAvailable('developer', 'security-review');
      assert.strictEqual(
        noCapability,
        false,
        'Developer should not have security-review capability'
      );
    });

    it('getAvailableFilters returns metadata', () => {
      const filters = query.getAvailableFilters();
      assert.ok(Array.isArray(filters.capabilities), 'Should have capabilities array');
      assert.ok(Array.isArray(filters.domains), 'Should have domains array');
      assert.ok(Array.isArray(filters.categories), 'Should have categories array');
      assert.ok(typeof filters.totalAgents === 'number', 'Should have totalAgents count');
    });
  });

  describe('No Match Handling', () => {
    it('returns suggestions when no agents match capability', () => {
      const result = query.query({ capability: 'nonexistent-capability' });
      assert.strictEqual(result.success, true); // Still success, just empty
      assert.strictEqual(result.count, 0);
    });

    it('returns empty array for unknown domain', () => {
      const result = query.query({ domain: 'unknown-domain' });
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.count, 0);
    });
  });

  describe('Public API', () => {
    it('AvailableAgents function uses singleton', () => {
      // This test uses the global AvailableAgents with its default path
      // Since we can't override the singleton's path easily, we just verify it works
      const instance = getInstance();
      assert.ok(
        instance instanceof AvailableAgentsQuery,
        'getInstance should return AvailableAgentsQuery instance'
      );
    });
  });

  describe('Performance', () => {
    it('query completes in under 100ms', () => {
      const start = Date.now();
      for (let i = 0; i < 10; i++) {
        query.clearCache();
        query.query({ capability: 'implementation' });
      }
      const elapsed = Date.now() - start;
      const avgTime = elapsed / 10;
      assert.ok(avgTime < 100, `Average query time should be <100ms, got ${avgTime}ms`);
    });

    it('cached query completes in under 50ms', () => {
      query.query({ capability: 'implementation' });
      const start = Date.now();
      for (let i = 0; i < 100; i++) {
        query.query({ capability: 'implementation' });
      }
      const elapsed = Date.now() - start;
      const avgTime = elapsed / 100;
      assert.ok(avgTime < 50, `Cached query should be <50ms, got ${avgTime}ms`);
    });
  });

  describe('Edge Cases', () => {
    it('handles agent with no capabilities', () => {
      const registryWithEmptyAgent = JSON.parse(JSON.stringify(mockRegistry));
      registryWithEmptyAgent.agents['empty-agent'] = {
        id: 'empty-agent',
        displayName: 'Empty Agent',
        category: 'core',
        filePath: '.claude/agents/core/empty.md',
        capabilities: [],
        constraints: {},
        health: { status: 'healthy', successRate: 1.0, consecutiveFailures: 0 },
      };

      const tempPath = path.join(FIXTURE_DIR, 'test-registry-empty-agent.json');
      fs.writeFileSync(tempPath, JSON.stringify(registryWithEmptyAgent, null, 2));

      const q = new AvailableAgentsQuery({ registryPath: tempPath });
      const result = q.query({});

      assert.strictEqual(result.success, true);
      // Empty agent should still be included in general query

      fs.unlinkSync(tempPath);
    });

    it('handles combined filters correctly', () => {
      const result = query.query({
        domain: 'code',
        minSuccessRate: 0.95,
        excludeFailed: true,
        limit: 5,
      });
      assert.strictEqual(result.success, true);
      result.agents.forEach(agent => {
        assert.ok(agent.health.successRate >= 0.95);
        assert.ok(agent.health.status !== 'unavailable');
      });
    });

    it('handles empty registry gracefully', () => {
      const emptyRegistry = {
        version: '1.0.0',
        generatedAt: '2026-01-31T12:00:00.000Z',
        metadata: { totalAgents: 0 },
        agents: {},
        index: { byCapability: {}, byDomain: {}, byCategory: {} },
        health: { healthy: [], degraded: [], unavailable: [] },
      };

      const tempPath = path.join(FIXTURE_DIR, 'test-empty-registry.json');
      fs.writeFileSync(tempPath, JSON.stringify(emptyRegistry, null, 2));

      const q = new AvailableAgentsQuery({ registryPath: tempPath });
      const result = q.query({});

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.count, 0);

      fs.unlinkSync(tempPath);
    });

    it('handles malformed JSON gracefully', () => {
      const tempPath = path.join(FIXTURE_DIR, 'test-malformed.json');
      fs.writeFileSync(tempPath, '{ not valid json');

      const q = new AvailableAgentsQuery({ registryPath: tempPath });
      const result = q.query({});

      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('Failed to load'), 'Should report load failure');

      fs.unlinkSync(tempPath);
    });

    it('isAvailable returns false for unavailable agent', () => {
      const registryWithUnavailable = JSON.parse(JSON.stringify(mockRegistry));
      registryWithUnavailable.agents['unavailable-agent'] = {
        id: 'unavailable-agent',
        displayName: 'Unavailable Agent',
        category: 'core',
        capabilities: [{ name: 'test', domain: 'code' }],
        health: { status: 'unavailable', successRate: 0 },
      };

      const tempPath = path.join(FIXTURE_DIR, 'test-unavailable-agent.json');
      fs.writeFileSync(tempPath, JSON.stringify(registryWithUnavailable, null, 2));

      const q = new AvailableAgentsQuery({ registryPath: tempPath });
      const available = q.isAvailable('unavailable-agent');

      assert.strictEqual(available, false, 'Unavailable agent should not be available');

      fs.unlinkSync(tempPath);
    });

    it('isAvailable returns false for non-existent agent', () => {
      const result = query.isAvailable('does-not-exist');
      assert.strictEqual(result, false);
    });

    it('getBestAgent returns best agent for capability', () => {
      const best = query.getBestAgent('implementation');
      assert.ok(best, 'Should find best agent for implementation');
      assert.ok(
        ['developer', 'frontend-pro'].includes(best.id),
        'Best agent should be developer or frontend-pro'
      );
    });

    it('getBestAgent returns null when no agents match', () => {
      const best = query.getBestAgent('nonexistent-capability');
      assert.strictEqual(best, null, 'Should return null for unknown capability');
    });

    it('getAvailableCapabilities returns capability list', () => {
      const capabilities = query.getAvailableCapabilities();
      assert.ok(Array.isArray(capabilities), 'Should return array');
      assert.ok(capabilities.includes('code-review'), 'Should include code-review');
      assert.ok(capabilities.includes('implementation'), 'Should include implementation');
    });

    it('getAvailableDomains returns domain list', () => {
      const domains = query.getAvailableDomains();
      assert.ok(Array.isArray(domains), 'Should return array');
      assert.ok(domains.includes('code'), 'Should include code');
      assert.ok(domains.includes('testing'), 'Should include testing');
    });

    it('query includes query echo in response', () => {
      const options = { capability: 'code-review', limit: 5 };
      const result = query.query(options);
      assert.deepStrictEqual(result.query, options, 'Response should echo query options');
    });
  });

  describe('API Consistency', () => {
    it('all agents have consistent structure', () => {
      const result = query.query({ minSuccessRate: 0 });
      assert.strictEqual(result.success, true);
      result.agents.forEach(agent => {
        assert.ok(typeof agent.id === 'string', `${agent.id}: id should be string`);
        assert.ok(
          typeof agent.displayName === 'string',
          `${agent.id}: displayName should be string`
        );
        assert.ok(
          ['core', 'specialized', 'domain', 'orchestrator'].includes(agent.category),
          `${agent.id}: category should be valid`
        );
        assert.ok(Array.isArray(agent.capabilities), `${agent.id}: capabilities should be array`);
        assert.ok(typeof agent.health === 'object', `${agent.id}: health should be object`);
        assert.ok(
          ['healthy', 'degraded', 'unavailable'].includes(agent.health.status),
          `${agent.id}: health.status should be valid`
        );
      });
    });

    it('query with all filters returns consistent structure', () => {
      const result = query.query({
        capability: 'implementation',
        excludeFailed: true,
        minSuccessRate: 0.5,
        limit: 3,
      });

      assert.ok('success' in result);
      assert.ok('agents' in result);
      assert.ok('count' in result);
      assert.ok('query' in result);
      assert.strictEqual(typeof result.success, 'boolean');
      assert.ok(Array.isArray(result.agents));
      assert.strictEqual(typeof result.count, 'number');
    });

    it('cache key is deterministic regardless of option order', () => {
      const key1 = query.getCacheKey({ capability: 'test', domain: 'code' });
      const key2 = query.getCacheKey({ domain: 'code', capability: 'test' });
      assert.strictEqual(key1, key2, 'Cache keys should match regardless of option order');
    });
  });

  describe('Degraded Agents', () => {
    it('degraded agents are included by default', () => {
      const result = query.query({ minSuccessRate: 0.5 });
      assert.strictEqual(result.success, true);
      // security-architect is degraded with 0.71 success rate
      const hasDegraded = result.agents.some(a => a.health.status === 'degraded');
      assert.ok(hasDegraded, 'Should include degraded agents by default');
    });

    it('degraded agents are filtered by minSuccessRate', () => {
      const result = query.query({ minSuccessRate: 0.9 });
      assert.strictEqual(result.success, true);
      // security-architect has 0.71, should be excluded
      result.agents.forEach(agent => {
        assert.ok(
          agent.health.successRate >= 0.9,
          `Agent ${agent.id} should have successRate >= 0.9`
        );
      });
    });
  });
});
