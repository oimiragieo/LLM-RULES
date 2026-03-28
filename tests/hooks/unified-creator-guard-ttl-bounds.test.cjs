/**
 * Tests for unified-creator-guard.cjs - TTL Bounds Checking
 * Step 2: Add TTL bounds checking for CREATOR_STATE_TTL_MS
 *
 * These tests verify that the TTL environment variable is properly bounded
 * to prevent Infinity or negative values from creating permanent bypass
 * windows or immediate expiration.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

describe('unified-creator-guard - TTL Bounds Checking', () => {
  let originalTTL;

  beforeEach(() => {
    // Save original env var
    originalTTL = process.env.CREATOR_STATE_TTL_MS;

    // Clear module cache to get fresh DEFAULT_TTL_MS calculation
    delete require.cache[require.resolve('../../.claude/hooks/routing/unified-creator-guard.cjs')];
  });

  afterEach(() => {
    // Restore original env var
    if (originalTTL !== undefined) {
      process.env.CREATOR_STATE_TTL_MS = originalTTL;
    } else {
      delete process.env.CREATOR_STATE_TTL_MS;
    }

    // Clear module cache
    delete require.cache[require.resolve('../../.claude/hooks/routing/unified-creator-guard.cjs')];
  });

  describe('Default TTL', () => {
    it('should use 1800000ms (30 minutes) when no env var set', () => {
      delete process.env.CREATOR_STATE_TTL_MS;

      const { DEFAULT_TTL_MS } = require('../../.claude/hooks/routing/unified-creator-guard.cjs');

      assert.strictEqual(DEFAULT_TTL_MS, 1800000, 'Default should be 30 minutes (1800000ms)');
    });
  });

  describe('TTL Maximum Bound', () => {
    it('should fall back to default for Infinity (more secure than clamping)', () => {
      process.env.CREATOR_STATE_TTL_MS = 'Infinity';

      const { DEFAULT_TTL_MS } = require('../../.claude/hooks/routing/unified-creator-guard.cjs');

      assert.strictEqual(
        DEFAULT_TTL_MS,
        1800000,
        'Infinity should use default (not max) for security'
      );
    });

    it('should clamp very large values to MAX_TTL_MS (1800000ms)', () => {
      process.env.CREATOR_STATE_TTL_MS = '999999999999';

      const { DEFAULT_TTL_MS } = require('../../.claude/hooks/routing/unified-creator-guard.cjs');

      assert.strictEqual(DEFAULT_TTL_MS, 1800000, 'Very large value should clamp to 30 minutes');
    });

    it('should accept 11 minutes as-is', () => {
      process.env.CREATOR_STATE_TTL_MS = String(11 * 60 * 1000); // 660000ms

      const { DEFAULT_TTL_MS } = require('../../.claude/hooks/routing/unified-creator-guard.cjs');

      assert.strictEqual(DEFAULT_TTL_MS, 11 * 60 * 1000, '11 minutes should be accepted');
    });

    it('should clamp 31 minutes to MAX_TTL_MS (1800000ms)', () => {
      process.env.CREATOR_STATE_TTL_MS = String(31 * 60 * 1000); // 1860000ms

      const { DEFAULT_TTL_MS } = require('../../.claude/hooks/routing/unified-creator-guard.cjs');

      assert.strictEqual(DEFAULT_TTL_MS, 1800000, '31 minutes should clamp to 30 minutes');
    });
  });

  describe('TTL Minimum Bound', () => {
    it('should clamp negative values to default (1800000ms)', () => {
      process.env.CREATOR_STATE_TTL_MS = '-1';

      const { DEFAULT_TTL_MS } = require('../../.claude/hooks/routing/unified-creator-guard.cjs');

      assert.strictEqual(DEFAULT_TTL_MS, 1800000, 'Negative value should use default');
    });

    it('should clamp zero to default (1800000ms)', () => {
      process.env.CREATOR_STATE_TTL_MS = '0';

      const { DEFAULT_TTL_MS } = require('../../.claude/hooks/routing/unified-creator-guard.cjs');

      assert.strictEqual(DEFAULT_TTL_MS, 1800000, 'Zero should use default');
    });

    it('should clamp values below 30 seconds to MIN_TTL_MS (30000ms)', () => {
      process.env.CREATOR_STATE_TTL_MS = '10000'; // 10 seconds

      const { DEFAULT_TTL_MS } = require('../../.claude/hooks/routing/unified-creator-guard.cjs');

      assert.strictEqual(DEFAULT_TTL_MS, 30000, 'Below 30s should clamp to MIN_TTL_MS');
    });

    it('should clamp 1 second to MIN_TTL_MS (30000ms)', () => {
      process.env.CREATOR_STATE_TTL_MS = '1000'; // 1 second

      const { DEFAULT_TTL_MS } = require('../../.claude/hooks/routing/unified-creator-guard.cjs');

      assert.strictEqual(DEFAULT_TTL_MS, 30000, '1 second should clamp to 30 seconds');
    });
  });

  describe('Valid TTL Values', () => {
    it('should accept 2 minutes (120000ms) as-is', () => {
      process.env.CREATOR_STATE_TTL_MS = '120000';

      const { DEFAULT_TTL_MS } = require('../../.claude/hooks/routing/unified-creator-guard.cjs');

      assert.strictEqual(DEFAULT_TTL_MS, 120000, '2 minutes should be accepted');
    });

    it('should accept 5 minutes (300000ms) as-is', () => {
      process.env.CREATOR_STATE_TTL_MS = '300000';

      const { DEFAULT_TTL_MS } = require('../../.claude/hooks/routing/unified-creator-guard.cjs');

      assert.strictEqual(DEFAULT_TTL_MS, 300000, '5 minutes should be accepted');
    });

    it('should accept exactly 30 seconds (MIN_TTL_MS)', () => {
      process.env.CREATOR_STATE_TTL_MS = '30000';

      const { DEFAULT_TTL_MS } = require('../../.claude/hooks/routing/unified-creator-guard.cjs');

      assert.strictEqual(DEFAULT_TTL_MS, 30000, '30 seconds should be accepted');
    });

    it('should accept exactly 30 minutes (MAX_TTL_MS)', () => {
      process.env.CREATOR_STATE_TTL_MS = '1800000';

      const { DEFAULT_TTL_MS } = require('../../.claude/hooks/routing/unified-creator-guard.cjs');

      assert.strictEqual(DEFAULT_TTL_MS, 1800000, '30 minutes should be accepted');
    });
  });

  describe('Invalid TTL Values', () => {
    it('should use default for NaN', () => {
      process.env.CREATOR_STATE_TTL_MS = 'not-a-number';

      const { DEFAULT_TTL_MS } = require('../../.claude/hooks/routing/unified-creator-guard.cjs');

      assert.strictEqual(DEFAULT_TTL_MS, 1800000, 'NaN should use default');
    });

    it('should use default for empty string', () => {
      process.env.CREATOR_STATE_TTL_MS = '';

      const { DEFAULT_TTL_MS } = require('../../.claude/hooks/routing/unified-creator-guard.cjs');

      assert.strictEqual(DEFAULT_TTL_MS, 1800000, 'Empty string should use default');
    });
  });
});
