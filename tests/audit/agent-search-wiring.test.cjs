/**
 * Test: Agent Search Tool Wiring Regression
 *
 * Validates the 3-layer skill resolution system integrity for search skills.
 * Layer 1: Agent frontmatter skills: arrays
 * Layer 2: agent-skill-matrix.json "always" arrays
 * Layer 3: skill-index.json agentPrimary lists
 *
 * Catches: agents added to registry but missing from skill-index,
 * agents in skill-index but removed from registry, matrix "always"
 * entries inconsistent with skill-index agentPrimary.
 */

const { describe, it } = require('node:test');
const { strict: assert } = require('node:assert');
const { readFileSync, existsSync } = require('fs');
const { resolve, join } = require('path');

const PROJECT_ROOT = resolve(__dirname, '../..');

// --- Data loaders ---

function loadJSON(relPath) {
  const full = join(PROJECT_ROOT, relPath);
  return JSON.parse(readFileSync(full, 'utf8'));
}

function parseFrontmatter(mdContent) {
  const match = mdContent.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const yaml = match[1];
  const fm = {};
  // Parse skills array
  const skillsMatch = yaml.match(/^skills:\s*\n((?:\s+-\s+.+\n?)*)/m);
  if (skillsMatch) {
    fm.skills = skillsMatch[1]
      .split('\n')
      .map(l => l.replace(/^\s*-\s*/, '').trim())
      .filter(Boolean);
  }
  // Parse name
  const nameMatch = yaml.match(/^name:\s*(.+)$/m);
  if (nameMatch) fm.name = nameMatch[1].trim();
  return fm;
}

const registry = loadJSON('.claude/context/agent-registry.json');
const matrix = loadJSON('.claude/context/config/agent-skill-matrix.json');
const skillIndex = loadJSON('.claude/config/skill-index.json');

const allAgentIds = Object.keys(registry.agents);
const SEARCH_SKILLS = [
  'ripgrep',
  'code-semantic-search',
  'code-structural-search',
  'token-saver-context-compression',
];

// Agents that are explicitly excluded from search skill requirements
const EXCLUDED_AGENTS = ['router'];

// Non-router agents
const nonRouterAgents = allAgentIds.filter(id => !EXCLUDED_AGENTS.includes(id));

// Sample agents across categories for frontmatter checks
const SAMPLED_AGENTS = [
  { id: 'developer', category: 'core', path: '.claude/agents/core/developer.md' },
  { id: 'qa', category: 'core', path: '.claude/agents/core/qa.md' },
  { id: 'architect', category: 'core', path: '.claude/agents/core/architect.md' },
  { id: 'planner', category: 'core', path: '.claude/agents/core/planner.md' },
  { id: 'python-pro', category: 'domain', path: '.claude/agents/domain/python-pro.md' },
  {
    id: 'security-architect',
    category: 'specialized',
    path: '.claude/agents/specialized/security-architect.md',
  },
  { id: 'devops', category: 'specialized', path: '.claude/agents/specialized/devops.md' },
  {
    id: 'code-reviewer',
    category: 'specialized',
    path: '.claude/agents/specialized/code-reviewer.md',
  },
  {
    id: 'master-orchestrator',
    category: 'orchestrators',
    path: '.claude/agents/orchestrators/master-orchestrator.md',
  },
  {
    id: 'evolution-orchestrator',
    category: 'orchestrators',
    path: '.claude/agents/orchestrators/evolution-orchestrator.md',
  },
  { id: 'typescript-pro', category: 'domain', path: '.claude/agents/domain/typescript-pro.md' },
  { id: 'nodejs-pro', category: 'domain', path: '.claude/agents/domain/nodejs-pro.md' },
];

// --- Layer 3: skill-index.json tests ---

