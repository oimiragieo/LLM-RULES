#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const FORCE_INCLUDE = new Set([
  'PLANNER_FIRST_ENFORCEMENT',
  'SECURITY_REVIEW_ENFORCEMENT',
  'CREATOR_GUARD',
  'SPAWN_PROMPT_VALIDATOR',
  'ROUTER_WRITE_GUARD',
  'RESEARCH_ENFORCEMENT',
  'REFLECTION_STEP0_ENFORCEMENT',
  'TASK_COMPLETION_GUARD',
  'TASKLIST_FIRST_ENFORCEMENT',
  'TASKUPDATE_FIRST_ENFORCEMENT',
  'TASKUPDATE_FIRST_AUTOMARK',
  'TASKUPDATE_FIRST_BOOTSTRAP',
  'INTEGRATION_ENFORCEMENT',
  'TOOL_SCOPE_VALIDATOR',
  'REGISTRY_CONSISTENCY_GATE',
  'HOOK_FAIL_OPEN',
  'STATE_STALE_THRESHOLD_MS',
]);

function isEnforcementVar(name) {
  if (FORCE_INCLUDE.has(name)) return true;
  if (name.startsWith('TASKUPDATE_FIRST_')) return true;
  if (name.startsWith('TASKLIST_FIRST_')) return true;
  if (name.includes('ENFORCEMENT')) return true;
  if (name.includes('GUARD')) return true;
  if (name.includes('VALIDATOR')) return true;
  if (name.includes('FAIL_OPEN')) return true;
  return false;
}

function walkFiles(dir, predicate, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, predicate, acc);
      continue;
    }
    if (entry.isFile() && predicate(full)) {
      acc.push(full);
    }
  }
  return acc;
}

function extractHookEnvVars(hooksRoot) {
  const files = walkFiles(hooksRoot, file => file.endsWith('.cjs'));
  const vars = new Set();
  const pattern = /process\.env\.([A-Z0-9_]+)/g;
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = pattern.exec(text)) !== null) {
      vars.add(match[1]);
    }
  }
  return Array.from(vars).sort();
}

function extractDocEnvVars(docPath) {
  if (!fs.existsSync(docPath)) return [];
  const text = fs.readFileSync(docPath, 'utf8');
  const vars = new Set();
  const pattern = /`([A-Z][A-Z0-9_]+)`/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    vars.add(match[1]);
  }
  return Array.from(vars).sort();
}

function parseEnvExampleVars(envExamplePath) {
  const text = fs.readFileSync(envExamplePath, 'utf8');
  const vars = new Set();
  const pattern = /^\s*#?\s*([A-Z][A-Z0-9_]+)\s*=/gm;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    vars.add(match[1]);
  }
  return Array.from(vars).sort();
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    hooksRoot: path.join(PROJECT_ROOT, '.claude', 'hooks'),
    envExamplePath: path.join(PROJECT_ROOT, '.env.example'),
    envDocPath: path.join(PROJECT_ROOT, '.claude', 'docs', '@ENVIRONMENT_CONFIG.md'),
    strict: true,
    json: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--hooks-root' && args[i + 1]) {
      opts.hooksRoot = path.resolve(args[++i]);
    } else if (arg === '--env-example' && args[i + 1]) {
      opts.envExamplePath = path.resolve(args[++i]);
    } else if (arg === '--env-doc' && args[i + 1]) {
      opts.envDocPath = path.resolve(args[++i]);
    } else if (arg === '--strict') {
      opts.strict = true;
    } else if (arg === '--no-strict') {
      opts.strict = false;
    } else if (arg === '--json') {
      opts.json = true;
    }
  }
  return opts;
}

function main(argv = process.argv) {
  const opts = parseArgs(argv);
  const hookVars = extractHookEnvVars(opts.hooksRoot);
  const docVars = extractDocEnvVars(opts.envDocPath);
  const envExampleVars = parseEnvExampleVars(opts.envExamplePath);
  const required = new Set([...hookVars, ...docVars].filter(isEnforcementVar));
  const missing = Array.from(required)
    .filter(name => !envExampleVars.includes(name))
    .sort();

  const result = {
    hooksRoot: path.relative(PROJECT_ROOT, opts.hooksRoot),
    envExamplePath: path.relative(PROJECT_ROOT, opts.envExamplePath),
    envDocPath: path.relative(PROJECT_ROOT, opts.envDocPath),
    requiredCount: required.size,
    missingCount: missing.length,
    missing,
    strict: opts.strict,
  };

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (missing.length === 0) {
    process.stdout.write('enforcement-env-sync: PASS\n');
  } else {
    process.stdout.write(`enforcement-env-sync: ${opts.strict ? 'FAIL' : 'WARN'} (${missing.length} missing)\n`);
    for (const item of missing) {
      process.stdout.write(` - ${item}\n`);
    }
  }

  if (opts.strict && missing.length > 0) {
    process.exitCode = 1;
  }
  return result;
}

if (require.main === module) {
  main();
}

module.exports = {
  extractHookEnvVars,
  extractDocEnvVars,
  parseEnvExampleVars,
  isEnforcementVar,
  parseArgs,
  main,
};
