// tests/agents/search-compliance.test.cjs
// Verifies that all agents have search skills wired and search-first
// instructions in place after Phase 1-3 wiring (commit 7197fa60).

'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const AGENTS_DIR = path.join(ROOT, '.claude', 'agents');
const TEMPLATES_DIR = path.join(ROOT, '.claude', 'templates', 'spawn');
const CLAUDE_MD = path.join(ROOT, '.claude', 'CLAUDE.md');
const CODE_STANDARDS = path.join(ROOT, '.claude', 'rules', 'code-standards.md');

const SEARCH_SKILLS = ['ripgrep', 'code-semantic-search', 'code-structural-search'];
const SUBDIRS = ['core', 'specialized', 'domain', 'orchestrators'];

// Agents that are exempt from search skill requirements (router, reflection, etc.)
const SEARCH_SKILL_EXEMPTIONS = new Set(['router.md', 'reflection-agent.md']);

// Agents exempt from Code Search Protocol body section
const PROTOCOL_EXEMPTIONS = new Set(['router.md']);

function getAgentFiles(subdir) {
  const dir = path.join(AGENTS_DIR, subdir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const content = fs.readFileSync(path.join(dir, f), 'utf8');
      return { name: f, subdir, content };
    });
}

function getAllAgents() {
  return SUBDIRS.flatMap(d => getAgentFiles(d));
}

function extractFrontmatterSkills(content) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return [];
  const fm = fmMatch[1];
  const skills = [];
  const lines = fm.split('\n');
  let inSkills = false;
  for (const line of lines) {
    if (/^skills:/.test(line)) {
      inSkills = true;
      continue;
    }
    if (inSkills && /^\s+-\s+/.test(line)) {
      skills.push(line.replace(/^\s+-\s+/, '').trim());
    } else if (inSkills && !/^\s+/.test(line) && line.trim() !== '') {
      inSkills = false;
    }
  }
  return skills;
}

describe('Agent Search Skill Wiring', () => {
  const agents = getAllAgents();

  it('agent directory contains files to test', () => {
    assert.ok(agents.length > 0, 'Expected at least one agent file to exist');
  });

  for (const agent of agents) {
    if (SEARCH_SKILL_EXEMPTIONS.has(agent.name)) continue;

    it(`${agent.subdir}/${agent.name} has at least one search skill`, () => {
      const skills = extractFrontmatterSkills(agent.content);
      const hasSearch = skills.some(s => SEARCH_SKILLS.some(ss => s.includes(ss)));
      assert.ok(hasSearch, `${agent.name} missing search skills. Has: [${skills.join(', ')}]`);
    });
  }
});

describe('Agent Search-First Instructions', () => {
  const agents = getAllAgents();

  for (const agent of agents) {
    if (PROTOCOL_EXEMPTIONS.has(agent.name)) continue;

    it(`${agent.subdir}/${agent.name} references search or hybrid search`, () => {
      const hasSearchRef =
        agent.content.includes('Code Search Protocol') ||
        agent.content.includes('Search-First') ||
        agent.content.includes('search:code') ||
        agent.content.includes('ripgrep') ||
        agent.content.includes('hybrid search') ||
        agent.content.includes('pnpm search');
      assert.ok(
        hasSearchRef,
        `${agent.name} has no search-first reference (Code Search Protocol, ripgrep, search:code)`
      );
    });
  }
});

describe('Spawn Template Search-First', () => {
  let template;

  before(() => {
    template = fs.readFileSync(path.join(TEMPLATES_DIR, 'universal-agent-spawn.md'), 'utf8');
  });

  it('contains Search-First Protocol section', () => {
    assert.ok(
      template.includes('Search-First Protocol'),
      'universal-agent-spawn.md missing Search-First Protocol section'
    );
  });

  it('mentions pnpm search:code', () => {
    assert.ok(
      template.includes('pnpm search:code'),
      'universal-agent-spawn.md should mention pnpm search:code'
    );
  });

  it('mentions ripgrep skill', () => {
    assert.ok(template.includes('ripgrep'), 'universal-agent-spawn.md should mention ripgrep');
  });

  it('says Grep is fallback only', () => {
    assert.match(
      template,
      /[Gg]rep\b.*(?:fallback|FALLBACK|only|ONLY)|(?:fallback|FALLBACK|only|ONLY).*[Gg]rep\b/i,
      'universal-agent-spawn.md should indicate Grep is fallback-only'
    );
  });
});

