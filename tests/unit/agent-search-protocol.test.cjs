'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const AGENTS_DIR = path.join(PROJECT_ROOT, '.claude', 'agents');
const _CONFIG_DIR = path.join(PROJECT_ROOT, '.claude', 'config');

const CODE_FOCUSED_AGENTS = [
  'developer',
  'qa',
  'code-reviewer',
  'code-simplifier',
  'architect',
  'planner',
  'security-architect',
  'devops',
  'devops-troubleshooter',
  'database-architect',
  'incident-responder',
  'python-pro',
  'typescript-pro',
  'nodejs-pro',
  'golang-pro',
  'rust-pro',
  'java-pro',
  'php-pro',
  'nextjs-pro',
  'frontend-pro',
  'sveltekit-expert',
  'graphql-pro',
  'ios-pro',
  'android-pro',
  'expo-mobile-developer',
  'tauri-desktop-developer',
  'ai-ml-specialist',
  'web3-blockchain-expert',
  'gamedev-pro',
  'data-engineer',
  'fastapi-pro',
  'mcp-developer',
  'advanced-debugging',
  'penetration-tester',
  'performance-engineer',
  'reverse-engineer',
  'sre-engineer',
  'chaos-engineer',
  'accessibility-tester',
  'api-designer',
];

const ORCHESTRATOR_AGENTS = [
  'master-orchestrator',
  'evolution-orchestrator',
  'artifact-integrator',
  'party-orchestrator',
  'swarm-coordinator',
];

const SEARCH_SKILLS = ['ripgrep', 'code-semantic-search', 'code-structural-search'];

// --- Helpers ---

function _walkDir(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      results.push(..._walkDir(full));
    } else if (entry.endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

function parseFrontmatter(content) {
  const lines = content.split('\n');
  if (lines[0].trim() !== '---') return { skills: [], tools: [], name: '' };
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIdx = i;
      break;
    }
  }
  if (endIdx < 0) return { skills: [], tools: [], name: '' };
  const fmBlock = lines.slice(1, endIdx).join('\n');
  const result = { skills: [], tools: [], name: '' };
  // Extract name
  const nameMatch = fmBlock.match(/^name:\s*(.+)/m);
  if (nameMatch) result.name = nameMatch[1].trim();
  // Extract list fields (skills, tools) — supports YAML list and bracket formats
  for (const key of ['skills', 'tools']) {
    const listStart = fmBlock.match(new RegExp(`^${key}:\\s*$`, 'm'));
    const bracketMatch = fmBlock.match(new RegExp(`^${key}:\\s*\\[([\\s\\S]*?)\\]`, 'm'));
    if (bracketMatch) {
      // Bracket format: tools: [\n  Read,\n  Write,\n]
      result[key] = bracketMatch[1]
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);
    } else if (listStart) {
      // YAML list format: skills:\n  - item1\n  - item2
      const idx = fmBlock.indexOf(listStart[0]) + listStart[0].length;
      const rest = fmBlock.slice(idx).split('\n');
      for (const line of rest) {
        const m = line.match(/^\s+-\s+(.+)/);
        if (m) result[key].push(m[1].trim());
        else if (line.match(/^[a-zA-Z_]/)) break;
      }
    }
  }
  return result;
}

function findAgentFile(agentName) {
  const subdirs = ['core', 'domain', 'specialized', 'orchestrators'];
  for (const sub of subdirs) {
    const filePath = path.join(AGENTS_DIR, sub, `${agentName}.md`);
    if (fs.existsSync(filePath)) return filePath;
  }
  return null;
}

function loadJSON(relativePath) {
  const full = path.join(PROJECT_ROOT, relativePath);
  return JSON.parse(fs.readFileSync(full, 'utf-8'));
}

// --- Tests ---

