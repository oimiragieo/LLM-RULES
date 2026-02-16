#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWriteJSONSync } = require('../../lib/utils/atomic-write.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const LEDGER_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'task-claim-ledger.json'
);

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled', 'canceled', 'deleted']);

function ensureRuntimeDir() {
  const dir = path.dirname(LEDGER_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function normalizePathToken(value) {
  if (value == null) return '';
  let token = String(value).trim();
  if (!token) return '';
  token = token.replace(/\\/g, '/');
  token = token.replace(/\/+/g, '/');
  token = token.replace(/^\.\//, '');
  token = token.replace(/\/$/, '');
  return process.platform === 'win32' ? token.toLowerCase() : token;
}

function normalizePathList(values) {
  if (!Array.isArray(values)) return [];
  const out = new Set();
  for (const value of values) {
    const normalized = normalizePathToken(value);
    if (normalized) out.add(normalized);
  }
  return Array.from(out);
}

function hasPathOverlap(a, b) {
  for (const left of a) {
    for (const right of b) {
      if (left === right) return true;
      if (left.startsWith(`${right}/`)) return true;
      if (right.startsWith(`${left}/`)) return true;
    }
  }
  return false;
}

function defaultLedger() {
  return {
    claims: {},
    updatedAt: null,
  };
}

function readLedger() {
  try {
    if (!fs.existsSync(LEDGER_FILE)) return defaultLedger();
    const parsed = safeParseJSON(fs.readFileSync(LEDGER_FILE, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || typeof parsed.claims !== 'object') {
      return defaultLedger();
    }
    return {
      claims: parsed.claims || {},
      updatedAt: parsed.updatedAt || null,
    };
  } catch (_err) {
    return defaultLedger();
  }
}

function writeLedger(ledger) {
  ensureRuntimeDir();
  const payload = {
    claims: ledger.claims || {},
    updatedAt: new Date().toISOString(),
  };
  atomicWriteJSONSync(LEDGER_FILE, payload);
}

function isClaimExpired(claim) {
  const ttlMs = Number(process.env.TASK_CLAIM_TTL_MS || 2 * 60 * 60 * 1000);
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) return false;
  const ts = Date.parse(claim?.updatedAt || claim?.createdAt || '');
  if (!Number.isFinite(ts) || ts <= 0) return false;
  return Date.now() - ts > ttlMs;
}

function pruneExpiredClaims(ledger) {
  const claims = ledger.claims || {};
  let changed = false;
  for (const [taskId, claim] of Object.entries(claims)) {
    if (isClaimExpired(claim)) {
      delete claims[taskId];
      changed = true;
    }
  }
  if (changed) {
    writeLedger(ledger);
  }
}

function getActiveClaims() {
  const ledger = readLedger();
  pruneExpiredClaims(ledger);
  return Object.values(ledger.claims || {}).filter(claim => claim && claim.active !== false);
}

function parsePromptList(prompt, key) {
  if (!prompt || typeof prompt !== 'string') return [];
  const re = new RegExp(`^\\s*${key}\\s*:\\s*(.+)$`, 'im');
  const match = prompt.match(re);
  if (!match || !match[1]) return [];
  return match[1]
    .split(/[,;]/)
    .map(v => v.trim())
    .filter(Boolean);
}

function extractClaimMetadataFromTaskInput(toolInput = {}) {
  const prompt = String(toolInput.prompt || '');
  const ownedFromInput = Array.isArray(toolInput.owned_paths)
    ? toolInput.owned_paths
    : Array.isArray(toolInput.ownedPaths)
      ? toolInput.ownedPaths
      : [];
  const allowedFiles = Array.isArray(toolInput.allowed_files)
    ? toolInput.allowed_files
    : Array.isArray(toolInput.allowedFiles)
      ? toolInput.allowedFiles
      : [];
  const allowedFromPrompt = parsePromptList(prompt, 'ALLOWED_FILES');
  const ownedFromPrompt = parsePromptList(prompt, 'OWNED_PATHS');
  const dependencies = (Array.isArray(toolInput.depends_on) ? toolInput.depends_on : []).concat(
    parsePromptList(prompt, 'DEPENDS_ON')
  );
  const dependencyType =
    toolInput.dependency_type ||
    toolInput.dependencyType ||
    parsePromptList(prompt, 'DEPENDENCY_TYPE')[0] ||
    'blocks';

  return {
    ownedPaths: normalizePathList([
      ...ownedFromInput,
      ...allowedFiles,
      ...allowedFromPrompt,
      ...ownedFromPrompt,
    ]),
    dependsOn: Array.from(new Set(dependencies.map(v => String(v || '').trim()).filter(Boolean))),
    dependencyType: String(dependencyType || 'blocks')
      .trim()
      .toLowerCase(),
  };
}

function findOwnershipConflicts({ taskId, ownedPaths }) {
  const candidate = normalizePathList(ownedPaths);
  if (candidate.length === 0) return [];
  const activeClaims = getActiveClaims();
  const conflicts = [];
  for (const claim of activeClaims) {
    if (!claim || !claim.taskId) continue;
    if (taskId && claim.taskId === taskId) continue;
    const claimPaths = normalizePathList(claim.ownedPaths);
    if (claimPaths.length === 0) continue;
    if (hasPathOverlap(candidate, claimPaths)) {
      conflicts.push(claim);
    }
  }
  return conflicts;
}

function upsertClaim(claim) {
  if (!claim || !claim.taskId) return;
  const ledger = readLedger();
  ledger.claims[claim.taskId] = {
    taskId: String(claim.taskId),
    sessionId: claim.sessionId || null,
    agentType: claim.agentType || null,
    ownedPaths: normalizePathList(claim.ownedPaths),
    dependsOn: Array.isArray(claim.dependsOn) ? claim.dependsOn : [],
    dependencyType: String(claim.dependencyType || 'blocks').toLowerCase(),
    active: claim.active !== false,
    createdAt: claim.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  writeLedger(ledger);
}

function releaseClaim(taskId, status = null) {
  if (!taskId) return;
  const ledger = readLedger();
  const key = String(taskId);
  const existing = ledger.claims[key];
  if (!existing) return;
  if (!status || TERMINAL_STATUSES.has(String(status).toLowerCase())) {
    delete ledger.claims[key];
    writeLedger(ledger);
    return;
  }
  existing.updatedAt = new Date().toISOString();
  existing.active = true;
  ledger.claims[key] = existing;
  writeLedger(ledger);
}

function clearLedger() {
  if (fs.existsSync(LEDGER_FILE)) {
    fs.unlinkSync(LEDGER_FILE);
  }
}

module.exports = {
  LEDGER_FILE,
  TERMINAL_STATUSES,
  normalizePathToken,
  normalizePathList,
  hasPathOverlap,
  readLedger,
  writeLedger,
  getActiveClaims,
  extractClaimMetadataFromTaskInput,
  findOwnershipConflicts,
  upsertClaim,
  releaseClaim,
  clearLedger,
};
