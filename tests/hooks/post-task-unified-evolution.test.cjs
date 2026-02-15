'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

const unifiedHook = require('../../.claude/hooks/routing/post-task-unified.cjs');

describe('post-task-unified.cjs evolution audit', () => {
  describe('isEvolutionCompletion', () => {
    it('should detect enable phase', () => {
      const state = {
        currentEvolution: { phase: 'enable' },
      };
      assert.strictEqual(unifiedHook.isEvolutionCompletion(state), true);
    });

    it('should detect recently completed evolution', () => {
      const state = {
        evolutions: [
          {
            createdAt: new Date().toISOString(),
          },
        ],
      };
      assert.strictEqual(unifiedHook.isEvolutionCompletion(state), true);
    });

    it('should return false for null state', () => {
      assert.strictEqual(unifiedHook.isEvolutionCompletion(null), false);
    });

    it('should return false for old evolutions', () => {
      const oldDate = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const state = {
        evolutions: [
          {
            createdAt: oldDate,
          },
        ],
      };
      assert.strictEqual(unifiedHook.isEvolutionCompletion(state), false);
    });
  });

  describe('getLatestEvolution', () => {
    it('should get last evolution from array', () => {
      const state = {
        evolutions: [{ name: 'first' }, { name: 'second' }],
      };
      const result = unifiedHook.getLatestEvolution(state);
      assert.deepStrictEqual(result, { name: 'second' });
    });

    it('should fall back to currentEvolution', () => {
      const state = {
        currentEvolution: { name: 'current' },
      };
      const result = unifiedHook.getLatestEvolution(state);
      assert.deepStrictEqual(result, { name: 'current' });
    });

    it('should return null for empty state', () => {
      assert.strictEqual(unifiedHook.getLatestEvolution(null), null);
      assert.strictEqual(unifiedHook.getLatestEvolution({}), null);
    });
  });

  describe('formatAuditEntry', () => {
    it('should format evolution data', () => {
      const evolution = {
        type: 'agent',
        name: 'test-agent',
        path: '.claude/agents/test.md',
        researchReport: 'research.md',
      };
      const entry = unifiedHook.formatAuditEntry(evolution);
      assert.ok(entry.includes('[EVOLUTION]'));
      assert.ok(entry.includes('type=agent'));
      assert.ok(entry.includes('name=test-agent'));
      assert.ok(entry.includes('status=completed'));
    });

    it('should handle null evolution', () => {
      const entry = unifiedHook.formatAuditEntry(null);
      assert.ok(entry.includes('[EVOLUTION]'));
      assert.ok(entry.includes('type=unknown'));
    });
  });
});
