'use strict';

/**
 * Tests for ccusage-adapter.cjs
 *
 * TDD: Tests cover happy path, error handling, TTL memoization, security constraints,
 * and environment controls. Uses setExecOverride() for deterministic subprocess mocking.
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const ADAPTER_PATH = path.resolve(__dirname, '../../../.claude/lib/utils/ccusage-adapter.cjs');

const adapter = require(ADAPTER_PATH);

// ── helpers ──────────────────────────────────────────────────────────────────

function makeDailyResponse() {
  return JSON.stringify({
    summary: {
      inputTokens: 12000,
      outputTokens: 3000,
      cacheCreationTokens: 800,
      cacheReadTokens: 5000,
      totalCost: 0.045,
    },
    models: ['claude-sonnet-4-6'],
    days: [],
  });
}

// Reset state after every test
afterEach(() => {
  adapter.setExecOverride(null);
  adapter.clearCache();
  delete process.env.CCUSAGE_DISABLED;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ccusage-adapter', () => {
  describe('getSessionUsage()', () => {
    // ── Test 1: returns structured usage on success ───────────────────────────
    it('returns structured usage when ccusage succeeds', () => {
      adapter.setExecOverride(() => makeDailyResponse());

      const result = adapter.getSessionUsage();

      assert.ok(result !== null, 'should return non-null result');
      assert.ok(typeof result.inputTokens === 'number', 'should have inputTokens');
      assert.ok(typeof result.outputTokens === 'number', 'should have outputTokens');
      assert.ok(typeof result.cacheCreationTokens === 'number', 'should have cacheCreationTokens');
      assert.ok(typeof result.cacheReadTokens === 'number', 'should have cacheReadTokens');
      assert.ok(typeof result.totalCost === 'number', 'should have totalCost');
      assert.strictEqual(result.inputTokens, 12000);
      assert.strictEqual(result.outputTokens, 3000);
      assert.strictEqual(result.cacheCreationTokens, 800);
      assert.strictEqual(result.cacheReadTokens, 5000);
    });

    // ── Test 2: returns null on ENOENT ────────────────────────────────────────
    it('returns null when ccusage is not installed (ENOENT)', () => {
      const err = new Error('spawn npx ENOENT');
      err.code = 'ENOENT';
      adapter.setExecOverride(() => {
        throw err;
      });

      const result = adapter.getSessionUsage();
      assert.strictEqual(result, null, 'should return null on ENOENT');
    });

    // ── Test 3: returns null when CCUSAGE_DISABLED=true ───────────────────────
    it('returns null when CCUSAGE_DISABLED=true', () => {
      process.env.CCUSAGE_DISABLED = 'true';

      let called = false;
      adapter.setExecOverride(() => {
        called = true;
        return makeDailyResponse();
      });

      const result = adapter.getSessionUsage();
      assert.strictEqual(result, null, 'should return null when disabled');
      assert.strictEqual(called, false, 'should not call execFileSync when disabled');
    });

    // ── Test 4: memoized cache within TTL ─────────────────────────────────────
    it('uses memoized cache within TTL (execFileSync called only once)', () => {
      let callCount = 0;
      adapter.setExecOverride(() => {
        callCount++;
        return makeDailyResponse();
      });

      const r1 = adapter.getSessionUsage();
      const r2 = adapter.getSessionUsage();

      assert.ok(r1 !== null, 'first call should succeed');
      assert.ok(r2 !== null, 'second call should succeed');
      assert.strictEqual(callCount, 1, 'execFileSync called only once within TTL');
    });

    // ── Test 5: re-fetches after TTL expires ──────────────────────────────────
    it('re-fetches after TTL expires', () => {
      let callCount = 0;
      adapter.setExecOverride(() => {
        callCount++;
        return makeDailyResponse();
      });

      adapter.getSessionUsage(); // call 1 — populates cache
      adapter._forceExpireCache(); // expire TTL
      adapter.getSessionUsage(); // call 2 — re-fetch

      assert.strictEqual(callCount, 2, 'should re-fetch after TTL expires');
    });
  });

  describe('getDailyUsage()', () => {
    // ── Test 6: returns structured usage for a given date ─────────────────────
    it('returns structured usage for a given date', () => {
      adapter.setExecOverride(() => makeDailyResponse());

      const result = adapter.getDailyUsage('20260316');

      assert.ok(result !== null, 'should return non-null result');
      assert.ok(typeof result.inputTokens === 'number', 'should have inputTokens');
      assert.ok(typeof result.totalCost === 'number', 'should have totalCost');
    });
  });

  describe('getTodayTotals()', () => {
    // ── Test 7: returns aggregated totals for today ───────────────────────────
    it('returns aggregated totals for today', () => {
      adapter.setExecOverride(() => makeDailyResponse());

      const result = adapter.getTodayTotals();

      assert.ok(result !== null, 'should return non-null result');
      assert.ok(typeof result.inputTokens === 'number', 'should have inputTokens');
      assert.ok(typeof result.outputTokens === 'number', 'should have outputTokens');
    });
  });

  describe('security constraints (source-level checks)', () => {
    // ── Test 8: shell:false ───────────────────────────────────────────────────
    it('adapter source does not use shell: true', () => {
      const source = fs.readFileSync(ADAPTER_PATH, 'utf8');
      assert.ok(!source.includes('shell: true'), 'should not use shell: true');
      assert.ok(!source.includes("shell:'true'"), 'should not use shell:true (no space)');
      assert.ok(
        source.includes('shell: false') || source.includes('shell:false'),
        'should explicitly set shell: false'
      );
    });

    // ── Test 9: safeParseJSON ─────────────────────────────────────────────────
    it('adapter source uses safeParseJSON, not raw JSON.parse', () => {
      const source = fs.readFileSync(ADAPTER_PATH, 'utf8');
      assert.ok(source.includes('safeParseJSON'), 'should use safeParseJSON');
      // Strip comments, then verify no bare JSON.parse
      const noComments = source.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
      assert.ok(
        !noComments.includes('JSON.parse('),
        'should not use raw JSON.parse() in non-comment code'
      );
    });

    // ── Test 10: pinned version (no @latest) ──────────────────────────────────
    it('adapter pins ccusage to a specific version, not @latest', () => {
      const source = fs.readFileSync(ADAPTER_PATH, 'utf8');
      assert.ok(!source.includes('ccusage@latest'), 'should not use @latest');
      // CCUSAGE_VERSION constant must exist as a numeric string
      const m = source.match(/CCUSAGE_VERSION\s*=\s*['"](\d+)['"]/);
      assert.ok(m, 'CCUSAGE_VERSION must be a numeric string (e.g. "1")');
    });

    // ── Test 11: env sanitization ─────────────────────────────────────────────
    it('adapter sanitizes env (strips ANTHROPIC_API_KEY before subprocess)', () => {
      const source = fs.readFileSync(ADAPTER_PATH, 'utf8');
      assert.ok(
        source.includes('ANTHROPIC_API_KEY'),
        'should reference ANTHROPIC_API_KEY for removal'
      );
      const hasSanitization =
        source.includes('_sanitizedEnv') ||
        source.includes('sanitizeEnv') ||
        source.includes('SENSITIVE_VARS') ||
        source.includes('delete env[');
      assert.ok(hasSanitization, 'should have env sanitization logic');
    });
  });
});
