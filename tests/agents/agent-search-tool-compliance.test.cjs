'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../');

const PHASE_1 = [
  { name: 'developer', file: '.claude/agents/core/developer.md' },
  { name: 'qa', file: '.claude/agents/core/qa.md' },
  { name: 'architect', file: '.claude/agents/core/architect.md' },
  { name: 'planner', file: '.claude/agents/core/planner.md' },
  { name: 'context-compressor', file: '.claude/agents/core/context-compressor.md' },
  { name: 'technical-writer', file: '.claude/agents/core/technical-writer.md' },
  { name: 'code-reviewer', file: '.claude/agents/specialized/code-reviewer.md' },
  { name: 'code-simplifier', file: '.claude/agents/specialized/code-simplifier.md' },
  { name: 'devops', file: '.claude/agents/specialized/devops.md' },
  { name: 'devops-troubleshooter', file: '.claude/agents/specialized/devops-troubleshooter.md' },
  { name: 'security-architect', file: '.claude/agents/specialized/security-architect.md' },
  { name: 'database-architect', file: '.claude/agents/specialized/database-architect.md' },
  { name: 'incident-responder', file: '.claude/agents/specialized/incident-responder.md' },
];

const REQUIRED_SKILLS = [
  'ripgrep',
  'code-semantic-search',
  'code-structural-search',
  'token-saver-context-compression',
];

// Parse skills from YAML frontmatter
function parseFrontmatterSkills(content) {
  const m = content.match(/^---\n([\s\S]+?)\n---/);
  if (!m) return [];
  const skills = [];
  let inSkills = false;
  for (const line of m[1].split('\n')) {
    if (/^skills:/.test(line)) { inSkills = true; continue; }
    if (inSkills && /^\S/.test(line)) break;
    if (inSkills) {
      const sm = line.match(/^\s+- (.+)/);
      if (sm) skills.push(sm[1].trim());
    }
  }
  return skills;
}

describe('Phase 1 Agent Search Tool Compliance', () => {
  describe('Frontmatter skills', () => {
    for (const agent of PHASE_1) {
      const content = fs.readFileSync(path.join(ROOT, agent.file), 'utf8');
      const skills = parseFrontmatterSkills(content);
      for (const req of REQUIRED_SKILLS) {
        it(`${agent.name} has ${req} in frontmatter`, () => {
          assert.ok(skills.includes(req), `Missing '${req}'. Found: ${skills.join(', ')}`);
        });
      }
    }
  });

  describe('Agent skill matrix', () => {
    const matrix = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude/context/config/agent-skill-matrix.json'), 'utf8'));
    for (const agent of PHASE_1) {
      for (const cat of Object.values(matrix.agents)) {
        if (!cat[agent.name]) continue;
        const always = cat[agent.name].always || [];
        for (const req of REQUIRED_SKILLS) {
          it(`${agent.name} has ${req} in matrix always`, () => {
            assert.ok(always.includes(req), `Missing '${req}' in always. Found: ${always.join(', ')}`);
          });
        }
      }
    }
  });

  describe('Agent registry', () => {
    const registry = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude/context/agent-registry.json'), 'utf8'));
    // registry.agents is keyed by agent name (object map), not an array
    const agentsMap = registry.agents || {};
    for (const agent of PHASE_1) {
      const entry = agentsMap[agent.name];
      if (!entry) continue;
      // Skills may be on the entry directly or in capabilities[0].skills
      const cap0 = (entry.capabilities || [])[0] || {};
      const allSkills = new Set([
        ...(entry.skills || []),
        ...(entry.alwaysSkills || []),
        ...(entry.primarySkills || []),
        ...(entry.secondarySkills || []),
        ...(cap0.skills || []),
      ]);
      for (const req of REQUIRED_SKILLS) {
        it(`${agent.name} has ${req} in registry`, () => {
          assert.ok(allSkills.has(req), `Missing '${req}' in registry. Found: ${[...allSkills].join(', ')}`);
        });
      }
    }
  });
});
