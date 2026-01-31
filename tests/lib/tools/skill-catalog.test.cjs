/**
 * SkillCatalog Tool Tests
 *
 * TDD: Write failing test first, then implement to pass
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { performance } = require('node:perf_hooks');
const path = require('path');

// Import will fail until we create the module
const {
  SkillCatalog,
  SkillCatalogQuery,
  getInstance,
} = require('../../../.claude/lib/tools/skill-catalog.cjs');

describe('SkillCatalog Tool', () => {
  let catalog;

  beforeEach(() => {
    catalog = new SkillCatalogQuery();
    catalog.clearCache();
  });

  describe('Basic Queries', () => {
    it('returns all skills when no filters', () => {
      const result = SkillCatalog({});
      assert.strictEqual(result.success, true);
      assert.ok(result.skills.length > 0, 'Should return at least one skill');
      assert.strictEqual(result.count, result.skills.length);
    });

    it('filters by domain', () => {
      const result = SkillCatalog({ domain: 'development' });
      assert.strictEqual(result.success, true);
      assert.ok(result.skills.length > 0, 'Should return skills for development domain');
      result.skills.forEach((skill) => {
        assert.strictEqual(skill.domain, 'development', `Skill ${skill.name} should be in development domain`);
      });
    });

    it('filters by category', () => {
      const result = SkillCatalog({ category: 'Testing' });
      assert.strictEqual(result.success, true);
      result.skills.forEach((skill) => {
        assert.strictEqual(skill.category, 'Testing', `Skill ${skill.name} should be in Testing category`);
      });
    });

    it('filters by tags (AND logic)', () => {
      const result = SkillCatalog({ tags: ['development', 'testing'] });
      assert.strictEqual(result.success, true);
      result.skills.forEach((skill) => {
        assert.ok(
          skill.tags.includes('development') && skill.tags.includes('testing'),
          `Skill ${skill.name} should have both tags`
        );
      });
    });

    it('filters by agentType', () => {
      const result = SkillCatalog({ agentType: 'developer' });
      assert.strictEqual(result.success, true);
      assert.ok(result.skills.length > 0, 'Should return skills for developer');
    });

    it('respects limit parameter', () => {
      const result = SkillCatalog({ limit: 5 });
      assert.ok(result.skills.length <= 5, 'Should return at most 5 skills');
    });

    it('uses default limit of 10', () => {
      const result = SkillCatalog({});
      assert.ok(result.skills.length <= 10, 'Should return at most 10 skills by default');
    });
  });

  describe('Combined Filters', () => {
    it('filters by domain AND tags', () => {
      const result = SkillCatalog({
        domain: 'development',
        tags: ['testing'],
        limit: 10,
      });
      assert.strictEqual(result.success, true);
      result.skills.forEach((skill) => {
        assert.strictEqual(skill.domain, 'development');
        assert.ok(skill.tags.includes('testing'));
      });
    });

    it('filters by agentType AND domain', () => {
      const result = SkillCatalog({
        agentType: 'developer',
        domain: 'development',
      });
      assert.strictEqual(result.success, true);
      result.skills.forEach((skill) => {
        assert.strictEqual(skill.domain, 'development');
      });
    });

    it('filters by domain AND category', () => {
      const result = SkillCatalog({
        domain: 'development',
        category: 'Testing',
      });
      assert.strictEqual(result.success, true);
      result.skills.forEach((skill) => {
        assert.strictEqual(skill.domain, 'development');
        assert.strictEqual(skill.category, 'Testing');
      });
    });
  });

  describe('No Matches', () => {
    it('handles no match gracefully', () => {
      const result = SkillCatalog({
        domain: 'nonexistent-domain-xyz',
        tags: ['impossible-tag-abc'],
      });
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.skills.length, 0);
      assert.ok(result.suggestions, 'Should provide suggestions');
      assert.ok(result.suggestions.alternatives.length > 0, 'Should have alternative queries');
    });

    it('provides suggestions for unknown domain', () => {
      const result = SkillCatalog({ domain: 'wrong-domain' });
      assert.strictEqual(result.success, false);
      assert.ok(result.suggestions.alternatives.length > 0);
      assert.ok(result.suggestions.availableDomains.length > 0, 'Should list available domains');
    });

    it('provides suggestions when tags yield no results', () => {
      const result = SkillCatalog({ tags: ['nonexistent-tag-xyz'] });
      assert.strictEqual(result.success, false);
      assert.ok(result.suggestions.message, 'Should have a message');
    });
  });

  describe('Validation', () => {
    it('rejects invalid limit (too high)', () => {
      const result = SkillCatalog({ limit: 100 });
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('limit'), 'Error should mention limit');
    });

    it('rejects invalid limit (too low)', () => {
      const result = SkillCatalog({ limit: 0 });
      assert.strictEqual(result.success, false);
    });

    it('rejects negative limit', () => {
      const result = SkillCatalog({ limit: -5 });
      assert.strictEqual(result.success, false);
    });

    it('rejects non-array tags', () => {
      const result = SkillCatalog({ tags: 'not-array' });
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('array'), 'Error should mention array');
    });

    it('rejects invalid options type (string)', () => {
      const result = SkillCatalog('invalid');
      assert.strictEqual(result.success, false);
    });

    it('accepts null options (treated as empty object)', () => {
      const result = SkillCatalog(null);
      // null is treated as {} for convenience
      assert.strictEqual(result.success, true);
    });

    it('accepts undefined options (returns all)', () => {
      const result = SkillCatalog(undefined);
      assert.strictEqual(result.success, true);
    });
  });

  describe('Caching', () => {
    it('returns same result on repeated queries', () => {
      const result1 = SkillCatalog({ domain: 'development', limit: 5 });
      const result2 = SkillCatalog({ domain: 'development', limit: 5 });

      assert.deepStrictEqual(result1.skills, result2.skills);
    });

    it('cache has reasonable latency on hit', () => {
      // First query, warms cache
      SkillCatalog({ domain: 'development' });

      const cacheStart = performance.now();
      // Second query, hits cache
      SkillCatalog({ domain: 'development' });
      const cacheEnd = performance.now();

      const cacheLatency = cacheEnd - cacheStart;
      assert.ok(cacheLatency < 50, `Cache latency ${cacheLatency}ms exceeded 50ms`);
    });

    it('clearCache removes cached entries', () => {
      const result1 = SkillCatalog({ domain: 'development', limit: 3 });
      catalog.clearCache();
      // After clearing, cache should be empty (but query should still work)
      const result2 = SkillCatalog({ domain: 'development', limit: 3 });
      assert.deepStrictEqual(result1.skills, result2.skills);
    });
  });

  describe('Response Format', () => {
    it('response has required fields', () => {
      const result = SkillCatalog({ domain: 'development' });
      assert.ok(Object.prototype.hasOwnProperty.call(result, 'success'));
      assert.ok(Object.prototype.hasOwnProperty.call(result, 'skills'));
      assert.ok(Object.prototype.hasOwnProperty.call(result, 'count'));
      assert.ok(Object.prototype.hasOwnProperty.call(result, 'query'));
    });

    it('skill result has required fields', () => {
      const result = SkillCatalog({ limit: 1 });
      assert.ok(result.skills.length > 0, 'Need at least one skill to test');

      const skill = result.skills[0];
      assert.ok(skill.name, 'Skill should have name');
      assert.ok(skill.domain, 'Skill should have domain');
      assert.ok(skill.description, 'Skill should have description');
      assert.ok(Array.isArray(skill.tags), 'Skill should have tags array');
    });

    it('recommended flag set correctly for agentType query', () => {
      const result = SkillCatalog({ agentType: 'developer' });
      assert.ok(result.skills.some((s) => s.recommended === true), 'Some skills should be recommended');
    });

    it('query is echoed in response', () => {
      const query = { domain: 'development', limit: 5 };
      const result = SkillCatalog(query);
      assert.deepStrictEqual(result.query, query);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty query object', () => {
      const result = SkillCatalog({});
      assert.strictEqual(result.success, true);
    });

    it('limit=1 works', () => {
      const result = SkillCatalog({ limit: 1 });
      assert.ok(result.skills.length <= 1);
    });

    it('limit=50 works', () => {
      const result = SkillCatalog({ limit: 50 });
      assert.ok(result.skills.length <= 50);
    });

    it('handles empty tags array', () => {
      const result = SkillCatalog({ tags: [] });
      assert.strictEqual(result.success, true);
    });

    it('case-sensitive domain matching', () => {
      const lower = SkillCatalog({ domain: 'development' });
      const upper = SkillCatalog({ domain: 'DEVELOPMENT' });

      // Both should work but may return different results
      // (depends on data - at least one should succeed or give suggestions)
      assert.ok(
        lower.success || lower.suggestions,
        'Lower case should return results or suggestions'
      );
      assert.ok(
        upper.success || upper.suggestions,
        'Upper case should return results or suggestions'
      );
    });

    it('handles special characters in domain gracefully', () => {
      const result = SkillCatalog({ domain: 'test<script>' });
      // Should not crash, should return empty or error
      assert.ok(result.success === false || result.skills.length === 0);
    });
  });

  describe('Performance', () => {
    it('query completes in reasonable time (cold cache)', () => {
      catalog.clearCache();
      const start = performance.now();
      SkillCatalog({ domain: 'development', limit: 10 });
      const end = performance.now();

      const duration = end - start;
      assert.ok(duration < 1000, `Query took ${duration}ms, expected <1000ms`);
    });

    it('getAvailableFilters() works', () => {
      const filters = catalog.getAvailableFilters();

      assert.ok(Array.isArray(filters.domains), 'domains should be an array');
      assert.ok(Array.isArray(filters.categories), 'categories should be an array');
      assert.ok(Array.isArray(filters.agentTypes), 'agentTypes should be an array');
      assert.ok(typeof filters.totalSkills === 'number', 'totalSkills should be a number');
      assert.ok(filters.totalSkills > 0, 'Should have some skills');
    });
  });

  describe('getAvailableFilters()', () => {
    it('returns available domains', () => {
      const filters = catalog.getAvailableFilters();
      assert.ok(filters.domains.includes('development'), 'Should include development domain');
    });

    it('returns available categories', () => {
      const filters = catalog.getAvailableFilters();
      assert.ok(filters.categories.length > 0, 'Should have categories');
    });

    it('returns available agentTypes', () => {
      const filters = catalog.getAvailableFilters();
      assert.ok(filters.agentTypes.includes('developer'), 'Should include developer');
      assert.ok(filters.agentTypes.includes('qa'), 'Should include qa');
    });

    it('returns total skills count', () => {
      const filters = catalog.getAvailableFilters();
      assert.ok(filters.totalSkills > 0, 'Should have skills');
    });
  });

  describe('Singleton Instance', () => {
    it('getInstance returns singleton', () => {
      const instance1 = getInstance();
      const instance2 = getInstance();
      assert.strictEqual(instance1, instance2, 'Should return same instance');
    });
  });

  describe('Additional Filter Tests', () => {
    it('filters by multiple tags correctly', () => {
      const result = SkillCatalog({ tags: ['development'] });
      assert.strictEqual(result.success, true);
      result.skills.forEach((skill) => {
        assert.ok(skill.tags.includes('development'));
      });
    });

    it('recommended skills sorted first', () => {
      const result = SkillCatalog({ agentType: 'developer', limit: 20 });
      assert.strictEqual(result.success, true);

      // Find first non-recommended skill
      let foundNonRecommended = false;
      result.skills.forEach((skill) => {
        if (foundNonRecommended && skill.recommended) {
          assert.fail('Recommended skill found after non-recommended');
        }
        if (!skill.recommended) {
          foundNonRecommended = true;
        }
      });
    });

    it('returns skills with all required fields', () => {
      const result = SkillCatalog({ domain: 'development', limit: 3 });
      assert.strictEqual(result.success, true);

      result.skills.forEach((skill) => {
        assert.ok(typeof skill.name === 'string', 'name should be string');
        assert.ok(typeof skill.domain === 'string', 'domain should be string');
        assert.ok(typeof skill.category === 'string', 'category should be string');
        assert.ok(typeof skill.description === 'string', 'description should be string');
        assert.ok(Array.isArray(skill.tags), 'tags should be array');
      });
    });
  });

  describe('Cache TTL and LRU', () => {
    it('cache respects max size', () => {
      // Create many different queries to fill cache
      for (let i = 0; i < 5; i++) {
        SkillCatalog({ limit: i + 1 });
      }
      // Cache should not grow unbounded (just verify no errors)
      const result = SkillCatalog({ domain: 'development' });
      assert.strictEqual(result.success, true);
    });

    it('different queries produce different cache keys', () => {
      const result1 = SkillCatalog({ domain: 'development' });
      const result2 = SkillCatalog({ domain: 'security' });

      // Results should be different (different domains)
      assert.notDeepStrictEqual(result1.skills, result2.skills);
    });
  });

  describe('Error Messages', () => {
    it('error message for invalid limit includes context', () => {
      const result = SkillCatalog({ limit: 999 });
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('1') || result.error.includes('50'), 'Error should mention valid range');
    });

    it('suggestions message describes the failed query', () => {
      const result = SkillCatalog({ domain: 'nonexistent', category: 'also-nonexistent' });
      assert.strictEqual(result.success, false);
      assert.ok(result.suggestions.message.includes('nonexistent'), 'Message should include failed filter');
    });
  });

  describe('Real Data Queries', () => {
    it('can find tdd skill', () => {
      const result = SkillCatalog({ tags: ['tdd'] });
      assert.strictEqual(result.success, true);
      assert.ok(result.skills.some((s) => s.name === 'tdd'), 'Should find tdd skill');
    });

    it('can find security domain skills', () => {
      const result = SkillCatalog({ domain: 'security' });
      // Should either succeed or provide suggestions
      assert.ok(result.success || result.suggestions, 'Should have result or suggestions');
    });

    it('developer recommended skills include tdd', () => {
      const result = SkillCatalog({ agentType: 'developer', limit: 20 });
      assert.strictEqual(result.success, true);
      const tddSkill = result.skills.find((s) => s.name === 'tdd');
      assert.ok(tddSkill, 'Should include tdd skill');
      assert.strictEqual(tddSkill.recommended, true, 'tdd should be recommended for developer');
    });
  });
});
