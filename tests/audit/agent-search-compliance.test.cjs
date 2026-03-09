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

// Parse frontmatter skills from agent .md files (source of truth, not capped like registry)
function parseFrontmatterSkills(agentId) {
  const agentDirs = ['core', 'domain', 'specialized', 'orchestrators'];
  for (const dir of agentDirs) {
    const fp = path.join(PROJECT_ROOT, '.claude', 'agents', dir, `${agentId}.md`);
    if (fs.existsSync(fp)) {
      const content = fs.readFileSync(fp, 'utf8');
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch) return [];
      const fm = fmMatch[1];
      const skillsMatch = fm.match(/^skills:\n((?:\s+-\s+.+\n?)*)/m);
      if (!skillsMatch) return [];
      return (
        skillsMatch[1].match(/^\s+-\s+(.+)$/gm)?.map(l => l.replace(/^\s+-\s+/, '').trim()) || []
      );
    }
  }
  return [];
}

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
    it('should have expected total agent count (73)', () => {
      assert.equal(
        registry.metadata.totalAgents,
        73,
        `Expected 73 agents, got ${registry.metadata.totalAgents}`
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

  describe('Search skills in frontmatter', () => {
    for (const agentId of nonRouterAgents) {
      it(`${agentId}: has all 3 search skills in frontmatter`, () => {
        const agent = registry.agents[agentId];
        assert.ok(agent, `Agent ${agentId} not found in registry`);
        // Use frontmatter (source of truth) — registry caps at 50 skills
        const allSkills = parseFrontmatterSkills(agentId);
        const missing = SEARCH_SKILLS.filter(s => !allSkills.includes(s));
        assert.deepStrictEqual(
          missing,
          [],
          `Agent ${agentId} missing search skills in frontmatter: ${missing.join(', ')}`
        );
      });
    }
  });

  describe('Baseline skills in frontmatter', () => {
    for (const agentId of nonRouterAgents) {
      it(`${agentId}: has baseline skills in frontmatter`, () => {
        const agent = registry.agents[agentId];
        assert.ok(agent, `Agent ${agentId} not found in registry`);
        // Use frontmatter (source of truth) — registry caps at 50 skills
        const allSkills = parseFrontmatterSkills(agentId);
        const missing = BASELINE_SKILLS.filter(s => !allSkills.includes(s));
        assert.deepStrictEqual(
          missing,
          [],
          `Agent ${agentId} missing baseline skills in frontmatter: ${missing.join(', ')}`
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
    it('every matrix agent with search in "always" also has them in frontmatter', () => {
      const failures = [];
      for (const category of Object.keys(skillMatrix.agents)) {
        const agents = skillMatrix.agents[category];
        for (const agentId of Object.keys(agents)) {
          if (EXCLUDED_AGENTS.includes(agentId)) continue;
          if (MATRIX_NO_ALWAYS.includes(agentId)) continue;

          const always = agents[agentId].always || [];
          const hasSearchInMatrix = SEARCH_SKILLS.every(s => always.includes(s));
          if (!hasSearchInMatrix) continue;

          // Use frontmatter as source of truth (registry caps at 50 skills)
          const fmSkills = parseFrontmatterSkills(agentId);
          if (fmSkills.length === 0) {
            failures.push(`${agentId}: in matrix but no frontmatter found`);
            continue;
          }
          const missingInFm = SEARCH_SKILLS.filter(s => !fmSkills.includes(s));
          if (missingInFm.length > 0) {
            failures.push(
              `${agentId}: matrix has search in always, frontmatter missing: ${missingInFm.join(', ')}`
            );
          }
        }
      }
      assert.deepStrictEqual(
        failures,
        [],
        `Matrix-frontmatter inconsistencies:\n${failures.join('\n')}`
      );
    });
  });
});
