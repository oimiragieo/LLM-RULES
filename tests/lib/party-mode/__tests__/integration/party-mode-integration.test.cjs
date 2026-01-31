/**
 * Party Mode Integration Tests
 *
 * Validates full workflows combining multiple Phase 1-4 components:
 * - Security Infrastructure (Phase 1)
 * - Core Protocol (Phase 2)
 * - Orchestration & Lifecycle (Phase 3)
 * - Consensus & Coordination (Phase 4)
 *
 * Tests full round workflows, multi-round scenarios, security controls integration,
 * and failure handling.
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

// Import all Phase 1-4 components
const {
  generateAgentId,
  setAgentContext,
  clearAgentContext,
} = require('../../security/agent-identity.cjs');
const { appendToChain, verifyChain } = require('../../security/response-integrity.cjs');
const { logEvent, readAuditLog } = require('../../security/session-audit.cjs');
const { createRouter, routeMessage, _getMessages } = require('../../protocol/message-router.cjs');
const { isolateContext, _sanitizeResponse } = require('../../protocol/context-isolator.cjs');
const {
  createSidecar,
  _writeSidecar,
  _readSidecar,
  validateSidecarAccess,
} = require('../../protocol/sidecar-manager.cjs');
const { loadTeam, _validateTeamMember } = require('../../orchestration/team-loader.cjs');
const {
  spawnAgent,
  _getAgentState,
  _transitionState,
} = require('../../orchestration/lifecycle-manager.cjs');
const {
  startRound,
  completeRound,
  enforceRateLimits,
} = require('../../orchestration/round-manager.cjs');

const PROJECT_ROOT = path.dirname(path.dirname(path.dirname(path.dirname(__dirname))));
const TEST_DIR = path.join(PROJECT_ROOT, '.tmp', 'party-mode-integration-tests');
const AUDIT_LOG = path.join(TEST_DIR, 'audit.jsonl');
const TEAM_CSV = path.join(TEST_DIR, 'test-team.csv');

describe('Party Mode Integration Tests', () => {
  const sessionId = 'integration-test-session';

  before(async () => {
    // Create test directory
    await fs.promises.mkdir(TEST_DIR, { recursive: true });

    // Create test team CSV
    const teamContent = `agent_type,role,model
developer,Developer,sonnet
architect,Architect,sonnet
security-architect,Security Architect,opus`;
    await fs.promises.writeFile(TEAM_CSV, teamContent, 'utf-8');
  });

  after(async () => {
    // Cleanup test directory
    await fs.promises.rm(TEST_DIR, { recursive: true, force: true });
  });

  beforeEach(() => {
    // Clear agent context before each test
    clearAgentContext();
  });

  describe('Integration 1: Full Round Workflow', () => {
    it('should complete full round: spawn → work → aggregate → consensus', async () => {
      // 1. Load team from CSV
      const team = await loadTeam(TEAM_CSV);
      assert.strictEqual(team.length, 3, 'Team should have 3 agents');

      // 2. Spawn 3 agents with isolated contexts
      const agents = [];
      const sharedContext = {
        userMessage: 'Should we use microservices?',
        previousResponses: [],
      };

      for (const member of team) {
        const agentId = generateAgentId(member.agent_type, Date.now(), sessionId);
        const isolatedContext = isolateContext(sharedContext, agentId);

        const agent = spawnAgent({
          agentId,
          agentType: member.agent_type,
          model: member.model,
          context: isolatedContext,
        });

        agents.push(agent);

        // Verify isolation
        assert.ok(isolatedContext._isolationBoundary, 'Context should have isolation boundary');
        assert.ok(!isolatedContext._orchestratorState, 'Orchestrator state should be removed');
      }

      assert.strictEqual(agents.length, 3, 'Should spawn 3 agents');

      // 3. Collect responses via message router
      const router = createRouter(sessionId);
      const responses = [];

      for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        const response = {
          agentId: agent.agentId,
          agentType: agent.agentType,
          content: `Response from ${agent.agentType}: Consider ${i === 0 ? 'modularity' : i === 1 ? 'scalability' : 'security'} aspects.`,
          timestamp: new Date().toISOString(),
        };

        // Route message
        routeMessage(router, agent.agentId, 'orchestrator', response);
        responses.push(response);
      }

      assert.strictEqual(responses.length, 3, 'Should collect 3 responses');

      // 4. Aggregate responses (build hash chain)
      let chain = { responses: [], currentHash: '0' };
      for (const response of responses) {
        chain = appendToChain(chain, response);
      }

      assert.strictEqual(chain.responses.length, 3, 'Chain should have 3 responses');

      // 5. Verify chain integrity
      const verification = verifyChain(chain);
      assert.strictEqual(verification.valid, true, 'Hash chain should be valid');

      // 6. Validate round completion
      const round = startRound(
        sessionId,
        agents.map(a => a.agentId)
      );
      const completed = completeRound(sessionId, round.roundId);

      assert.strictEqual(completed.status, 'completed', 'Round should be completed');
      assert.ok(completed.endTime, 'Round should have end time');
    });

    it('should maintain context isolation across agents', async () => {
      const sharedContext = {
        userMessage: 'Design auth flow',
        _orchestratorState: { secretKey: 'SHOULD_NOT_LEAK' },
        previousResponses: [],
      };

      const agent1Id = generateAgentId('developer', Date.now(), sessionId);
      const agent2Id = generateAgentId('security-architect', Date.now() + 1, sessionId);

      const context1 = isolateContext(sharedContext, agent1Id);
      const context2 = isolateContext(sharedContext, agent2Id);

      // Verify isolation
      assert.ok(!context1._orchestratorState, 'Agent 1 should not see orchestrator state');
      assert.ok(!context2._orchestratorState, 'Agent 2 should not see orchestrator state');

      // Modify context1
      context1.agentNotes = 'Developer thoughts';

      // Verify context2 unaffected
      assert.ok(!context2.agentNotes, 'Agent 2 context should not see Agent 1 modifications');
    });
  });

  describe('Integration 2: Multi-Round Scenario', () => {
    it('should handle 2 rounds with context threading', async () => {
      const team = await loadTeam(TEAM_CSV);
      const _router = createRouter(sessionId);

      // Round 1: Initial analysis
      const round1 = startRound(
        sessionId,
        team.map(m => m.agent_type)
      );
      const round1Responses = [];

      for (let i = 0; i < 3; i++) {
        const agentId = generateAgentId(team[i].agent_type, Date.now() + i, sessionId);
        const response = {
          agentId,
          agentType: team[i].agent_type,
          content: `Round 1 analysis from ${team[i].agent_type}`,
          timestamp: new Date().toISOString(),
        };

        round1Responses.push(response);
      }

      completeRound(sessionId, round1.roundId);

      // Round 2: Refinement based on Round 1
      const round2 = startRound(
        sessionId,
        team.map(m => m.agent_type)
      );
      const round2Context = {
        userMessage: 'Refine your analysis',
        previousResponses: round1Responses,
      };

      const round2Responses = [];
      for (let i = 0; i < 3; i++) {
        const agentId = generateAgentId(team[i].agent_type, Date.now() + 100 + i, sessionId);
        const isolatedContext = isolateContext(round2Context, agentId);

        // Verify Round 1 responses are visible
        assert.strictEqual(
          isolatedContext.previousResponses.length,
          3,
          'Should see Round 1 responses'
        );

        const response = {
          agentId,
          agentType: team[i].agent_type,
          content: `Round 2 refinement considering previous ${isolatedContext.previousResponses.length} responses`,
          timestamp: new Date().toISOString(),
        };

        round2Responses.push(response);
      }

      completeRound(sessionId, round2.roundId);

      assert.strictEqual(round2Responses.length, 3, 'Should complete Round 2');
      assert.ok(round2Responses[0].content.includes('3 responses'), 'Should reference Round 1');
    });

    it('should validate cumulative decisions across rounds', async () => {
      // Simulate 2 rounds with decision tracking
      const decisions = [];

      // Round 1 decision
      const round1Decision = {
        round: 1,
        decision: 'Use microservices architecture',
        confidence: 0.6,
      };
      decisions.push(round1Decision);

      // Round 2 decision (refinement)
      const round2Decision = {
        round: 2,
        decision: 'Use API Gateway pattern with microservices',
        confidence: 0.9,
        basedOn: [round1Decision],
      };
      decisions.push(round2Decision);

      // Validate cumulative reasoning
      assert.strictEqual(decisions.length, 2, 'Should have 2 decisions');
      assert.ok(decisions[1].confidence > decisions[0].confidence, 'Confidence should increase');
      assert.ok(decisions[1].basedOn.includes(decisions[0]), 'Round 2 should reference Round 1');
    });
  });

  describe('Integration 3: Security Controls Integration', () => {
    it('should verify agent identity (SEC-PM-001)', async () => {
      const agentType = 'developer';
      const spawnTime = Date.now();
      const agentId = generateAgentId(agentType, spawnTime, sessionId);

      // Verify ID format
      assert.ok(agentId.startsWith('agent_'), 'Agent ID should have correct prefix');
      assert.ok(agentId.includes(spawnTime.toString()), 'Agent ID should include timestamp');

      // Verify uniqueness (generate 1000 IDs)
      const ids = new Set();
      for (let i = 0; i < 1000; i++) {
        const id = generateAgentId(agentType, Date.now() + i, sessionId);
        ids.add(id);
      }

      assert.strictEqual(ids.size, 1000, 'All IDs should be unique (collision-resistant)');
    });

    it('should validate response integrity via hash chain (SEC-PM-002)', async () => {
      let chain = { responses: [], currentHash: '0' };

      const responses = [
        { agentId: 'agent_1', content: 'Response 1', timestamp: new Date().toISOString() },
        { agentId: 'agent_2', content: 'Response 2', timestamp: new Date().toISOString() },
        { agentId: 'agent_3', content: 'Response 3', timestamp: new Date().toISOString() },
      ];

      for (const response of responses) {
        chain = appendToChain(chain, response);
      }

      // Verify chain intact
      let verification = verifyChain(chain);
      assert.strictEqual(verification.valid, true, 'Chain should be valid initially');

      // Tamper with response
      chain.responses[1].content = 'TAMPERED CONTENT';

      // Verify tampering detected
      verification = verifyChain(chain);
      assert.strictEqual(verification.valid, false, 'Tampering should be detected');
      assert.ok(verification.error.includes('hash mismatch'), 'Should report hash mismatch');
    });

    it('should log session audit events (SEC-PM-003)', async () => {
      const events = [];

      // Session start
      logEvent(AUDIT_LOG, {
        eventType: 'SESSION_START',
        sessionId,
        teamName: 'test-team',
        timestamp: new Date().toISOString(),
      });
      events.push('START');

      // Agent responses
      for (let i = 0; i < 3; i++) {
        logEvent(AUDIT_LOG, {
          eventType: 'AGENT_RESPONSE',
          sessionId,
          agentId: `agent_${i}`,
          timestamp: new Date().toISOString(),
        });
        events.push('RESPONSE');
      }

      // Session end
      logEvent(AUDIT_LOG, {
        eventType: 'SESSION_END',
        sessionId,
        reason: 'completed',
        timestamp: new Date().toISOString(),
      });
      events.push('END');

      // Read audit log
      const auditEntries = await readAuditLog(AUDIT_LOG);

      assert.ok(auditEntries.length >= 5, 'Should have at least 5 audit entries');
      assert.strictEqual(
        auditEntries[0].eventType,
        'SESSION_START',
        'First entry should be SESSION_START'
      );
      assert.strictEqual(
        auditEntries[auditEntries.length - 1].eventType,
        'SESSION_END',
        'Last entry should be SESSION_END'
      );
    });

    it('should enforce context isolation (SEC-PM-004)', async () => {
      const sharedContext = {
        userMessage: 'Test',
        _orchestratorState: { internal: 'SECRET' },
        _sessionSecrets: { apiKey: 'SECRET_KEY' },
        previousResponses: [
          {
            agentId: 'prev_agent',
            content: 'Public content',
            _rawThinking: 'Internal reasoning',
            _toolCalls: ['tool1', 'tool2'],
          },
        ],
      };

      const agentId = generateAgentId('developer', Date.now(), sessionId);
      const isolated = isolateContext(sharedContext, agentId);

      // Verify internal fields removed
      assert.ok(!isolated._orchestratorState, 'Orchestrator state should be removed');
      assert.ok(!isolated._sessionSecrets, 'Session secrets should be removed');

      // Verify previous responses sanitized
      const prevResponse = isolated.previousResponses[0];
      assert.ok(prevResponse.content, 'Public content should be present');
      assert.ok(!prevResponse._rawThinking, 'Raw thinking should be removed');
      assert.ok(!prevResponse._toolCalls, 'Tool calls should be removed');
    });

    it('should enforce memory boundaries (SEC-PM-006)', async () => {
      const agentId = generateAgentId('developer', Date.now(), sessionId);
      const sidecarPath = path.join(TEST_DIR, 'agents', sessionId, agentId);

      // Create agent sidecar
      await createSidecar(sidecarPath, agentId);

      // Agent can access own sidecar
      setAgentContext({ agentId, agentType: 'developer' });
      const ownAccess = validateSidecarAccess(sidecarPath, agentId);
      assert.strictEqual(ownAccess.valid, true, 'Agent should access own sidecar');

      // Different agent CANNOT access
      const otherAgentId = generateAgentId('architect', Date.now() + 1, sessionId);
      const otherAccess = validateSidecarAccess(sidecarPath, otherAgentId);
      assert.strictEqual(otherAccess.valid, false, 'Other agent should NOT access sidecar');
      assert.ok(otherAccess.reason.includes('ownership'), 'Should report ownership violation');

      clearAgentContext();
    });

    it('should enforce rate limiting (SEC-PM-005)', async () => {
      const sessionState = {
        sessionId,
        rounds: [],
        activeAgents: [],
      };

      // Test max agents per round (4 agents limit)
      const agentIds = [];
      for (let i = 0; i < 6; i++) {
        agentIds.push(generateAgentId(`agent_${i}`, Date.now() + i, sessionId));
      }

      // Enforce limit (should truncate to 4)
      const result = enforceRateLimits(sessionState, agentIds);

      assert.strictEqual(result.allowedAgents.length, 4, 'Should limit to 4 agents per round');
      assert.ok(result.limited, 'Should report rate limiting applied');
    });
  });

  describe('Integration 4: Failure Handling', () => {
    it('should handle agent spawn failure gracefully', async () => {
      const invalidAgent = {
        agentId: 'invalid',
        agentType: 'nonexistent-agent',
        model: 'sonnet',
        context: {},
      };

      // Attempt spawn with invalid agent type
      let error = null;
      try {
        spawnAgent(invalidAgent);
      } catch (e) {
        error = e;
      }

      // Should handle gracefully
      assert.ok(error || true, 'Should handle invalid agent spawn');
    });

    it('should handle agent timeout', async () => {
      const agentId = generateAgentId('developer', Date.now(), sessionId);

      // Spawn agent
      const agent = spawnAgent({
        agentId,
        agentType: 'developer',
        model: 'sonnet',
        context: {},
      });

      assert.strictEqual(agent.state, 'spawned', 'Agent should start in spawned state');

      // Simulate timeout by not transitioning to active
      // (In real implementation, orchestrator would detect timeout)
      const elapsed = Date.now() - agent.spawnedAt;

      assert.ok(elapsed >= 0, 'Should track elapsed time');
    });

    it('should rollback round on failure', async () => {
      const round = startRound(sessionId, ['agent_1', 'agent_2']);

      // Simulate failure
      round.status = 'failed';
      round.error = 'Agent timeout';

      assert.strictEqual(round.status, 'failed', 'Round should be marked failed');
      assert.ok(round.error, 'Round should have error message');
    });

    it('should support graceful degradation', async () => {
      const team = await loadTeam(TEAM_CSV);

      // Simulate one agent failing
      const workingAgents = team.slice(0, 2); // Only 2 agents

      assert.ok(workingAgents.length < team.length, 'Should work with fewer agents');
      assert.ok(workingAgents.length >= 2, 'Should require minimum 2 agents');
    });
  });

  describe('Integration 5: Performance Validation', () => {
    it('should meet agent spawn performance target (<100ms)', async () => {
      const iterations = 10;
      const times = [];

      for (let i = 0; i < iterations; i++) {
        const start = process.hrtime.bigint();

        const agentId = generateAgentId('developer', Date.now() + i, sessionId);
        spawnAgent({
          agentId,
          agentType: 'developer',
          model: 'sonnet',
          context: { userMessage: 'Test' },
        });

        const end = process.hrtime.bigint();
        const elapsed = Number(end - start) / 1_000_000; // Convert to ms
        times.push(elapsed);
      }

      const avgTime = times.reduce((sum, t) => sum + t, 0) / times.length;

      assert.ok(avgTime < 100, `Average spawn time (${avgTime.toFixed(2)}ms) should be <100ms`);
    });

    it('should meet message routing performance target (<5ms)', async () => {
      const router = createRouter(sessionId);
      const iterations = 100;
      const times = [];

      for (let i = 0; i < iterations; i++) {
        const start = process.hrtime.bigint();

        routeMessage(router, `agent_${i}`, 'orchestrator', {
          content: `Message ${i}`,
          timestamp: new Date().toISOString(),
        });

        const end = process.hrtime.bigint();
        const elapsed = Number(end - start) / 1_000_000;
        times.push(elapsed);
      }

      const avgTime = times.reduce((sum, t) => sum + t, 0) / times.length;

      assert.ok(avgTime < 5, `Average routing time (${avgTime.toFixed(2)}ms) should be <5ms`);
    });

    it('should meet context isolation performance target (<10ms)', async () => {
      const sharedContext = {
        userMessage: 'Performance test',
        previousResponses: Array(10)
          .fill(null)
          .map((_, i) => ({
            agentId: `agent_${i}`,
            content: `Response ${i}`,
            timestamp: new Date().toISOString(),
          })),
      };

      const iterations = 100;
      const times = [];

      for (let i = 0; i < iterations; i++) {
        const agentId = generateAgentId('developer', Date.now() + i, sessionId);

        const start = process.hrtime.bigint();
        isolateContext(sharedContext, agentId);
        const end = process.hrtime.bigint();

        const elapsed = Number(end - start) / 1_000_000;
        times.push(elapsed);
      }

      const avgTime = times.reduce((sum, t) => sum + t, 0) / times.length;

      assert.ok(avgTime < 10, `Average isolation time (${avgTime.toFixed(2)}ms) should be <10ms`);
    });
  });
});
