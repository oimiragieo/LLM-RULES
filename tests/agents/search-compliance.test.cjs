// tests/agents/search-compliance.test.cjs
// Comprehensive search compliance tests for agent tool usage.
// Verifies agents instruct correct search tool hierarchy, MemoryRecord presence,
// token-saver wiring, frontmatter validity, and router tool restrictions.
//
// Checks:
//   A: Search tool compliance (Grep in tools → must reference ripgrep/search:code/etc.)
//   B: MemoryRecord presence in core/domain/specialized agents
//   C: Token-saver wiring for agents with >5 skills
//   D: Frontmatter parseable (--- markers, name field, tools array)
//   Router: Only whitelisted tools

'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const AGENTS_DIR = path.join(ROOT, '.claude', 'agents');
const SUBDIRS = ['core', 'domain', 'specialized', 'orchestrators'];

// Lightweight agents exempt from MemoryRecord requirement (Check B)
const MEMORY_RECORD_EXEMPTIONS = new Set([
  'context-compressor',
  'conductor-validator',
  'c4-code',
  'c4-component',
  'c4-container',
  'c4-context',
  'general-assistant',
]);

// Router banned tools
const ROUTER_BANNED_TOOLS = new Set(['Edit', 'Write', 'Glob', 'Grep', 'WebSearch', 'WebFetch']);

// Search-related references that satisfy Check A
const SEARCH_REFERENCES = ['ripgrep', 'pnpm search:code', 'code-semantic-search', 'lsp-navigator'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract YAML frontmatter text between --- markers.
 * Returns null if no valid frontmatter found.
 */
function extractFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  return match ? match[1] : null;
}

/**
 * Extract the body text after frontmatter.
 */