describe('Agent Search Protocol — Frontmatter Skills', () => {
  for (const agent of CODE_FOCUSED_AGENTS) {
    it(`${agent} has ripgrep in frontmatter skills`, () => {
      const filePath = findAgentFile(agent);
      assert.ok(filePath, `Agent file not found: ${agent}`);
      const fm = parseFrontmatter(fs.readFileSync(filePath, 'utf-8'));
      assert.ok(fm.skills.includes('ripgrep'), `${agent} missing ripgrep in frontmatter skills`);
    });

    it(`${agent} has code-semantic-search in frontmatter skills`, () => {
      const filePath = findAgentFile(agent);
      assert.ok(filePath, `Agent file not found: ${agent}`);
      const fm = parseFrontmatter(fs.readFileSync(filePath, 'utf-8'));
      assert.ok(
        fm.skills.includes('code-semantic-search'),
        `${agent} missing code-semantic-search in frontmatter skills`
      );
    });

    it(`${agent} has code-structural-search in frontmatter skills`, () => {
      const filePath = findAgentFile(agent);
      assert.ok(filePath, `Agent file not found: ${agent}`);
      const fm = parseFrontmatter(fs.readFileSync(filePath, 'utf-8'));
      assert.ok(
        fm.skills.includes('code-structural-search'),
        `${agent} missing code-structural-search in frontmatter skills`
      );
    });

    it(`${agent} has token-saver-context-compression in frontmatter`, () => {
      const filePath = findAgentFile(agent);
      assert.ok(filePath, `Agent file not found: ${agent}`);
      const fm = parseFrontmatter(fs.readFileSync(filePath, 'utf-8'));
      assert.ok(
        fm.skills.includes('token-saver-context-compression'),
        `${agent} missing token-saver-context-compression`
      );
    });
  }
});

describe('Agent-Skill Matrix Consistency', () => {
  let matrix;
  before(() => {
    matrix = loadJSON('.claude/context/config/agent-skill-matrix.json');
  });

  it('matrix always-skills are superset of search skills for code agents', () => {
    const categories = Object.keys(matrix.agents || {});
    for (const cat of categories) {
      const agents = matrix.agents[cat];
      for (const [agentName, config] of Object.entries(agents)) {
        if (!CODE_FOCUSED_AGENTS.includes(agentName)) continue;
        const always = config.always || [];
        for (const skill of SEARCH_SKILLS) {
          assert.ok(
            always.includes(skill),
            `Matrix ${cat}/${agentName} missing ${skill} in always`
          );
        }
      }
    }
  });

  it('matrix agents with search skills also appear in frontmatter', () => {
    const categories = Object.keys(matrix.agents || {});
    const mismatches = [];
    for (const cat of categories) {
      const agents = matrix.agents[cat];
      for (const [agentName, config] of Object.entries(agents)) {
        const always = config.always || [];
        const hasSearchInMatrix = SEARCH_SKILLS.some(s => always.includes(s));
        if (!hasSearchInMatrix) continue;
        const filePath = findAgentFile(agentName);
        if (!filePath) continue;
        const fm = parseFrontmatter(fs.readFileSync(filePath, 'utf-8'));
        for (const skill of SEARCH_SKILLS) {
          if (always.includes(skill) && !fm.skills.includes(skill)) {
            mismatches.push(`${agentName}: ${skill} in matrix but not frontmatter`);
          }
        }
      }
    }
    if (mismatches.length > 0) {
      assert.fail(`Search skill mismatches:\n  ${mismatches.join('\n  ')}`);
    }
  });
});

describe('Skill-Index Tool Requirements', () => {
  let skillIndex;
  before(() => {
    skillIndex = loadJSON('.claude/config/skill-index.json');
  });

  for (const skillName of SEARCH_SKILLS) {
    it(`${skillName} exists in skill-index with requiredTools`, () => {
      const skill = skillIndex.skills[skillName];
      assert.ok(skill, `${skillName} missing from skill-index.json`);
      assert.ok(Array.isArray(skill.requiredTools), `${skillName} requiredTools not an array`);
      assert.ok(skill.requiredTools.length > 0, `${skillName} has empty requiredTools`);
    });
  }

  it('token-saver-context-compression exists in skill-index', () => {
    const skill = skillIndex.skills['token-saver-context-compression'];
    assert.ok(skill, 'token-saver-context-compression missing from skill-index');
    assert.ok(Array.isArray(skill.requiredTools), 'token-saver requiredTools not an array');
  });
});

