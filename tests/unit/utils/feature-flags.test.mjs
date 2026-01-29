/**
 * Feature Flags Test Suite
 *
 * Tests for phased rollout feature flag system
 * Following TDD: RED → GREEN → REFACTOR
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

describe('Feature Flags System', () => {
  let FeatureFlags;
  const originalEnv = { ...process.env };

  before(async () => {
    // Import module dynamically to allow env var manipulation
    const module = await import('../../../.claude/lib/utils/feature-flags.cjs');
    FeatureFlags = module.FeatureFlags;
  });

  after(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  describe('Construction and Configuration', () => {
    it('should create instance with default values', () => {
      const flags = new FeatureFlags();
      assert.ok(flags);
    });

    it('should read MEMORY_SYSTEM_ENABLED from env', () => {
      process.env.MEMORY_SYSTEM_ENABLED = 'true';
      const flags = new FeatureFlags();
      assert.strictEqual(flags.isEnabled('memory_system'), true);

      process.env.MEMORY_SYSTEM_ENABLED = 'false';
      const flags2 = new FeatureFlags();
      assert.strictEqual(flags2.isEnabled('memory_system'), false);
    });

    it('should read MEMORY_ROLLOUT_PERCENTAGE from env', () => {
      process.env.MEMORY_ROLLOUT_PERCENTAGE = '50';
      const flags = new FeatureFlags();
      assert.strictEqual(flags.getRolloutPercentage('memory_system'), 50);
    });

    it('should default to disabled if env vars not set', () => {
      delete process.env.MEMORY_SYSTEM_ENABLED;
      delete process.env.MEMORY_ROLLOUT_PERCENTAGE;
      const flags = new FeatureFlags();
      assert.strictEqual(flags.isEnabled('memory_system'), false);
    });

    it('should validate percentage is 0-100', () => {
      process.env.MEMORY_ROLLOUT_PERCENTAGE = '150';
      assert.throws(() => new FeatureFlags(), /Rollout percentage must be between 0 and 100/);
    });

    it('should handle invalid percentage gracefully', () => {
      process.env.MEMORY_ROLLOUT_PERCENTAGE = 'invalid';
      const flags = new FeatureFlags();
      assert.strictEqual(flags.getRolloutPercentage('memory_system'), 0);
    });
  });

  describe('Phased Rollout Logic', () => {
    it('should return false when feature disabled', () => {
      process.env.MEMORY_SYSTEM_ENABLED = 'false';
      const flags = new FeatureFlags();
      // Even at 100% rollout, disabled flag returns false
      assert.strictEqual(flags.shouldUse('memory_system', 'user-123'), false);
    });

    it('should return false when percentage is 0', () => {
      process.env.MEMORY_SYSTEM_ENABLED = 'true';
      process.env.MEMORY_ROLLOUT_PERCENTAGE = '0';
      const flags = new FeatureFlags();
      assert.strictEqual(flags.shouldUse('memory_system', 'any-id'), false);
    });

    it('should return true when percentage is 100', () => {
      process.env.MEMORY_SYSTEM_ENABLED = 'true';
      process.env.MEMORY_ROLLOUT_PERCENTAGE = '100';
      const flags = new FeatureFlags();
      assert.strictEqual(flags.shouldUse('memory_system', 'any-id'), true);
    });

    it('should use consistent hashing for stable assignment', () => {
      process.env.MEMORY_SYSTEM_ENABLED = 'true';
      process.env.MEMORY_ROLLOUT_PERCENTAGE = '50';
      const flags = new FeatureFlags();

      // Same ID should always return same result
      const userId = 'test-user-123';
      const result1 = flags.shouldUse('memory_system', userId);
      const result2 = flags.shouldUse('memory_system', userId);
      const result3 = flags.shouldUse('memory_system', userId);

      assert.strictEqual(result1, result2);
      assert.strictEqual(result2, result3);
    });

    it('should distribute users across rollout boundary', () => {
      process.env.MEMORY_SYSTEM_ENABLED = 'true';
      process.env.MEMORY_ROLLOUT_PERCENTAGE = '50';
      const flags = new FeatureFlags();

      // Test 100 different user IDs
      const results = [];
      for (let i = 0; i < 100; i++) {
        results.push(flags.shouldUse('memory_system', `user-${i}`));
      }

      const enabledCount = results.filter(Boolean).length;
      // With 50% rollout, expect ~50% enabled (allow 30-70% tolerance)
      assert.ok(
        enabledCount >= 30 && enabledCount <= 70,
        `Expected ~50% enabled, got ${enabledCount}%`
      );
    });

    it('should handle 10% rollout correctly', () => {
      process.env.MEMORY_SYSTEM_ENABLED = 'true';
      process.env.MEMORY_ROLLOUT_PERCENTAGE = '10';
      const flags = new FeatureFlags();

      const results = [];
      for (let i = 0; i < 1000; i++) {
        results.push(flags.shouldUse('memory_system', `user-${i}`));
      }

      const enabledCount = results.filter(Boolean).length;
      // With 10% rollout, expect ~10% enabled (allow 5-15% tolerance)
      assert.ok(
        enabledCount >= 50 && enabledCount <= 150,
        `Expected ~10% enabled (100/1000), got ${enabledCount}/1000`
      );
    });

    it('should handle edge case: empty session ID', () => {
      process.env.MEMORY_SYSTEM_ENABLED = 'true';
      process.env.MEMORY_ROLLOUT_PERCENTAGE = '50';
      const flags = new FeatureFlags();

      // Should use fallback ID
      const result = flags.shouldUse('memory_system', '');
      assert.strictEqual(typeof result, 'boolean');
    });

    it('should handle edge case: null session ID', () => {
      process.env.MEMORY_SYSTEM_ENABLED = 'true';
      process.env.MEMORY_ROLLOUT_PERCENTAGE = '50';
      const flags = new FeatureFlags();

      const result = flags.shouldUse('memory_system', null);
      assert.strictEqual(typeof result, 'boolean');
    });
  });

  describe('Rollback Procedure', () => {
    it('should disable feature when rollback called', () => {
      process.env.MEMORY_SYSTEM_ENABLED = 'true';
      process.env.MEMORY_ROLLOUT_PERCENTAGE = '100';
      const flags = new FeatureFlags();

      assert.strictEqual(flags.isEnabled('memory_system'), true);
      flags.rollback('memory_system', 'Critical bug detected');
      assert.strictEqual(flags.isEnabled('memory_system'), false);
    });

    it('should log rollback reason', () => {
      process.env.MEMORY_SYSTEM_ENABLED = 'true';
      const flags = new FeatureFlags();

      const logs = [];
      const originalWarn = console.warn;
      console.warn = msg => logs.push(msg);

      flags.rollback('memory_system', 'Test rollback');

      console.warn = originalWarn;
      assert.ok(
        logs.some(log => log.includes('Test rollback')),
        'Should log rollback reason'
      );
    });

    it('should reset rollout percentage to 0 on rollback', () => {
      process.env.MEMORY_SYSTEM_ENABLED = 'true';
      process.env.MEMORY_ROLLOUT_PERCENTAGE = '100';
      const flags = new FeatureFlags();

      flags.rollback('memory_system', 'Rollback test');
      assert.strictEqual(flags.getRolloutPercentage('memory_system'), 0);
    });
  });

  describe('Multiple Features Support', () => {
    it('should support multiple feature flags', () => {
      process.env.MEMORY_SYSTEM_ENABLED = 'true';
      process.env.PARTY_MODE_ENABLED = 'false';
      const flags = new FeatureFlags();

      assert.strictEqual(flags.isEnabled('memory_system'), true);
      assert.strictEqual(flags.isEnabled('party_mode'), false);
    });

    it('should handle rollout for multiple features independently', () => {
      process.env.MEMORY_SYSTEM_ENABLED = 'true';
      process.env.MEMORY_ROLLOUT_PERCENTAGE = '50';
      process.env.PARTY_MODE_ENABLED = 'true';
      process.env.PARTY_ROLLOUT_PERCENTAGE = '100';

      const flags = new FeatureFlags();
      const sessionId = 'test-session';

      // Party mode at 100% should always be enabled
      assert.strictEqual(flags.shouldUse('party_mode', sessionId), true);

      // Memory system at 50% depends on hash
      const memoryResult = flags.shouldUse('memory_system', sessionId);
      assert.strictEqual(typeof memoryResult, 'boolean');
    });
  });

  describe('Status Reporting', () => {
    it('should return status object for feature', () => {
      process.env.MEMORY_SYSTEM_ENABLED = 'true';
      process.env.MEMORY_ROLLOUT_PERCENTAGE = '50';
      const flags = new FeatureFlags();

      const status = flags.getStatus('memory_system');
      assert.ok(status);
      assert.strictEqual(status.enabled, true);
      assert.strictEqual(status.rolloutPercentage, 50);
      assert.ok('rollbackHistory' in status);
    });

    it('should include rollback history in status', () => {
      process.env.MEMORY_SYSTEM_ENABLED = 'true';
      const flags = new FeatureFlags();

      flags.rollback('memory_system', 'Bug #123');
      const status = flags.getStatus('memory_system');

      assert.ok(Array.isArray(status.rollbackHistory));
      assert.strictEqual(status.rollbackHistory.length, 1);
      assert.ok(status.rollbackHistory[0].reason.includes('Bug #123'));
      assert.ok('timestamp' in status.rollbackHistory[0]);
    });

    it('should return all features status', () => {
      process.env.MEMORY_SYSTEM_ENABLED = 'true';
      process.env.PARTY_MODE_ENABLED = 'false';
      const flags = new FeatureFlags();

      const allStatus = flags.getAllStatus();
      assert.ok(allStatus);
      assert.ok('memory_system' in allStatus);
      assert.ok('party_mode' in allStatus);
    });
  });
});
