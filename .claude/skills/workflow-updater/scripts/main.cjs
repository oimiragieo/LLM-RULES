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
const WORKFLOWS_DIR = path.join(PROJECT_ROOT, '.claude', 'workflows');

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

function resolveWorkflowPath(raw) {
  const input = String(raw || '').trim();
  if (!input) return { workflowName: '', workflowPath: '', exists: false };
  if (input.endsWith('.md') || input.includes('.claude/workflows/')) {
    const normalized = input.replace(/\\/g, '/');
    return {
      workflowName: path.basename(normalized, '.md'),
      workflowPath: normalized,
      exists: fs.existsSync(path.join(PROJECT_ROOT, normalized)),
    };
  }

  const direct = path.join(WORKFLOWS_DIR, `${input}.md`);
  if (fs.existsSync(direct)) {
    return { workflowName: input, workflowPath: `.claude/workflows/${input}.md`, exists: true };
  }

  const core = path.join(WORKFLOWS_DIR, 'core', `${input}.md`);
  if (fs.existsSync(core)) {
    return {
      workflowName: input,
      workflowPath: `.claude/workflows/core/${input}.md`,
      exists: true,
    };
  }

  return { workflowName: input, workflowPath: `.claude/workflows/**/${input}.md`, exists: false };
}

function main(input = null) {
  const options = input || parseArgs(process.argv.slice(2));
  if (options.help) {
    return {
      ok: true,
      usage:
        'node .claude/skills/workflow-updater/scripts/main.cjs --workflow <name-or-path> [--trigger reflection|evolve|manual]',
    };
  }

  const target = resolveWorkflowPath(options.workflow || options.name);
  const trigger = ['reflection', 'evolve', 'manual'].includes(options.trigger)
    ? options.trigger
    : 'manual';

  // POST-UPDATE INTEGRATION (Phase 4.3 Hardening)
  try {
    const learningsPath = path.join(PROJECT_ROOT, '.claude', 'context', 'memory', 'learnings.md');
    if (fs.existsSync(learningsPath)) {
      fs.appendFileSync(learningsPath, `\n- Updated workflow: ${target.workflowName} (${new Date().toISOString().split('T')[0]})\n`, 'utf8');
    }
  } catch (err) {
    console.error(`Warning: Post-update integration partial: ${err.message}`);
  }

  if (!target.workflowName) return { ok: false, stage: 'input', error: 'Missing --workflow' };
  if (!target.exists) {
    return {
      ok: false,
      stage: 'resolve_target',
      target,
      recommendation:
        'Workflow not found. Use Skill({ skill: "workflow-creator" }) for net-new workflow.',
    };
  }

  return {
    ok: true,
    trigger,
    target,
    requiredChecks: [
      'phase gate preconditions remain explicit',
      'state transitions remain valid',
      'duplicate completion events are idempotent',
      'validation commands still pass',
    ],
    tddBacklog: [
      { phase: 'RED', items: ['add failing phase-gate regression tests'] },
      { phase: 'GREEN', items: ['minimal workflow/hook logic updates'] },
      { phase: 'REFACTOR', items: ['tighten transitions and docs wording'] },
      {
        phase: 'VERIFY',
        items: [
          'node scripts/validate-workflow.mjs',
          `node .claude/tools/cli/validate-integration.cjs ${target.workflowPath}`,
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

module.exports = { parseArgs, resolveWorkflowPath, main };
