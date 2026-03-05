// tests/agents/agent-frontmatter-search-skills.test.cjs
// Validates agent .md frontmatter includes required search skills.
// TDD Red phase: tests should FAIL for agents missing search skills in frontmatter.
'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const AGENTS_DIR = path.join(ROOT, '.claude', 'agents');
const SKILLS_DIR = path.join(ROOT, '.claude', 'skills');
const REGISTRY_PATH = path.join(ROOT, '.claude', 'context', 'agent-registry.json');
const MATRIX_PATH = path.join(ROOT, '.claude', 'context', 'config', 'agent-skill-matrix.json');
const SUBDIRS = ['core', 'domain', 'specialized', 'orchestrators'];

// Agents exempt from search skill requirements entirely
const EXEMPT_AGENTS = new Set(['router.md', 'reflection-agent.md']);

// Non-code agents exempt from code-semantic-search and code-structural-search
const NON_CODE_AGENT_FILES = new Set([
  'router.md',
  'reflection-agent.md',
  'brand-guardian.md',
  'aso-specialist.md',
  'marketing-strategist.md',
  'feedback-synthesizer.md',
  'compliance-checker.md',
  'mobile-ux-reviewer.md',
]);

/**
 * Parse YAML frontmatter skills from agent .md content.
 * Returns array of skill names found in the skills: field.
 */
function extractFrontmatterSkills(content) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return [];
  const fm = fmMatch[1];
  const skills = [];
  const lines = fm.split('\n');
  let inSkills = false;
  for (const line of lines) {
    if (/^skills:\s*$/.test(line) || /^skills:\s*\[/.test(line)) {
      inSkills = true;
      // Handle inline array: skills: [a, b, c]
      const inline = line.match(/skills:\s*\[([^\]]*)\]/);
      if (inline) {
        skills.push(
          ...inline[1]
            .split(',')
            .map(s => s.trim().replace(/['"]/g, ''))
            .filter(Boolean)
        );
        inSkills = false;
      }
      continue;
    }
    if (inSkills) {
      if (/^\s+-\s+/.test(line) || /^\s+-\s*"/.test(line) || /^\s+-\s*'/.test(line)) {
        const skill = line
          .replace(/^\s+-\s+/, '')
          .replace(/^\s+-\s*/, '')
          .replace(/['"]/g, '')
          .trim();
        if (skill) skills.push(skill);
      } else if (/^\w/.test(line)) {
        inSkills = false;
      }
    }
  }
  return skills;
}

/**
 * Get all agent files across subdirectories.
 */
function getAllAgentFiles() {
  const agents = [];
  for (const subdir of SUBDIRS) {
    const dir = path.join(AGENTS_DIR, subdir);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    for (const f of files) {
      const content = fs.readFileSync(path.join(dir, f), 'utf8');
      const skills = extractFrontmatterSkills(content);
      agents.push({ filename: f, subdir, skills, hasSkillsFrontmatter: skills.length > 0 });
    }
  }
  return agents;
}

/**
 * Get all valid skill names from the skills directory.
 */
function getValidSkillNames() {
  if (!fs.existsSync(SKILLS_DIR)) return new Set();
  return new Set(
    fs.readdirSync(SKILLS_DIR).filter(d => {
      if (d.startsWith('_') || d.startsWith('.')) return false;
      const stat = fs.statSync(path.join(SKILLS_DIR, d));
      return stat.isDirectory();
    })
  );
}

let allAgents;
let validSkills;
let registry;
let matrix;

describe('Agent Frontmatter Search Skills Compliance', () => {
  before(() => {
    allAgents = getAllAgentFiles();
    validSkills = getValidSkillNames();
    registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    matrix = JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf8'));
    assert.ok(allAgents.length > 0, 'Should find agent .md files');
    assert.ok(validSkills.size > 0, 'Should find skill directories');
  });

  describe('1. All agent .md files with skills: frontmatter include ripgrep', () => {
    it('should have ripgrep in frontmatter for non-exempt agents', () => {
      const missing = allAgents
        .filter(a => !EXEMPT_AGENTS.has(a.filename))
        .filter(a => a.hasSkillsFrontmatter)
        .filter(a => !a.skills.includes('ripgrep'));
      assert.strictEqual(
        missing.length,
        0,
        `Agents with skills: frontmatter missing ripgrep: ${missing.map(a => `${a.subdir}/${a.filename}`).join(', ')}`
      );
    });
  });

  describe('2. Code-focused agents include code-semantic-search in frontmatter', () => {
    it('should have code-semantic-search for code-focused agents', () => {
      const missing = allAgents
        .filter(a => !NON_CODE_AGENT_FILES.has(a.filename))
        .filter(a => a.hasSkillsFrontmatter)
        .filter(a => !a.skills.includes('code-semantic-search'));
      assert.strictEqual(
        missing.length,
        0,
        `Code-focused agents missing code-semantic-search in frontmatter: ${missing.map(a => `${a.subdir}/${a.filename}`).join(', ')}`
      );
    });
  });

  describe('3. Code-focused agents include code-structural-search in frontmatter', () => {
    it('should have code-structural-search for code-focused agents', () => {
      const missing = allAgents
        .filter(a => !NON_CODE_AGENT_FILES.has(a.filename))
        .filter(a => a.hasSkillsFrontmatter)
        .filter(a => !a.skills.includes('code-structural-search'));
      assert.strictEqual(
        missing.length,
        0,
        `Code-focused agents missing code-structural-search in frontmatter: ${missing.map(a => `${a.subdir}/${a.filename}`).join(', ')}`
      );
    });
  });

  describe('4. No agent frontmatter references non-existent skills', () => {
    it('should only reference skills that exist in the skills directory', () => {
      const invalid = [];
      for (const agent of allAgents) {
        if (!agent.hasSkillsFrontmatter) continue;
        for (const skill of agent.skills) {
          if (!validSkills.has(skill)) {
            invalid.push(`${agent.subdir}/${agent.filename}: "${skill}"`);
          }
        }
      }
      assert.strictEqual(
        invalid.length,
        0,
        `Agents referencing non-existent skills: ${invalid.join('; ')}`
      );
    });
  });

  describe('5. All registry agents exist in skill matrix', () => {
    it('should find every registry agent in the matrix', () => {
      const exempt = ['router'];
      const matrixAgentNames = new Set();
      for (const category of Object.values(matrix.agents)) {
        for (const name of Object.keys(category)) {
          matrixAgentNames.add(name);
        }
      }
      const missing = [];
      for (const agent of Object.keys(registry.agents || {})) {
        if (exempt.includes(agent)) continue;
        if (!matrixAgentNames.has(agent)) missing.push(agent);
      }
      assert.strictEqual(
        missing.length,
        0,
        `Registry agents missing from skill matrix: ${missing.join(', ')}`
      );
    });
  });
});
