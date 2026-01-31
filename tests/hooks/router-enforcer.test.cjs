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

// Import the router-state module to check state
const routerState = require('../../.claude/hooks/routing/router-state.cjs');

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
      const { execSync } = require('child_process');
      const hookInput = JSON.stringify({ prompt: 'Hello, how are you?' });

      try {
        // Use double quotes for Windows compatibility, escape inner quotes
        execSync(
          `node "${path.join(__dirname, 'router-enforcer.cjs')}" "${hookInput.replace(/"/g, '\\"')}"`,
          {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
          }
        );
      } catch (_e) {
        // Hook may exit with code 0 anyway
      }

      const state = routerState.getState();
      assert.strictEqual(state.complexity, 'trivial', 'Greeting should be classified as trivial');
    });

    it('should classify single-file fix as low complexity', async () => {
      const { execSync } = require('child_process');
      const hookInput = JSON.stringify({ prompt: 'Fix the typo in config.js' });

      try {
        execSync(
          `node "${path.join(__dirname, 'router-enforcer.cjs')}" "${hookInput.replace(/"/g, '\\"')}"`,
          {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
          }
        );
      } catch (_e) {
        // Hook may exit with code 0 anyway
      }

      const state = routerState.getState();
      assert.strictEqual(state.complexity, 'low', 'Single-file fix should be classified as low');
    });

    it('should classify feature addition as medium complexity', async () => {
      const { execSync } = require('child_process');
      const hookInput = JSON.stringify({ prompt: 'Add a new button component with styling' });

      try {
        execSync(
          `node "${path.join(__dirname, 'router-enforcer.cjs')}" "${hookInput.replace(/"/g, '\\"')}"`,
          {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
          }
        );
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
      const { execSync } = require('child_process');
      const hookInput = JSON.stringify({
        prompt: 'Refactor the authentication system and add OAuth integration',
      });

      try {
        execSync(
          `node "${path.join(__dirname, 'router-enforcer.cjs')}" "${hookInput.replace(/"/g, '\\"')}"`,
          {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
          }
        );
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
      const { execSync } = require('child_process');
      const hookInput = JSON.stringify({ prompt: 'Update the user authentication login flow' });

      try {
        execSync(
          `node "${path.join(__dirname, 'router-enforcer.cjs')}" "${hookInput.replace(/"/g, '\\"')}"`,
          {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
          }
        );
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
      const { execSync } = require('child_process');
      const hookInput = JSON.stringify({ prompt: 'Add a new color theme option' });

      try {
        execSync(
          `node "${path.join(__dirname, 'router-enforcer.cjs')}" "${hookInput.replace(/"/g, '\\"')}"`,
          {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
          }
        );
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
    // Read the router-enforcer.cjs file to verify structure
    const routerEnforcerCode = fs.readFileSync(
      path.join(__dirname, 'router-enforcer.cjs'),
      'utf-8'
    );

    it('should have documentation key in intentKeywords', () => {
      assert.ok(
        routerEnforcerCode.includes('documentation: ['),
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
          routerEnforcerCode.includes(`'${keyword}'`),
          `Should include "${keyword}" keyword`
        );
      }
    });

    it('should include additional documentation keywords', () => {
      const keywords = ['explain', 'describe', 'guide', 'manual', 'technical writing'];
      for (const keyword of keywords) {
        assert.ok(
          routerEnforcerCode.includes(`'${keyword}'`),
          `Should include "${keyword}" keyword`
        );
      }
    });
  });

  describe('technical-writer scoring via INTENT_TO_AGENT', () => {
    const routerEnforcerCode = fs.readFileSync(
      path.join(__dirname, 'router-enforcer.cjs'),
      'utf-8'
    );

    it('should have INTENT_TO_AGENT mapping for documentation to technical-writer', () => {
      assert.ok(
        routerEnforcerCode.includes("documentation: 'technical-writer'") &&
          routerEnforcerCode.includes('const INTENT_TO_AGENT'),
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

  describe('ROUTING_TABLE data structure', () => {
    const routerEnforcerCode = fs.readFileSync(
      path.join(__dirname, 'router-enforcer.cjs'),
      'utf-8'
    );

    it('should have ROUTING_TABLE constant defined', () => {
      assert.ok(
        routerEnforcerCode.includes('const ROUTING_TABLE = {'),
        'Should have ROUTING_TABLE constant'
      );
    });

    it('should map documentation to technical-writer', () => {
      assert.ok(
        routerEnforcerCode.includes("documentation: 'technical-writer'"),
        'Should map documentation to technical-writer'
      );
    });

    it('should map docs to technical-writer', () => {
      assert.ok(
        routerEnforcerCode.includes("docs: 'technical-writer'"),
        'Should map docs to technical-writer'
      );
    });

    it('should have all core routing mappings', () => {
      const mappings = [
        "bug: 'developer'",
        "security: 'security-architect'",
        "test: 'qa'",
        "plan: 'planner'",
        "devops: 'devops'",
        "incident: 'incident-responder'",
      ];
      for (const mapping of mappings) {
        assert.ok(routerEnforcerCode.includes(mapping), `Should have mapping: ${mapping}`);
      }
    });

    it('should have sync comment with CLAUDE.md', () => {
      assert.ok(
        routerEnforcerCode.includes('Keep in sync with CLAUDE.md') ||
          routerEnforcerCode.includes('Mirrors CLAUDE.md'),
        'Should have sync comment with CLAUDE.md'
      );
    });
  });

  describe('getPreferredAgent function', () => {
    const routerEnforcerCode = fs.readFileSync(
      path.join(__dirname, 'router-enforcer.cjs'),
      'utf-8'
    );

    it('should have getPreferredAgent function defined', () => {
      assert.ok(
        routerEnforcerCode.includes('function getPreferredAgent(intent)'),
        'Should have getPreferredAgent function'
      );
    });

    it('should return agent from ROUTING_TABLE or null', () => {
      assert.ok(
        routerEnforcerCode.includes('return ROUTING_TABLE[intent] || null'),
        'Should return from ROUTING_TABLE or null'
      );
    });
  });
});
