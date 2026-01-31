/**
 * Context Isolator Tests (TDD - RED phase)
 *
 * Tests for SEC-PM-004 (CRITICAL): Context Isolation
 * Prevents cross-agent contamination via deep copy + data stripping.
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert');

describe('Context Isolator (SEC-PM-004)', () => {
  let contextIsolator;

  before(async () => {
    // Will fail until we create context-isolator.cjs
    contextIsolator = require('../../../.claude/lib/context-isolator.cjs');
  });

  describe('isolateContext', () => {
    it('should create isolated COPY (not reference) of context', () => {
      const originalContext = {
        userMessage: 'What do you think about microservices?',
        previousResponses: [{ agentName: 'developer', content: 'I prefer modular monoliths' }],
      };

      const isolated = contextIsolator.isolateContext(originalContext, 'agent_001', 'architect');

      // Modify isolated context
      isolated.userMessage = 'MODIFIED';
      isolated.previousResponses[0].content = 'MODIFIED';

      // Original should be UNCHANGED (deep copy)
      assert.strictEqual(originalContext.userMessage, 'What do you think about microservices?');
      assert.strictEqual(
        originalContext.previousResponses[0].content,
        'I prefer modular monoliths'
      );
    });

    it('should strip _internal fields from context', () => {
      const originalContext = {
        userMessage: 'Test',
        _internal: { secretData: 'should be removed' },
        _systemPrompts: ['prompt1', 'prompt2'],
      };

      const isolated = contextIsolator.isolateContext(originalContext, 'agent_001', 'developer');

      assert.strictEqual(isolated._internal, undefined);
      assert.strictEqual(isolated._systemPrompts, undefined);
    });

    it('should add agent metadata to isolated context', () => {
      const originalContext = { userMessage: 'Test' };

      const isolated = contextIsolator.isolateContext(originalContext, 'agent_123', 'architect');

      assert.strictEqual(isolated.agentId, 'agent_123');
      assert.strictEqual(isolated.agentType, 'architect');
      assert.ok(isolated.timestamp);
    });

    it('should strip rawThinking from previous responses', () => {
      const originalContext = {
        userMessage: 'Test',
        previousResponses: [
          {
            agentName: 'developer',
            content: 'Public content',
            rawThinking: 'Internal reasoning that should be removed',
          },
        ],
      };

      const isolated = contextIsolator.isolateContext(originalContext, 'agent_002', 'architect');

      assert.strictEqual(isolated.previousResponses[0].content, 'Public content');
      assert.strictEqual(isolated.previousResponses[0].rawThinking, undefined);
    });

    it('should strip toolCalls from previous responses', () => {
      const originalContext = {
        userMessage: 'Test',
        previousResponses: [
          {
            agentName: 'developer',
            content: 'Public content',
            toolCalls: [{ tool: 'Read', args: ['secret-file.txt'] }],
          },
        ],
      };

      const isolated = contextIsolator.isolateContext(originalContext, 'agent_003', 'security');

      assert.strictEqual(isolated.previousResponses[0].toolCalls, undefined);
    });

    it('should complete isolation in <10ms (performance)', () => {
      const originalContext = {
        userMessage: 'Test',
        previousResponses: Array(10).fill({ agentName: 'test', content: 'Test response' }),
      };

      const start = process.hrtime.bigint();
      contextIsolator.isolateContext(originalContext, 'agent_perf', 'developer');
      const end = process.hrtime.bigint();

      const durationMs = Number(end - start) / 1_000_000;
      assert.ok(durationMs < 10, `Isolation took ${durationMs.toFixed(2)}ms (target: <10ms)`);
    });
  });

  describe('sanitizeSharedContext', () => {
    it('should remove sensitive data (credentials, tokens, paths)', () => {
      const context = {
        apiKey: 'sk-abc123',
        token: 'Bearer xyz',
        filePath: '/secret/path',
        publicData: 'This should remain',
      };

      const sanitized = contextIsolator.sanitizeSharedContext(context);

      assert.strictEqual(sanitized.apiKey, undefined);
      assert.strictEqual(sanitized.token, undefined);
      assert.strictEqual(sanitized.filePath, undefined);
      assert.strictEqual(sanitized.publicData, 'This should remain');
    });

    it('should remove session IDs', () => {
      const context = {
        sessionId: 'session_secret_123',
        data: 'public',
      };

      const sanitized = contextIsolator.sanitizeSharedContext(context);

      assert.strictEqual(sanitized.sessionId, undefined);
      assert.strictEqual(sanitized.data, 'public');
    });
  });

  describe('validateContextBoundary', () => {
    it('should validate context has required isolation markers', () => {
      const validContext = {
        agentId: 'agent_001',
        agentType: 'developer',
        timestamp: Date.now(),
        userMessage: 'Test',
      };

      const result = contextIsolator.validateContextBoundary(validContext, 'agent_001');

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.violations.length, 0);
    });

    it('should detect if _internal fields are present (violation)', () => {
      const invalidContext = {
        agentId: 'agent_001',
        agentType: 'developer',
        _internal: { secret: 'data' },
      };

      const result = contextIsolator.validateContextBoundary(invalidContext, 'agent_001');

      assert.strictEqual(result.valid, false);
      assert.ok(result.violations.length > 0);
      assert.match(result.violations[0], /_internal/);
    });

    it('should detect if agent has access to wrong agentId context', () => {
      const context = {
        agentId: 'agent_999', // Different agent!
        agentType: 'developer',
        timestamp: Date.now(),
      };

      const result = contextIsolator.validateContextBoundary(context, 'agent_001');

      assert.strictEqual(result.valid, false);
      assert.ok(result.violations.some(v => v.includes('agentId mismatch')));
    });
  });

  describe('mergeAgentContributions', () => {
    it('should safely merge agent response to shared context', () => {
      const sharedContext = {
        userMessage: 'Test',
        previousResponses: [],
      };

      const agentContribution = {
        agentName: 'developer',
        content: 'My response',
      };

      const updated = contextIsolator.mergeAgentContributions(sharedContext, agentContribution);

      assert.strictEqual(updated.previousResponses.length, 1);
      assert.strictEqual(updated.previousResponses[0].agentName, 'developer');
      assert.strictEqual(updated.previousResponses[0].content, 'My response');
    });

    it('should strip internal data during merge', () => {
      const sharedContext = {
        userMessage: 'Test',
        previousResponses: [],
      };

      const agentContribution = {
        agentName: 'developer',
        content: 'My response',
        rawThinking: 'Internal reasoning',
        toolCalls: [{ tool: 'Read' }],
      };

      const updated = contextIsolator.mergeAgentContributions(sharedContext, agentContribution);

      assert.strictEqual(updated.previousResponses[0].rawThinking, undefined);
      assert.strictEqual(updated.previousResponses[0].toolCalls, undefined);
    });
  });

  describe('SEC-PM-004 Penetration Tests', () => {
    it('PEN-003: Should prevent context eavesdropping (Agent A reads Agent B context)', () => {
      const agentBContext = {
        agentId: 'agent_B',
        agentType: 'security-architect',
        previousResponses: [
          {
            agentName: 'security-architect',
            content: 'Public response',
            rawThinking: 'SECRET: Threat model analysis',
          },
        ],
      };

      // Agent A tries to access Agent B's context
      const agentAIsolated = contextIsolator.isolateContext(agentBContext, 'agent_A', 'developer');

      // Agent A should NOT see rawThinking
      assert.strictEqual(agentAIsolated.previousResponses[0].rawThinking, undefined);
    });

    it('PEN-004: Should prevent internal data leak (_internal fields)', () => {
      const contextWithInternals = {
        userMessage: 'Test',
        _internal: { secretKeys: ['key1', 'key2'] },
        _orchestratorState: { activeAgents: ['agent_001'] },
      };

      const isolated = contextIsolator.isolateContext(
        contextWithInternals,
        'agent_malicious',
        'developer'
      );

      // Internal fields should be STRIPPED
      assert.strictEqual(isolated._internal, undefined);
      assert.strictEqual(isolated._orchestratorState, undefined);
    });

    it('PEN-011: Should prevent context modification affecting other agents', () => {
      const sharedContext = {
        userMessage: 'Original message',
        previousResponses: [{ agentName: 'dev', content: 'Original' }],
      };

      // Agent A modifies their isolated context
      const agentAContext = contextIsolator.isolateContext(sharedContext, 'agent_A', 'developer');
      agentAContext.userMessage = 'TAMPERED';
      agentAContext.previousResponses[0].content = 'TAMPERED';

      // Agent B gets fresh isolated context
      const agentBContext = contextIsolator.isolateContext(sharedContext, 'agent_B', 'architect');

      // Agent B should see ORIGINAL (not tampered)
      assert.strictEqual(agentBContext.userMessage, 'Original message');
      assert.strictEqual(agentBContext.previousResponses[0].content, 'Original');
    });
  });
});
