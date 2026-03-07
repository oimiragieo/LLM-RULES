// tests/agents/agent-tool-compliance.test.cjs
// Validates agent .md files follow search tool hierarchy, memory tool, and skill matrix rules.
'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const AGENTS_DIR = path.join(ROOT, '.claude', 'agents');
const MATRIX_PATH = path.join(ROOT, '.claude', 'config', 'agent-skill-matrix.json');
const MATRIX_PATH_ALT = path.join(ROOT, '.claude', 'context', 'config', 'agent-skill-matrix.json');
const SUBDIRS = ['core', 'domain', 'specialized', 'orchestrators'];

// Router is exempt from most checks (it delegates, never executes)
const ROUTER_FILE = 'router.md';

// Core agents that MUST have MemoryRecord
const CORE_MEMORY_AGENTS = new Set([
  'developer',
  'planner',
  'architect',
  'qa',
  'reflection-agent',
]);

// Heavy-context agents that should have token-saver-context-compression
const HEAVY_CONTEXT_AGENTS = new Set([
  'master-orchestrator',
  'evolution-orchestrator',
  'artifact-integrator',
  'swarm-coordinator',
  'party-orchestrator',
  'architect',
  'planner',
  'researcher',
  'code-reviewer',
  'security-architect',
  'advanced-debugging',
]);

// Preferred search tool references (at least one should be mentioned)
// Prefixed with _ to satisfy no-unused-vars (constant kept for documentation value)
const _PREFERRED_SEARCH_REFS = [
  'pnpm search:code',
  "Skill({ skill: 'ripgrep'",
  'Skill({ skill: "ripgrep"',
  'code-semantic-search',
  'code-structural-search',
  'ripgrep',
  'search:code',
];

/**
 * Parse YAML frontmatter from an agent .md file.
 * Returns { frontmatter, body, content, tools, skills, name }.
 */
function parseAgentFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  const frontmatter = fmMatch ? fmMatch[1] : '';
  const body = fmMatch ? content.slice(fmMatch[0].length) : content;

  const tools = extractList(frontmatter, 'tools');
  const skills = extractList(frontmatter, 'skills');
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  const name = nameMatch ? nameMatch[1].trim().replace(/['"]/g, '') : path.basename(filePath, '.md');

  return { frontmatter, body, content, tools, skills, name };
}

/**
 * Extract a YAML list field (tools: or skills:) from frontmatter text.
 * Handles both dash-list and bracket-array formats.
 */
function extractList(fm, fieldName) {
  const items = [];
  const lines = fm.split('\n');
  let inField = false;
  const fieldRegex = new RegExp(`^${fieldName}:\\s*`);

  for (const line of lines) {
    if (fieldRegex.test(line)) {
      inField = true;
      // Handle inline bracket array: tools: [Read, Write, Edit]
      const bracketMatch = line.match(new RegExp(`${fieldName}:\\s*\\[([^\\]]*)\\]`));
      if (bracketMatch) {
        items.push(
          ...bracketMatch[1]
            .split(',')
            .map(s => s.trim().replace(/['"]/g, ''))
            .filter(Boolean)
        );
        inField = false;
      }
      continue;
    }
    if (inField) {
      // Multi-line bracket array (tools: [\n  Read,\n  Write,\n])
      if (/^\s*\[/.test(line)) continue;
      if (/^\s*\]/.test(line) || /\]/.test(line)) {
        // Extract any items before the closing bracket
        const beforeBracket = line.replace(/\].*/, '').trim();
        if (beforeBracket) {
          items.push(
            ...beforeBracket
              .split(',')
              .map(s => s.trim().replace(/['"]/g, '').replace(/^\s*-\s*/, ''))
              .filter(Boolean)
          );
        }
        inField = false;
        continue;
      }
      // Dash-list items: - Read
      if (/^\s+-\s+/.test(line) || /^\s+-\s*"/.test(line) || /^\s+-\s*'/.test(line)) {
        const item = line
          .replace(/^\s+-\s+/, '')
          .replace(/^\s+-\s*/, '')
          .replace(/['"]/g, '')
          .replace(/,\s*$/, '')
          .trim();
        if (item) items.push(item);
      } else if (/^\s+\w/.test(line)) {
        // Comma-separated items in bracket array continuation
        items.push(
          ...line
            .split(',')
            .map(s => s.trim().replace(/['"]/g, ''))
            .filter(Boolean)
        );
      } else if (/^\w/.test(line)) {
        // New top-level field — stop
        inField = false;
      }
    }
  }
  return items;
}

/**
 * Get all agent .md files (excluding router).
 */
function getAllAgentFiles() {
  const files = [];
  for (const subdir of SUBDIRS) {
    const dir = path.join(AGENTS_DIR, subdir);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.md')) continue;
      if (f === ROUTER_FILE) continue;
      const filePath = path.join(dir, f);
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) continue;
      const parsed = parseAgentFile(filePath);
      files.push({ filename: f, subdir, path: filePath, ...parsed });
    }
  }
  return files;
}

let agents;
let matrix;

describe('Agent Tool Compliance', () => {
  before(() => {
    agents = getAllAgentFiles();
    assert.ok(agents.length > 0, 'Should find agent .md files');

    // Load skill matrix from either path
    const matrixFile = fs.existsSync(MATRIX_PATH) ? MATRIX_PATH : MATRIX_PATH_ALT;
    assert.ok(fs.existsSync(matrixFile), 'Agent skill matrix file should exist');
    matrix = JSON.parse(fs.readFileSync(matrixFile, 'utf-8'));
  });

  describe('1. Search Protocol: agents with Grep/Glob must mention preferred search', () => {
    it('agents with Grep or Glob in tools should also reference preferred search tools', () => {
      const violations = [];

      for (const agent of agents) {
        const hasGrep = agent.tools.includes('Grep');
        const hasGlob = agent.tools.includes('Glob');
        if (!hasGrep && !hasGlob) continue;

        // Check if agent has at least one preferred search skill in frontmatter
        const hasPreferredSkill = agent.skills.some(
          s => s === 'ripgrep' || s === 'code-semantic-search' || s === 'code-structural-search'
        );

        if (!hasPreferredSkill) {
          violations.push(`${agent.subdir}/${agent.filename} has Grep/Glob but no preferred search skill`);
        }
      }

      assert.strictEqual(
        violations.length,
        0,
        `Agents with Grep/Glob missing preferred search skills:\n  ${violations.join('\n  ')}`
      );
    });
  });

  describe('2. Grep Fallback: Grep should not be described as primary search', () => {
    it('agents mentioning Grep in body should describe it as fallback, not primary', () => {
      const violations = [];
      // Patterns that suggest Grep is positioned as primary search
      const primaryPatterns = [
        /use\s+grep\s+(as|for)\s+(your\s+)?primary/i,
        /grep\s+is\s+(the\s+)?primary/i,
        /always\s+use\s+grep\s+first/i,
        /start\s+with\s+grep/i,
      ];
      // Patterns that indicate correct fallback positioning
      const fallbackPatterns = [/fallback/i, /last\s+resort/i, /advanced\s+regex/i, /single-file/i];

      for (const agent of agents) {
        // Only check agents that mention Grep prominently in body
        const grepMentionCount = (agent.body.match(/\bGrep\b/g) || []).length;
        if (grepMentionCount < 2) continue;

        const hasPrimaryPattern = primaryPatterns.some(p => p.test(agent.body));
        const hasFallbackPattern = fallbackPatterns.some(p => p.test(agent.body));

        if (hasPrimaryPattern && !hasFallbackPattern) {
          violations.push(`${agent.subdir}/${agent.filename} positions Grep as primary search tool`);
        }
      }

      assert.strictEqual(
        violations.length,
        0,
        `Agents positioning Grep as primary search:\n  ${violations.join('\n  ')}`
      );
    });
  });

  describe('3. Token-Saver: heavy-context agents should have token-saver skill', () => {
    it('orchestrators and heavy-analysis agents should list token-saver-context-compression', () => {
      const violations = [];

      for (const agent of agents) {
        if (!HEAVY_CONTEXT_AGENTS.has(agent.name)) continue;
        if (!agent.skills.includes('token-saver-context-compression')) {
          violations.push(`${agent.subdir}/${agent.filename} (${agent.name}) missing token-saver-context-compression`);
        }
      }

      assert.strictEqual(
        violations.length,
        0,
        `Heavy-context agents missing token-saver-context-compression:\n  ${violations.join('\n  ')}`
      );
    });
  });

  describe('4. Memory Tool: core agents must have MemoryRecord in tools', () => {
    it('core agents (developer, planner, architect, qa, reflection-agent) must list MemoryRecord', () => {
      const violations = [];

      for (const agent of agents) {
        if (!CORE_MEMORY_AGENTS.has(agent.name)) continue;
        if (!agent.tools.includes('MemoryRecord')) {
          violations.push(`${agent.subdir}/${agent.filename} (${agent.name}) missing MemoryRecord in tools`);
        }
      }

      assert.strictEqual(
        violations.length,
        0,
        `Core agents missing MemoryRecord tool:\n  ${violations.join('\n  ')}`
      );
    });
  });

  describe('5. Ripgrep Skill: all agents (except router) should have ripgrep', () => {
    it('all agents with a skills array should include ripgrep', () => {
      const violations = [];

      for (const agent of agents) {
        // Skip agents without any skills frontmatter
        if (agent.skills.length === 0) continue;
        if (!agent.skills.includes('ripgrep')) {
          violations.push(`${agent.subdir}/${agent.filename} (${agent.name}) missing ripgrep in skills`);
        }
      }

      assert.strictEqual(
        violations.length,
        0,
        `Agents missing ripgrep skill:\n  ${violations.join('\n  ')}`
      );
    });
  });

  describe('6. Skill Matrix: all agents should have an entry in agent-skill-matrix.json', () => {
    it('every agent .md file should map to an entry in the skill matrix', () => {
      const matrixAgentNames = new Set();
      for (const category of Object.values(matrix.agents)) {
        if (typeof category !== 'object' || category === null) continue;
        for (const name of Object.keys(category)) {
          matrixAgentNames.add(name);
        }
      }

      const violations = [];
      for (const agent of agents) {
        if (!matrixAgentNames.has(agent.name)) {
          violations.push(`${agent.subdir}/${agent.filename} (${agent.name}) not in agent-skill-matrix.json`);
        }
      }

      assert.strictEqual(
        violations.length,
        0,
        `Agents missing from skill matrix:\n  ${violations.join('\n  ')}`
      );
    });
  });
});