describe('Search Protocol Body Sections', () => {
  for (const agent of CODE_FOCUSED_AGENTS) {
    it(`${agent} body mentions search protocol or hybrid search`, () => {
      const filePath = findAgentFile(agent);
      assert.ok(filePath, `Agent file not found: ${agent}`);
      const content = fs.readFileSync(filePath, 'utf-8');
      const hasSearchSection = /search protocol|hybrid search|code search/i.test(content);
      assert.ok(hasSearchSection, `${agent} body missing Search Protocol / Hybrid Search section`);
    });

    it(`${agent} body mentions pnpm search:code or ripgrep skill`, () => {
      const filePath = findAgentFile(agent);
      assert.ok(filePath, `Agent file not found: ${agent}`);
      const content = fs.readFileSync(filePath, 'utf-8');
      const mentionsSearch =
        content.includes('pnpm search:code') ||
        content.includes("skill: 'ripgrep'") ||
        content.includes('Skill({ skill: "ripgrep"') ||
        content.includes('ripgrep');
      assert.ok(mentionsSearch, `${agent} body does not mention pnpm search:code or ripgrep`);
    });

    it(`${agent} body mentions Grep as fallback`, () => {
      const filePath = findAgentFile(agent);
      assert.ok(filePath, `Agent file not found: ${agent}`);
      const content = fs.readFileSync(filePath, 'utf-8');
      const mentionsFallback =
        /grep.*(fallback|last.resort)/i.test(content) || /fallback.*(grep)/i.test(content);
      assert.ok(mentionsFallback, `${agent} body does not mention Grep as fallback`);
    });
  }
});

describe('Orchestrator Ripgrep Wiring', () => {
  for (const agent of ORCHESTRATOR_AGENTS) {
    it(`${agent} has ripgrep in frontmatter skills`, () => {
      const filePath = findAgentFile(agent);
      assert.ok(filePath, `Orchestrator file not found: ${agent}`);
      const fm = parseFrontmatter(fs.readFileSync(filePath, 'utf-8'));
      assert.ok(
        fm.skills.includes('ripgrep'),
        `Orchestrator ${agent} missing ripgrep in frontmatter`
      );
    });
  }
});

describe('Agent Tool Compatibility', () => {
  it('agents with ripgrep skill have Bash tool for execution', () => {
    const missing = [];
    for (const agent of [...CODE_FOCUSED_AGENTS, ...ORCHESTRATOR_AGENTS]) {
      const filePath = findAgentFile(agent);
      if (!filePath) continue;
      const fm = parseFrontmatter(fs.readFileSync(filePath, 'utf-8'));
      if (fm.skills.includes('ripgrep') && !fm.tools.includes('Bash')) {
        missing.push(agent);
      }
    }
    if (missing.length > 0) {
      assert.fail(`Agents with ripgrep but missing Bash tool: ${missing.join(', ')}`);
    }
  });

  it('agents with code-semantic-search have Bash tool', () => {
    const missing = [];
    for (const agent of CODE_FOCUSED_AGENTS) {
      const filePath = findAgentFile(agent);
      if (!filePath) continue;
      const fm = parseFrontmatter(fs.readFileSync(filePath, 'utf-8'));
      if (fm.skills.includes('code-semantic-search') && !fm.tools.includes('Bash')) {
        missing.push(agent);
      }
    }
    if (missing.length > 0) {
      assert.fail(`Agents with code-semantic-search but no Bash: ${missing.join(', ')}`);
    }
  });

  it('agents with code-structural-search have Bash tool', () => {
    const missing = [];
    for (const agent of CODE_FOCUSED_AGENTS) {
      const filePath = findAgentFile(agent);
      if (!filePath) continue;
      const fm = parseFrontmatter(fs.readFileSync(filePath, 'utf-8'));
      if (fm.skills.includes('code-structural-search') && !fm.tools.includes('Bash')) {
        missing.push(agent);
      }
    }
    if (missing.length > 0) {
      assert.fail(`Agents with code-structural-search but no Bash: ${missing.join(', ')}`);
    }
  });
});
