#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const yaml = require('js-yaml');
const {
  validateFixedPreserved,
  applyUpdatePreservingFixed,
} = require('../../../lib/updaters/fixed-section-handler.cjs');

const PROJECT_ROOT = findProjectRoot();

function findProjectRoot() {
  let dir = __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.claude'))) return dir;
    if (path.basename(dir) === '.claude') return path.dirname(dir);
    dir = path.dirname(dir);
  }
  return process.cwd();
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    const hasValue = next && !next.startsWith('--');
    options[key] = hasValue ? argv[++i] : true;
  }
  return options;
}

function normalizeSkillRef(raw) {
  const input = String(raw || '').trim();
  if (!input) return { skillName: '', skillPath: '' };

  if (input.endsWith('SKILL.md') || input.includes('.claude/skills/')) {
    const normalizedPath = input.replace(/\\/g, '/');
    const parts = normalizedPath.split('/');
    const idx = parts.lastIndexOf('skills');
    const skillName =
      idx >= 0 && idx + 1 < parts.length ? parts[idx + 1] : path.basename(path.dirname(input));
    return { skillName, skillPath: normalizedPath };
  }

  return {
    skillName: input,
    skillPath: `.claude/skills/${input}/SKILL.md`,
  };
}

function buildResearchChecklist(input) {
  const topic = input.topic || input.skillName || 'target-skill-refresh';
  return {
    exaQueries: [
      `best practices ${topic} skill workflow`,
      `common failures and anti-patterns ${topic}`,
      `${topic} testing validation regression gates`,
    ],
    arxivQueries: [
      `LLM agent evaluation regression testing ${topic}`,
      `test-driven development LLM code generation ${topic}`,
    ],
    internalChecks: [
      `pnpm search:code "${topic}"`,
      `Skill({ skill: 'ripgrep', args: '${topic}' })`,
      `Skill({ skill: 'code-semantic-search', args: '${topic}' })`,
    ],
  };
}

function buildGapChecklist(skillName) {
  return [
    {
      id: 'skill-md-content',
      check: `Validate .claude/skills/${skillName}/SKILL.md contains 'Memory Protocol', 'Anti-Patterns', and 'Integration Points' sections (PRESERVE existing content)`,
    },
    {
      id: 'search-best-practice',
      check: `Ensure SKILL.md mandates 'pnpm search:code' or 'ripgrep' over generic grep/glob for code discovery`,
    },
    {
      id: 'enterprise-scaffold',
      check: `Ensure .claude/skills/${skillName}/hooks/ (pre/post) and .claude/skills/${skillName}/schemas/ (input/output) exist. IF MISSING: Create them with enterprise defaults.`,
    },
    {
      id: 'script',
      check: `Validate .claude/skills/${skillName}/scripts/main.cjs deterministic output contract`,
    },
    {
      id: 'rules-preservation',
      check: `Check .claude/rules/${skillName}.md for 'Anti-Patterns' and 'Workflows'. PRESERVE these sections if updating.`,
    },
    {
      id: 'command-surface',
      check: `Validate .claude/skills/${skillName}/commands/${skillName}.md plus .claude/commands delegator`,
    },
    {
      id: 'workflow-doc',
      check: `Validate .claude/workflows/${skillName}-skill-workflow.md exists and matches behavior`,
    },
    {
      id: 'catalog-wiring',
      check: 'Validate CLAUDE.md + skill-catalog + agent assignments + skill index',
    },
  ];
}

function updateSkillMetadata(skillPath) {
  const absolutePath = path.join(PROJECT_ROOT, skillPath);
  if (!fs.existsSync(absolutePath)) return;

  const content = fs.readFileSync(absolutePath, 'utf8');
  const now = new Date().toISOString();
  const parsed = parseFrontmatter(content);
  if (!parsed) return;

  parsed.attributes.lastVerifiedAt = now;
  parsed.attributes.verified = true;

  fs.writeFileSync(absolutePath, serializeFrontmatter(parsed.attributes, parsed.body), 'utf8');
}

function parseFrontmatter(content) {
  const normalized = content.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return null;
  const closeIndex = normalized.indexOf('\n---\n', 4);
  if (closeIndex === -1) return null;

  const rawFrontmatter = normalized.slice(4, closeIndex);
  const body = normalized.slice(closeIndex + 5);
  const attributes = yaml.load(rawFrontmatter) || {};
  if (typeof attributes !== 'object' || Array.isArray(attributes)) return null;
  return { attributes, body };
}

