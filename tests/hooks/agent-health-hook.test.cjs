#!/usr/bin/env node
/**
 * Agent Health Hook Tests
 * =======================
 *
 * Tests for the agent health hook which integrates with the Task tool
 * to record success/failure for health tracking.
 *
 * @module tests/hooks/agent-health-hook.test.cjs
 * @see {@link file://.claude/hooks/routing/agent-health-hook.cjs} Implementation
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// =============================================================================
// Test Setup
// =============================================================================

/**
 * Create a mock agent registry for testing
 */
function createMockRegistry() {
  return {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    metadata: {
      totalAgents: 3,
      healthyAgents: 3,
      degradedAgents: 0,
      unavailableAgents: 0,
      lastHealthCheck: new Date().toISOString(),
      lastFullScan: new Date().toISOString(),
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
        ],
        constraints: {
          maxConcurrentTasks: 5,
          preferredModel: 'sonnet',
        },
        health: {
          status: 'healthy',
          consecutiveFailures: 0,
          successCount: 0,
          failureCount: 0,
          successRate: 1.0,
          averageExecutionMs: null,
          lastUpdate: new Date().toISOString(),
          isolatedAt: null,
          isolationReason: null,
          lastSuccessAt: null,
          lastFailureAt: null,
        },
        metadata: {
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
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
            description: 'Test development and execution',
            triggerPhrases: ['test', 'qa', 'validate'],
            requiredTools: ['Read', 'Write', 'Edit', 'Bash'],
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
          successCount: 0,
          failureCount: 0,
          successRate: 1.0,
          averageExecutionMs: null,
          lastUpdate: new Date().toISOString(),
          isolatedAt: null,
          isolationReason: null,
          lastSuccessAt: null,
          lastFailureAt: null,
        },
        metadata: {
          version: '1.0.0',
        },
      },
      planner: {
        id: 'planner',
        displayName: 'Planner Agent',
        category: 'core',
        filePath: '.claude/agents/core/planner.md',
        capabilities: [
          {
            name: 'planning',
            domain: 'planning',
            description: 'Task planning and breakdown',
            triggerPhrases: ['plan', 'design', 'roadmap'],
            requiredTools: ['Read', 'Write', 'TaskCreate'],
            skills: ['task-breakdown'],
          },
        ],
        constraints: {
          maxConcurrentTasks: 3,
          preferredModel: 'sonnet',
        },
        health: {
          status: 'healthy',
          consecutiveFailures: 0,
          successCount: 0,
          failureCount: 0,
          successRate: 1.0,
          averageExecutionMs: null,
          lastUpdate: new Date().toISOString(),
          isolatedAt: null,
          isolationReason: null,
          lastSuccessAt: null,
          lastFailureAt: null,
        },
        metadata: {
          version: '1.0.0',
        },
      },
    },
    index: {
      byCapability: {
        implementation: ['developer'],
        testing: ['qa'],
        planning: ['planner'],
      },
      byDomain: {
        code: ['developer'],
        testing: ['qa'],
        planning: ['planner'],
      },
      byCategory: {
        core: ['developer', 'qa', 'planner'],
      },
    },
    health: {
      healthy: ['developer', 'qa', 'planner'],
      degraded: [],
      unavailable: [],
    },
  };
}

/**
 * Setup test environment with temporary registry file
 */
function setupTestEnvironment() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-health-hook-test-'));
  const registryPath = path.join(tmpDir, 'agent-registry.json');
  const registry = createMockRegistry();
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
  return { tmpDir, registryPath, registry };
}

/**
 * Cleanup test environment
 */
