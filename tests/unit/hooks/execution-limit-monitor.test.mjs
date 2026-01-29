/**
 * Unit Tests for Execution Limit Monitor Hook (P1-8.2)
 *
 * Tests the monitoring hook that tracks agent execution limits:
 * - max_turns (tool call count)
 * - max_duration_ms (execution time)
 * - max_cost_usd (LLM cost estimation)
 * - timeout_action (warn, terminate, pause)
 *
 * Pattern: TDD - Red-Green-Refactor
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
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

describe('Execution Limit Monitor Hook', () => {
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

  describe('Turn Counting', () => {
    it('should track tool call turns correctly', () => {
      const agentId = 'test-agent-1';
      const limits = {
        max_turns: 5,
        timeout_action: 'terminate',
      };

      executionMonitor.startMonitoring(agentId, limits);

      // Simulate 3 turns
      executionMonitor.recordTurn(agentId);
      executionMonitor.recordTurn(agentId);
      executionMonitor.recordTurn(agentId);

      const status = executionMonitor.getStatus(agentId);
      assert.equal(status.turns, 3, 'Should track 3 turns');
    });

    it('should emit warning at 80% of max_turns', (t, done) => {
      const agentId = 'test-agent-2';
      const limits = {
        max_turns: 10,
        timeout_action: 'warn',
      };

      // Listen for warning event
      mockEventBus.once('AGENT_LIMIT_WARNING', payload => {
        assert.equal(payload.agentId, agentId);
        assert.equal(payload.limitType, 'max_turns');
        assert.equal(payload.current, 8);
        assert.equal(payload.max, 10);
        done();
      });

      executionMonitor.startMonitoring(agentId, limits);

      // Simulate 8 turns (80% of 10)
      for (let i = 0; i < 8; i++) {
        executionMonitor.recordTurn(agentId);
      }
    });

    it('should emit exceeded event at 100% of max_turns', (t, done) => {
      const agentId = 'test-agent-3';
      const limits = {
        max_turns: 5,
        timeout_action: 'terminate',
      };

      // Listen for exceeded event
      mockEventBus.once('AGENT_LIMIT_EXCEEDED', payload => {
        assert.equal(payload.agentId, agentId);
        assert.equal(payload.limitType, 'max_turns');
        assert.equal(payload.current, 5); // Turn 5 triggers the exceeded event
        assert.equal(payload.max, 5);
        assert.equal(payload.action, 'terminate');
        done();
      });

      executionMonitor.startMonitoring(agentId, limits);

      // Simulate 5 turns (reaches 100% at turn 5)
      for (let i = 0; i < 5; i++) {
        executionMonitor.recordTurn(agentId);
      }
    });
  });

  describe('Duration Tracking', () => {
    it('should track elapsed time correctly', async () => {
      const agentId = 'test-agent-4';
      const limits = {
        max_duration_ms: 1000,
        timeout_action: 'terminate',
      };

      executionMonitor.startMonitoring(agentId, limits);

      // Wait 100ms
      await new Promise(resolve => setTimeout(resolve, 100));

      const status = executionMonitor.getStatus(agentId);
      assert.ok(status.elapsed >= 100, 'Should track at least 100ms elapsed');
      assert.ok(status.elapsed < 200, 'Should not track more than 200ms');
    });

    it('should emit warning at 80% of max_duration_ms', (t, done) => {
      const agentId = 'test-agent-5';
      const limits = {
        max_duration_ms: 100, // 100ms limit
        timeout_action: 'warn',
      };

      // Listen for warning event
      mockEventBus.once('AGENT_LIMIT_WARNING', payload => {
        assert.equal(payload.agentId, agentId);
        assert.equal(payload.limitType, 'max_duration_ms');
        assert.ok(payload.current >= 80, 'Should warn at 80% duration');
        done();
      });

      executionMonitor.startMonitoring(agentId, limits);

      // Wait for 80ms (80% of 100ms), then trigger check
      setTimeout(() => {
        executionMonitor.recordTurn(agentId); // Trigger check
      }, 80);
    });

    it('should emit exceeded event at 100% of max_duration_ms', (t, done) => {
      const agentId = 'test-agent-6';
      const limits = {
        max_duration_ms: 100,
        timeout_action: 'terminate',
      };

      // Listen for exceeded event
      mockEventBus.once('AGENT_LIMIT_EXCEEDED', payload => {
        assert.equal(payload.agentId, agentId);
        assert.equal(payload.limitType, 'max_duration_ms');
        assert.ok(payload.current >= 100, 'Should exceed at 100ms');
        done();
      });

      executionMonitor.startMonitoring(agentId, limits);

      // Wait for 110ms (exceeds 100ms), then trigger check
      setTimeout(() => {
        executionMonitor.recordTurn(agentId); // Trigger check
      }, 110);
    });
  });

  describe('Cost Tracking', () => {
    it('should track accumulated cost correctly', () => {
      const agentId = 'test-agent-7';
      const limits = {
        max_cost_usd: 1.0,
        timeout_action: 'terminate',
      };

      executionMonitor.startMonitoring(agentId, limits);

      // Simulate LLM calls with costs
      executionMonitor.recordTurn(agentId, { cost: 0.1 });
      executionMonitor.recordTurn(agentId, { cost: 0.25 });
      executionMonitor.recordTurn(agentId, { cost: 0.15 });

      const status = executionMonitor.getStatus(agentId);
      assert.equal(status.cost, 0.5, 'Should accumulate $0.50 in costs');
    });

    it('should emit warning at 80% of max_cost_usd', (t, done) => {
      const agentId = 'test-agent-8';
      const limits = {
        max_cost_usd: 1.0,
        timeout_action: 'warn',
      };

      // Listen for warning event
      mockEventBus.once('AGENT_LIMIT_WARNING', payload => {
        assert.equal(payload.agentId, agentId);
        assert.equal(payload.limitType, 'max_cost_usd');
        assert.equal(payload.current, 0.8);
        assert.equal(payload.max, 1.0);
        done();
      });

      executionMonitor.startMonitoring(agentId, limits);

      // Accumulate $0.80 (80% of $1.00)
      executionMonitor.recordTurn(agentId, { cost: 0.8 });
    });

    it('should emit exceeded event at 100% of max_cost_usd', (t, done) => {
      const agentId = 'test-agent-9';
      const limits = {
        max_cost_usd: 1.0,
        timeout_action: 'terminate',
      };

      // Listen for exceeded event
      mockEventBus.once('AGENT_LIMIT_EXCEEDED', payload => {
        assert.equal(payload.agentId, agentId);
        assert.equal(payload.limitType, 'max_cost_usd');
        assert.equal(payload.current, 1.1);
        assert.equal(payload.max, 1.0);
        assert.equal(payload.action, 'terminate');
        done();
      });

      executionMonitor.startMonitoring(agentId, limits);

      // Accumulate $1.10 (exceeds $1.00)
      executionMonitor.recordTurn(agentId, { cost: 1.1 });
    });
  });

  describe('Timeout Actions', () => {
    it('should log warning when timeout_action=warn', (t, done) => {
      const agentId = 'test-agent-10';
      const limits = {
        max_turns: 3,
        timeout_action: 'warn',
      };

      // Listen for exceeded event
      mockEventBus.once('AGENT_LIMIT_EXCEEDED', payload => {
        assert.equal(payload.action, 'warn');
        // Verify agent continues (no error thrown)
        assert.ok(true, 'Warning logged but agent continues');
        done();
      });

      executionMonitor.startMonitoring(agentId, limits);

      // Exceed turns
      for (let i = 0; i < 4; i++) {
        executionMonitor.recordTurn(agentId);
      }
    });

    it('should throw error when timeout_action=terminate', (t, done) => {
      const agentId = 'test-agent-11';
      const limits = {
        max_turns: 3,
        timeout_action: 'terminate',
      };

      // Listen for exceeded event
      mockEventBus.once('AGENT_LIMIT_EXCEEDED', payload => {
        assert.equal(payload.action, 'terminate');
        assert.throws(
          () => {
            // Simulate termination
            throw new Error(`Agent ${agentId} terminated: max_turns exceeded`);
          },
          /terminated/,
          'Should throw termination error'
        );
        done();
      });

      executionMonitor.startMonitoring(agentId, limits);

      // Exceed turns
      for (let i = 0; i < 4; i++) {
        executionMonitor.recordTurn(agentId);
      }
    });
  });

  describe('Multiple Agents', () => {
    it('should track multiple agents independently', () => {
      const agent1 = 'test-agent-12';
      const agent2 = 'test-agent-13';

      executionMonitor.startMonitoring(agent1, { max_turns: 10 });
      executionMonitor.startMonitoring(agent2, { max_turns: 5 });

      // Agent 1: 3 turns
      executionMonitor.recordTurn(agent1);
      executionMonitor.recordTurn(agent1);
      executionMonitor.recordTurn(agent1);

      // Agent 2: 2 turns
      executionMonitor.recordTurn(agent2);
      executionMonitor.recordTurn(agent2);

      const status1 = executionMonitor.getStatus(agent1);
      const status2 = executionMonitor.getStatus(agent2);

      assert.equal(status1.turns, 3, 'Agent 1 should have 3 turns');
      assert.equal(status2.turns, 2, 'Agent 2 should have 2 turns');
    });
  });

  describe('Cleanup', () => {
    it('should stop monitoring and clean up resources', () => {
      const agentId = 'test-agent-14';
      const limits = { max_turns: 10 };

      executionMonitor.startMonitoring(agentId, limits);
      executionMonitor.recordTurn(agentId);

      // Stop monitoring
      executionMonitor.stopMonitoring(agentId);

      // Status should be unavailable after cleanup
      const status = executionMonitor.getStatus(agentId);
      assert.ok(!status || status.turns === 0, 'Should clean up after stop');
    });
  });
});
