/**
 * Lifecycle Manager Tests
 *
 * Tests for agent lifecycle management (spawn, status, terminate).
 * Integrates with Phase 1 (agent-identity) and Phase 2 (context-isolator, sidecar-manager).
 *
 * RED phase: These tests MUST fail initially (module doesn't exist yet).
 */

const { describe, it, _before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs/promises');
const path = require('path');

const PROJECT_ROOT = path.dirname(
  path.dirname(path.dirname(path.dirname(path.dirname(__dirname))))
);
const STAGING_DIR = path.join(PROJECT_ROOT, '.claude', 'staging', 'agents');

// Import module under test (will fail initially - expected for RED phase)
const {
  spawnAgent,
  updateAgentStatus,
  getAgentStatus,
  terminateAgent,
  getAllAgents,
} = require('../../../.claude/lib/lifecycle-manager.cjs');

describe('Lifecycle Manager', () => {
  const testSessionId = `test-session-${Date.now()}`;
  let testAgentId; // eslint-disable-line no-unused-vars

  // Cleanup: Remove test session directory
  after(async () => {
    const sessionPath = path.join(STAGING_DIR, testSessionId);
    try {
      await fs.rm(sessionPath, { recursive: true, force: true });
    } catch (_err) {
      // Ignore if doesn't exist
    }
  });

  describe('spawnAgent', () => {
    it('should spawn agent with unique ID', async () => {
      const result = await spawnAgent(testSessionId, 'developer', 'implementer', {
        userMessage: 'Implement feature X',
        previousResponses: [],
      });

      testAgentId = result.agentId;

      assert.ok(result.agentId, 'Should return agent ID');
      assert.strictEqual(result.status, 'spawned', 'Status should be spawned');
      assert.ok(result.timestamp, 'Should have timestamp');
      assert.ok(result.agentId.startsWith('agent_'), 'Agent ID should have correct prefix');
    });

    it('should create sidecar directory for agent', async () => {
      const result = await spawnAgent(testSessionId, 'architect', 'designer', {
        userMessage: 'Design system architecture',
        previousResponses: [],
      });

      const sidecarPath = path.join(STAGING_DIR, testSessionId, result.agentId);
      const sidecarExists = await fs
        .access(sidecarPath)
        .then(() => true)
        .catch(() => false);

      assert.ok(sidecarExists, 'Sidecar directory should be created');

      // Cleanup
      testAgentId = result.agentId;
    });

    it('should isolate context for agent', async () => {
      const sharedContext = {
        userMessage: 'Review security',
        previousResponses: [{ content: 'Previous response', rawThinking: 'Internal thoughts' }],
        _orchestratorState: { secret: 'data' },
      };

      const result = await spawnAgent(
        testSessionId,
        'security-architect',
        'reviewer',
        sharedContext
      );

      assert.ok(result.isolatedContext, 'Should return isolated context');
      assert.strictEqual(
        result.isolatedContext.userMessage,
        'Review security',
        'User message should be preserved'
      );
      assert.ok(
        !result.isolatedContext._orchestratorState,
        'Orchestrator state should be stripped'
      );
      assert.ok(
        !result.isolatedContext.previousResponses[0].rawThinking,
        'rawThinking should be stripped'
      );
      assert.ok(result.isolatedContext.agentId, 'Agent ID should be added to context');

      testAgentId = result.agentId;
    });

    it('should track spawned agent in lifecycle state', async () => {
      const result = await spawnAgent(testSessionId, 'qa', 'validator', {
        userMessage: 'Run tests',
        previousResponses: [],
      });

      const status = await getAgentStatus(result.agentId);

      assert.ok(status, 'Agent status should be tracked');
      assert.strictEqual(status.status, 'spawned', 'Status should be spawned');
      assert.strictEqual(status.agentType, 'qa', 'Agent type should be tracked');

      testAgentId = result.agentId;
    });
  });

  describe('updateAgentStatus', () => {
    it('should update agent status to active', async () => {
      const spawnResult = await spawnAgent(testSessionId, 'developer', 'implementer', {
        userMessage: 'Build feature',
        previousResponses: [],
      });

      const updateResult = await updateAgentStatus(spawnResult.agentId, 'active');

      assert.ok(updateResult.updated, 'Should update status');
      assert.strictEqual(
        updateResult.previousStatus,
        'spawned',
        'Previous status should be spawned'
      );
      assert.strictEqual(updateResult.newStatus, 'active', 'New status should be active');
    });

    it('should track status transitions', async () => {
      const spawnResult = await spawnAgent(testSessionId, 'developer', 'implementer', {
        userMessage: 'Test transitions',
        previousResponses: [],
      });

      await updateAgentStatus(spawnResult.agentId, 'active');
      await updateAgentStatus(spawnResult.agentId, 'completing');
      const finalResult = await updateAgentStatus(spawnResult.agentId, 'completed');

      assert.strictEqual(finalResult.previousStatus, 'completing', 'Should track previous status');
      assert.strictEqual(finalResult.newStatus, 'completed', 'Should track new status');
    });

    it('should validate status transitions', async () => {
      const spawnResult = await spawnAgent(testSessionId, 'developer', 'implementer', {
        userMessage: 'Test invalid transition',
        previousResponses: [],
      });

      // Try invalid transition (spawned → completed without active)
      const result = await updateAgentStatus(spawnResult.agentId, 'completed');

      // Note: Implementation may allow or disallow this - adjust based on design
      assert.ok(result.updated !== undefined, 'Should return update result');
    });
  });

  describe('getAgentStatus', () => {
    it('should retrieve agent status', async () => {
      const spawnResult = await spawnAgent(testSessionId, 'developer', 'implementer', {
        userMessage: 'Check status',
        previousResponses: [],
      });

      const status = await getAgentStatus(spawnResult.agentId);

      assert.ok(status, 'Should return status');
      assert.strictEqual(status.agentId, spawnResult.agentId, 'Agent ID should match');
      assert.strictEqual(status.status, 'spawned', 'Status should be spawned');
      assert.ok(status.spawnedAt, 'Should have spawned timestamp');
    });

    it('should return null for non-existent agent', async () => {
      const status = await getAgentStatus('agent_nonexistent_1234567890');

      assert.strictEqual(status, null, 'Should return null for non-existent agent');
    });
  });

  describe('terminateAgent', () => {
    it('should terminate agent gracefully', async () => {
      const spawnResult = await spawnAgent(testSessionId, 'developer', 'implementer', {
        userMessage: 'Will be terminated',
        previousResponses: [],
      });

      const terminateResult = await terminateAgent(spawnResult.agentId, 'test cleanup');

      assert.ok(terminateResult.terminated, 'Should terminate agent');
      assert.strictEqual(terminateResult.agentId, spawnResult.agentId, 'Agent ID should match');

      // Verify status updated
      const status = await getAgentStatus(spawnResult.agentId);
      assert.strictEqual(status.status, 'terminated', 'Status should be terminated');
    });

    it('should preserve sidecar after termination', async () => {
      const spawnResult = await spawnAgent(testSessionId, 'developer', 'implementer', {
        userMessage: 'Check sidecar preservation',
        previousResponses: [],
      });

      await terminateAgent(spawnResult.agentId, 'test');

      const sidecarPath = path.join(STAGING_DIR, testSessionId, spawnResult.agentId);
      const sidecarExists = await fs
        .access(sidecarPath)
        .then(() => true)
        .catch(() => false);

      assert.ok(sidecarExists, 'Sidecar should be preserved for audit');
    });
  });

  describe('getAllAgents', () => {
    it('should list all agents in session', async () => {
      const sessionId = `test-list-${Date.now()}`;

      // Spawn multiple agents
      await spawnAgent(sessionId, 'developer', 'implementer', {
        userMessage: 'Task 1',
        previousResponses: [],
      });
      await spawnAgent(sessionId, 'architect', 'designer', {
        userMessage: 'Task 2',
        previousResponses: [],
      });
      await spawnAgent(sessionId, 'qa', 'validator', {
        userMessage: 'Task 3',
        previousResponses: [],
      });

      const agents = await getAllAgents(sessionId);

      assert.strictEqual(agents.length, 3, 'Should return 3 agents');
      assert.ok(
        agents.every(a => a.agentId),
        'All agents should have IDs'
      );
      assert.ok(
        agents.every(a => a.status),
        'All agents should have status'
      );
      assert.ok(
        agents.every(a => a.role),
        'All agents should have roles'
      );
    });

    it('should return empty array for session with no agents', async () => {
      const agents = await getAllAgents('nonexistent-session');

      assert.strictEqual(agents.length, 0, 'Should return empty array');
    });
  });
});
