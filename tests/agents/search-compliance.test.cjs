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

/**
 * Check if an agent has the search-compliance-exempt comment.
 * Agents with this comment are skipped for body-text anti-pattern checks.
 */
function isExempt(content) {
  return content.includes('<!-- search-compliance-exempt -->');
}

/**
 * Extract the body text after frontmatter (everything after the closing ---).
 */
function extractBody(content) {
  const fmEnd = content.indexOf('---', content.indexOf('---') + 3);
  if (fmEnd === -1) return content;
  return content.slice(fmEnd + 3);
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
      if (isExempt(agent.content)) continue;
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
      if (isExempt(agent.content)) continue;
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

describe('No Raw Grep/Glob Tool Calls as Primary Search in Agents', () => {
  const agents = getAllAgents();

  it('no agent has Grep() call examples without fallback context', () => {
    const violations = [];
    for (const agent of agents) {
      if (isExempt(agent.content)) continue;
      // Match Grep({ or Grep( as tool call examples in prompt body
      const body = extractBody(agent.content);
      const grepCalls = body.match(/Grep\s*\(\s*\{/g);
      if (!grepCalls) continue;
      // Check if fallback/alternative qualifier exists nearby
      const hasFallback = /fallback|FALLBACK|last.resort|advanced.regex|PCRE/i.test(body);
      if (!hasFallback) {
        violations.push(`${agent.subdir}/${agent.name}`);
      }
    }
    assert.deepStrictEqual(
      violations,
      [],
      `Agents with raw Grep() examples without fallback context: ${violations.join(', ')}`
    );
  });

  it('no agent has Glob() call examples as primary discovery method', () => {
    const violations = [];
    for (const agent of agents) {
      if (isExempt(agent.content)) continue;
      const body = extractBody(agent.content);
      const globCalls = body.match(/Glob\s*\(\s*\{/g);
      if (!globCalls) continue;
      // Check if the agent also mentions search skills
      const hasSearchSkillRef =
        body.includes('ripgrep') ||
        body.includes('search:code') ||
        body.includes('code-semantic-search');
      if (!hasSearchSkillRef) {
        violations.push(`${agent.subdir}/${agent.name}`);
      }
    }
    assert.deepStrictEqual(
      violations,
      [],
      `Agents with Glob() as primary discovery without search skill refs: ${violations.join(', ')}`
    );
  });
});

describe('No Direct Memory File Edits in Agent Prompts', () => {
  const agents = getAllAgents();
  // Files that should be edited via MemoryRecord, not Edit/Write
  const GUARDED_MEMORY_FILES = [
    'learnings.md',
    'decisions.md',
    'issues.md',
    'patterns.json',
    'gotchas.json',
    'open-findings.json',
    'access-stats.json',
  ];

  it('no agent has Edit() examples targeting guarded memory files', () => {
    const violations = [];
    for (const agent of agents) {
      if (isExempt(agent.content)) continue;
      const body = extractBody(agent.content);
      for (const file of GUARDED_MEMORY_FILES) {
        // Match Edit('...learnings.md' or Edit("...learnings.md" patterns
        const editPattern = new RegExp(
          `Edit\\s*\\(\\s*['"\`][^'"\`]*${file.replace('.', '\\.')}`,
          'i'
        );
        if (editPattern.test(body)) {
          violations.push(`${agent.subdir}/${agent.name} (Edit ${file})`);
        }
        // Match Write('...learnings.md' patterns
        const writePattern = new RegExp(
          `Write\\s*\\(\\s*['"\`][^'"\`]*${file.replace('.', '\\.')}`,
          'i'
        );
        if (writePattern.test(body)) {
          violations.push(`${agent.subdir}/${agent.name} (Write ${file})`);
        }
      }
    }
    assert.deepStrictEqual(
      violations,
      [],
      `Agents with direct Edit/Write to guarded memory files: ${violations.join(', ')}`
    );
  });
});

describe('Orchestrator Search Skill References', () => {
  const orchestrators = getAgentFiles('orchestrators');

  it('orchestrator directory has files', () => {
    assert.ok(orchestrators.length > 0, 'Expected orchestrator agent files');
  });

  for (const orch of orchestrators) {
    if (isExempt(orch.content)) continue;

    it(`orchestrators/${orch.name} references a search skill or search:code`, () => {
      const hasRef =
        orch.content.includes('ripgrep') ||
        orch.content.includes('search:code') ||
        orch.content.includes('code-semantic-search') ||
        orch.content.includes('code-structural-search') ||
        orch.content.includes('hybrid search') ||
        orch.content.includes('Search-First') ||
        orch.content.includes('pnpm search');
      assert.ok(hasRef, `${orch.name} has no reference to search skills or search:code`);
    });
  }

  it('no orchestrator uses raw Grep/Glob as primary search pattern', () => {
    const violations = [];
    for (const orch of orchestrators) {
      if (isExempt(orch.content)) continue;
      const body = extractBody(orch.content);
      // Check for Grep({...}) patterns that appear as primary usage
      const grepCallCount = (body.match(/Grep\s*\(\s*\{/g) || []).length;
      const skillRefCount = (body.match(/ripgrep|search:code|code-semantic|code-structural/g) || [])
        .length;
      // If there are more Grep calls than search skill references, flag it
      if (grepCallCount > 0 && skillRefCount === 0) {
        violations.push(`orchestrators/${orch.name}`);
      }
    }
    assert.deepStrictEqual(
      violations,
      [],
      `Orchestrators with raw Grep as primary search: ${violations.join(', ')}`
    );
  });
});

describe('Agents with Search Skills Should Use Skill Invocation Syntax', () => {
  const agents = getAllAgents();

  it('agents with ripgrep in frontmatter mention Skill invocation or pnpm search', () => {
    const violations = [];
    for (const agent of agents) {
      if (isExempt(agent.content)) continue;
      if (SEARCH_SKILL_EXEMPTIONS.has(agent.name)) continue;
      const skills = extractFrontmatterSkills(agent.content);
      if (!skills.includes('ripgrep')) continue;
      const body = extractBody(agent.content);
      const hasSkillCall =
        body.includes("Skill({ skill: 'ripgrep'") ||
        body.includes('Skill({ skill: "ripgrep"') ||
        body.includes('search:code') ||
        body.includes('pnpm search') ||
        body.includes('ripgrep skill') ||
        body.includes('Search-First') ||
        body.includes('Code Search Protocol') ||
        body.includes('hybrid search');
      if (!hasSkillCall) {
        violations.push(`${agent.subdir}/${agent.name}`);
      }
    }
    assert.deepStrictEqual(
      violations,
      [],
      `Agents with ripgrep in frontmatter but no Skill invocation or search ref: ${violations.join(', ')}`
    );
  });
});