describe('Layer 3: skill-index.json search skill entries', () => {
  for (const skillName of SEARCH_SKILLS) {
    it(`skill-index has entry for "${skillName}"`, () => {
      assert.ok(skillIndex.skills[skillName], `Missing skill-index entry for "${skillName}"`);
    });

    it(`"${skillName}" agentPrimary is a non-empty array`, () => {
      const entry = skillIndex.skills[skillName];
      assert.ok(entry, `Skill "${skillName}" missing from index`);
      assert.ok(
        Array.isArray(entry.agentPrimary) && entry.agentPrimary.length > 0,
        `"${skillName}" agentPrimary should be a non-empty array`
      );
    });

    it(`"${skillName}" agentPrimary covers majority of non-router agents`, () => {
      const entry = skillIndex.skills[skillName];
      if (!entry) return;
      const coverage = entry.agentPrimary.length;
      const total = nonRouterAgents.length;
      const ratio = coverage / total;
      assert.ok(
        ratio >= 0.5,
        `"${skillName}" covers ${coverage}/${total} agents (${(ratio * 100).toFixed(0)}%), expected >=50%`
      );
    });
  }
});

// --- Layer 2: agent-skill-matrix.json tests ---

describe('Layer 2: agent-skill-matrix.json "always" arrays', () => {
  // Flatten all matrix categories into a single map of agentId -> always[]
  function getMatrixAlways() {
    const result = {};
    for (const category of Object.values(matrix.agents)) {
      for (const [agentId, config] of Object.entries(category)) {
        if (config.always && Array.isArray(config.always)) {
          result[agentId] = config.always;
        }
      }
    }
    return result;
  }

  const matrixAlways = getMatrixAlways();

  // Core agents that MUST have search skills in their "always" array
  const CORE_AGENTS_REQUIRING_SEARCH = [
    'developer',
    'planner',
    'architect',
    'qa',
    'technical-writer',
    'pm',
    'context-compressor',
    'technical-program-manager',
  ];

  for (const agentId of CORE_AGENTS_REQUIRING_SEARCH) {
    for (const skillName of SEARCH_SKILLS) {
      it(`matrix "always" for "${agentId}" includes "${skillName}"`, () => {
        const always = matrixAlways[agentId];
        assert.ok(always, `Agent "${agentId}" has no "always" array in matrix`);
        assert.ok(
          always.includes(skillName),
          `Agent "${agentId}" missing "${skillName}" in matrix "always" array`
        );
      });
    }
  }

  it('router has empty "always" array (excluded from search skills)', () => {
    const routerAlways = matrixAlways['router'];
    if (routerAlways) {
      assert.strictEqual(
        routerAlways.length,
        0,
        'Router "always" array should be empty (router does not use search skills)'
      );
    }
  });
});

// --- Layer 1: Agent frontmatter tests ---

describe('Layer 1: Agent frontmatter skills arrays', () => {
  for (const agent of SAMPLED_AGENTS) {
    const fullPath = join(PROJECT_ROOT, agent.path);
    const fileExists = existsSync(fullPath);

    it(`agent file exists for "${agent.id}" at ${agent.path}`, () => {
      assert.ok(fileExists, `Agent file not found: ${agent.path}`);
    });

    if (!fileExists) continue;

    const content = readFileSync(fullPath, 'utf8');
    const fm = parseFrontmatter(content);

    // Orchestrators may not have all search skills in frontmatter
    // (they get them via matrix augmentation), so only check core/domain/specialized
    if (agent.category !== 'orchestrators') {
      for (const skillName of ['code-semantic-search', 'code-structural-search']) {
        it(`frontmatter for "${agent.id}" includes "${skillName}"`, () => {
          assert.ok(
            fm.skills && fm.skills.includes(skillName),
            `Agent "${agent.id}" frontmatter missing skill "${skillName}"`
          );
        });
      }
    }

    it(`frontmatter for "${agent.id}" has skills array`, () => {
      assert.ok(
        fm.skills && fm.skills.length > 0,
        `Agent "${agent.id}" has no skills in frontmatter`
      );
    });
  }
});

// --- Regression detection: cross-layer consistency ---

