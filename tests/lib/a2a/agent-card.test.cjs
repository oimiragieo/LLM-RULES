'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { generateAgentCard, loadRegistry } = require('../../../.claude/lib/a2a/agent-card.cjs');

describe('Agent Card', () => {
  describe('generateAgentCard()', () => {
    it('returns an object with required top-level fields', () => {
      const card = generateAgentCard('http://localhost:3100');

      assert.ok(typeof card.name === 'string' && card.name.length > 0, 'name must be set');
      assert.ok(
        typeof card.description === 'string' && card.description.length > 0,
        'description must be set'
      );
      assert.equal(card.url, 'http://localhost:3100', 'url must match baseUrl');
      assert.ok(typeof card.version === 'string', 'version must be a string');
    });

    it('capabilities.streaming is true', () => {
      const card = generateAgentCard();
      assert.equal(card.capabilities.streaming, true);
    });

    it('capabilities.pushNotifications is false', () => {
      const card = generateAgentCard();
      assert.equal(card.capabilities.pushNotifications, false);
    });

    it('skills is an array', () => {
      const card = generateAgentCard();
      assert.ok(Array.isArray(card.skills), 'skills must be an array');
    });

    it('skills are populated from agent-registry.json', () => {
      const registry = loadRegistry();
      const agentCount = Object.keys(registry.agents || {}).length;

      const card = generateAgentCard();
      assert.equal(
        card.skills.length,
        agentCount,
        'number of skills should match agent registry entries'
      );
    });

    it('each skill has id, name, and description fields', () => {
      const card = generateAgentCard();
      // Only check if there are skills
      if (card.skills.length === 0) return;

      for (const skill of card.skills) {
        assert.ok(typeof skill.id === 'string', 'skill.id must be a string');
        assert.ok(typeof skill.name === 'string', 'skill.name must be a string');
        assert.ok(typeof skill.description === 'string', 'skill.description must be a string');
      }
    });

    it('uses http://localhost:3100 as default baseUrl', () => {
      const card = generateAgentCard();
      assert.equal(card.url, 'http://localhost:3100');
    });

    it('uses the provided baseUrl', () => {
      const card = generateAgentCard('https://example.com/agents');
      assert.equal(card.url, 'https://example.com/agents');
    });
  });
});