function extractBody(content) {
  const fmEnd = content.indexOf('---', content.indexOf('---') + 3);
  if (fmEnd === -1) return content;
  return content.slice(fmEnd + 3);
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
      if (/^\s*\[/.test(line)) continue;
      if (/^\s*\]/.test(line) || /\]/.test(line)) {
        const beforeBracket = line.replace(/\].*/, '').trim();
        if (beforeBracket) {
          items.push(
            ...beforeBracket
              .split(',')
              .map(s =>
                s
                  .trim()
                  .replace(/['"]/g, '')
                  .replace(/^\s*-\s*/, '')
              )
              .filter(Boolean)
          );
        }
        inField = false;
        continue;
      }
      // Dash-list items: - Read
      if (/^\s+-\s+/.test(line) || /^\s+-\s*["']/.test(line)) {
        const item = line
          .replace(/^\s+-\s+/, '')
          .replace(/^\s+-\s*/, '')
          .replace(/['"]/g, '')
          .replace(/,\s*$/, '')
          .trim();
        if (item) items.push(item);
      } else if (/^\s+\w/.test(line)) {
        // Comma-separated continuation
        items.push(
          ...line
            .split(',')
            .map(s => s.trim().replace(/['"]/g, ''))
            .filter(Boolean)
        );
      } else if (/^\w/.test(line)) {
        inField = false;
      }
    }
  }
  return items;
}

/**
 * Extract the name field from frontmatter.
 */
function extractName(fm) {
  const match = fm.match(/^name:\s*(.+)$/m);
  return match ? match[1].trim().replace(/['"]/g, '') : null;
}

/**
 * Parse an agent file into a structured object.
 */
function parseAgent(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fm = extractFrontmatter(content);
  const tools = fm ? extractList(fm, 'tools') : [];
  const skills = fm ? extractList(fm, 'skills') : [];
  const name = fm ? extractName(fm) : path.basename(filePath, '.md');
  const body = extractBody(content);
  return { content, fm, tools, skills, name, body, filePath };
}

/**
 * Load all agent files from all subdirectories.
 */
function loadAllAgents() {
  const agents = [];
  for (const subdir of SUBDIRS) {
    const dir = path.join(AGENTS_DIR, subdir);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const filePath = path.join(dir, file);
      if (!fs.statSync(filePath).isFile()) continue;
      const agent = parseAgent(filePath);
      agents.push({ ...agent, subdir, filename: file });
    }
  }
  return agents;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let allAgents;

before(() => {
  allAgents = loadAllAgents();
});

describe('Check D: Frontmatter parseable', () => {
  it('found agent files to test', () => {
    assert.ok(allAgents.length > 0, 'Expected at least one agent file');
  });

  for (const subdir of SUBDIRS) {
    it(`all ${subdir}/ agents have valid YAML frontmatter with --- markers`, () => {
      const failures = [];
      const subset = allAgents.filter(a => a.subdir === subdir);
      for (const agent of subset) {
        if (!agent.fm) {
          failures.push(`${agent.filename}: missing --- frontmatter markers`);
        }
      }
      assert.deepStrictEqual(failures, [], `Frontmatter parse failures:\n${failures.join('\n')}`);
    });

    it(`all ${subdir}/ agents have a name field`, () => {
      const failures = [];
      const subset = allAgents.filter(a => a.subdir === subdir);
      for (const agent of subset) {
        if (!agent.name) {
          failures.push(`${agent.filename}: missing name field in frontmatter`);
        }
      }
      assert.deepStrictEqual(failures, [], `Missing name field:\n${failures.join('\n')}`);
    });

    it(`all ${subdir}/ agents have a tools array`, () => {
      const failures = [];
      const subset = allAgents.filter(a => a.subdir === subdir);
      for (const agent of subset) {
        if (!agent.tools || agent.tools.length === 0) {
          failures.push(`${agent.filename}: missing or empty tools array`);
        }
      }
      assert.deepStrictEqual(failures, [], `Missing tools array:\n${failures.join('\n')}`);
    });
  }
});

describe('Check A: Search tool compliance', () => {
  it('agents with Grep in tools reference at least one preferred search tool', () => {
    const noncompliant = [];
    for (const agent of allAgents) {
      if (!agent.tools.includes('Grep')) continue;
      // Check body text for any preferred search reference
      const hasSearchRef = SEARCH_REFERENCES.some(ref => agent.content.includes(ref));
      // Also check skills array for search skills
      const hasSearchSkill =
        agent.skills.includes('ripgrep') ||
        agent.skills.includes('code-semantic-search') ||
        agent.skills.includes('lsp-navigator');
      if (!hasSearchRef && !hasSearchSkill) {
        noncompliant.push(
          `${agent.subdir}/${agent.filename} (name: ${agent.name}) — has Grep but no search skill/reference`
        );
      }
    }
    if (noncompliant.length > 0) {
      console.error(
        `[Check A] Search-noncompliant agents (${noncompliant.length}):\n  ${noncompliant.join('\n  ')}`
      );
    }
    assert.deepStrictEqual(
      noncompliant,
      [],
      `Agents with Grep in tools but no ripgrep/search:code/code-semantic-search/lsp-navigator reference:\n${noncompliant.join('\n')}`
    );
  });
});

describe('Check B: MemoryRecord presence', () => {
  for (const subdir of ['core', 'domain', 'specialized']) {
    it(`all ${subdir}/ agents (except exemptions) have MemoryRecord in tools`, () => {
      const missing = [];
      const subset = allAgents.filter(a => a.subdir === subdir);
      for (const agent of subset) {
        if (MEMORY_RECORD_EXEMPTIONS.has(agent.name)) continue;
        if (!agent.tools.includes('MemoryRecord')) {
          missing.push(`${agent.filename} (name: ${agent.name})`);
        }
      }
      assert.deepStrictEqual(
        missing,
        [],
        `${subdir}/ agents missing MemoryRecord in tools:\n${missing.join('\n')}`
      );
    });
  }

  it('exempted lightweight agents are known and documented', () => {
    // Verify exemptions actually exist as agent files
    for (const exempted of MEMORY_RECORD_EXEMPTIONS) {
      const found = allAgents.some(a => a.name === exempted);
      assert.ok(found, `Exempted agent "${exempted}" not found in agent files — stale exemption?`);
    }
  });
});

describe('Check C: Token-saver wiring', () => {
  it('agents with >5 skills reference token-saver-context-compression or similar', () => {
    const missing = [];
    for (const agent of allAgents) {
      if (agent.skills.length <= 5) continue;
      const hasTokenSaver =
        agent.skills.includes('token-saver-context-compression') ||
        agent.skills.includes('context-compressor') ||
        agent.content.includes('token-saver') ||
        agent.content.includes('context-compressor') ||
        agent.content.includes('context compression');
      if (!hasTokenSaver) {
        missing.push(
          `${agent.subdir}/${agent.filename} (name: ${agent.name}, skills: ${agent.skills.length}) — no compression skill`
        );
      }
    }
    if (missing.length > 0) {
      console.error(
        `[Check C] Agents with >5 skills but no token-saver/compression reference (${missing.length}):\n  ${missing.join('\n  ')}`
      );
    }
    // This is a SHOULD, not a MUST — use a softer assertion that still reports
    assert.deepStrictEqual(
      missing,
      [],
      `Agents with >5 skills missing token-saver-context-compression or similar:\n${missing.join('\n')}`
    );
  });
});

describe('Router tool whitelist', () => {
  let routerAgent;

  before(() => {
    // Look for router.md in core/ (primary location)
    const routerPath = path.join(AGENTS_DIR, 'core', 'router.md');
    if (fs.existsSync(routerPath)) {
      routerAgent = parseAgent(routerPath);
    }
  });

  it('router.md is intentionally absent because the router is defined in CLAUDE.md', () => {
    assert.equal(
      routerAgent,
      undefined,
      'router.md should remain absent; router policy is centralized in CLAUDE.md'
    );
  });

  it('router does NOT have banned tools in its tools array', () => {
    if (!routerAgent) return; // Skip if router.md absent
    const violations = [];
    for (const tool of routerAgent.tools) {
      if (ROUTER_BANNED_TOOLS.has(tool)) {
        violations.push(tool);
      }
    }
    assert.deepStrictEqual(
      violations,
      [],
      `Router has banned tools: ${violations.join(', ')}. Only Task, Read, AskUserQuestion, Bash-whitelist permitted.`
    );
  });

  it('CLAUDE.md documents router tool lockdown', () => {
    const claudeMd = fs.readFileSync(path.join(ROOT, '.claude', 'CLAUDE.md'), 'utf-8');
    assert.ok(
      claudeMd.includes('TOOL LOCKDOWN') || claudeMd.includes('BANNED TOOLS'),
      'CLAUDE.md should document router tool lockdown'
    );
    // Verify banned tools are listed
    for (const tool of ROUTER_BANNED_TOOLS) {
      assert.ok(
        claudeMd.includes(tool),
        `CLAUDE.md should mention banned tool "${tool}" in lockdown section`
      );
    }
  });
});

describe('Agent Search Skill Wiring (frontmatter)', () => {
  // Agents exempt from requiring search skills in frontmatter
  const SEARCH_SKILL_EXEMPTIONS = new Set(['reflection-agent']);

  it('all agents (except exemptions) have at least one search skill in frontmatter', () => {
    const SEARCH_SKILLS = [
      'ripgrep',
      'code-semantic-search',
      'code-structural-search',
      'lsp-navigator',
    ];
    const missing = [];
    for (const agent of allAgents) {
      if (SEARCH_SKILL_EXEMPTIONS.has(agent.name)) continue;
      const hasSearch = agent.skills.some(s => SEARCH_SKILLS.some(ss => s.includes(ss)));
      if (!hasSearch) {
        missing.push(`${agent.subdir}/${agent.filename} (name: ${agent.name})`);
      }
    }
    assert.deepStrictEqual(
      missing,
      [],
      `Agents missing search skills in frontmatter:\n${missing.join('\n')}`
    );
  });
});

describe('Agent Search-First Instructions (body text)', () => {
  it('all agents reference search or hybrid search in body text', () => {
    const missing = [];
    for (const agent of allAgents) {
      const hasSearchRef =
        agent.content.includes('Code Search Protocol') ||
        agent.content.includes('Search-First') ||
        agent.content.includes('search:code') ||
        agent.content.includes('ripgrep') ||
        agent.content.includes('hybrid search') ||
        agent.content.includes('pnpm search') ||
        agent.content.includes('code-semantic-search');
      if (!hasSearchRef) {
        missing.push(`${agent.subdir}/${agent.filename} (name: ${agent.name})`);
      }
    }
    assert.deepStrictEqual(
      missing,
      [],
      `Agents with no search-first reference in body:\n${missing.join('\n')}`
    );
  });
});

describe('No Grep-First Language in Agents', () => {
  function isExempt(content) {
    return content.includes('<!-- search-compliance-exempt -->');
  }

  it('no agent uses "use Grep for code discovery" without fallback qualifier', () => {
    const violations = [];
    for (const agent of allAgents) {
      if (isExempt(agent.content)) continue;
      if (
        /use Grep (for|to) (code |codebase )?discover/i.test(agent.content) &&
        !/fallback/i.test(agent.content)
      ) {
        violations.push(`${agent.subdir}/${agent.filename}`);
      }
    }
    assert.deepStrictEqual(
      violations,
      [],
      `Agents with unqualified Grep-first discovery language: ${violations.join(', ')}`
    );
  });
});

describe('Spawn Template Search-First', () => {
  const TEMPLATES_DIR = path.join(ROOT, '.claude', 'templates', 'spawn');
  let template;

  before(() => {
    const templatePath = path.join(TEMPLATES_DIR, 'universal-agent-spawn.md');
    if (fs.existsSync(templatePath)) {
      template = fs.readFileSync(templatePath, 'utf-8');
    }
  });

  it('universal-agent-spawn.md exists', () => {
    assert.ok(template, 'universal-agent-spawn.md should exist');
  });

  it('contains Search-First Protocol section', () => {
    if (!template) return;
    assert.ok(
      template.includes('Search-First Protocol'),
      'universal-agent-spawn.md missing Search-First Protocol section'
    );
  });

  it('mentions pnpm search:code', () => {
    if (!template) return;
    assert.ok(
      template.includes('pnpm search:code'),
      'universal-agent-spawn.md should mention pnpm search:code'
    );
  });

  it('mentions ripgrep skill', () => {
    if (!template) return;
    assert.ok(template.includes('ripgrep'), 'universal-agent-spawn.md should mention ripgrep');
  });

  it('says Grep is fallback only', () => {
    if (!template) return;
    assert.match(
      template,
      /[Gg]rep\b.*(?:fallback|FALLBACK|only|ONLY)|(?:fallback|FALLBACK|only|ONLY).*[Gg]rep\b/i,
      'universal-agent-spawn.md should indicate Grep is fallback-only'
    );
  });
});

describe('Code Standards Search Enforcement', () => {
  const CODE_STANDARDS = path.join(ROOT, '.claude', 'rules', 'code-standards.md');
  let standards;

  before(() => {
    standards = fs.readFileSync(CODE_STANDARDS, 'utf-8');
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

  it('marks Grep as fallback', () => {
    assert.match(
      standards,
      /[Gg]rep\b.*(?:FALLBACK|fallback)|(?:FALLBACK|fallback).*[Gg]rep\b/i,
      'code-standards.md should mark Grep as FALLBACK'
    );
  });
});

describe('Orchestrator Search Skill References', () => {
  it('all orchestrators reference a search skill or search:code', () => {
    const orchestrators = allAgents.filter(a => a.subdir === 'orchestrators');
    assert.ok(orchestrators.length > 0, 'Expected orchestrator agent files');
    const missing = [];
    for (const orch of orchestrators) {
      const hasRef =
        orch.content.includes('ripgrep') ||
        orch.content.includes('search:code') ||
        orch.content.includes('code-semantic-search') ||
        orch.content.includes('code-structural-search') ||
        orch.content.includes('hybrid search') ||
        orch.content.includes('Search-First') ||
        orch.content.includes('pnpm search');
      if (!hasRef) {
        missing.push(`orchestrators/${orch.filename}`);
      }
    }
    assert.deepStrictEqual(
      missing,
      [],
      `Orchestrators missing search references: ${missing.join(', ')}`
    );
  });
});
