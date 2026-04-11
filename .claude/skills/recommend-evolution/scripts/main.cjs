#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ALLOWED_TRIGGERS = new Set([
  'repeated_error',
  'no_agent',
  'integration_gap',
  'user_request',
  'rubric_regression',
  'stale_skill',
  'other',
]);

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
const EVOLUTION_QUEUE_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'evolution-requests.jsonl'
);

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

function normalizeTrigger(trigger) {
  const value = String(trigger || '').trim();
  return ALLOWED_TRIGGERS.has(value) ? value : null;
}

function toText(value, fallback = '') {
  const text = String(value == null ? '' : value).trim();
  return text || fallback;
}

function ensureQueueDir(queuePath = EVOLUTION_QUEUE_PATH) {
  fs.mkdirSync(path.dirname(queuePath), { recursive: true });
}

function buildRequest(options = {}) {
  const trigger = normalizeTrigger(options.trigger);
  if (!trigger) {
    return { ok: false, error: 'Invalid or missing --trigger' };
  }

  const suggestedArtifactType = toText(
    options.suggestedArtifactType || options.suggested_artifact_type,
    null
  );
  const source = toText(options.source, 'recommend-evolution');
  const evidence = toText(
    options.evidence,
    trigger === 'stale_skill' ? 'Stale artifact detected by audit.' : 'No evidence provided.'
  );
  const summary = toText(
    options.summary,
    'Recommend capability evolution based on repeated signals.'
  );
  const now = new Date().toISOString();
  const idInput = `${trigger}|${suggestedArtifactType || 'unknown'}|${summary}|${evidence}`;
  // M-03: non-security use (cache key / content addressing / UUID namespace); MD5/SHA-1 acceptable
  const id = `evo_${crypto.createHash('sha1').update(idInput).digest('hex').slice(0, 12)}`;

  return {
    ok: true,
    request: {
      id,
      timestamp: now,
      source,
      trigger,
      evidence,
      suggestedArtifactType: suggestedArtifactType || null,
      summary,
      status: 'proposed',
    },
  };
}

function appendQueueEntry(entry, queuePath = EVOLUTION_QUEUE_PATH) {
  ensureQueueDir(queuePath);
  const line = `${JSON.stringify(entry)}\n`;
  fs.appendFileSync(queuePath, line, 'utf8');
  return queuePath;
}

function main(input = null) {
  const options = input || parseArgs(process.argv.slice(2));
  if (options.help) {
    return {
      success: true,
      usage:
        'node .claude/skills/recommend-evolution/scripts/main.cjs --trigger <type> [--suggestedArtifactType skill|agent|workflow|hook|schema|command] [--summary <text>] [--evidence <text>] [--source <text>]',
    };
  }

  const built = buildRequest(options);
  if (!built.ok) {
    return {
      success: false,
      error: built.error,
    };
  }

  const queuePath = appendQueueEntry(built.request, EVOLUTION_QUEUE_PATH);
  return {
    success: true,
    result: {
      request: built.request,
      queuePath: path.relative(PROJECT_ROOT, queuePath).replace(/\\/g, '/'),
    },
  };
}

if (require.main === module) {
  const result = main();
  if (result.usage) {
    console.log(result.usage);
    process.exit(0);
  }
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}

module.exports = {
  ALLOWED_TRIGGERS,
  parseArgs,
  normalizeTrigger,
  buildRequest,
  appendQueueEntry,
  main,
  EVOLUTION_QUEUE_PATH,
};
