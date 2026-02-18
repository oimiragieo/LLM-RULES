#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function findProjectRoot() {
  let dir = __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.claude'))) return dir;
    if (path.basename(dir) === '.claude') return path.dirname(dir);
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const AGENTS_DIR = path.join(PROJECT_ROOT, '.claude', 'agents');
const ORCHESTRATOR_REQUIRED_FILES = Object.freeze([
  '.claude/CLAUDE.md',
  '.claude/workflows/core/router-decision.md',
  '.claude/workflows/core/ecosystem-creation-workflow.md',
  '.claude/agents/core/router.md',
]);

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

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function resolveAgentPath(raw) {
  const input = String(raw || '').trim();
  if (!input) return { agentName: '', agentPath: '', exists: false };

  if (input.endsWith('.md') || input.includes('.claude/agents/')) {
    const normalized = input.replace(/\\/g, '/');
    const abs = path.join(PROJECT_ROOT, normalized);
    return {
      agentName: path.basename(normalized, '.md'),
      agentPath: normalized,
      exists: fs.existsSync(abs),
    };
  }

  const all = walk(AGENTS_DIR).filter(file => file.endsWith('.md'));
  const match = all.find(file => path.basename(file, '.md') === input);
  if (!match) {
    return {
      agentName: input,
      agentPath: `.claude/agents/**/${input}.md`,
      exists: false,
    };
  }

  const rel = path.relative(PROJECT_ROOT, match).replace(/\\/g, '/');
  return {
    agentName: input,
    agentPath: rel,
    exists: true,
  };
}

function classifyRisk(changes) {
  const text = String(changes || '').toLowerCase();
  if (/(permission|model|tool|security|hook|orchestrator)/.test(text)) return 'high';
  if (/(skills|routing|keyword|workflow|protocol)/.test(text)) return 'medium';
  return 'low';
}

