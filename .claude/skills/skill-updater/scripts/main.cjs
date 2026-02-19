#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const yaml = require('js-yaml');

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
    'routing-table-intent-keywords.cjs'
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
  }
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
      "Skill({ skill: 'token-saver-context-compression' })",
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
  main,
};
