/**
 * Message Router Tests (TDD - RED phase)
 *
 * Tests for fast message routing between agents (<5ms)
 * Component: message-router.cjs
 * Security Controls: None directly (uses agent-identity for verification)
 */

const { describe, it, before, _after } = require('node:test');
const assert = require('node:assert');
const path = require('path');

describe('Message Router', () => {
  let messageRouter;

  before(async () => {
    // Will fail until we create message-router.cjs
    messageRouter = require('../../../.claude/lib/message-router.cjs');
  });

  describe('createRouter', () => {
    it('should create a router with session ID', () => {
      const sessionId = 'session_test_001';
      const router = messageRouter.createRouter(sessionId);

      assert.strictEqual(router.sessionId, sessionId);
      assert.ok(router.routes instanceof Map);
      assert.ok(Array.isArray(router.messageQueue));
      assert.strictEqual(router.messageQueue.length, 0);
    });

    it('should initialize empty routes and message queue', () => {
      const router = messageRouter.createRouter('session_002');

      assert.strictEqual(router.routes.size, 0);
      assert.strictEqual(router.messageQueue.length, 0);
    });
  });

  describe('registerAgent', () => {
    it('should register agent and return route ID', () => {
      const router = messageRouter.createRouter('session_003');
      const result = messageRouter.registerAgent(router, 'agent_001', 'developer');

      assert.strictEqual(result.success, true);
      assert.ok(result.routeId);
      assert.strictEqual(router.routes.size, 1);
    });

    it('should prevent duplicate agent registration', () => {
      const router = messageRouter.createRouter('session_004');
      messageRouter.registerAgent(router, 'agent_001', 'developer');

      const result = messageRouter.registerAgent(router, 'agent_001', 'architect');

      assert.strictEqual(result.success, false);
      assert.match(result.error, /already registered/i);
    });
  });

  describe('routeMessage', () => {
    it('should route message from one agent to another', () => {
      const router = messageRouter.createRouter('session_005');
      messageRouter.registerAgent(router, 'agent_001', 'developer');
      messageRouter.registerAgent(router, 'agent_002', 'architect');

      const message = { content: 'What do you think about microservices?' };
      const result = messageRouter.routeMessage(router, 'agent_001', 'agent_002', message);

      assert.strictEqual(result.delivered, true);
      assert.ok(result.timestamp);
      assert.ok(result.messageHash);
    });

    it('should fail if sender not registered', () => {
      const router = messageRouter.createRouter('session_006');
      messageRouter.registerAgent(router, 'agent_002', 'architect');

      const result = messageRouter.routeMessage(router, 'agent_999', 'agent_002', {
        content: 'test',
      });

      assert.strictEqual(result.delivered, false);
      assert.match(result.error, /Sender .* not registered/);
    });

    it('should fail if recipient not registered', () => {
      const router = messageRouter.createRouter('session_007');
      messageRouter.registerAgent(router, 'agent_001', 'developer');

      const result = messageRouter.routeMessage(router, 'agent_001', 'agent_999', {
        content: 'test',
      });

      assert.strictEqual(result.delivered, false);
      assert.match(result.error, /Recipient .* not registered/);
    });
  });

  describe('broadcastMessage', () => {
    it('should broadcast message to all agents except sender', () => {
      const router = messageRouter.createRouter('session_008');
      messageRouter.registerAgent(router, 'agent_001', 'developer');
      messageRouter.registerAgent(router, 'agent_002', 'architect');
      messageRouter.registerAgent(router, 'agent_003', 'security-architect');

      const message = { content: 'Team announcement: Architecture review at 3pm' };
      const result = messageRouter.broadcastMessage(router, 'agent_001', message);

      assert.strictEqual(result.delivered, 2); // Should deliver to agent_002 and agent_003, not agent_001
      assert.strictEqual(result.failedAgents.length, 0);
    });

    it('should handle empty router gracefully', () => {
      const router = messageRouter.createRouter('session_009');

      const result = messageRouter.broadcastMessage(router, 'agent_001', { content: 'test' });

      assert.strictEqual(result.delivered, 0);
      assert.strictEqual(result.failedAgents.length, 0);
    });
  });

  describe('getMessageHistory', () => {
    it('should return message history for specific agent', () => {
      const router = messageRouter.createRouter('session_010');
      messageRouter.registerAgent(router, 'agent_001', 'developer');
      messageRouter.registerAgent(router, 'agent_002', 'architect');

      // Send some messages
      messageRouter.routeMessage(router, 'agent_001', 'agent_002', { content: 'Message 1' });
      messageRouter.routeMessage(router, 'agent_002', 'agent_001', { content: 'Message 2' });

      const history = messageRouter.getMessageHistory(router, 'agent_001');

      assert.ok(Array.isArray(history));
      assert.strictEqual(history.length, 2); // 1 sent + 1 received
    });

    it('should return empty array for agent with no messages', () => {
      const router = messageRouter.createRouter('session_011');
      messageRouter.registerAgent(router, 'agent_001', 'developer');

      const history = messageRouter.getMessageHistory(router, 'agent_001');

      assert.ok(Array.isArray(history));
      assert.strictEqual(history.length, 0);
    });
  });

  describe('Performance', () => {
    it('should route message in <5ms', () => {
      const router = messageRouter.createRouter('session_perf');
      messageRouter.registerAgent(router, 'agent_001', 'developer');
      messageRouter.registerAgent(router, 'agent_002', 'architect');

      const message = { content: 'Performance test message' };

      const start = process.hrtime.bigint();
      messageRouter.routeMessage(router, 'agent_001', 'agent_002', message);
      const end = process.hrtime.bigint();

      const durationMs = Number(end - start) / 1_000_000;
      assert.ok(durationMs < 5, `Message routing took ${durationMs.toFixed(2)}ms (target: <5ms)`);
    });
  });
});
