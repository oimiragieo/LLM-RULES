// tests/lib/config/agent-search-compliance.test.cjs
// Validates agent-skill-matrix.json search skill assignments.
// TDD Red phase: tests should FAIL for agents missing search skills.
'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const MATRIX_PATH = path.join(ROOT, '.claude', 'context', 'config', 'agent-skill-matrix.json');
const REGISTRY_PATH = path.join(ROOT, '.claude', 'context', 'agent-registry.json');

// Exempt agents that should NOT have search skills
const EXEMPT_AGENTS = new Set(['router', 'reflection-agent']);

// Non-code agents exempt from code-semantic-search and code-structural-search
const NON_CODE_AGENTS = new Set([
  'router',
  'reflection-agent',
  'brand-guardian',
  'aso-specialist',
  'marketing-strategist',
  'feedback-synthesizer',
  'compliance-checker',
  'mobile-ux-reviewer',
]);

// Orchestrators exempt from memory-search and token-saver-context-compression
const ORCHESTRATORS = new Set([
  'master-orchestrator',
  'swarm-coordinator',
  'evolution-orchestrator',
  'party-orchestrator',
  'artifact-integrator',
]);

let matrix;
let registry;
let allAgentEntries; // Array of { name, category, always }

describe('Agent Search Skill Compliance (agent-skill-matrix.json)', () => {
  before(() => {
    assert.ok(fs.existsSync(MATRIX_PATH), `Matrix file must exist at ${MATRIX_PATH}`);
    assert.ok(fs.existsSync(REGISTRY_PATH), `Registry file must exist at ${REGISTRY_PATH}`);
    matrix = JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf8'));
    registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));

    // Flatten all agents from matrix into { name, category, always, entry }
    allAgentEntries = [];
    for (const [category, agents] of Object.entries(matrix.agents)) {
      for (const [agentName, entry] of Object.entries(agents)) {
        allAgentEntries.push({
          name: agentName,
          category,
          always: entry.always || [],
          entry,
        });
      }
    }
  });

  describe('1. All non-exempt agents have ripgrep in always array', () => {
    it('should have ripgrep for every non-exempt agent', () => {
      const missing = allAgentEntries
        .filter(a => !EXEMPT_AGENTS.has(a.name))
        .filter(a => !a.always.includes('ripgrep'));
      assert.strictEqual(
        missing.length,
        0,
        `Agents missing ripgrep in always: ${missing.map(a => a.name).join(', ')}`
      );
    });
  });

  describe('2. All code-focused agents have code-semantic-search in always array', () => {
    it('should have code-semantic-search for code-focused agents', () => {
      const missing = allAgentEntries
        .filter(a => !NON_CODE_AGENTS.has(a.name) && !ORCHESTRATORS.has(a.name))
        .filter(a => !a.always.includes('code-semantic-search'));
      assert.strictEqual(
        missing.length,
        0,
        `Code-focused agents missing code-semantic-search: ${missing.map(a => a.name).join(', ')}`
      );
    });
  });

  describe('3. All code-focused agents have code-structural-search in always array', () => {
    it('should have code-structural-search for code-focused agents', () => {
      const missing = allAgentEntries
        .filter(a => !NON_CODE_AGENTS.has(a.name) && !ORCHESTRATORS.has(a.name))
        .filter(a => !a.always.includes('code-structural-search'));
      assert.strictEqual(
        missing.length,
        0,
        `Code-focused agents missing code-structural-search: ${missing.map(a => a.name).join(', ')}`
      );
    });
  });

  describe('4. All non-orchestrator agents have memory-search in always array', () => {
    it('should have memory-search for non-orchestrator agents', () => {
      const missing = allAgentEntries
        .filter(a => !EXEMPT_AGENTS.has(a.name) && !ORCHESTRATORS.has(a.name))
        .filter(a => !a.always.includes('memory-search'));
      assert.strictEqual(
        missing.length,
        0,
        `Non-orchestrator agents missing memory-search: ${missing.map(a => a.name).join(', ')}`
      );
    });
  });

  describe('5. All non-exempt, non-orchestrator agents have token-saver-context-compression', () => {
    it('should have token-saver-context-compression in always array', () => {
      const missing = allAgentEntries
        .filter(a => !EXEMPT_AGENTS.has(a.name) && !ORCHESTRATORS.has(a.name))
        .filter(a => !a.always.includes('token-saver-context-compression'));
      assert.strictEqual(
        missing.length,
        0,
        `Agents missing token-saver-context-compression: ${missing.map(a => a.name).join(', ')}`
      );
    });
  });

  describe('6. Exempt agents have empty or minimal always arrays', () => {
    it('router should have empty always array', () => {
      const router = allAgentEntries.find(a => a.name === 'router');
      assert.ok(router, 'router must exist in matrix');
      assert.strictEqual(
        router.always.length,
        0,
        `router always array should be empty, got: ${JSON.stringify(router.always)}`
      );
    });

    it('reflection-agent should have empty always array', () => {
      const ra = allAgentEntries.find(a => a.name === 'reflection-agent');
      assert.ok(ra, 'reflection-agent must exist in matrix');
      assert.strictEqual(
        ra.always.length,
        0,
        `reflection-agent always array should be empty, got: ${JSON.stringify(ra.always)}`
      );
    });
  });

  describe('7. Orchestrators have at minimum ripgrep in always array', () => {
    it('should have ripgrep for every orchestrator', () => {
      const orchestratorEntries = allAgentEntries.filter(a => ORCHESTRATORS.has(a.name));
      const missing = orchestratorEntries.filter(a => !a.always.includes('ripgrep'));
      assert.strictEqual(
        missing.length,
        0,
        `Orchestrators missing ripgrep: ${missing.map(a => a.name).join(', ')}`
      );
    });
  });

  describe('8. No agent has duplicate skills in always array', () => {
    it('should have no duplicates in always arrays', () => {
      const dupes = [];
      for (const agent of allAgentEntries) {
        const seen = new Set();
        for (const skill of agent.always) {
          if (seen.has(skill)) {
            dupes.push(`${agent.name}: duplicate "${skill}"`);
          }
          seen.add(skill);
        }
      }
      assert.strictEqual(
        dupes.length,
        0,
        `Agents with duplicate skills in always: ${dupes.join('; ')}`
      );
    });
  });

  describe('9. All agents in matrix exist in agent-registry.json', () => {
    it('should find every matrix agent in registry', () => {
      const registryAgentNames = new Set(Object.keys(registry.agents || {}));
      const missing = allAgentEntries.filter(a => !registryAgentNames.has(a.name));
      assert.strictEqual(
        missing.length,
        0,
        `Matrix agents not in registry: ${missing.map(a => a.name).join(', ')}`
      );
    });
  });
});
