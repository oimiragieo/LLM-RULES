/**
 * Phase 4 / SPEC-021: Legacy adapter and strangler fig tests
 * wrap, route, fallback, feature toggle
 */

const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const StranglerFig = require('../../.claude/lib/workflow/strangler-fig.cjs');

describe('Phase 4: legacy adapter / strangler fig', () => {
  let strangler;

  beforeEach(() => {
    strangler = new StranglerFig();
  });

  test('register and execute routes to legacy when percentage 0', async () => {
    strangler.register('checkout', {
      legacyFn: async () => 'legacy',
      newFn: async () => 'new',
      percentage: 0,
      fallbackOnError: true,
    });
    const result = await strangler.execute('checkout', []);
    assert.strictEqual(result, 'legacy');
  });

  test('execute routes to new when percentage 100', async () => {
    strangler.register('pay', {
      legacyFn: async () => 'legacy',
      newFn: async () => 'new',
      percentage: 100,
      fallbackOnError: true,
    });
    const result = await strangler.execute('pay', []);
    assert.strictEqual(result, 'new');
  });

  test('fallback on error when new fails', async () => {
    strangler.register('fallback-test', {
      legacyFn: async () => 'legacy-ok',
      newFn: async () => {
        throw new Error('new failed');
      },
      percentage: 100,
      fallbackOnError: true,
    });
    const result = await strangler.execute('fallback-test', []);
    assert.strictEqual(result, 'legacy-ok');
  });

  test('getMetrics returns legacyCalls and newCalls', async () => {
    strangler.register('m', {
      legacyFn: async () => 'l',
      newFn: async () => 'n',
      percentage: 0,
    });
    await strangler.execute('m', []);
    const metrics = strangler.getMetrics('m');
    assert.ok(metrics.legacyCalls >= 1 || metrics.newCalls >= 1);
  });

  test('execute with percentage 50 routes to legacy or new', async () => {
    strangler.register('fifty', {
      legacyFn: async () => 'legacy',
      newFn: async () => 'new',
      percentage: 50,
    });
    const result = await strangler.execute('fifty', []);
    assert.ok(result === 'legacy' || result === 'new');
  });
});
