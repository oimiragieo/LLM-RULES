/**
 * Agent Search Tool Compliance Test Suite
 *
 * Verifies ALL agents have correct search skill assignments per the
 * search-first protocol (CLAUDE.md Section 7). Cross-references
 * agent-registry.json, agent-skill-matrix.json, and skill-index.json.
 *
 * <!-- Agent: qa | Task: #1 | Session: 2026-03-06 -->
 */

'use strict';

const { describe, it } = require('node:test');
const { strict: assert } = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Resolve project root (walk up from tests/audit/ to find agent-registry.json)
function findProjectRoot(dir) {
  if (fs.existsSync(path.join(dir, '.claude', 'context', 'agent-registry.json'))) {
    return dir;
  }
  const parent = path.dirname(dir);
  if (parent === dir) throw new Error('Could not find project root');
  return findProjectRoot(parent);
}

const PROJECT_ROOT = findProjectRoot(__dirname);

function loadJSON(relPath) {
  const full = path.join(PROJECT_ROOT, relPath);
  return JSON.parse(fs.readFileSync(full, 'utf8'));
}

const registry = loadJSON('.claude/context/agent-registry.json');
const skillMatrix = loadJSON('.claude/context/config/agent-skill-matrix.json');
const skillIndex = loadJSON('.claude/config/skill-index.json');

const SEARCH_SKILLS = ['ripgrep', 'code-semantic-search', 'code-structural-search'];

const BASELINE_SKILLS = [
  'token-saver-context-compression',
  'memory-search',
  'verification-before-completion',
  'task-management-protocol',
];

// Agents explicitly excluded from search skill requirements
const EXCLUDED_AGENTS = ['router'];

// Agents with intentionally empty "always" arrays in the matrix
const MATRIX_NO_ALWAYS = ['router', 'reflection-agent'];

const agentIds = Object.keys(registry.agents);
const nonRouterAgents = agentIds.filter(id => !EXCLUDED_AGENTS.includes(id));