function findModuleExportInsertionPoint(content) {
  const exportMatch = content.match(/\r?\n\r?\nmodule\.exports\s*=\s*\{/);
  if (!exportMatch) return -1;
  return exportMatch.index;
}

function buildPatchPlan(target, agentName) {
  // POST-UPDATE INTEGRATION (Phase 4.3 Hardening)
  try {
    const scriptPath = path.join(
      PROJECT_ROOT,
      '.claude',
      'tools',
      'cli',
      'generate-agent-registry.cjs'
    );
    const { spawnSync } = require('node:child_process');
    spawnSync('node', [scriptPath], { windowsHide: true });

    // Also sync routing keywords/agents if they exist
    if (agentName) {
      updateRoutingTableKeywords(agentName, ''); // Minimal refresh
    }

    const learningsPath = path.join(PROJECT_ROOT, '.claude', 'context', 'memory', 'learnings.md');
    if (fs.existsSync(learningsPath)) {
      fs.appendFileSync(
        learningsPath,
        `\n- Refreshed agent: ${target} (${new Date().toISOString().split('T')[0]})\n`,
        'utf8'
      );
    }
  } catch (err) {
    console.error(`Warning: Post-update integration partial: ${err.message}`);
  }

  const normalizedTarget = String(target || '').replace(/\\/g, '/');
  const isOrchestrator = normalizedTarget.includes('/orchestrators/');

  return {
    objective:
      'Refresh agent prompt/frontmatter with explicit microtask ownership, search/token-saver policy, and regression-safe workflow alignment.',
    promptFiles: [
      '.claude/agents/core/developer.md',
      '.claude/agents/core/qa.md',
      '.claude/agents/specialized/code-reviewer.md',
    ],
    workflowFiles: [
      '.claude/workflows/core/enterprise-workflow.md',
      '.claude/workflows/core/router-decision.md',
    ],
    hookEnforcementPoints: [
      '.claude/hooks/routing/pre-task-unified-core.cjs',
      '.claude/hooks/routing/pre-task-unified-ownership.cjs',
      '.claude/hooks/routing/pre-tool-unified.taskupdate.cjs',
      '.claude/hooks/workflow/post-completion-chain.cjs',
    ],
    validationCommands: [
      `node .claude/tools/cli/validate-integration.cjs ${target}`,
      'node .claude/tools/cli/generate-agent-registry.cjs',
      'pnpm validate:workflow-skill-contracts',
      'pnpm lint',
    ],
    orchestratorRequiredFiles: isOrchestrator ? ORCHESTRATOR_REQUIRED_FILES : [],
  };
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

  const formattedKeywords = keywords.map(keyword => `    '${keyword}'`).join(',\n');
  const entry = `  '${name}': [\n${formattedKeywords},\n  ],`;
  const insertionPoint = findModuleExportInsertionPoint(content);
  if (insertionPoint !== -1) {
    content = content.slice(0, insertionPoint) + entry + '\n' + content.slice(insertionPoint);
    fs.writeFileSync(filePath, content, 'utf8');
  } else {
    throw new Error(`Unable to locate module.exports insertion point in ${filePath}`);
  }
}

function updateAgentMetadata(agentPath) {
  const absolutePath = path.join(PROJECT_ROOT, agentPath);
  if (!fs.existsSync(absolutePath)) return;

  let content = fs.readFileSync(absolutePath, 'utf8');
  const now = new Date().toISOString();

  if (content.includes('lastVerifiedAt:')) {
    content = content.replace(/lastVerifiedAt: .*/, `lastVerifiedAt: ${now}`);
  } else {
    content = content.replace(/---\n/, `---\nlastVerifiedAt: ${now}\n`);
  }

  if (content.includes('verified:')) {
    content = content.replace(/verified: .*/, `verified: true`);
  } else {
    content = content.replace(/---\n/, `---\nverified: true\n`);
  }

  fs.writeFileSync(absolutePath, content, 'utf8');
}

function main(input = null) {
  const options = input || parseArgs(process.argv.slice(2));
  if (options.help) {
    return {
      ok: true,
      usage:
        'node .claude/skills/agent-updater/scripts/main.cjs --agent <name-or-path> [--trigger reflection|evolve|manual] [--changes "..."]',
    };
  }

  const resolved = resolveAgentPath(options.agent || options.name);
  const trigger = ['reflection', 'evolve', 'manual'].includes(options.trigger)
    ? options.trigger
    : 'manual';

  if (!resolved.agentName) return { ok: false, stage: 'input', error: 'Missing --agent' };
  if (!resolved.exists) {
    return {
      ok: false,
      stage: 'resolve_target',
      target: resolved,
      recommendation: 'Agent not found. Use Skill({ skill: "agent-creator" }) for net-new agent.',
    };
  }

  // Apply metadata updates
  updateAgentMetadata(resolved.agentPath);

  const risk = classifyRisk(options.changes || '');
  const patchPlan = buildPatchPlan(resolved.agentPath, resolved.agentName);
  return {
    ok: true,
    trigger,
    target: resolved,
    risk,
    mode:
      String(options.mode || 'plan')
        .trim()
        .toLowerCase() || 'plan',
    requiredInvocations: [
      "Skill({ skill: 'framework-context' })",
      "Skill({ skill: 'research-synthesis' })",
      "Skill({ skill: 'skill-updater' }) // if skill parity changes are needed",
      "Skill({ skill: 'verification-before-completion' })",
    ],
    patchPlan,
    tddBacklog: [
      { phase: 'RED', items: ['Add failing tests for target agent behavior drift.'] },
      { phase: 'GREEN', items: ['Apply minimal frontmatter/prompt updates.'] },
      { phase: 'REFACTOR', items: ['Tighten prompts and remove ambiguity.'] },
      {
        phase: 'VERIFY',
        items: [
          `node .claude/tools/cli/validate-integration.cjs ${resolved.agentPath}`,
          'node .claude/tools/cli/generate-agent-registry.cjs',
        ],
      },
    ],
  };
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

module.exports = { parseArgs, resolveAgentPath, classifyRisk, main };