function serializeFrontmatter(attributes, body) {
  const dumped = yaml.dump(attributes, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });
  return `---\n${dumped}---\n${body}`;
}

function applyPostUpdateIntegration(skillName) {
  const scriptPath = path.join(PROJECT_ROOT, '.claude', 'tools', 'cli', 'generate-skill-index.cjs');
  if (fs.existsSync(scriptPath)) {
    spawnSync('node', [scriptPath], { windowsHide: true, shell: false });
  }

  updateRoutingTableKeywords(skillName, '');

  const learningsPath = path.join(PROJECT_ROOT, '.claude', 'context', 'memory', 'learnings.md');
  if (fs.existsSync(learningsPath)) {
    fs.appendFileSync(
      learningsPath,
      `\n- Refreshed skill: ${skillName} (${new Date().toISOString().split('T')[0]})\n`,
      'utf8'
    );
  }
}

function buildTddBacklog(skillName) {
  return [
    {
      phase: 'RED',
      items: [
        `Add test ensuring .claude/rules/${skillName}.md retains 'Anti-Patterns' section`,
        `Add test verifying .claude/skills/${skillName}/schemas/input.schema.json exists and is valid`,
        `Add test verifying .claude/skills/${skillName}/hooks/pre-execute.cjs exists`,
      ],
    },
    {
      phase: 'GREEN',
      items: [
        'Update SKILL.md with 2026 standards while PRESERVING local patterns',
        'Create/Update input.schema.json with strict validation',
        'Create/Update pre-execute.cjs hook to enforce schema',
      ],
    },
    {
      phase: 'REFACTOR',
      items: [
        'Deduplicate instructions between SKILL.md and rules/',
        'Ensure pnpm search:code is the primary discovery tool',
      ],
    },
    {
      phase: 'VERIFY',
      items: [
        `node .claude/tools/cli/validate-integration.cjs .claude/skills/${skillName}/SKILL.md`,
        'node .claude/tools/cli/generate-skill-index.cjs',
        'node --test tests/skills/' + skillName + '-main.test.cjs',
      ],
    },
  ];
}

function updateRoutingTableKeywords(name, _description) {
  const filePath = path.join(
    PROJECT_ROOT,
    '.claude',
    'lib',
    'routing',
    'routing-table-intent-keywords-data.cjs'
  );
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(`'${name}':`)) return;

  const keywords = Array.from(new Set([name, ...name.split('-')])).slice(0, 10);

  const entry = `  '${name}': ${JSON.stringify(keywords)},`;
  const anchor =
    '\n};\n\n// Deliberate overlaps must be explicitly tracked so new collisions are reviewed.';
  const insertionPoint = content.indexOf(anchor);
  if (insertionPoint !== -1) {
    content = content.slice(0, insertionPoint) + entry + '\n' + content.slice(insertionPoint);
    fs.writeFileSync(filePath, content, 'utf8');
    return;
  }

  const exportAnchor = 'module.exports = {';
  const exportIndex = content.indexOf(exportAnchor);
  if (exportIndex !== -1) {
    const insertAt = exportIndex + exportAnchor.length;
    content = content.slice(0, insertAt) + '\n' + entry + content.slice(insertAt);
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

/**
 * Tokenize a description string into keyword triggers.
 * Extracts meaningful words (3+ chars, not stop words).
 * @param {string} description
 * @returns {string[]}
 */
function tokenizeDescription(description) {
  const STOP_WORDS = new Set([
    'the',
    'and',
    'for',
    'with',
    'this',
    'that',
    'from',
    'use',
    'used',
    'when',
    'into',
    'via',
    'are',
    'all',
    'any',
    'can',
    'each',
    'its',
    'not',
    'but',
    'has',
    'have',
    'been',
    'will',
    'also',
    'per',
    'our',
  ]);
  const words = (description || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w));
  // deduplicate and take first 8
  return [...new Set(words)].slice(0, 8);
}

/**
 * Check whether a parsed frontmatter attributes object already has the v3.1.0
 * `frontmatter` nested block.
 * @param {object} attributes
 * @returns {boolean}
 */
function hasFrontmatterBlock(attributes) {
  return (
    attributes !== null &&
    typeof attributes === 'object' &&
    'frontmatter' in attributes &&
    attributes.frontmatter !== null &&
    typeof attributes.frontmatter === 'object'
  );
}

