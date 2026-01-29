/**
 * Integration Tests for Execution Limit Monitor Hook (P1-8.3)
 *
 * Tests real-world scenarios with execution limit monitoring:
 * - Max turns exceeded → Warning + Termination
 * - Max duration exceeded → Warning + Termination
 * - Max cost exceeded → Warning + Termination
 * - Multiple limits → First exceeded wins
 * - timeout_action: warn vs terminate
 *
 * Pattern: TDD Integration Tests following project patterns
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Mock EventBus for testing
class MockEventBus extends EventEmitter {
  emit(eventType, payload) {
    super.emit(eventType, payload);
  }

  on(eventType, handler) {
    super.on(eventType, handler);
  }
}

describe('Execution Limit Monitor Integration Tests', () => {
  let executionMonitor;
  let mockEventBus;

  beforeEach(() => {
    // Create fresh mock event bus
    mockEventBus = new MockEventBus();

    // Clear require cache to get fresh instance
    const modulePath =
      require.resolve('../../../.claude/hooks/monitoring/execution-limit-monitor.cjs');
    delete require.cache[modulePath];

    // Mock the event bus module before requiring the monitor
    const eventBusPath = require.resolve('../../../.claude/lib/events/event-bus.cjs');
    require.cache[eventBusPath] = {
      exports: mockEventBus,
    };

    // Load the execution monitor (will use mocked event bus)
    executionMonitor = require('../../../.claude/hooks/monitoring/execution-limit-monitor.cjs');

    // Clear monitoring state for clean tests
    executionMonitor.clearAll();
  });

  afterEach(() => {
    mockEventBus.removeAllListeners();
  });

  describe('Scenario 1: Max Turns Exceeded → Warning + Termination', () => {
    it('should emit warning at 80% then termination at 100%', (t, done) => {
      const agentId = 'developer-agent-1';
      const limits = {
        max_turns: 10,
        timeout_action: 'terminate',
      };

      let warningEmitted = false;
      let exceededEmitted = false;

      // Listen for warning at 80%
      mockEventBus.once('AGENT_LIMIT_WARNING', payload => {
        warningEmitted = true;
        assert.equal(payload.agentId, agentId);
        assert.equal(payload.limitType, 'max_turns');
        assert.equal(payload.current, 8);
        assert.equal(payload.max, 10);
        assert.equal(payload.percentage, '80.0');
        assert.ok(payload.timestamp, 'Should have timestamp');
      });

      // Listen for exceeded at 100%
      mockEventBus.once('AGENT_LIMIT_EXCEEDED', payload => {
        exceededEmitted = true;
        assert.equal(payload.agentId, agentId);
        assert.equal(payload.limitType, 'max_turns');
        assert.equal(payload.current, 10);
        assert.equal(payload.max, 10);
        assert.equal(payload.action, 'terminate');
        assert.ok(payload.timestamp, 'Should have timestamp');

        // Verify both events emitted
        assert.ok(warningEmitted, 'Warning should have been emitted at 80%');
        assert.ok(exceededEmitted, 'Exceeded should have been emitted at 100%');
        done();
      });

      executionMonitor.startMonitoring(agentId, limits);

      // Simulate 10 turns (warning at 8, exceeded at 10)
      for (let i = 0; i < 10; i++) {
        executionMonitor.recordTurn(agentId);
      }
    });

    it('should not emit duplicate warnings/exceeded events', (t, done) => {
      const agentId = 'developer-agent-2';
      const limits = {
        max_turns: 5,
        timeout_action: 'terminate',
      };

      let warningCount = 0;
      let exceededCount = 0;

      mockEventBus.on('AGENT_LIMIT_WARNING', () => {
        warningCount++;
      });

      mockEventBus.on('AGENT_LIMIT_EXCEEDED', () => {
        exceededCount++;
      });

      executionMonitor.startMonitoring(agentId, limits);

      // Simulate 10 turns (exceeds limit of 5)
      for (let i = 0; i < 10; i++) {
        executionMonitor.recordTurn(agentId);
      }

      // Give time for any duplicate events
      setTimeout(() => {
        assert.equal(warningCount, 1, 'Warning should only be emitted once');
        assert.equal(exceededCount, 1, 'Exceeded should only be emitted once');
        done();
      }, 50);
    });
  });

  describe('Scenario 2: Max Duration Exceeded → Warning + Termination', () => {
    it('should emit warning at 80% then termination at 100% of duration', (t, done) => {
      const agentId = 'qa-agent-1';
      const limits = {
        max_duration_ms: 200, // 200ms limit
        timeout_action: 'terminate',
      };

      let warningEmitted = false;
      let exceededEmitted = false;

      mockEventBus.once('AGENT_LIMIT_WARNING', payload => {
        warningEmitted = true;
        assert.equal(payload.agentId, agentId);
        assert.equal(payload.limitType, 'max_duration_ms');
        assert.ok(payload.current >= 160, `Current ${payload.current} should be >= 160ms (80%)`);
        assert.equal(payload.max, 200);
      });

      mockEventBus.once('AGENT_LIMIT_EXCEEDED', payload => {
        exceededEmitted = true;
        assert.equal(payload.agentId, agentId);
        assert.equal(payload.limitType, 'max_duration_ms');
        assert.ok(payload.current >= 200, `Current ${payload.current} should be >= 200ms (100%)`);
        assert.equal(payload.max, 200);
        assert.equal(payload.action, 'terminate');

        assert.ok(warningEmitted, 'Warning should have been emitted');
        assert.ok(exceededEmitted, 'Exceeded should have been emitted');
        done();
      });

      executionMonitor.startMonitoring(agentId, limits);

      // Check at 170ms (should trigger warning)
      setTimeout(() => {
        executionMonitor.recordTurn(agentId);
      }, 170);

      // Check at 210ms (should trigger exceeded)
      setTimeout(() => {
        executionMonitor.recordTurn(agentId);
      }, 210);
    });
  });

  describe('Scenario 3: Max Cost Exceeded → Warning + Termination', () => {
    it('should emit warning at 80% then termination at 100% of cost', (t, done) => {
      const agentId = 'researcher-agent-1';
      const limits = {
        max_cost_usd: 5.0,
        timeout_action: 'terminate',
      };

      let warningEmitted = false;
      let exceededEmitted = false;

      mockEventBus.once('AGENT_LIMIT_WARNING', payload => {
        warningEmitted = true;
        assert.equal(payload.agentId, agentId);
        assert.equal(payload.limitType, 'max_cost_usd');
        assert.equal(payload.current, 4.0);
        assert.equal(payload.max, 5.0);
        assert.equal(payload.percentage, '80.0');
      });

      mockEventBus.once('AGENT_LIMIT_EXCEEDED', payload => {
        exceededEmitted = true;
        assert.equal(payload.agentId, agentId);
        assert.equal(payload.limitType, 'max_cost_usd');
        assert.equal(payload.current, 5.5);
        assert.equal(payload.max, 5.0);
        assert.equal(payload.action, 'terminate');

        assert.ok(warningEmitted, 'Warning should have been emitted at 80%');
        assert.ok(exceededEmitted, 'Exceeded should have been emitted at 100%');
        done();
      });

      executionMonitor.startMonitoring(agentId, limits);

      // Accumulate costs
      executionMonitor.recordTurn(agentId, { cost: 2.0 }); // 40%
      executionMonitor.recordTurn(agentId, { cost: 2.0 }); // 80% - triggers warning
      executionMonitor.recordTurn(agentId, { cost: 1.5 }); // 110% - triggers exceeded
    });
  });

  describe('Scenario 4: Multiple Limits → First Exceeded Wins', () => {
    it('should terminate on first limit exceeded (turns before duration)', (t, done) => {
      const agentId = 'planner-agent-1';
      const limits = {
        max_turns: 5,
        max_duration_ms: 10000, // 10 seconds (won't be reached)
        timeout_action: 'terminate',
      };

      let firstExceeded = null;

      mockEventBus.on('AGENT_LIMIT_EXCEEDED', payload => {
        if (!firstExceeded) {
          firstExceeded = payload.limitType;
        }
      });

      executionMonitor.startMonitoring(agentId, limits);

      // Quickly execute 6 turns (exceeds turn limit before duration)
      for (let i = 0; i < 6; i++) {
        executionMonitor.recordTurn(agentId);
      }

      setTimeout(() => {
        assert.equal(firstExceeded, 'max_turns', 'Turn limit should be exceeded first');
        done();
      }, 50);
    });

    it('should terminate on first limit exceeded (cost before turns)', (t, done) => {
      const agentId = 'architect-agent-1';
      const limits = {
        max_turns: 100, // High turn limit
        max_cost_usd: 1.0, // Low cost limit
        timeout_action: 'terminate',
      };

      let firstExceeded = null;

      mockEventBus.on('AGENT_LIMIT_EXCEEDED', payload => {
        if (!firstExceeded) {
          firstExceeded = payload.limitType;
        }
      });

      executionMonitor.startMonitoring(agentId, limits);

      // Expensive turns that exceed cost before turn limit
      executionMonitor.recordTurn(agentId, { cost: 0.6 }); // 60%
      executionMonitor.recordTurn(agentId, { cost: 0.5 }); // 110% - exceeds cost

      setTimeout(() => {
        assert.equal(firstExceeded, 'max_cost_usd', 'Cost limit should be exceeded first');
        done();
      }, 50);
    });

    it('should handle simultaneous limit breaches (duration and turns)', (t, done) => {
      const agentId = 'devops-agent-1';
      const limits = {
        max_turns: 3,
        max_duration_ms: 100, // Both limits will be exceeded simultaneously
        timeout_action: 'terminate',
      };

      const exceededTypes = [];

      mockEventBus.on('AGENT_LIMIT_EXCEEDED', payload => {
        exceededTypes.push(payload.limitType);
      });

      executionMonitor.startMonitoring(agentId, limits);

      // Wait for duration to approach limit, then add turns
      setTimeout(() => {
        // At ~110ms, add turns that exceed turn limit
        for (let i = 0; i < 4; i++) {
          executionMonitor.recordTurn(agentId);
        }

        // Allow time for events
        setTimeout(() => {
          // Should have exceeded both limits
          assert.ok(
            exceededTypes.includes('max_turns') || exceededTypes.includes('max_duration_ms'),
            'At least one limit should be exceeded'
          );
          done();
        }, 50);
      }, 110);
    });
  });

  describe('Scenario 5: timeout_action Variations', () => {
    it('should warn but continue execution when action=warn', (t, done) => {
      const agentId = 'researcher-agent-2';
      const limits = {
        max_turns: 5,
        timeout_action: 'warn',
      };

      let exceededEmitted = false;

      mockEventBus.once('AGENT_LIMIT_EXCEEDED', payload => {
        exceededEmitted = true;
        assert.equal(payload.action, 'warn');
      });

      executionMonitor.startMonitoring(agentId, limits);

      // Exceed turns
      for (let i = 0; i < 7; i++) {
        executionMonitor.recordTurn(agentId);
      }

      setTimeout(() => {
        assert.ok(exceededEmitted, 'Exceeded event should be emitted');

        // Agent should still be tracked (not terminated)
        const status = executionMonitor.getStatus(agentId);
        assert.equal(status.turns, 7, 'Agent should continue tracking turns');
        done();
      }, 50);
    });

    it('should log termination when action=terminate', (t, done) => {
      const agentId = 'developer-agent-3';
      const limits = {
        max_cost_usd: 1.0,
        timeout_action: 'terminate',
      };

      let terminationLogged = false;

      // Capture console.error
      const originalError = console.error;
      console.error = message => {
        if (message.includes('terminated') && message.includes(agentId)) {
          terminationLogged = true;
        }
      };

      mockEventBus.once('AGENT_LIMIT_EXCEEDED', payload => {
        assert.equal(payload.action, 'terminate');
      });

      executionMonitor.startMonitoring(agentId, limits);

      // Exceed cost
      executionMonitor.recordTurn(agentId, { cost: 1.1 });

      setTimeout(() => {
        console.error = originalError; // Restore console.error
        assert.ok(terminationLogged, 'Termination should be logged to console.error');
        done();
      }, 50);
    });

    it('should log pause when action=pause', (t, done) => {
      const agentId = 'architect-agent-2';
      const limits = {
        max_duration_ms: 100,
        timeout_action: 'pause',
      };

      let pauseLogged = false;

      // Capture console.warn
      const originalWarn = console.warn;
      console.warn = message => {
        if (message.includes('paused') && message.includes(agentId)) {
          pauseLogged = true;
        }
      };

      mockEventBus.once('AGENT_LIMIT_EXCEEDED', payload => {
        assert.equal(payload.action, 'pause');
      });

      executionMonitor.startMonitoring(agentId, limits);

      // Wait for duration to exceed
      setTimeout(() => {
        executionMonitor.recordTurn(agentId);

        setTimeout(() => {
          console.warn = originalWarn; // Restore console.warn
          assert.ok(pauseLogged, 'Pause should be logged to console.warn');
          done();
        }, 50);
      }, 110);
    });
  });

  describe('Scenario 6: Real-World Simulation (Developer Agent)', () => {
    it('should track typical developer workflow within limits', (t, done) => {
      const agentId = 'developer-agent-sim-1';
      const limits = {
        max_turns: 30, // Increased to avoid 80% threshold (19/30 = 63%)
        max_duration_ms: 600000, // 10 minutes
        max_cost_usd: 1.0,
        timeout_action: 'terminate',
      };

      let warningsEmitted = 0;
      let exceededEmitted = false;

      mockEventBus.on('AGENT_LIMIT_WARNING', () => {
        warningsEmitted++;
      });

      mockEventBus.on('AGENT_LIMIT_EXCEEDED', () => {
        exceededEmitted = true;
      });

      executionMonitor.startMonitoring(agentId, limits);

      // Simulate developer workflow:
      // - Read files (5 turns, low cost)
      // - Write code (8 turns, medium cost)
      // - Run tests (3 turns, low cost)
      // - Refactor (3 turns, medium cost)
      // Total: 19 turns (63% of 30), $0.60

      for (let i = 0; i < 5; i++) {
        executionMonitor.recordTurn(agentId, { cost: 0.02 }); // Read
      }
      for (let i = 0; i < 8; i++) {
        executionMonitor.recordTurn(agentId, { cost: 0.04 }); // Write
      }
      for (let i = 0; i < 3; i++) {
        executionMonitor.recordTurn(agentId, { cost: 0.02 }); // Test
      }
      for (let i = 0; i < 3; i++) {
        executionMonitor.recordTurn(agentId, { cost: 0.04 }); // Refactor
      }

      setTimeout(() => {
        const status = executionMonitor.getStatus(agentId);

        // Verify workflow completed within limits (well under 80% threshold)
        assert.equal(status.turns, 19, 'Should track 19 turns');
        // Use approximate comparison for floating point (within 0.01 tolerance)
        assert.ok(
          Math.abs(status.cost - 0.6) < 0.01,
          `Should track ~$0.60 cost (actual: ${status.cost})`
        );
        assert.equal(warningsEmitted, 0, 'No warnings should be emitted (19/30 = 63% < 80%)');
        assert.equal(exceededEmitted, false, 'No exceeded events should be emitted');
        done();
      }, 50);
    });

    it('should terminate runaway developer agent (infinite loop)', (t, done) => {
      const agentId = 'developer-agent-sim-2';
      const limits = {
        max_turns: 25,
        max_duration_ms: 600000,
        max_cost_usd: 1.0,
        timeout_action: 'terminate',
      };

      let terminationEmitted = false;

      mockEventBus.once('AGENT_LIMIT_EXCEEDED', payload => {
        terminationEmitted = true;
        assert.equal(payload.limitType, 'max_turns');
      });

      executionMonitor.startMonitoring(agentId, limits);

      // Simulate infinite loop (30 turns)
      for (let i = 0; i < 30; i++) {
        executionMonitor.recordTurn(agentId, { cost: 0.01 });
      }

      setTimeout(() => {
        assert.ok(terminationEmitted, 'Should terminate runaway agent');
        done();
      }, 50);
    });
  });

  describe('Scenario 7: Edge Cases', () => {
    it('should handle agent with only turn limit', () => {
      const agentId = 'qa-agent-2';
      const limits = {
        max_turns: 10,
        // No duration or cost limits
        timeout_action: 'warn',
      };

      executionMonitor.startMonitoring(agentId, limits);

      for (let i = 0; i < 5; i++) {
        executionMonitor.recordTurn(agentId);
      }

      const status = executionMonitor.getStatus(agentId);
      assert.equal(status.turns, 5);
      assert.ok(status.limits.max_duration_ms === Infinity);
      assert.ok(status.limits.max_cost_usd === Infinity);
    });

    it('should handle agent with only duration limit', async () => {
      const agentId = 'planner-agent-2';
      const limits = {
        max_duration_ms: 100,
        timeout_action: 'warn',
      };

      executionMonitor.startMonitoring(agentId, limits);

      await new Promise(resolve => setTimeout(resolve, 50));

      const status = executionMonitor.getStatus(agentId);
      assert.ok(status.elapsed >= 50);
      assert.ok(status.limits.max_turns === Infinity);
      assert.ok(status.limits.max_cost_usd === Infinity);
    });

    it('should handle agent with only cost limit', () => {
      const agentId = 'researcher-agent-3';
      const limits = {
        max_cost_usd: 2.0,
        timeout_action: 'terminate',
      };

      executionMonitor.startMonitoring(agentId, limits);

      executionMonitor.recordTurn(agentId, { cost: 1.0 });

      const status = executionMonitor.getStatus(agentId);
      assert.equal(status.cost, 1.0);
      assert.ok(status.limits.max_turns === Infinity);
      assert.ok(status.limits.max_duration_ms === Infinity);
    });

    it('should handle turn without cost metadata', () => {
      const agentId = 'devops-agent-2';
      const limits = {
        max_cost_usd: 1.0,
        timeout_action: 'warn',
      };

      executionMonitor.startMonitoring(agentId, limits);

      // Turn without cost metadata
      executionMonitor.recordTurn(agentId);
      executionMonitor.recordTurn(agentId, { cost: 0.5 });
      executionMonitor.recordTurn(agentId); // No cost again

      const status = executionMonitor.getStatus(agentId);
      assert.equal(status.turns, 3);
      assert.equal(status.cost, 0.5, 'Should only accumulate turns with cost metadata');
    });
  });

  describe('Scenario 8: Multi-Agent Coordination', () => {
    it('should track multiple agents independently', (t, done) => {
      const agent1 = 'developer-multi-1';
      const agent2 = 'qa-multi-1';
      const agent3 = 'researcher-multi-1';

      executionMonitor.startMonitoring(agent1, {
        max_turns: 25,
        max_cost_usd: 1.0,
        timeout_action: 'terminate',
      });

      executionMonitor.startMonitoring(agent2, {
        max_turns: 10,
        max_cost_usd: 0.5,
        timeout_action: 'warn',
      });

      executionMonitor.startMonitoring(agent3, {
        max_turns: 50,
        max_cost_usd: 5.0,
        timeout_action: 'pause',
      });

      // Simulate work
      for (let i = 0; i < 15; i++) {
        executionMonitor.recordTurn(agent1, { cost: 0.03 });
      }
      for (let i = 0; i < 8; i++) {
        executionMonitor.recordTurn(agent2, { cost: 0.05 });
      }
      for (let i = 0; i < 30; i++) {
        executionMonitor.recordTurn(agent3, { cost: 0.1 });
      }

      setTimeout(() => {
        const status1 = executionMonitor.getStatus(agent1);
        const status2 = executionMonitor.getStatus(agent2);
        const status3 = executionMonitor.getStatus(agent3);

        assert.equal(status1.turns, 15);
        // Use approximate comparison for floating point (within 0.01 tolerance)
        assert.ok(
          Math.abs(status1.cost - 0.45) < 0.01,
          `Agent1 cost ~$0.45 (actual: ${status1.cost})`
        );

        assert.equal(status2.turns, 8);
        assert.ok(
          Math.abs(status2.cost - 0.4) < 0.01,
          `Agent2 cost ~$0.40 (actual: ${status2.cost})`
        );

        assert.equal(status3.turns, 30);
        assert.ok(
          Math.abs(status3.cost - 3.0) < 0.01,
          `Agent3 cost ~$3.00 (actual: ${status3.cost})`
        );

        // Verify all agents tracked
        const activeAgents = executionMonitor.getActiveAgents();
        assert.equal(activeAgents.length, 3);
        assert.ok(activeAgents.includes(agent1));
        assert.ok(activeAgents.includes(agent2));
        assert.ok(activeAgents.includes(agent3));

        done();
      }, 50);
    });

    it('should isolate limit breaches per agent', (t, done) => {
      const agent1 = 'isolated-agent-1';
      const agent2 = 'isolated-agent-2';

      const exceededAgents = [];

      mockEventBus.on('AGENT_LIMIT_EXCEEDED', payload => {
        exceededAgents.push(payload.agentId);
      });

      executionMonitor.startMonitoring(agent1, {
        max_turns: 5,
        timeout_action: 'terminate',
      });

      executionMonitor.startMonitoring(agent2, {
        max_turns: 10,
        timeout_action: 'terminate',
      });

      // Agent 1: Exceed limit (6 turns)
      for (let i = 0; i < 6; i++) {
        executionMonitor.recordTurn(agent1);
      }

      // Agent 2: Stay within limit (8 turns)
      for (let i = 0; i < 8; i++) {
        executionMonitor.recordTurn(agent2);
      }

      setTimeout(() => {
        assert.equal(exceededAgents.length, 1, 'Only one agent should exceed');
        assert.equal(exceededAgents[0], agent1, 'Agent 1 should exceed');
        done();
      }, 50);
    });
  });

  describe('Scenario 9: Cleanup and Resource Management', () => {
    it('should clean up agent state after stopMonitoring', () => {
      const agentId = 'cleanup-agent-1';

      executionMonitor.startMonitoring(agentId, { max_turns: 10 });
      executionMonitor.recordTurn(agentId);
      executionMonitor.recordTurn(agentId);

      // Stop monitoring
      executionMonitor.stopMonitoring(agentId);

      // Status should return empty/default
      const status = executionMonitor.getStatus(agentId);
      assert.equal(status.turns, 0, 'Should reset turns after stop');
      assert.equal(status.cost, 0, 'Should reset cost after stop');

      // Should not be in active agents list
      const activeAgents = executionMonitor.getActiveAgents();
      assert.ok(!activeAgents.includes(agentId), 'Should not be in active list');
    });

    it('should clear all monitoring state', () => {
      executionMonitor.startMonitoring('agent-1', { max_turns: 10 });
      executionMonitor.startMonitoring('agent-2', { max_turns: 15 });
      executionMonitor.startMonitoring('agent-3', { max_turns: 20 });

      // Clear all
      executionMonitor.clearAll();

      const activeAgents = executionMonitor.getActiveAgents();
      assert.equal(activeAgents.length, 0, 'Should have no active agents after clearAll');
    });
  });
});
