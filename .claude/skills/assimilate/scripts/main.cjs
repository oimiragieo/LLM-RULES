#!/usr/bin/env node
'use strict';

const path = require('node:path');

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

function parseRepos(raw) {
  if (Array.isArray(raw)) return raw.map(v => String(v).trim()).filter(Boolean);
  if (typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

function buildResult(options) {
  const runId = options.runId || new Date().toISOString().replace(/[:.]/g, '-');
  const workspace = path
    .join('.claude', 'context', 'runtime', 'assimilate', runId)
    .replace(/\\/g, '/');
  const repos = parseRepos(options.repos);
  const mode = repos.length > 0 ? 'execution' : 'planning';

  return {
    ok: true,
    mode,
    workspace,
    repos,
    kickoff:
      'I’ll do this in four phases: clone competitor repos into a temp workspace, extract comparable features/tooling surfaces, build a gap list against our repo, then convert that into a concrete TDD backlog with checkpoints to implement and validate improvements. I’m starting by creating the temp comparison workspace and cloning the repos.',
    phases: [
      {
        id: 'phase-1',
        name: 'Clone + Stage',
        goal: 'Create a temp workspace and clone benchmark repos without executing untrusted scripts.',
      },
      {
        id: 'phase-2',
        name: 'Comparable Surface Extraction',
        goal: 'Extract memory/search/agent-communication/creator-system surfaces for parity comparison.',
      },
      {
        id: 'phase-3',
        name: 'Gap List',
        goal: 'Build prioritized gaps with complexity, risk, and artifact-type recommendation.',
      },
      {
        id: 'phase-4',
        name: 'TDD Backlog',
        goal: 'Convert gaps into RED/GREEN/REFACTOR/VERIFY backlog with checkpoints.',
      },
    ],
    checkpoints: [
      'Workspace created under .claude/context/runtime/assimilate/<run-id>',
      'Repo inventory captured (url, commit, default branch, structure snapshot)',
      'Comparable surface tables completed (memory, search, communication, creator/CI)',
      'Gap list prioritized with impact and feasibility scores',
      'TDD backlog produced with commands and acceptance checks',
    ],
  };
}

function main(rawOptions = null) {
  const options = rawOptions || parseArgs(process.argv.slice(2));
  if (options.help) {
    return {
      ok: true,
      usage:
        'node .claude/skills/assimilate/scripts/main.cjs --repos "<url1,url2>" [--runId <id>] [--focus "memory,search,agents,creators"]',
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
  parseRepos,
  buildResult,
  main,
};
