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

function resolveHarness(raw) {
  const input = String(raw || '').trim();
  if (!input) return { harness: '', path: '', exists: false };
  if (input.includes('/') || input.endsWith('.cjs') || input.endsWith('.mjs')) {
    const normalized = input.replace(/\\/g, '/');
    return {
      harness: path.basename(normalized),
      path: normalized,
      exists: fs.existsSync(path.join(PROJECT_ROOT, normalized)),
    };
  }

  const candidate = `.claude/context/runtime/evals/${input}`;
  return {
    harness: input,
    path: candidate,
    exists: fs.existsSync(path.join(PROJECT_ROOT, candidate)),
  };
}

function main(input = null) {
  const options = input || parseArgs(process.argv.slice(2));
  if (options.help) {
    return {
      ok: true,
      usage:
        'node .claude/skills/eval-harness-updater/scripts/main.cjs --harness <path-or-name> [--trigger reflection|evolve|manual]',
    };
  }

  const target = resolveHarness(options.harness || options.name);
  const trigger = ['reflection', 'evolve', 'manual'].includes(options.trigger)
    ? options.trigger
    : 'manual';
  if (!target.harness) return { ok: false, stage: 'input', error: 'Missing --harness' };

  return {
    ok: true,
    trigger,
    target,
    checks: [
      'parser scans full stream + partial timeout output',
      'live mode emits actionable diagnostics',
      'fallback mode emits deterministic metrics',
      'SLO gates use explicit thresholds',
    ],
    tddBacklog: [
      { phase: 'RED', items: ['add failing parser/timeout/fallback tests'] },
      { phase: 'GREEN', items: ['patch harness parser/prompts minimally'] },
      { phase: 'REFACTOR', items: ['simplify report mode-selection logic'] },
      { phase: 'VERIFY', items: ['run eval tests + validate metrics outputs'] },
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

module.exports = { parseArgs, resolveHarness, main };