function cleanupTestEnvironment(tmpDir) {
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('AgentHealthHook', () => {
  let testEnv;
  let hook;

  beforeEach(() => {
    testEnv = setupTestEnvironment();
    // Set environment variable for registry path
    process.env.AGENT_REGISTRY_PATH = testEnv.registryPath;
    // Clear module cache for fresh load
    delete require.cache[require.resolve('../../.claude/hooks/routing/agent-health-hook.cjs')];
    hook = require('../../.claude/hooks/routing/agent-health-hook.cjs');
  });

  afterEach(() => {
    cleanupTestEnvironment(testEnv.tmpDir);
    delete process.env.AGENT_REGISTRY_PATH;
  });

  // ===========================================================================
  // extractAgentId Tests
  // ===========================================================================

  describe('extractAgentId', () => {
    it('should extract agent from "You are DEVELOPER agent" pattern', () => {
      const prompt = 'You are DEVELOPER agent. Implement the feature.';
      const result = hook.extractAgentId(prompt);
      assert.strictEqual(result, 'developer', 'Should extract developer');
    });

    it('should extract agent from "You are the PLANNER agent" pattern', () => {
      const prompt = 'You are the PLANNER agent. Create a plan.';
      const result = hook.extractAgentId(prompt);
      assert.strictEqual(result, 'planner', 'Should extract planner');
    });

    it('should extract agent from agent file path pattern', () => {
      const prompt = 'Read: .claude/agents/core/developer.md';
      const result = hook.extractAgentId(prompt);
      assert.strictEqual(result, 'developer', 'Should extract developer from path');
    });

    it('should extract agent from specialized agent path', () => {
      const prompt = 'Read: .claude/agents/specialized/code-reviewer.md';
      const result = hook.extractAgentId(prompt);
      assert.strictEqual(result, 'code-reviewer', 'Should extract code-reviewer');
    });

    it('should extract agent from domain agent path', () => {
      const prompt = 'Read: .claude/agents/domain/frontend-pro.md';
      const result = hook.extractAgentId(prompt);
      assert.strictEqual(result, 'frontend-pro', 'Should extract frontend-pro');
    });

    it('should extract agent from orchestrator path', () => {
      const prompt = 'Read: .claude/agents/orchestrators/master-orchestrator.md';
      const result = hook.extractAgentId(prompt);
      assert.strictEqual(result, 'master-orchestrator', 'Should extract master-orchestrator');
    });

    it('should handle underscores in agent name', () => {
      const prompt = 'You are SECURITY_ARCHITECT agent.';
      const result = hook.extractAgentId(prompt);
      assert.strictEqual(result, 'security-architect', 'Should convert underscores to dashes');
    });

    it('should return null for unrecognized patterns', () => {
      const prompt = 'This is a random prompt without agent info.';
      const result = hook.extractAgentId(prompt);
      assert.strictEqual(result, null, 'Should return null');
    });
  });

  // ===========================================================================
  // extractAgentFromInput Tests
  // ===========================================================================

  describe('extractAgentFromInput', () => {
    it('should extract agent from prompt field', () => {
      const input = {
        prompt: 'You are DEVELOPER agent. Fix the bug.',
      };
      const result = hook.extractAgentFromInput(input);
      assert.strictEqual(result, 'developer', 'Should extract from prompt');
    });

    it('should extract agent from description field when prompt has no match', () => {
      const input = {
        prompt: 'No agent info here',
        description: 'developer implementing feature',
      };
      const result = hook.extractAgentFromInput(input);
      assert.strictEqual(result, 'developer', 'Should extract from description');
    });

    it('should prioritize prompt over description', () => {
      const input = {
        prompt: 'You are QA agent.',
        description: 'developer implementing feature',
      };
      const result = hook.extractAgentFromInput(input);
      assert.strictEqual(result, 'qa', 'Should prioritize prompt');
    });

    it('should return null when no agent found', () => {
      const input = {
        prompt: 'Random task',
        description: 'Some work to do',
      };
      const result = hook.extractAgentFromInput(input);
      assert.strictEqual(result, null, 'Should return null');
    });
  });

  // ===========================================================================
  // Hook Configuration Tests
  // ===========================================================================

  describe('hook configuration', () => {
    it('should have correct name', () => {
      assert.strictEqual(hook.name, 'agent-health-hook', 'Should have correct name');
    });

    it('should have description', () => {
      assert.ok(hook.description, 'Should have description');
      assert.ok(hook.description.includes('health'), 'Description should mention health');
    });

    it('should export postToolUse function', () => {
      assert.ok(typeof hook.postToolUse === 'function', 'Should export postToolUse');
    });

    it('should export preToolUse function', () => {
      assert.ok(typeof hook.preToolUse === 'function', 'Should export preToolUse');
    });
  });

  // ===========================================================================
  // postToolUse Tests
  // ===========================================================================

  describe('postToolUse', () => {
    it('should allow non-Task tools to pass through', async () => {
      const context = {
        toolName: 'Read',
        toolInput: { file_path: '/some/file.txt' },
        toolResult: { content: 'file content' },
      };
      const result = await hook.postToolUse(context);
      assert.strictEqual(result.decision, 'allow', 'Should allow non-Task tools');
    });

    it('should record success for Task tool with successful result', async () => {
      const context = {
        toolName: 'Task',
        toolInput: {
          prompt: 'You are DEVELOPER agent.',
        },
        toolResult: { agentId: 'developer', success: true },
        startTime: Date.now() - 1000, // Started 1 second ago
      };
      const result = await hook.postToolUse(context);
      assert.strictEqual(result.decision, 'allow', 'Should allow');

      // Verify health was recorded
      const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      assert.strictEqual(
        registry.agents.developer.health.successCount,
        1,
        'Should increment successCount'
      );
    });

    it('should record failure for Task tool with error result', async () => {
      const context = {
        toolName: 'Task',
        toolInput: {
          prompt: 'You are DEVELOPER agent.',
        },
        toolResult: { error: { message: 'Spawn failed' } },
      };
      const result = await hook.postToolUse(context);
      assert.strictEqual(
        result.decision,
        'allow',
        'Should allow (failure is recorded, not blocked)'
      );

      // Verify failure was recorded
      const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      assert.strictEqual(
        registry.agents.developer.health.failureCount,
        1,
        'Should increment failureCount'
      );
    });

    it('should record failure for Task tool with status=error', async () => {
      const context = {
        toolName: 'Task',
        toolInput: {
          prompt: 'You are QA agent.',
        },
        toolResult: { status: 'error', message: 'Agent crashed' },
      };
      const result = await hook.postToolUse(context);
      assert.strictEqual(result.decision, 'allow', 'Should allow');

      // Verify failure was recorded
      const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      assert.strictEqual(
        registry.agents.qa.health.failureCount,
        1,
        'Should increment failureCount'
      );
    });

    it('should not track unknown agents', async () => {
      const context = {
        toolName: 'Task',
        toolInput: {
          prompt: 'Random task with no agent reference',
        },
        toolResult: { success: true },
      };
      const result = await hook.postToolUse(context);
      assert.strictEqual(result.decision, 'allow', 'Should allow');

      // Registry should be unchanged
      const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      assert.strictEqual(
        registry.agents.developer.health.successCount,
        0,
        'Should not change developer'
      );
      assert.strictEqual(registry.agents.qa.health.successCount, 0, 'Should not change qa');
    });
  });

  // ===========================================================================
  // preToolUse Tests (Pre-spawn Health Check)
  // ===========================================================================

  describe('preToolUse', () => {
    it('should allow non-Task tools', async () => {
      const context = {
        toolName: 'Read',
        toolInput: { file_path: '/some/file.txt' },
      };
      const result = await hook.preToolUse(context);
      assert.strictEqual(result.decision, 'allow', 'Should allow non-Task tools');
    });

    it('should allow healthy agents', async () => {
      const context = {
        toolName: 'Task',
        toolInput: {
          prompt: 'You are DEVELOPER agent.',
        },
      };
      const result = await hook.preToolUse(context);
      assert.strictEqual(result.decision, 'allow', 'Should allow healthy agent');
    });

    it('should allow unknown agents (may be new)', async () => {
      const context = {
        toolName: 'Task',
        toolInput: {
          prompt: 'You are NEW_AGENT agent.',
        },
      };
      const result = await hook.preToolUse(context);
      assert.strictEqual(result.decision, 'allow', 'Should allow unknown agent');
    });

    it('should block unavailable agents within recovery window', async () => {
      // Make developer unavailable
      const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      registry.agents.developer.health.status = 'unavailable';
      registry.agents.developer.health.isolatedAt = new Date().toISOString();
      registry.agents.developer.health.isolationReason = '3 consecutive failures: Timeout';
      registry.agents.developer.health.consecutiveFailures = 3;
      registry.health.healthy = registry.health.healthy.filter(id => id !== 'developer');
      registry.health.unavailable.push('developer');
      fs.writeFileSync(testEnv.registryPath, JSON.stringify(registry, null, 2));

      const context = {
        toolName: 'Task',
        toolInput: {
          prompt: 'You are DEVELOPER agent.',
        },
      };
      const result = await hook.preToolUse(context);
      assert.strictEqual(result.decision, 'block', 'Should block unavailable agent');
      assert.ok(result.message.includes('unavailable'), 'Should mention unavailable');
    });

    it('should allow recovery for unavailable agents after window passes', async () => {
      // Make developer unavailable 6 minutes ago
      const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
      const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      registry.agents.developer.health.status = 'unavailable';
      registry.agents.developer.health.isolatedAt = sixMinutesAgo.toISOString();
      registry.agents.developer.health.isolationReason = '3 consecutive failures: Timeout';
      registry.agents.developer.health.consecutiveFailures = 3;
      registry.health.healthy = registry.health.healthy.filter(id => id !== 'developer');
      registry.health.unavailable.push('developer');
      fs.writeFileSync(testEnv.registryPath, JSON.stringify(registry, null, 2));

      const context = {
        toolName: 'Task',
        toolInput: {
          prompt: 'You are DEVELOPER agent.',
        },
      };
      const result = await hook.preToolUse(context);
      assert.strictEqual(result.decision, 'allow', 'Should allow after recovery window');

      // Verify recovery was attempted
      const updatedRegistry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      assert.strictEqual(
        updatedRegistry.agents.developer.health.status,
        'degraded',
        'Should be degraded after recovery'
      );
    });

    it('should warn for degraded agents but allow spawn', async () => {
      // Make developer degraded
      const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      registry.agents.developer.health.status = 'degraded';
      registry.agents.developer.health.successRate = 0.65;
      registry.health.healthy = registry.health.healthy.filter(id => id !== 'developer');
      registry.health.degraded.push('developer');
      fs.writeFileSync(testEnv.registryPath, JSON.stringify(registry, null, 2));

      const context = {
        toolName: 'Task',
        toolInput: {
          prompt: 'You are DEVELOPER agent.',
        },
      };
      const result = await hook.preToolUse(context);
      assert.strictEqual(result.decision, 'allow', 'Should allow degraded agent');
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('edge cases', () => {
    it('should handle missing toolInput', async () => {
      const context = {
        toolName: 'Task',
        toolInput: null,
        toolResult: { success: true },
      };
      const result = await hook.postToolUse(context);
      assert.strictEqual(result.decision, 'allow', 'Should allow with missing input');
    });

    it('should handle missing toolResult', async () => {
      const context = {
        toolName: 'Task',
        toolInput: { prompt: 'You are DEVELOPER agent.' },
        toolResult: null,
      };
      const result = await hook.postToolUse(context);
      assert.strictEqual(result.decision, 'allow', 'Should allow with missing result');
    });

    it('should handle disabled mode', async () => {
      process.env.AGENT_HEALTH_HOOK = 'off';
      delete require.cache[require.resolve('../../.claude/hooks/routing/agent-health-hook.cjs')];
      const disabledHook = require('../../.claude/hooks/routing/agent-health-hook.cjs');

      const context = {
        toolName: 'Task',
        toolInput: { prompt: 'You are DEVELOPER agent.' },
        toolResult: { success: true },
      };
      const result = await disabledHook.postToolUse(context);
      assert.strictEqual(result.decision, 'allow', 'Should allow when disabled');

      // Verify health was NOT recorded
      const registry = JSON.parse(fs.readFileSync(testEnv.registryPath, 'utf-8'));
      assert.strictEqual(
        registry.agents.developer.health.successCount,
        0,
        'Should not track when disabled'
      );

      // Cleanup
      delete process.env.AGENT_HEALTH_HOOK;
    });
  });
});