describe('CLAUDE.md Search Status', () => {
  let claudeMd;

  before(() => {
    claudeMd = fs.readFileSync(CLAUDE_MD, 'utf8');
  });

  it('reports 63 agents with search skills', () => {
    assert.ok(
      claudeMd.includes('63 agents'),
      'CLAUDE.md should report 63 agents with search skills'
    );
  });

  it('Phase 2 marked COMPLETE', () => {
    assert.match(claudeMd, /Phase 2[^\n]*COMPLETE/, 'CLAUDE.md should mark Phase 2 as COMPLETE');
  });

  it('Phase 3 marked COMPLETE', () => {
    assert.match(claudeMd, /Phase 3[^\n]*COMPLETE/, 'CLAUDE.md should mark Phase 3 as COMPLETE');
  });

  it('has search telemetry enforcement note', () => {
    assert.ok(
      claudeMd.includes('search-telemetry.jsonl'),
      'CLAUDE.md should reference search-telemetry.jsonl'
    );
  });
});

describe('Code Standards Search Enforcement', () => {
  let standards;

  before(() => {
    standards = fs.readFileSync(CODE_STANDARDS, 'utf8');
  });

  it('has MANDATORY enforcement language', () => {
    assert.ok(
      standards.includes('MANDATORY'),
      'code-standards.md should include MANDATORY enforcement language'
    );
  });

  it('mentions pnpm search:code', () => {
    assert.ok(
      standards.includes('pnpm search:code'),
      'code-standards.md should mention pnpm search:code'
    );
  });

  it('mentions ripgrep', () => {
    assert.ok(standards.includes('ripgrep'), 'code-standards.md should mention ripgrep');
  });

  it('mentions code-semantic-search', () => {
    assert.ok(
      standards.includes('code-semantic-search'),
      'code-standards.md should mention code-semantic-search'
    );
  });

  it('mentions code-structural-search', () => {
    assert.ok(
      standards.includes('code-structural-search'),
      'code-standards.md should mention code-structural-search'
    );
  });

  it('marks Grep as fallback', () => {
    assert.match(
      standards,
      /[Gg]rep\b.*(?:FALLBACK|fallback)|(?:FALLBACK|fallback).*[Gg]rep\b/i,
      'code-standards.md should mark Grep as FALLBACK'
    );
  });

  it('has Anti-Pattern warning', () => {
    assert.ok(
      standards.includes('Anti-Pattern') || standards.includes('anti-pattern'),
      'code-standards.md should include Anti-Pattern warning about Grep-first usage'
    );
  });
});

describe('No Grep-First Language in Agents', () => {
  const agents = getAllAgents();

  it('no agent uses "use Grep for code discovery" without fallback qualifier', () => {
    const violations = [];
    for (const agent of agents) {
      if (
        /use Grep (for|to) (code |codebase )?discover/i.test(agent.content) &&
        !/fallback/i.test(agent.content)
      ) {
        violations.push(`${agent.subdir}/${agent.name}`);
      }
    }
    assert.deepStrictEqual(
      violations,
      [],
      `Agents with unqualified Grep-first discovery language: ${violations.join(', ')}`
    );
  });

  it('no agent says "use Grep to search the codebase" as primary method', () => {
    const violations = [];
    for (const agent of agents) {
      if (
        /use Grep to search (the )?codebase/i.test(agent.content) &&
        !/fallback|after|prefer.*instead/i.test(agent.content)
      ) {
        violations.push(`${agent.subdir}/${agent.name}`);
      }
    }
    assert.deepStrictEqual(
      violations,
      [],
      `Agents with Grep-as-primary-search language: ${violations.join(', ')}`
    );
  });
});
