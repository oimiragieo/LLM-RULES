'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { atomicWriteJSONSync } = require('../utils/atomic-write.cjs');

const DEFAULT_EVIDENCE_RELATIVE_DIR = path.join('.claude', 'context', 'ci', 'failure-evidence');
const SECRET_KEY_RE = /(token|secret|api[_-]?key|password|auth)/i;
const SECRET_VALUE_RE = /\b(token|secret|api[_-]?key|password)\s*[:=]\s*([^\s,;]+)/gi;

function resolveEvidenceDir(projectRoot) {
  return path.join(projectRoot || process.cwd(), DEFAULT_EVIDENCE_RELATIVE_DIR);
}

function redactString(value) {
  if (typeof value !== 'string') return value;
  return value.replace(SECRET_VALUE_RE, (_, label) => `${label}=[REDACTED]`);
}

function sanitizeValue(value, keyHint) {
  if (SECRET_KEY_RE.test(String(keyHint || ''))) {
    return '[REDACTED]';
  }

  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return value;
  if (Array.isArray(value)) return value.map(item => sanitizeValue(item));
  if (typeof value !== 'object') return String(value);

  const out = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    out[key] = sanitizeValue(nestedValue, key);
  }
  return out;
}

function runGit(projectRoot, args) {
  const result = spawnSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) return null;
  return String(result.stdout || '').trim();
}

function resolveGitBranch(projectRoot, env) {
  if (env?.GITHUB_REF_NAME) return String(env.GITHUB_REF_NAME);
  return runGit(projectRoot, ['branch', '--show-current']) || null;
}

function resolveGitRef(projectRoot, env) {
  if (env?.GITHUB_SHA) return String(env.GITHUB_SHA);
  return runGit(projectRoot, ['rev-parse', 'HEAD']) || null;
}

function getChangedFiles(projectRoot, options = {}) {
  if (Array.isArray(options.changedFiles)) {
    return options.changedFiles.filter(file => typeof file === 'string' && file.trim() !== '');
  }

  const diffArgs =
    options.base && options.head
      ? ['diff', '--name-only', '--diff-filter=ACMR', options.base, options.head]
      : ['diff', '--name-only', '--diff-filter=ACMR', 'HEAD'];
  const output = runGit(projectRoot, diffArgs);
  if (!output) return [];
  return output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

function collectFailureEvidence(projectRoot, options = {}) {
  const env = options.env || process.env;
  const root = projectRoot || process.cwd();

  return {
    generatedAt: new Date().toISOString(),
    runtime: {
      nodeVersion: process.version,
      platform: process.platform,
    },
    git: {
      branch: resolveGitBranch(root, env),
      ref: resolveGitRef(root, env),
    },
    ci: {
      workflow: env.GITHUB_WORKFLOW || null,
      job: env.GITHUB_JOB || null,
      runId: env.GITHUB_RUN_ID || null,
    },
    changedFiles: getChangedFiles(root, options),
    failure: sanitizeValue(options.failure || null),
    extra: sanitizeValue(options.extra || null),
  };
}

function writeFailureEvidence(projectRoot, options = {}) {
  const evidenceDir = resolveEvidenceDir(projectRoot);
  const evidencePath = path.join(evidenceDir, `failure-evidence-${Date.now()}.json`);
  const payload = collectFailureEvidence(projectRoot, options);
  atomicWriteJSONSync(evidencePath, payload);
  return evidencePath;
}

module.exports = {
  DEFAULT_EVIDENCE_RELATIVE_DIR,
  collectFailureEvidence,
  getChangedFiles,
  writeFailureEvidence,
};
