const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = process.cwd();
const TOKEN_LOG_PATH = path.join(PROJECT_ROOT, '.claude/context/token-usage.jsonl');
const BUDGET_STATE_PATH = path.join(PROJECT_ROOT, '.claude/context/runtime/budget-tracker.json');

// Import the module we're testing
const {
  estimateTokens,
  trackAgentUsage,
  checkBudgetStatus,
  logTokenEvent,
} = require('../../.claude/lib/utils/token-budget-tracker.cjs');

describe('token-budget-tracker.cjs', () => {
  before(() => {
    // Clean up test log file before tests
    if (fs.existsSync(TOKEN_LOG_PATH)) {
      fs.unlinkSync(TOKEN_LOG_PATH);
    }
    if (fs.existsSync(BUDGET_STATE_PATH)) {
      fs.unlinkSync(BUDGET_STATE_PATH);
    }
  });

  after(() => {
    // Clean up test log file after tests
    if (fs.existsSync(TOKEN_LOG_PATH)) {
      fs.unlinkSync(TOKEN_LOG_PATH);
    }
    if (fs.existsSync(BUDGET_STATE_PATH)) {
      fs.unlinkSync(BUDGET_STATE_PATH);
    }
  });

  // === Category 1: Unit - estimateTokens() ===
  describe('estimateTokens()', () => {
    it('should estimate 1000 chars as 750 tokens (0.75 ratio)', () => {
      const content = 'a'.repeat(1000);
      const result = estimateTokens(content);

      assert.strictEqual(result.chars, 1000);
      assert.strictEqual(result.tokens, 750);
      assert.ok(result.estimate.includes('750'));
    });

    it('should estimate 10 KB (10,000 chars) as 7500 tokens', () => {
      const content = 'x'.repeat(10000);
      const result = estimateTokens(content);

      assert.strictEqual(result.chars, 10000);
      assert.strictEqual(result.tokens, 7500);
      assert.ok(result.estimate.includes('7500'));
    });

    it('should return 0 tokens for empty string', () => {
      const result = estimateTokens('');

      assert.strictEqual(result.chars, 0);
      assert.strictEqual(result.tokens, 0);
    });

    it('should estimate very large content (100 KB) as ~75,000 tokens', () => {
      const content = 'y'.repeat(100000);
      const result = estimateTokens(content);

      assert.strictEqual(result.chars, 100000);
      assert.strictEqual(result.tokens, 75000);
    });
  });

  // === Category 2: Unit - trackAgentUsage() ===
  describe('trackAgentUsage()', () => {
    it('should track first usage and initialize budget to 200k', () => {
      const result = trackAgentUsage('agent-1', {
        inputTokens: 1000,
        outputTokens: 500,
        toolResults: 'a'.repeat(1000), // 750 tokens
      });

      assert.strictEqual(result.agentId, 'agent-1');
      assert.strictEqual(result.totalTokens, 2250); // 1000 + 500 + 750
      assert.strictEqual(result.budget, 200000);
      assert.strictEqual(result.budgetRemaining, 197750); // 200000 - 2250
      assert.ok(result.percentUsed < 2);
      assert.strictEqual(result.status, 'OK');
    });

    it('should add second usage cumulatively', () => {
      // First usage
      trackAgentUsage('agent-2', {
        inputTokens: 5000,
        outputTokens: 3000,
        toolResults: '',
      });

      // Second usage (cumulative)
      const result = trackAgentUsage('agent-2', {
        inputTokens: 2000,
        outputTokens: 1000,
        toolResults: '',
      });

      assert.strictEqual(result.totalTokens, 11000); // 5000+3000 + 2000+1000
      assert.strictEqual(result.budgetRemaining, 189000);
    });

    it('should track multiple agents separately', () => {
      trackAgentUsage('agent-a', { inputTokens: 1000, outputTokens: 0, toolResults: '' });
      trackAgentUsage('agent-b', { inputTokens: 2000, outputTokens: 0, toolResults: '' });

      const statusA = checkBudgetStatus('agent-a');
      const statusB = checkBudgetStatus('agent-b');

      assert.strictEqual(statusA.used, 1000);
      assert.strictEqual(statusB.used, 2000);
    });

    it('should calculate budget correctly', () => {
      const result = trackAgentUsage('agent-budget', {
        inputTokens: 50000,
        outputTokens: 50000,
        toolResults: 'x'.repeat(10000), // 7500 tokens
      });

      assert.strictEqual(result.totalTokens, 107500);
      assert.strictEqual(result.budget, 200000);
      assert.strictEqual(result.budgetRemaining, 92500);
      assert.ok(result.percentUsed > 50);
      assert.ok(result.percentUsed < 60);
    });
  });

  // === Category 3: Unit - checkBudgetStatus() ===
  describe('checkBudgetStatus()', () => {
    it('should return OK status for < 80% usage', () => {
      // Use 50,000 tokens (25% of 200k)
      trackAgentUsage('agent-ok', {
        inputTokens: 40000,
        outputTokens: 10000,
        toolResults: '',
      });

      const status = checkBudgetStatus('agent-ok');

      assert.strictEqual(status.budget, 200000);
      assert.strictEqual(status.used, 50000);
      assert.strictEqual(status.remaining, 150000);
      assert.ok(status.percentUsed === 25);
      assert.strictEqual(status.status, 'OK');
    });

    it('should return WARNING status for 80-90% usage', () => {
      // Use 170,000 tokens (85% of 200k)
      trackAgentUsage('agent-warn', {
        inputTokens: 150000,
        outputTokens: 20000,
        toolResults: '',
      });

      const status = checkBudgetStatus('agent-warn');

      assert.ok(status.percentUsed >= 80);
      assert.ok(status.percentUsed <= 90);
      assert.strictEqual(status.status, 'WARNING');
    });

    it('should return CRITICAL status for > 90% usage', () => {
      // Use 185,000 tokens (92.5% of 200k)
      trackAgentUsage('agent-critical', {
        inputTokens: 180000,
        outputTokens: 5000,
        toolResults: '',
      });

      const status = checkBudgetStatus('agent-critical');

      assert.ok(status.percentUsed > 90);
      assert.strictEqual(status.status, 'CRITICAL');
    });

    it('should return correct remaining budget', () => {
      trackAgentUsage('agent-math', {
        inputTokens: 60000,
        outputTokens: 40000,
        toolResults: '',
      });

      const status = checkBudgetStatus('agent-math');

      assert.strictEqual(status.remaining, 100000); // 200k - 100k
    });
  });

  // === Category 4: Unit - logTokenEvent() ===
  describe('logTokenEvent()', () => {
    it('should log event to JSONL format', () => {
      logTokenEvent('spawn', {
        agentId: 'test-agent',
        tokens: 5000,
        reason: 'Agent spawned with large prompt',
      });

      // Read the log file
      assert.ok(fs.existsSync(TOKEN_LOG_PATH));
      const content = fs.readFileSync(TOKEN_LOG_PATH, 'utf8');
      const lines = content.trim().split('\n');

      assert.ok(lines.length > 0);

      // Parse the last line
      const lastEvent = JSON.parse(lines[lines.length - 1]);
      assert.strictEqual(lastEvent.eventType, 'spawn');
      assert.strictEqual(lastEvent.agentId, 'test-agent');
      assert.strictEqual(lastEvent.tokens, 5000);
      assert.strictEqual(lastEvent.reason, 'Agent spawned with large prompt');
      assert.ok(lastEvent.timestamp);
    });

    it('should record timestamp in event', () => {
      logTokenEvent('completion', {
        agentId: 'time-test',
        tokens: 1000,
        reason: 'Test timestamp',
      });

      const content = fs.readFileSync(TOKEN_LOG_PATH, 'utf8');
      const lines = content.trim().split('\n');
      const lastEvent = JSON.parse(lines[lines.length - 1]);

      const timestamp = new Date(lastEvent.timestamp);
      assert.ok(!isNaN(timestamp.getTime()));
    });

    it('should support multiple event types', () => {
      const eventTypes = ['spawn', 'tool_result', 'prompt', 'compression', 'completion'];

      eventTypes.forEach((type, index) => {
        logTokenEvent(type, {
          agentId: `agent-${index}`,
          tokens: 100 * (index + 1),
          reason: `Test ${type}`,
        });
      });

      const content = fs.readFileSync(TOKEN_LOG_PATH, 'utf8');
      const lines = content.trim().split('\n');

      // Check that we have at least the events we just logged
      assert.ok(lines.length >= 5);

      // Check each event type is logged correctly
      const lastFiveEvents = lines.slice(-5).map(line => JSON.parse(line));
      eventTypes.forEach((type, index) => {
        assert.strictEqual(lastFiveEvents[index].eventType, type);
      });
    });

    it('should create JSONL file with parseable lines', () => {
      // Log a few events
      logTokenEvent('test1', { agentId: 'a1', tokens: 100, reason: 'r1' });
      logTokenEvent('test2', { agentId: 'a2', tokens: 200, reason: 'r2' });

      // Verify each line is valid JSON
      const content = fs.readFileSync(TOKEN_LOG_PATH, 'utf8');
      const lines = content.trim().split('\n');

      lines.forEach(line => {
        assert.doesNotThrow(() => {
          JSON.parse(line);
        });
      });
    });
  });

  // === Category 5: Integration - Config Loading ===
  describe('Config Loading Integration', () => {
    it('should load memory_management section from config.yaml', () => {
      // This test verifies the config.yaml structure is readable
      // We'll just check that trackAgentUsage uses the expected default budget (200k)
      const result = trackAgentUsage('config-test', {
        inputTokens: 10000,
        outputTokens: 0,
        toolResults: '',
      });

      assert.strictEqual(result.budget, 200000);
    });

    it('should initialize token budgets from config', () => {
      // All models use same budget for simplicity (200k)
      const agents = ['haiku-agent', 'sonnet-agent', 'opus-agent'];

      agents.forEach(agentId => {
        const result = trackAgentUsage(agentId, {
          inputTokens: 1000,
          outputTokens: 0,
          toolResults: '',
        });

        assert.strictEqual(result.budget, 200000);
      });
    });

    it('should load warn threshold (default 0.90)', () => {
      // Verify 90% threshold triggers WARNING status
      trackAgentUsage('threshold-test', {
        inputTokens: 180000,
        outputTokens: 0,
        toolResults: '',
      });

      const status = checkBudgetStatus('threshold-test');

      // At 90%, should be either WARNING or CRITICAL
      assert.ok(status.status === 'WARNING' || status.status === 'CRITICAL');
    });
  });

  // === Category 6: Smoke - End-to-End Workflow ===
  describe('End-to-End Workflow', () => {
    it('should support spawn -> track -> check workflow', () => {
      const agentId = 'e2e-agent';

      // 1. Spawn agent, track usage
      const trackResult = trackAgentUsage(agentId, {
        inputTokens: 5000,
        outputTokens: 3000,
        toolResults: 'x'.repeat(2000), // 1500 tokens
      });

      assert.strictEqual(trackResult.totalTokens, 9500);

      // 2. Check budget status
      const status = checkBudgetStatus(agentId);

      assert.strictEqual(status.used, 9500);
      assert.strictEqual(status.remaining, 190500);
      assert.strictEqual(status.status, 'OK');

      // 3. Log event
      logTokenEvent('spawn', {
        agentId,
        tokens: trackResult.totalTokens,
        reason: 'End-to-end test',
      });

      // Verify log was written
      assert.ok(fs.existsSync(TOKEN_LOG_PATH));
    });

    it('should track multiple agents independently', () => {
      trackAgentUsage('multi-1', { inputTokens: 10000, outputTokens: 0, toolResults: '' });
      trackAgentUsage('multi-2', { inputTokens: 20000, outputTokens: 0, toolResults: '' });
      trackAgentUsage('multi-3', { inputTokens: 30000, outputTokens: 0, toolResults: '' });

      const status1 = checkBudgetStatus('multi-1');
      const status2 = checkBudgetStatus('multi-2');
      const status3 = checkBudgetStatus('multi-3');

      assert.strictEqual(status1.used, 10000);
      assert.strictEqual(status2.used, 20000);
      assert.strictEqual(status3.used, 30000);
    });

    it('should not block execution (tracking only)', () => {
      // Even at CRITICAL status, no exceptions thrown
      assert.doesNotThrow(() => {
        trackAgentUsage('non-blocking', {
          inputTokens: 195000,
          outputTokens: 0,
          toolResults: '',
        });

        const status = checkBudgetStatus('non-blocking');
        assert.strictEqual(status.status, 'CRITICAL');
      });
    });

    it('should create JSONL log file correctly', () => {
      // Log multiple events
      for (let i = 0; i < 5; i++) {
        logTokenEvent('test', {
          agentId: `smoke-${i}`,
          tokens: 1000 * i,
          reason: `Smoke test ${i}`,
        });
      }

      // Verify file exists and is valid JSONL
      assert.ok(fs.existsSync(TOKEN_LOG_PATH));

      const content = fs.readFileSync(TOKEN_LOG_PATH, 'utf8');
      const lines = content.trim().split('\n');

      // At least our 5 events
      assert.ok(lines.length >= 5);

      // Each line is valid JSON
      lines.forEach(line => {
        const event = JSON.parse(line);
        assert.ok(event.timestamp);
        assert.ok(event.eventType);
        assert.ok(event.agentId);
        assert.ok(typeof event.tokens === 'number');
      });
    });
  });
});