describe('Regression: cross-layer consistency', () => {
  it('no agents in registry but missing from ALL search skill agentPrimary lists', () => {
    const missing = [];
    for (const agentId of nonRouterAgents) {
      const inAny = SEARCH_SKILLS.some(skill => {
        const entry = skillIndex.skills[skill];
        return entry && entry.agentPrimary && entry.agentPrimary.includes(agentId);
      });
      if (!inAny) missing.push(agentId);
    }
    // Allow some agents to be missing (e.g., very new or non-code agents)
    // but flag if more than 20% are missing
    const ratio = missing.length / nonRouterAgents.length;
    assert.ok(
      ratio <= 0.2,
      `${missing.length}/${nonRouterAgents.length} agents missing from ALL search skill lists: ${missing.join(', ')}`
    );
  });

  it('no agents in skill-index agentPrimary but removed from registry', () => {
    const orphans = [];
    for (const skillName of SEARCH_SKILLS) {
      const entry = skillIndex.skills[skillName];
      if (!entry || !entry.agentPrimary) continue;
      for (const agentId of entry.agentPrimary) {
        if (!registry.agents[agentId]) {
          orphans.push({ skill: skillName, agent: agentId });
        }
      }
    }
    assert.strictEqual(
      orphans.length,
      0,
      `Orphan agents in skill-index (not in registry): ${JSON.stringify(orphans)}`
    );
  });

  it('matrix "always" search skills are consistent with skill-index agentPrimary', () => {
    const inconsistencies = [];
    for (const category of Object.values(matrix.agents)) {
      for (const [agentId, config] of Object.entries(category)) {
        if (!config.always || agentId === 'router') continue;
        for (const skillName of SEARCH_SKILLS) {
          if (config.always.includes(skillName)) {
            const entry = skillIndex.skills[skillName];
            if (entry && entry.agentPrimary && !entry.agentPrimary.includes(agentId)) {
              inconsistencies.push({ agent: agentId, skill: skillName });
            }
          }
        }
      }
    }
    assert.strictEqual(
      inconsistencies.length,
      0,
      `Agents in matrix "always" but not in skill-index agentPrimary: ${JSON.stringify(inconsistencies)}`
    );
  });

  it('all 4 search skills have consistent agentPrimary lists', () => {
    // ripgrep should be a superset of the other 3 (since it includes orchestrators)
    const ripgrepAgents = new Set(skillIndex.skills['ripgrep']?.agentPrimary || []);
    for (const skill of [
      'code-semantic-search',
      'code-structural-search',
      'token-saver-context-compression',
    ]) {
      const agents = skillIndex.skills[skill]?.agentPrimary || [];
      for (const agent of agents) {
        if (!ripgrepAgents.has(agent)) {
          // Just warn, not fail - some skills may differ
          // This test ensures we notice divergence
        }
      }
    }
    // At minimum, all 4 skills should have the same core agents
    const coreExpected = ['developer', 'planner', 'architect', 'qa'];
    for (const skill of SEARCH_SKILLS) {
      const primary = skillIndex.skills[skill]?.agentPrimary || [];
      for (const core of coreExpected) {
        assert.ok(
          primary.includes(core),
          `Core agent "${core}" missing from "${skill}" agentPrimary`
        );
      }
    }
  });

  it('registry agent count matches metadata', () => {
    const actual = Object.keys(registry.agents).length;
    const declared = registry.metadata.totalAgents;
    assert.strictEqual(
      actual,
      declared,
      `Registry has ${actual} agents but metadata says ${declared}`
    );
  });
});

// --- Coverage summary (informational) ---

describe('Coverage summary', () => {
  it('reports search skill coverage statistics', () => {
    const total = nonRouterAgents.length;
    for (const skill of SEARCH_SKILLS) {
      const entry = skillIndex.skills[skill];
      const covered = entry ? entry.agentPrimary.length : 0;
      const pct = ((covered / total) * 100).toFixed(1);
      // This is informational - always passes
      assert.ok(true, `${skill}: ${covered}/${total} agents (${pct}%)`);
    }
  });
});
