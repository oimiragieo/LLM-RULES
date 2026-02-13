import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const routingTable = require('../../.claude/lib/routing/routing-table.cjs');

describe('Routing Table Equivalence Tests', () => {
  describe('Export Shape Tests', () => {
    it('should export all required keys', () => {
      const requiredKeys = [
        'ROUTING_TABLE',
        'ROUTING_PREFIX_PATTERNS',
        'ROUTING_PATTERNS',
        'INTENT_KEYWORDS',
        'INTENT_TO_AGENT',
        'DISAMBIGUATION_RULES',
        'getPreferredAgent',
      ];

      for (const key of requiredKeys) {
        assert.ok(Object.hasOwn(routingTable, key), `Missing required export: ${key}`);
      }
    });

    it('ROUTING_TABLE should be a non-empty object', () => {
      assert.equal(typeof routingTable.ROUTING_TABLE, 'object');
      assert.ok(Object.keys(routingTable.ROUTING_TABLE).length > 0);
      assert.ok(routingTable.ROUTING_TABLE !== null);
    });

    it('INTENT_KEYWORDS should be a non-empty object', () => {
      assert.equal(typeof routingTable.INTENT_KEYWORDS, 'object');
      assert.ok(Object.keys(routingTable.INTENT_KEYWORDS).length > 0);
      assert.ok(routingTable.INTENT_KEYWORDS !== null);
    });

    it('INTENT_TO_AGENT should be a non-empty object', () => {
      assert.equal(typeof routingTable.INTENT_TO_AGENT, 'object');
      assert.ok(Object.keys(routingTable.INTENT_TO_AGENT).length > 0);
      assert.ok(routingTable.INTENT_TO_AGENT !== null);
    });

    it('DISAMBIGUATION_RULES should be a non-empty object', () => {
      assert.equal(typeof routingTable.DISAMBIGUATION_RULES, 'object');
      assert.ok(Object.keys(routingTable.DISAMBIGUATION_RULES).length > 0);
      assert.ok(routingTable.DISAMBIGUATION_RULES !== null);
    });

    it('getPreferredAgent should be a function', () => {
      assert.equal(typeof routingTable.getPreferredAgent, 'function');
    });

    it('ROUTING_PREFIX_PATTERNS should be a non-empty array', () => {
      assert.ok(Array.isArray(routingTable.ROUTING_PREFIX_PATTERNS));
      assert.ok(routingTable.ROUTING_PREFIX_PATTERNS.length > 0);
    });

    it('ROUTING_PATTERNS should be a non-empty object', () => {
      assert.equal(typeof routingTable.ROUTING_PATTERNS, 'object');
      assert.ok(Object.keys(routingTable.ROUTING_PATTERNS).length > 0);
      assert.ok(routingTable.ROUTING_PATTERNS !== null);
    });
  });

  describe('ROUTING_TABLE Coverage Tests', () => {
    const agentNames = new Set([
      'developer',
      'technical-writer',
      'qa',
      'code-simplifier',
      'security-architect',
      'devops',
      'database-architect',
      'code-reviewer',
      'planner',
      'architect',
      'pm',
      'python-pro',
      'rust-pro',
      'golang-pro',
      'typescript-pro',
      'fastapi-pro',
      'c4-context',
      'c4-container',
      'c4-component',
      'c4-code',
      'web3-blockchain-expert',
      'frontend-pro',
      'nodejs-pro',
      'expo-mobile-developer',
      'tauri-desktop-developer',
      'ios-pro',
      'android-pro',
      'data-engineer',
      'master-orchestrator',
      'swarm-coordinator',
      'evolution-orchestrator',
      'context-compressor',
      'conductor-validator',
      'reverse-engineer',
      'incident-responder',
      'devops-troubleshooter',
      'graphql-pro',
      'java-pro',
      'php-pro',
      'mobile-ux-reviewer',
      'nextjs-pro',
      'sveltekit-expert',
      'llm-architect',
      'prompt-engineer',
      'mcp-developer',
      'gamedev-pro',
      'scientific-research-expert',
      'researcher',
      'ai-ml-specialist',
      'api-designer',
      'microservices-architect',
      'sre-engineer',
      'performance-engineer',
      'penetration-tester',
      'accessibility-tester',
      'chaos-engineer',
      'reflection-agent',
    ]);

    it('should map all entries to valid agent names', () => {
      const entries = Object.entries(routingTable.ROUTING_TABLE);
      assert.ok(entries.length > 0, 'ROUTING_TABLE should have entries');

      for (const [keyword, agent] of entries) {
        assert.equal(
          typeof agent,
          'string',
          `Keyword "${keyword}" should map to a string agent name`
        );
        assert.ok(agentNames.has(agent), `Keyword "${keyword}" maps to unknown agent "${agent}"`);
      }
    });

    it('should map "bug" to "developer"', () => {
      assert.equal(routingTable.ROUTING_TABLE.bug, 'developer');
    });

    it('should map "docs" to "technical-writer"', () => {
      assert.equal(routingTable.ROUTING_TABLE.docs, 'technical-writer');
    });

    it('should map "test" to "qa"', () => {
      assert.equal(routingTable.ROUTING_TABLE.test, 'qa');
    });

    it('should map "refactor" to "code-simplifier"', () => {
      assert.equal(routingTable.ROUTING_TABLE.refactor, 'code-simplifier');
    });

    it('should map "security" to "security-architect"', () => {
      assert.equal(routingTable.ROUTING_TABLE.security, 'security-architect');
    });

    it('should map "devops" to "devops"', () => {
      assert.equal(routingTable.ROUTING_TABLE.devops, 'devops');
    });

    it('should map "database" to "database-architect"', () => {
      assert.equal(routingTable.ROUTING_TABLE.database, 'database-architect');
    });

    it('should map "review" to "code-reviewer"', () => {
      assert.equal(routingTable.ROUTING_TABLE.review, 'code-reviewer');
    });

    it('should map "plan" to "planner"', () => {
      assert.equal(routingTable.ROUTING_TABLE.plan, 'planner');
    });

    it('should map "architecture" to "architect"', () => {
      assert.equal(routingTable.ROUTING_TABLE.architecture, 'architect');
    });

    it('should record total ROUTING_TABLE entry count (baseline snapshot)', () => {
      const count = Object.keys(routingTable.ROUTING_TABLE).length;
      // Baseline: 208 entries as of 2026-02-09
      assert.ok(count >= 200, `Expected at least 200 entries, got ${count}`);
    });
  });

  describe('INTENT_TO_AGENT Coverage Tests', () => {
    const agentNames = new Set([
      'architect',
      'context-compressor',
      'developer',
      'planner',
      'pm',
      'qa',
      'router',
      'technical-writer',
      'python-pro',
      'rust-pro',
      'golang-pro',
      'typescript-pro',
      'java-pro',
      'php-pro',
      'fastapi-pro',
      'nextjs-pro',
      'sveltekit-expert',
      'nodejs-pro',
      'expo-mobile-developer',
      'tauri-desktop-developer',
      'ios-pro',
      'android-pro',
      'graphql-pro',
      'frontend-pro',
      'data-engineer',
      'mobile-ux-reviewer',
      'c4-code',
      'c4-component',
      'c4-container',
      'c4-context',
      'code-reviewer',
      'code-simplifier',
      'conductor-validator',
      'database-architect',
      'devops',
      'devops-troubleshooter',
      'incident-responder',
      'reverse-engineer',
      'researcher',
      'security-architect',
      'master-orchestrator',
      'swarm-coordinator',
      'evolution-orchestrator',
      'scientific-research-expert',
      'llm-architect',
      'prompt-engineer',
      'mcp-developer',
      'ai-ml-specialist',
      'api-designer',
      'microservices-architect',
      'sre-engineer',
      'performance-engineer',
      'penetration-tester',
      'accessibility-tester',
      'chaos-engineer',
      'gamedev-pro',
      'web3-blockchain-expert',
    ]);

    it('should map all intent keys to valid agent names', () => {
      const entries = Object.entries(routingTable.INTENT_TO_AGENT);
      assert.ok(entries.length > 0, 'INTENT_TO_AGENT should have entries');

      for (const [intent, agent] of entries) {
        assert.equal(
          typeof agent,
          'string',
          `Intent "${intent}" should map to a string agent name`
        );
        assert.ok(agentNames.has(agent), `Intent "${intent}" maps to unknown agent "${agent}"`);
      }
    });

    it('should record total INTENT_TO_AGENT entry count (baseline snapshot)', () => {
      const count = Object.keys(routingTable.INTENT_TO_AGENT).length;
      // Baseline: 53 entries as of 2026-02-09
      assert.ok(count >= 50, `Expected at least 50 entries, got ${count}`);
    });
  });

  describe('getPreferredAgent Function Tests', () => {
    it('should return "developer" for "bug"', () => {
      assert.equal(routingTable.getPreferredAgent('bug'), 'developer');
    });

    it('should return "technical-writer" for "docs"', () => {
      assert.equal(routingTable.getPreferredAgent('docs'), 'technical-writer');
    });

    it('should return "qa" for "test"', () => {
      assert.equal(routingTable.getPreferredAgent('test'), 'qa');
    });

    it('should return "devops" for "infrastructure"', () => {
      assert.equal(routingTable.getPreferredAgent('infrastructure'), 'devops');
    });

    it('should return "code-reviewer" for "review"', () => {
      assert.equal(routingTable.getPreferredAgent('review'), 'code-reviewer');
    });

    it('should return "planner" for "plan"', () => {
      assert.equal(routingTable.getPreferredAgent('plan'), 'planner');
    });

    it('should return "golang-pro" for "go"', () => {
      assert.equal(routingTable.getPreferredAgent('go'), 'golang-pro');
    });

    it('should return "python-pro" for "python"', () => {
      assert.equal(routingTable.getPreferredAgent('python'), 'python-pro');
    });

    it('should return "ios-pro" for "ios"', () => {
      assert.equal(routingTable.getPreferredAgent('ios'), 'ios-pro');
    });

    it('should return "security-architect" for "security"', () => {
      assert.equal(routingTable.getPreferredAgent('security'), 'security-architect');
    });

    it('should return "database-architect" for "database"', () => {
      assert.equal(routingTable.getPreferredAgent('database'), 'database-architect');
    });

    it('should return "code-simplifier" for "refactor"', () => {
      assert.equal(routingTable.getPreferredAgent('refactor'), 'code-simplifier');
    });

    it('should return null for empty string', () => {
      assert.equal(routingTable.getPreferredAgent(''), null);
    });

    it('should return null for nonsense string', () => {
      assert.equal(routingTable.getPreferredAgent('xyzzy123'), null);
    });

    it('should return "frontend-pro" for "react"', () => {
      assert.equal(routingTable.getPreferredAgent('react'), 'frontend-pro');
    });

    it('should return "nextjs-pro" for "nextjs"', () => {
      assert.equal(routingTable.getPreferredAgent('nextjs'), 'nextjs-pro');
    });

    it('should return "llm-architect" for "llm"', () => {
      assert.equal(routingTable.getPreferredAgent('llm'), 'llm-architect');
    });

    it('should return "mcp-developer" for "mcp"', () => {
      assert.equal(routingTable.getPreferredAgent('mcp'), 'mcp-developer');
    });

    it('should return "penetration-tester" for "pentest"', () => {
      assert.equal(routingTable.getPreferredAgent('pentest'), 'penetration-tester');
    });

    it('should return "accessibility-tester" for "wcag"', () => {
      assert.equal(routingTable.getPreferredAgent('wcag'), 'accessibility-tester');
    });
  });

  describe('DISAMBIGUATION_RULES Tests', () => {
    it('should have valid structure for all rules', () => {
      const rules = routingTable.DISAMBIGUATION_RULES;
      const entries = Object.entries(rules);

      assert.ok(entries.length > 0, 'DISAMBIGUATION_RULES should have entries');

      for (const [keyword, ruleArray] of entries) {
        assert.ok(
          Array.isArray(ruleArray),
          `Disambiguation rule for "${keyword}" should be an array`
        );
        assert.ok(
          ruleArray.length > 0,
          `Disambiguation rule for "${keyword}" should have at least one rule`
        );

        for (const rule of ruleArray) {
          assert.equal(typeof rule, 'object', `Each rule for "${keyword}" should be an object`);
          assert.ok(
            Array.isArray(rule.condition),
            `Rule for "${keyword}" should have a "condition" array`
          );
          assert.equal(
            typeof rule.prefer,
            'string',
            `Rule for "${keyword}" should have a "prefer" string`
          );
          assert.equal(
            typeof rule.deprioritize,
            'string',
            `Rule for "${keyword}" should have a "deprioritize" string`
          );
        }
      }
    });

    it('should have "llm" disambiguation rule', () => {
      assert.ok(
        Object.hasOwn(routingTable.DISAMBIGUATION_RULES, 'llm'),
        'Should have disambiguation rule for "llm"'
      );
    });

    it('should have "test" disambiguation rule', () => {
      assert.ok(
        Object.hasOwn(routingTable.DISAMBIGUATION_RULES, 'test'),
        'Should have disambiguation rule for "test"'
      );
    });

    it('should have "mobile" disambiguation rule', () => {
      assert.ok(
        Object.hasOwn(routingTable.DISAMBIGUATION_RULES, 'mobile'),
        'Should have disambiguation rule for "mobile"'
      );
    });

    it('should have "api" disambiguation rule', () => {
      assert.ok(
        Object.hasOwn(routingTable.DISAMBIGUATION_RULES, 'api'),
        'Should have disambiguation rule for "api"'
      );
    });

    it('should have "design" disambiguation rule', () => {
      assert.ok(
        Object.hasOwn(routingTable.DISAMBIGUATION_RULES, 'design'),
        'Should have disambiguation rule for "design"'
      );
    });

    it('should have "component" disambiguation rule', () => {
      assert.ok(
        Object.hasOwn(routingTable.DISAMBIGUATION_RULES, 'component'),
        'Should have disambiguation rule for "component"'
      );
    });

    it('should have "debug" disambiguation rule', () => {
      assert.ok(
        Object.hasOwn(routingTable.DISAMBIGUATION_RULES, 'debug'),
        'Should have disambiguation rule for "debug"'
      );
    });

    it('should have "review" disambiguation rule', () => {
      assert.ok(
        Object.hasOwn(routingTable.DISAMBIGUATION_RULES, 'review'),
        'Should have disambiguation rule for "review"'
      );
    });

    it('should have "performance" disambiguation rule', () => {
      assert.ok(
        Object.hasOwn(routingTable.DISAMBIGUATION_RULES, 'performance'),
        'Should have disambiguation rule for "performance"'
      );
    });

    it('should have "accessibility" disambiguation rule', () => {
      assert.ok(
        Object.hasOwn(routingTable.DISAMBIGUATION_RULES, 'accessibility'),
        'Should have disambiguation rule for "accessibility"'
      );
    });

    it('should record total DISAMBIGUATION_RULES count (baseline snapshot)', () => {
      const count = Object.keys(routingTable.DISAMBIGUATION_RULES).length;
      // Simplified: ~11 rules after Phase 3.4 reduction (from 21)
      assert.ok(count >= 10, `Expected at least 10 disambiguation rules, got ${count}`);
    });
  });

  describe('INTENT_KEYWORDS Snapshot Test', () => {
    it('should have expected number of intent categories', () => {
      const categories = Object.keys(routingTable.INTENT_KEYWORDS);
      // Simplified: ~56 categories after removing legacy duplicate sections (Phase 3.3)
      assert.ok(
        categories.length >= 50,
        `Expected at least 50 intent categories, got ${categories.length}`
      );
    });

    it('should have expected total keyword count (approximate baseline)', () => {
      let totalKeywords = 0;
      for (const keywords of Object.values(routingTable.INTENT_KEYWORDS)) {
        assert.ok(Array.isArray(keywords), 'Each intent category should have an array of keywords');
        totalKeywords += keywords.length;
      }
      // Simplified: ~350 total keywords after Phase 3.3 reduction (from ~1570)
      assert.ok(totalKeywords >= 200, `Expected at least 200 total keywords, got ${totalKeywords}`);
    });

    it('should have all intent categories map to arrays', () => {
      const entries = Object.entries(routingTable.INTENT_KEYWORDS);
      for (const [category, keywords] of entries) {
        assert.ok(
          Array.isArray(keywords),
          `Intent category "${category}" should have an array of keywords`
        );
        assert.ok(
          keywords.length > 0,
          `Intent category "${category}" should have at least one keyword`
        );
        for (const keyword of keywords) {
          assert.equal(
            typeof keyword,
            'string',
            `Keyword in category "${category}" should be a string`
          );
        }
      }
    });
  });

  describe('ROUTING_PATTERNS Tests', () => {
    it('should be an object with agent keys', () => {
      assert.equal(typeof routingTable.ROUTING_PATTERNS, 'object');
      assert.ok(routingTable.ROUTING_PATTERNS !== null);
      const agentKeys = Object.keys(routingTable.ROUTING_PATTERNS);
      assert.ok(agentKeys.length > 0, 'ROUTING_PATTERNS should have at least one agent');
    });

    it('should have valid structure for each pattern entry', () => {
      const entries = Object.entries(routingTable.ROUTING_PATTERNS);

      for (const [agent, patterns] of entries) {
        assert.ok(Array.isArray(patterns), `Patterns for agent "${agent}" should be an array`);
        assert.ok(
          patterns.length > 0,
          `Patterns for agent "${agent}" should have at least one pattern`
        );

        for (const pattern of patterns) {
          assert.equal(
            typeof pattern,
            'object',
            `Each pattern for agent "${agent}" should be an object`
          );
          assert.ok(
            pattern.pattern instanceof RegExp,
            `Pattern for agent "${agent}" should have a RegExp "pattern" property`
          );
          assert.equal(
            typeof pattern.priority,
            'number',
            `Pattern for agent "${agent}" should have a numeric "priority" property`
          );
        }
      }
    });

    it('should have "developer" patterns', () => {
      assert.ok(
        Object.hasOwn(routingTable.ROUTING_PATTERNS, 'developer'),
        'Should have patterns for "developer"'
      );
    });

    it('should have "qa" patterns', () => {
      assert.ok(
        Object.hasOwn(routingTable.ROUTING_PATTERNS, 'qa'),
        'Should have patterns for "qa"'
      );
    });

    it('should have "architect" patterns', () => {
      assert.ok(
        Object.hasOwn(routingTable.ROUTING_PATTERNS, 'architect'),
        'Should have patterns for "architect"'
      );
    });

    it('should have "planner" patterns', () => {
      assert.ok(
        Object.hasOwn(routingTable.ROUTING_PATTERNS, 'planner'),
        'Should have patterns for "planner"'
      );
    });

    it('should have "security-architect" patterns', () => {
      assert.ok(
        Object.hasOwn(routingTable.ROUTING_PATTERNS, 'security-architect'),
        'Should have patterns for "security-architect"'
      );
    });

    it('should have "technical-writer" patterns', () => {
      assert.ok(
        Object.hasOwn(routingTable.ROUTING_PATTERNS, 'technical-writer'),
        'Should have patterns for "technical-writer"'
      );
    });

    it('should have "devops" patterns', () => {
      assert.ok(
        Object.hasOwn(routingTable.ROUTING_PATTERNS, 'devops'),
        'Should have patterns for "devops"'
      );
    });

    it('should have "incident-responder" patterns', () => {
      assert.ok(
        Object.hasOwn(routingTable.ROUTING_PATTERNS, 'incident-responder'),
        'Should have patterns for "incident-responder"'
      );
    });

    it('should have "code-reviewer" patterns', () => {
      assert.ok(
        Object.hasOwn(routingTable.ROUTING_PATTERNS, 'code-reviewer'),
        'Should have patterns for "code-reviewer"'
      );
    });

    it('should match pattern examples correctly', () => {
      const developerPatterns = routingTable.ROUTING_PATTERNS.developer;
      const implementPattern = developerPatterns.find(p =>
        p.pattern.test('implement authentication')
      );
      assert.ok(implementPattern, 'Should match "implement authentication" for developer');

      const qaPatterns = routingTable.ROUTING_PATTERNS.qa;
      const testPattern = qaPatterns.find(p => p.pattern.test('test the login flow'));
      assert.ok(testPattern, 'Should match "test the login flow" for qa');

      const architectPatterns = routingTable.ROUTING_PATTERNS.architect;
      const designPattern = architectPatterns.find(p =>
        p.pattern.test('design a microservice architecture')
      );
      assert.ok(designPattern, 'Should match "design a microservice architecture" for architect');
    });
  });

  describe('ROUTING_PREFIX_PATTERNS Tests', () => {
    it('should be an array', () => {
      assert.ok(Array.isArray(routingTable.ROUTING_PREFIX_PATTERNS));
    });

    it('should have valid structure for each prefix pattern', () => {
      const patterns = routingTable.ROUTING_PREFIX_PATTERNS;
      assert.ok(patterns.length > 0, 'Should have at least one prefix pattern');

      for (const pattern of patterns) {
        assert.equal(typeof pattern, 'object', 'Each prefix pattern should be an object');
        assert.equal(
          typeof pattern.pattern,
          'string',
          'Prefix pattern should have a string "pattern" property'
        );
        assert.equal(
          typeof pattern.agent,
          'string',
          'Prefix pattern should have a string "agent" property'
        );
      }
    });

    it('should include "reactjs" pattern', () => {
      const reactjsPattern = routingTable.ROUTING_PREFIX_PATTERNS.find(
        p => p.pattern === 'reactjs'
      );
      assert.ok(reactjsPattern, 'Should have "reactjs" prefix pattern');
    });

    it('should include "nextjs" pattern', () => {
      const nextjsPattern = routingTable.ROUTING_PREFIX_PATTERNS.find(p => p.pattern === 'nextjs');
      assert.ok(nextjsPattern, 'Should have "nextjs" prefix pattern');
    });

    it('should include "nodejs" pattern', () => {
      const nodejsPattern = routingTable.ROUTING_PREFIX_PATTERNS.find(p => p.pattern === 'nodejs');
      assert.ok(nodejsPattern, 'Should have "nodejs" prefix pattern');
    });
  });
});