/**
 * Propose minimal v3.1.0 frontmatter defaults derived from the skill's existing
 * description field. Never overwrites an existing frontmatter block.
 *
 * Design rationale (v3.1.0 dual-layer pattern):
 *   - The YAML frontmatter acts as machine-parseable metadata (Layer 1).
 *   - The Markdown body is human-readable prose (Layer 2).
 *   The `frontmatter` nested block bridges these layers so agents can inspect
 *   routing triggers, token budgets, and skill dependencies without parsing
 *   the full prose body. See `.claude/schemas/skill-definition.schema.json`
 *   for the authoritative schema.
 *
 * @param {string} skillPath  - relative path (e.g. `.claude/skills/tdd/SKILL.md`)
 * @param {{ token_budget?: number, requires_skills?: string[] }} [overrides]
 * @returns {{
 *   action: 'already_present'|'proposed'|'error',
 *   skillPath: string,
 *   proposed?: { triggers: string[], token_budget: number, requires_skills: string[] },
 *   message: string,
 * }}
 */
function backfillFrontmatter(skillPath, overrides = {}) {
  const absolutePath = path.join(PROJECT_ROOT, skillPath);
  if (!fs.existsSync(absolutePath)) {
    return {
      action: 'error',
      skillPath,
      message: `Skill file not found: ${skillPath}`,
    };
  }

  const content = fs.readFileSync(absolutePath, 'utf8');
  const parsed = parseFrontmatter(content);
  if (!parsed) {
    return {
      action: 'error',
      skillPath,
      message: 'Could not parse YAML frontmatter from skill file',
    };
  }

  // Guard: never overwrite an existing frontmatter block
  if (hasFrontmatterBlock(parsed.attributes)) {
    return {
      action: 'already_present',
      skillPath,
      message: 'Skill already has a v3.1.0 frontmatter block — no changes made',
    };
  }

  const description = String(parsed.attributes.description || '');
  const triggers = tokenizeDescription(description);
  const proposed = {
    triggers: triggers.length > 0 ? triggers : [String(parsed.attributes.name || 'skill')],
    token_budget: typeof overrides.token_budget === 'number' ? overrides.token_budget : 10000,
    requires_skills: Array.isArray(overrides.requires_skills) ? overrides.requires_skills : [],
  };

  return {
    action: 'proposed',
    skillPath,
    proposed,
    message:
      'Proposed frontmatter block derived from description. Agent must confirm before writing.',
  };
}

/**
 * Apply the proposed frontmatter block to the skill file on disk.
 * Only call this after the agent has confirmed the proposal from backfillFrontmatter().
 * @param {string} skillPath
 * @param {{ triggers: string[], token_budget: number, requires_skills: string[] }} proposed
 * @returns {{ ok: boolean, message: string }}
 */
function applyFrontmatterBackfill(skillPath, proposed) {
  const absolutePath = path.join(PROJECT_ROOT, skillPath);
  if (!fs.existsSync(absolutePath)) {
    return { ok: false, message: `Skill file not found: ${skillPath}` };
  }

  const content = fs.readFileSync(absolutePath, 'utf8');
  const parsed = parseFrontmatter(content);
  if (!parsed) {
    return { ok: false, message: 'Could not parse YAML frontmatter' };
  }

  if (hasFrontmatterBlock(parsed.attributes)) {
    return { ok: false, message: 'frontmatter block already present — refusing to overwrite' };
  }

  parsed.attributes.frontmatter = {
    triggers: proposed.triggers,
    token_budget: proposed.token_budget,
    requires_skills: proposed.requires_skills,
  };

  fs.writeFileSync(absolutePath, serializeFrontmatter(parsed.attributes, parsed.body), 'utf8');
  return { ok: true, message: `frontmatter block added to ${skillPath}` };
}

