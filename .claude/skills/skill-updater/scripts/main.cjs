#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

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
      id: 'skill-md',
      check: `Validate .claude/skills/${skillName}/SKILL.md trigger clarity + workflow completeness`,
    },
    {
      id: 'script',
      check: `Validate .claude/skills/${skillName}/scripts/main.cjs deterministic output contract`,
    },
    {
      id: 'schemas',
      check: `Validate .claude/skills/${skillName}/schemas/input.schema.json and output.schema.json`,
    },
    {
      id: 'hooks',
      check: `Validate .claude/skills/${skillName}/hooks/pre-execute.cjs and post-execute.cjs`,
    },
    {
      id: 'command-surface',
      check: `Validate .claude/skills/${skillName}/commands/${skillName}.md plus .claude/commands delegator`,
    },
    { id: 'template-rule', check: `Validate template/rules references and no stale defaults` },
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

function buildTddBacklog(skillName) {
  return [
    {
      phase: 'RED',
      items: [
        `Add/update tests for ${skillName} script contract and trigger routing behavior`,
        'Add regression tests for known stale wording/invalid references',
      ],
    },
    {
      phase: 'GREEN',
      items: [
        'Apply minimal SKILL.md + script + schema updates to satisfy failing tests',
        'Update command/workflow wiring only where required by tests',
      ],
    },
    {
      phase: 'REFACTOR',
      items: [
        'Tighten wording and remove duplicate instructions',
        'Consolidate trigger rules and memory/search/token-saver decision branches',
      ],
    },
    {
      phase: 'VERIFY',
      items: [
        `node .claude/tools/cli/validate-integration.cjs .claude/skills/${skillName}/SKILL.md`,
        'node .claude/tools/cli/generate-skill-index.cjs',
        'node .claude/tools/cli/generate-agent-registry.cjs (if assignments changed)',
        `node --test tests/skills/${skillName}-main.test.cjs`,
      ],
    },
  ];
}

function buildResult(input) {
  const trigger = ['reflection', 'evolve', 'manual'].includes(input.trigger)
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
        'node .claude/skills/skill-updater/scripts/main.cjs --skill <name-or-path> [--trigger reflection|evolve|manual] [--mode plan|execute] [--topic <research-topic>]',
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
  buildTddBacklog,
  buildResult,
  main,
};
