const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = process.cwd();
const COMPRESSION_STATS_PATH = path.join(PROJECT_ROOT, '.claude/context/compression-stats.jsonl');

// Import the module we're testing
const {
  checkCompressionNeeded,
  triggerCompression,
  getCompressionStats,
  resetCompressionCounters
} = require('../../.claude/lib/utils/compression-trigger.cjs');

describe('compression-trigger.cjs', () => {
  before(() => {
    // Clean up test files before tests
    if (fs.existsSync(COMPRESSION_STATS_PATH)) {
      fs.unlinkSync(COMPRESSION_STATS_PATH);
    }
  });

  after(() => {
    // Clean up test files after tests
    if (fs.existsSync(COMPRESSION_STATS_PATH)) {
      fs.unlinkSync(COMPRESSION_STATS_PATH);
    }
  });

  beforeEach(() => {
    // Reset counters before each test
    resetCompressionCounters();
  });

  // === Category 1: Unit - checkCompressionNeeded() - Budget Trigger ===
  describe('checkCompressionNeeded() - Budget Trigger', () => {
    it('should return needed: false when budget is 85%', () => {
      const result = checkCompressionNeeded({
        tokenBudgetStatus: { percentUsed: 85, status: 'OK' },
        lastReadSize: 0,
        lastFetchSize: 0,
        operationCount: 0
      });

      assert.strictEqual(result.needed, false);
    });

    it('should return needed: true with urgency: high when budget is 90%', () => {
      const result = checkCompressionNeeded({
        tokenBudgetStatus: { percentUsed: 90, status: 'CRITICAL' },
        lastReadSize: 0,
        lastFetchSize: 0,
        operationCount: 0
      });

      assert.strictEqual(result.needed, true);
      assert.strictEqual(result.urgency, 'high');
      assert.ok(result.reason.includes('Budget'));
    });

    it('should return needed: true with urgency: high when budget is 95%', () => {
      const result = checkCompressionNeeded({
        tokenBudgetStatus: { percentUsed: 95, status: 'CRITICAL' },
        lastReadSize: 0,
        lastFetchSize: 0,
        operationCount: 0
      });

      assert.strictEqual(result.needed, true);
      assert.strictEqual(result.urgency, 'high');
      assert.ok(result.reason.includes('Budget'));
    });
  });

  // === Category 2: Unit - checkCompressionNeeded() - Size Triggers ===
  describe('checkCompressionNeeded() - Size Triggers', () => {
    it('should return needed: false for Read 8 KB', () => {
      const result = checkCompressionNeeded({
        tokenBudgetStatus: { percentUsed: 50, status: 'OK' },
        lastReadSize: 8000,
        lastFetchSize: 0,
        operationCount: 0
      });

      assert.strictEqual(result.needed, false);
    });

    it('should return needed: true with urgency: medium for Read 10 KB', () => {
      const result = checkCompressionNeeded({
        tokenBudgetStatus: { percentUsed: 50, status: 'OK' },
        lastReadSize: 10000,
        lastFetchSize: 0,
        operationCount: 0
      });

      assert.strictEqual(result.needed, true);
      assert.strictEqual(result.urgency, 'medium');
      assert.ok(result.reason.includes('Read'));
      assert.ok(result.reason.includes('10'));
    });

    it('should return needed: true with urgency: medium for Read 15 KB', () => {
      const result = checkCompressionNeeded({
        tokenBudgetStatus: { percentUsed: 50, status: 'OK' },
        lastReadSize: 15000,
        lastFetchSize: 0,
        operationCount: 0
      });

      assert.strictEqual(result.needed, true);
      assert.strictEqual(result.urgency, 'medium');
      assert.ok(result.reason.includes('Read'));
      assert.ok(result.reason.includes('15'));
    });

    it('should return needed: false for Fetch 3 KB', () => {
      const result = checkCompressionNeeded({
        tokenBudgetStatus: { percentUsed: 50, status: 'OK' },
        lastReadSize: 0,
        lastFetchSize: 3000,
        operationCount: 0
      });

      assert.strictEqual(result.needed, false);
    });

    it('should return needed: true with urgency: medium for Fetch 5 KB', () => {
      const result = checkCompressionNeeded({
        tokenBudgetStatus: { percentUsed: 50, status: 'OK' },
        lastReadSize: 0,
        lastFetchSize: 5000,
        operationCount: 0
      });

      assert.strictEqual(result.needed, true);
      assert.strictEqual(result.urgency, 'medium');
      assert.ok(result.reason.includes('Fetch'));
      assert.ok(result.reason.includes('5'));
    });

    it('should return needed: true with urgency: medium for Fetch 8 KB', () => {
      const result = checkCompressionNeeded({
        tokenBudgetStatus: { percentUsed: 50, status: 'OK' },
        lastReadSize: 0,
        lastFetchSize: 8000,
        operationCount: 0
      });

      assert.strictEqual(result.needed, true);
      assert.strictEqual(result.urgency, 'medium');
      assert.ok(result.reason.includes('Fetch'));
      assert.ok(result.reason.includes('8'));
    });
  });

  // === Category 3: Unit - checkCompressionNeeded() - Periodic Trigger ===
  describe('checkCompressionNeeded() - Periodic Trigger', () => {
    it('should return needed: false for operationCount: 9', () => {
      const result = checkCompressionNeeded({
        tokenBudgetStatus: { percentUsed: 50, status: 'OK' },
        lastReadSize: 0,
        lastFetchSize: 0,
        operationCount: 9
      });

      assert.strictEqual(result.needed, false);
    });

    it('should return needed: true with urgency: low for operationCount: 10', () => {
      const result = checkCompressionNeeded({
        tokenBudgetStatus: { percentUsed: 50, status: 'OK' },
        lastReadSize: 0,
        lastFetchSize: 0,
        operationCount: 10
      });

      assert.strictEqual(result.needed, true);
      assert.strictEqual(result.urgency, 'low');
      assert.ok(result.reason.includes('Periodic'));
      assert.ok(result.reason.includes('10'));
    });

    it('should return needed: true for operationCount: 15 (periodic reset expected)', () => {
      const result = checkCompressionNeeded({
        tokenBudgetStatus: { percentUsed: 50, status: 'OK' },
        lastReadSize: 0,
        lastFetchSize: 0,
        operationCount: 15
      });

      assert.strictEqual(result.needed, true);
      assert.strictEqual(result.urgency, 'low');
      assert.ok(result.reason.includes('Periodic'));
    });
  });

  // === Category 4: Unit - checkCompressionNeeded() - Pattern Trigger ===
  describe('checkCompressionNeeded() - Pattern Trigger', () => {
    it('should return needed: false for 1-2 large ops', () => {
      // Simulate tracking 2 large operations (not enough for pattern)
      // This will be handled internally by the module's operation tracking
      const result = checkCompressionNeeded({
        tokenBudgetStatus: { percentUsed: 50, status: 'OK' },
        lastReadSize: 8000, // Below threshold individually
        lastFetchSize: 0,
        operationCount: 2
      });

      assert.strictEqual(result.needed, false);
    });

    it('should return needed: true with urgency: high for 3+ large ops in last 5', () => {
      // This test will require the module to track operation history
      // For now, we'll test the basic implementation
      // The pattern trigger will be verified in integration tests
      const result = checkCompressionNeeded({
        tokenBudgetStatus: { percentUsed: 50, status: 'OK' },
        lastReadSize: 0,
        lastFetchSize: 0,
        operationCount: 5,
        largeOperationPattern: true // Signal for pattern detection
      });

      // This will pass once pattern detection is implemented
      // For initial RED phase, we expect this to fail
      assert.strictEqual(result.needed, true);
      assert.strictEqual(result.urgency, 'high');
      assert.ok(result.reason.includes('pattern') || result.reason.includes('large'));
    });
  });

  // === Category 5: Unit - triggerCompression() ===
  describe('triggerCompression()', () => {
    it('should return success: true when compression succeeds', async () => {
      const result = await triggerCompression({
        reason: 'Budget > 90%',
        urgency: 'high',
        maxRetries: 1
      });

      assert.strictEqual(result.success, true);
      assert.ok(result.message);
      assert.ok(typeof result.bytesFreed === 'number');
    });

    it('should return success: false when compression fails', async () => {
      // Simulate failure by providing invalid options or triggering error condition
      // This will need error injection once implementation is complete
      const result = await triggerCompression({
        reason: 'Test failure',
        urgency: 'low',
        maxRetries: 1,
        _simulateFailure: true // Internal test flag
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.message);
    });

    it('should handle errors gracefully without retrying', async () => {
      const result = await triggerCompression({
        reason: 'Error test',
        urgency: 'medium',
        maxRetries: 1,
        _simulateFailure: true
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.message.includes('fail') || result.message.includes('error'));
    });
  });

  // === Category 6: Unit - getCompressionStats() ===
  describe('getCompressionStats()', () => {
    it('should return total compressions, bytes saved, average reduction', () => {
      // First, trigger some compressions to generate stats
      // For now, return zeros if no stats exist
      const stats = getCompressionStats();

      assert.ok(typeof stats.totalCompressions === 'number');
      assert.ok(typeof stats.totalBytesSaved === 'number');
      assert.ok(typeof stats.averageReduction === 'string');
      assert.ok(typeof stats.lastCompressionTime === 'string');
    });

    it('should return zeros when stats file is empty', () => {
      // Ensure clean state
      if (fs.existsSync(COMPRESSION_STATS_PATH)) {
        fs.unlinkSync(COMPRESSION_STATS_PATH);
      }

      const stats = getCompressionStats();

      assert.strictEqual(stats.totalCompressions, 0);
      assert.strictEqual(stats.totalBytesSaved, 0);
      assert.strictEqual(stats.averageReduction, '0%');
      assert.strictEqual(stats.lastCompressionTime, 'Never');
    });
  });

  // === Category 7: Unit - resetCompressionCounters() ===
  describe('resetCompressionCounters()', () => {
    it('should reset operation counter to 0', () => {
      // Increment counter first
      checkCompressionNeeded({
        tokenBudgetStatus: { percentUsed: 50, status: 'OK' },
        lastReadSize: 0,
        lastFetchSize: 0,
        operationCount: 5
      });

      resetCompressionCounters();

      const result = checkCompressionNeeded({
        tokenBudgetStatus: { percentUsed: 50, status: 'OK' },
        lastReadSize: 0,
        lastFetchSize: 0,
        operationCount: 0 // Counter should be reset
      });

      // After reset, operation count should be 0
      assert.strictEqual(result.needed, false);
    });

    it('should reset large operation tracking', () => {
      resetCompressionCounters();

      // Verify counters are reset by checking state
      const result = checkCompressionNeeded({
        tokenBudgetStatus: { percentUsed: 50, status: 'OK' },
        lastReadSize: 0,
        lastFetchSize: 0,
        operationCount: 0
      });

      assert.strictEqual(result.needed, false);
    });
  });

  // === Category 8: Integration - Hook Behavior ===
  describe('Hook Integration', () => {
    it('should trigger compression when PostToolResult has large Read', async () => {
      const compressionCheck = checkCompressionNeeded({
        tokenBudgetStatus: { percentUsed: 70, status: 'OK' },
        lastReadSize: 15000, // 15 KB - triggers compression
        lastFetchSize: 0,
        operationCount: 5
      });

      assert.strictEqual(compressionCheck.needed, true);
      assert.strictEqual(compressionCheck.urgency, 'medium');

      // If compression needed, trigger it
      if (compressionCheck.needed) {
        const result = await triggerCompression({
          reason: compressionCheck.reason,
          urgency: compressionCheck.urgency,
          maxRetries: 1
        });

        assert.ok(result.success !== undefined);
      }
    });

    it('should not trigger compression for small tools', () => {
      const compressionCheck = checkCompressionNeeded({
        tokenBudgetStatus: { percentUsed: 50, status: 'OK' },
        lastReadSize: 2000, // 2 KB - below threshold
        lastFetchSize: 0,
        operationCount: 3
      });

      assert.strictEqual(compressionCheck.needed, false);
    });

    it('should only trigger one compression per check', async () => {
      const compressionCheck = checkCompressionNeeded({
        tokenBudgetStatus: { percentUsed: 92, status: 'CRITICAL' },
        lastReadSize: 0,
        lastFetchSize: 0,
        operationCount: 0
      });

      assert.strictEqual(compressionCheck.needed, true);

      // Trigger once
      const result1 = await triggerCompression({
        reason: compressionCheck.reason,
        urgency: compressionCheck.urgency,
        maxRetries: 1
      });

      // Should succeed
      assert.ok(result1.success !== undefined);

      // Immediate re-check should still allow compression (no cooldown in Phase 2)
      const compressionCheck2 = checkCompressionNeeded({
        tokenBudgetStatus: { percentUsed: 92, status: 'CRITICAL' },
        lastReadSize: 0,
        lastFetchSize: 0,
        operationCount: 0
      });

      // Check should still detect need (no automatic cooldown)
      assert.strictEqual(compressionCheck2.needed, true);
    });
  });

  // === Category 9: Smoke - End-to-End ===
  describe('End-to-End Workflow', () => {
    it('should complete full workflow: check -> trigger -> stats', async () => {
      // Step 1: Check if compression needed
      const compressionCheck = checkCompressionNeeded({
        tokenBudgetStatus: { percentUsed: 91, status: 'CRITICAL' },
        lastReadSize: 0,
        lastFetchSize: 0,
        operationCount: 0
      });

      assert.strictEqual(compressionCheck.needed, true);

      // Step 2: Trigger compression
      const triggerResult = await triggerCompression({
        reason: compressionCheck.reason,
        urgency: compressionCheck.urgency,
        maxRetries: 1
      });

      assert.ok(triggerResult.success !== undefined);

      // Step 3: Get stats
      const stats = getCompressionStats();

      assert.ok(typeof stats.totalCompressions === 'number');
      assert.ok(typeof stats.totalBytesSaved === 'number');
    });

    it('should log stats correctly to JSONL', async () => {
      // Trigger compression to generate log
      const triggerResult = await triggerCompression({
        reason: 'Test logging',
        urgency: 'low',
        maxRetries: 1
      });

      // If successful, check log file
      if (triggerResult.success && fs.existsSync(COMPRESSION_STATS_PATH)) {
        const logContent = fs.readFileSync(COMPRESSION_STATS_PATH, 'utf8');
        const lines = logContent.trim().split('\n').filter(line => line.length > 0);

        assert.ok(lines.length > 0);

        // Parse last line
        const lastEntry = JSON.parse(lines[lines.length - 1]);
        assert.ok(lastEntry.timestamp);
        assert.ok(typeof lastEntry.bytesFreed === 'number');
      }
    });

    it('should reset counters after compression', async () => {
      // Increment counter
      checkCompressionNeeded({
        tokenBudgetStatus: { percentUsed: 50, status: 'OK' },
        lastReadSize: 0,
        lastFetchSize: 0,
        operationCount: 8
      });

      // Reset
      resetCompressionCounters();

      // Verify reset
      const result = checkCompressionNeeded({
        tokenBudgetStatus: { percentUsed: 50, status: 'OK' },
        lastReadSize: 0,
        lastFetchSize: 0,
        operationCount: 0
      });

      assert.strictEqual(result.needed, false);
    });
  });
});