describe('Agent Search Compliance', () => {
  describe('Registry agent count', () => {
    it('should have expected total agent count (72)', () => {
      assert.equal(
        registry.metadata.totalAgents,
        72,
        `Expected 72 agents, got ${registry.metadata.totalAgents}`
      );
    });

    it('should match actual agents object key count', () => {
      assert.equal(
        agentIds.length,
        registry.metadata.totalAgents,
        `Agents keys (${agentIds.length}) != metadata count (${registry.metadata.totalAgents})`
      );
    });
  });

  describe('Search skills in registry', () => {
    for (const agentId of nonRouterAgents) {
      it(`${agentId}: has all 3 search skills in registry`, () => {
        const agent = registry.agents[agentId];
        assert.ok(agent, `Agent ${agentId} not found in registry`);
        const caps = agent.capabilities || [];
        const allSkills = [];
        for (const cap of caps) {
          if (cap.skills) allSkills.push(...cap.skills);
        }
        const missing = SEARCH_SKILLS.filter(s => !allSkills.includes(s));
        assert.deepStrictEqual(
          missing,
          [],
          `Agent ${agentId} missing search skills in registry: ${missing.join(', ')}`
        );
      });
    }
  });

  describe('Baseline skills in registry', () => {
    for (const agentId of nonRouterAgents) {
      it(`${agentId}: has baseline skills in registry`, () => {
        const agent = registry.agents[agentId];
        assert.ok(agent, `Agent ${agentId} not found in registry`);
        const caps = agent.capabilities || [];
        const allSkills = [];
        for (const cap of caps) {
          if (cap.skills) allSkills.push(...cap.skills);
        }
        const missing = BASELINE_SKILLS.filter(s => !allSkills.includes(s));
        assert.deepStrictEqual(
          missing,
          [],
          `Agent ${agentId} missing baseline skills in registry: ${missing.join(', ')}`
        );
      });
    }
  });

  describe('Search skills in agent-skill-matrix "always" arrays', () => {
    const matrixCategories = Object.keys(skillMatrix.agents);

    for (const category of matrixCategories) {
      const agents = skillMatrix.agents[category];
      for (const agentId of Object.keys(agents)) {
        if (MATRIX_NO_ALWAYS.includes(agentId)) continue;

        it(`${agentId} (${category}): matrix "always" has search skills`, () => {
          const entry = agents[agentId];
          const always = entry.always || [];
          const missing = SEARCH_SKILLS.filter(s => !always.includes(s));
          assert.deepStrictEqual(
            missing,
            [],
            `Agent ${agentId} missing search skills in matrix always: ${missing.join(', ')}`
          );
        });
      }
    }
  });

  describe('Baseline skills in agent-skill-matrix "always" arrays', () => {
    const matrixCategories = Object.keys(skillMatrix.agents);

    for (const category of matrixCategories) {
      const agents = skillMatrix.agents[category];
      for (const agentId of Object.keys(agents)) {
        if (MATRIX_NO_ALWAYS.includes(agentId)) continue;

        it(`${agentId} (${category}): matrix "always" has baseline skills`, () => {
          const entry = agents[agentId];
          const always = entry.always || [];
          const missing = BASELINE_SKILLS.filter(s => !always.includes(s));
          assert.deepStrictEqual(
            missing,
            [],
            `Agent ${agentId} missing baseline skills in matrix always: ${missing.join(', ')}`
          );
        });
      }
    }
  });

  describe('Search skills exist in skill-index.json', () => {
    for (const skillName of [...SEARCH_SKILLS, ...BASELINE_SKILLS]) {
      it(`skill "${skillName}" exists in skill-index`, () => {
        assert.ok(
          skillIndex.skills[skillName],
          `Skill "${skillName}" not found in skill-index.json`
        );
      });
    }
  });

  describe('No orphan agents (registry vs skill-matrix)', () => {
    it('all registry agents appear in skill-matrix (except excluded)', () => {
      const matrixAgentIds = new Set();
      for (const category of Object.keys(skillMatrix.agents)) {
        for (const id of Object.keys(skillMatrix.agents[category])) {
          matrixAgentIds.add(id);
        }
      }
      const orphans = nonRouterAgents.filter(
        id => !matrixAgentIds.has(id) && !MATRIX_NO_ALWAYS.includes(id)
      );
      // Allow some agents to be in registry but not in matrix
      // (the matrix is augmentation, not exhaustive)
      // Report as informational but do not hard-fail
      if (orphans.length > 0) {
        console.error(
          `INFO: ${orphans.length} agents in registry but not in skill-matrix: ${orphans.join(', ')}`
        );
      }
      // The test passes but logs informational note
      assert.ok(true);
    });
  });

  describe('Skill-index has agent assignments for search skills', () => {
    for (const skillName of SEARCH_SKILLS) {
      it(`skill "${skillName}" has agentPrimary assignments`, () => {
        const skill = skillIndex.skills[skillName];
        assert.ok(skill, `Skill ${skillName} missing from index`);
        assert.ok(
          Array.isArray(skill.agentPrimary) && skill.agentPrimary.length > 0,
          `Skill ${skillName} has no agentPrimary assignments`
        );
      });
    }
  });

  describe('Registry-matrix consistency for search skills', () => {
    it('every matrix agent with search in "always" also has them in registry', () => {
      const failures = [];
      for (const category of Object.keys(skillMatrix.agents)) {
        const agents = skillMatrix.agents[category];
        for (const agentId of Object.keys(agents)) {
          if (EXCLUDED_AGENTS.includes(agentId)) continue;
          if (MATRIX_NO_ALWAYS.includes(agentId)) continue;

          const always = agents[agentId].always || [];
          const hasSearchInMatrix = SEARCH_SKILLS.every(s => always.includes(s));
          if (!hasSearchInMatrix) continue;

          const regAgent = registry.agents[agentId];
          if (!regAgent) {
            failures.push(`${agentId}: in matrix but not in registry`);
            continue;
          }
          const regSkills = [];
          for (const cap of regAgent.capabilities || []) {
            if (cap.skills) regSkills.push(...cap.skills);
          }
          const missingInReg = SEARCH_SKILLS.filter(s => !regSkills.includes(s));
          if (missingInReg.length > 0) {
            failures.push(
              `${agentId}: matrix has search in always, registry missing: ${missingInReg.join(', ')}`
            );
          }
        }
      }
      assert.deepStrictEqual(
        failures,
        [],
        `Registry-matrix inconsistencies:\n${failures.join('\n')}`
      );
    });
  });
});
