#!/usr/bin/env node
/**
 * Tests for router-enforcer.cjs
 *
 * Verifies that complexity classification is saved to router-state
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// HOOK-002 FIX: Use shared project-root utility instead of duplicated function
const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');
const _STATE_FILE = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');
const HOOK_PATH = path.join(PROJECT_ROOT, '.claude', 'hooks', 'routing', 'router-enforcer.cjs');

// Import the router-state module to check state
const routerState = require('../../.claude/hooks/routing/router-state.cjs');
const { INTENT_KEYWORDS, INTENT_TO_AGENT } = require('../../.claude/lib/routing/routing-table.cjs');

describe('router-enforcer complexity classification', () => {
  beforeEach(() => {
    // Reset state before each test
    routerState.resetToRouterMode();
  });

  afterEach(() => {
    // Clean up state file after each test
    routerState.resetToRouterMode();
  });

  describe('complexity detection and persistence', () => {
    it('should classify greeting as trivial complexity', async () => {
      // Simulate running the enforcer with a greeting prompt
      const { spawnSync } = require('child_process');
      const hookInput = JSON.stringify({ prompt: 'Hello, how are you?' });

      try {
        spawnSync('node', [HOOK_PATH, hookInput], {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (_e) {
        // Hook may exit with code 0 anyway
      }

      const state = routerState.getState();
      assert.strictEqual(state.complexity, 'trivial', 'Greeting should be classified as trivial');
    });

    it('should classify single-file fix as low complexity', async () => {
      const { spawnSync } = require('child_process');
      const hookInput = JSON.stringify({ prompt: 'Fix the typo in config.js' });

      try {
        spawnSync('node', [HOOK_PATH, hookInput], {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (_e) {
        // Hook may exit with code 0 anyway
      }

      const state = routerState.getState();
      assert.strictEqual(state.complexity, 'low', 'Single-file fix should be classified as low');
    });

    it('should classify feature addition as medium complexity', async () => {
      const { spawnSync } = require('child_process');
      const hookInput = JSON.stringify({ prompt: 'Add a new button component with styling' });

      try {
        spawnSync('node', [HOOK_PATH, hookInput], {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (_e) {
        // Hook may exit with code 0 anyway
      }

      const state = routerState.getState();
      assert.ok(
        state.complexity === 'medium' || state.complexity === 'low',
        `Feature addition should be medium or low complexity, got: ${state.complexity}`
      );
    });

    it('should classify architecture work as high or epic complexity', async () => {
      const { spawnSync } = require('child_process');
      const hookInput = JSON.stringify({
        prompt: 'Refactor the authentication system and add OAuth integration',
      });

      try {
        spawnSync('node', [HOOK_PATH, hookInput], {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (_e) {
        // Hook may exit with code 0 anyway
      }

      const state = routerState.getState();
      assert.ok(
        state.complexity === 'high' || state.complexity === 'epic',
        `Architecture + auth should be classified as high or epic, got: ${state.complexity}`
      );
    });

    it('should set security required flag for auth-related prompts', async () => {
      const { spawnSync } = require('child_process');
      const hookInput = JSON.stringify({ prompt: 'Update the user authentication login flow' });

      try {
        spawnSync('node', [HOOK_PATH, hookInput], {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (_e) {
        // Hook may exit with code 0 anyway
      }

      const state = routerState.getState();
      assert.strictEqual(
        state.requiresSecurityReview,
        true,
        'Auth prompts should set security required flag'
      );
    });

    it('should not set security flag for non-security prompts', async () => {
      const { spawnSync } = require('child_process');
      const hookInput = JSON.stringify({ prompt: 'Add a new color theme option' });

      try {
        spawnSync('node', [HOOK_PATH, hookInput], {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (_e) {
        // Hook may exit with code 0 anyway
      }

      const state = routerState.getState();
      assert.strictEqual(
        state.requiresSecurityReview,
        false,
        'Non-security prompts should not set security flag'
      );
    });
  });

  describe('documentation intent keywords', () => {
    it('should have documentation key in intentKeywords', () => {
      assert.ok(
        Array.isArray(INTENT_KEYWORDS.documentation),
        'intentKeywords should have documentation key'
      );
    });

    it('should include core documentation keywords', () => {
      const keywords = [
        'document',
        'docs',
        'documentation',
        'readme',
        'user guide',
        'api doc',
        'tutorial',
      ];
      for (const keyword of keywords) {
        assert.ok(
          INTENT_KEYWORDS.documentation.includes(keyword),
          `Should include "${keyword}" keyword`
        );
      }
    });

    it('should include additional documentation keywords', () => {
      const keywords = ['explain', 'describe', 'guide', 'manual', 'technical writing'];
      for (const keyword of keywords) {
        assert.ok(
          INTENT_KEYWORDS.documentation.includes(keyword),
          `Should include "${keyword}" keyword`
        );
      }
    });
  });

  describe('technical-writer scoring via INTENT_TO_AGENT', () => {
    const routerEnforcerCode = fs.readFileSync(HOOK_PATH, 'utf-8');

    it('should have INTENT_TO_AGENT mapping for documentation to technical-writer', () => {
      assert.ok(
        INTENT_TO_AGENT.documentation === 'technical-writer',
        'Should have INTENT_TO_AGENT mapping for documentation to technical-writer'
      );
    });

    it('should use INTENT_TO_AGENT for domain-specific boosts', () => {
      // Check that the scoring logic uses INTENT_TO_AGENT
      assert.ok(
        routerEnforcerCode.includes('INTENT_TO_AGENT[detectedIntent]') ||
          routerEnforcerCode.includes('preferredAgent = INTENT_TO_AGENT'),
        'Should use INTENT_TO_AGENT for determining preferred agents'
      );
    });
  });

  describe('routing table mappings', () => {
    it('should map documentation to technical-writer', () => {
      assert.strictEqual(INTENT_TO_AGENT.documentation, 'technical-writer');
    });

    it('should have all core routing mappings', () => {
      const mappings = {
        bug: 'developer',
        security: 'security-architect',
        test: 'qa',
        plan: 'planner',
        devops: 'devops',
        incident: 'incident-responder',
      };
      for (const [intent, agent] of Object.entries(mappings)) {
        assert.strictEqual(INTENT_TO_AGENT[intent], agent, `Should map ${intent} to ${agent}`);
      }
    });
  });
});