function buildResult(input) {
  const trigger = ['reflection', 'evolve', 'manual', 'stale_skill'].includes(input.trigger)
    ? input.trigger
    : 'manual';
  const mode = input.mode === 'execute' ? 'execute' : 'plan';
  const resolved = normalizeSkillRef(input.skill || input.name);

  if (!resolved.skillName) {
    return {
      ok: false,
      stage: 'input',
      error: 'Missing --skill <name-or-path>',
    };
  }

  const absoluteSkillPath = path.join(PROJECT_ROOT, resolved.skillPath);
  const exists = fs.existsSync(absoluteSkillPath);

  if (!exists) {
    return {
      ok: false,
      stage: 'resolve_target',
      trigger,
      target: {
        skillName: resolved.skillName,
        skillPath: resolved.skillPath,
        exists: false,
      },
      recommendation:
        'Target skill does not exist. Use Skill({ skill: "skill-creator" }) for net-new skill creation.',
    };
  }

  const skillDir = path.dirname(absoluteSkillPath);

  const isExecuteMode = mode === 'execute';
  if (isExecuteMode) {
    updateSkillMetadata(resolved.skillPath);
    try {
      applyPostUpdateIntegration(resolved.skillName);
    } catch (err) {
      console.error(`Warning: Post-update integration partial: ${err.message}`);
    }
  }

  const bundle = {
    commands: fs.existsSync(path.join(skillDir, 'commands')),
    hooks: fs.existsSync(path.join(skillDir, 'hooks')),
    schemas: fs.existsSync(path.join(skillDir, 'schemas')),
    scripts: fs.existsSync(path.join(skillDir, 'scripts')),
    templates: fs.existsSync(path.join(skillDir, 'templates')),
    rules: fs.existsSync(path.join(skillDir, 'rules')),
  };

  return {
    ok: true,
    mode,
    trigger,
    target: {
      skillName: resolved.skillName,
      skillPath: resolved.skillPath,
      exists: true,
      bundle,
    },
    requiredInvocations: [
      "Skill({ skill: 'framework-context' })",
      "Skill({ skill: 'research-synthesis' })",
    ],
    optionalInvocations: [
      "Skill({ skill: 'assimilate' })",
      "Skill({ skill: 'context-compressor' })",
      "Skill({ skill: 'recommend-evolution' })",
    ],
    research: buildResearchChecklist({ topic: input.topic, skillName: resolved.skillName }),
    gapChecklist: buildGapChecklist(resolved.skillName),
    tddBacklog: buildTddBacklog(resolved.skillName),
    memoryProtocol: {
      before: [
        '.claude/context/memory/learnings.md',
        '.claude/context/memory/issues.md',
        '.claude/context/memory/decisions.md',
      ],
      after: [
        '.claude/context/memory/learnings.md',
        '.claude/context/memory/issues.md',
        '.claude/context/memory/decisions.md',
      ],
    },
  };
}

function main(input = null) {
  const options = input || parseArgs(process.argv.slice(2));
  if (options.help) {
    return {
      ok: true,
      usage:
        'node .claude/skills/skill-updater/scripts/main.cjs --skill <name-or-path> [--trigger reflection|evolve|manual|stale_skill] [--mode plan|execute] [--topic <research-topic>]',
    };
  }
  return buildResult(options);
}

if (require.main === module) {
  const result = main();
  if (result.usage) {
    console.log(result.usage);
    process.exit(0);
  }
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

/**
 * Validate that proposed content for a skill file does not violate FIXED section markers.
 * @param {string} skillPath - relative path to the skill file
 * @param {string} proposedContent - new content to apply
 * @returns {{ valid: boolean, violations: Array<{sectionName: string, reason: string}> }}
 */
function validateFixedSections(skillPath, proposedContent) {
  const absolutePath = path.join(PROJECT_ROOT, skillPath);
  if (!fs.existsSync(absolutePath)) return { valid: true, violations: [] };
  const originalContent = fs.readFileSync(absolutePath, 'utf8');
  return validateFixedPreserved(originalContent, proposedContent);
}

/**
 * Apply proposedContent to a skill file while preserving FIXED sections from the original.
 * @param {string} skillPath
 * @param {string} proposedContent
 * @returns {string} merged safe content
 */
function applyPreservingFixedSections(skillPath, proposedContent) {
  const absolutePath = path.join(PROJECT_ROOT, skillPath);
  if (!fs.existsSync(absolutePath)) return proposedContent;
  const originalContent = fs.readFileSync(absolutePath, 'utf8');
  return applyUpdatePreservingFixed(originalContent, proposedContent);
}

module.exports = {
  parseArgs,
  normalizeSkillRef,
  buildResearchChecklist,
  buildGapChecklist,
  parseFrontmatter,
  serializeFrontmatter,
  updateSkillMetadata,
  updateRoutingTableKeywords,
  applyPostUpdateIntegration,
  buildTddBacklog,
  buildResult,
  validateFixedSections,
  applyPreservingFixedSections,
  tokenizeDescription,
  hasFrontmatterBlock,
  backfillFrontmatter,
  applyFrontmatterBackfill,
  main,
};
