'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { atomicWriteJSONSync } = require('../utils/atomic-write.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');

const DEFAULT_LEDGER_RELATIVE_PATH = path.join('.claude', 'context', 'ci', 'flake-ledger.json');
const VALID_FAILURE_CATEGORIES = new Set([
  'product_regression',
  'test_defect',
  'env_nondeterminism',
  'unknown',
]);
const CORRUPT_SENTINEL = Object.freeze({ __flakeLedgerCorrupt: true });

function createEmptyLedger() {
  return {
    version: 1,
    updatedAt: null,
    entries: [],
  };
}

function resolveLedgerPath(projectRoot) {
  return path.join(projectRoot || process.cwd(), DEFAULT_LEDGER_RELATIVE_PATH);
}

function normalizeCategory(category) {
  if (typeof category !== 'string') return 'unknown';
  return VALID_FAILURE_CATEGORIES.has(category) ? category : 'unknown';
}

function buildFailureFingerprint(record) {
  const digest = crypto.createHash('sha256');
  digest.update(String(record?.testId || ''));
  digest.update('\n');
  digest.update(String(record?.filePath || ''));
  digest.update('\n');
  digest.update(String(record?.message || '').trim());
  return digest.digest('hex');
}

function sanitizeRunContext(runContext) {
  if (!runContext || typeof runContext !== 'object' || Array.isArray(runContext)) {
    return {};
  }

  const out = {};
  for (const [key, value] of Object.entries(runContext)) {
    if (value == null) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    }
  }
  return out;
}

function isLedgerShape(value) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray(value.entries) &&
    typeof value.version === 'number'
  );
}

function quarantineMalformedLedger(ledgerPath) {
  if (!fs.existsSync(ledgerPath)) return null;
  const dir = path.dirname(ledgerPath);
  const baseName = path.basename(ledgerPath, '.json');
  const quarantinePath = path.join(dir, `${baseName}.corrupt-${Date.now()}.json`);
  fs.renameSync(ledgerPath, quarantinePath);
  return quarantinePath;
}

function readLedgerFile(ledgerPath, { quarantineOnError = false } = {}) {
  if (!fs.existsSync(ledgerPath)) {
    return { ledger: createEmptyLedger(), quarantinedPath: null };
  }

  const raw = fs.readFileSync(ledgerPath, 'utf8');
  const parsed = safeParseJSON(raw, null, null, CORRUPT_SENTINEL);

  if (parsed === CORRUPT_SENTINEL || !isLedgerShape(parsed)) {
    const quarantinedPath = quarantineOnError ? quarantineMalformedLedger(ledgerPath) : null;
    return { ledger: createEmptyLedger(), quarantinedPath };
  }

  return {
    ledger: {
      version: Number(parsed.version) || 1,
      updatedAt: parsed.updatedAt || null,
      entries: parsed.entries.map(entry => ({ ...entry })),
    },
    quarantinedPath: null,
  };
}

function loadFlakeLedger(projectRoot) {
  const ledgerPath = resolveLedgerPath(projectRoot);
  return readLedgerFile(ledgerPath).ledger;
}

function recordFlakeFailure(projectRoot, record) {
  const ledgerPath = resolveLedgerPath(projectRoot);
  const { ledger } = readLedgerFile(ledgerPath, { quarantineOnError: true });
  const now = new Date().toISOString();
  const normalized = {
    fingerprint: buildFailureFingerprint(record),
    testId: String(record?.testId || 'unknown-test'),
    filePath: String(record?.filePath || ''),
    message: String(record?.message || ''),
    category: normalizeCategory(record?.category),
    runContext: sanitizeRunContext(record?.runContext),
  };

  const existing = ledger.entries.find(entry => entry.fingerprint === normalized.fingerprint);
  if (existing) {
    existing.occurrences = Number(existing.occurrences || 0) + 1;
    existing.lastSeenAt = now;
    existing.category = normalized.category;
    existing.runContext = normalized.runContext;
  } else {
    ledger.entries.push({
      ...normalized,
      occurrences: 1,
      firstSeenAt: now,
      lastSeenAt: now,
    });
  }

  ledger.updatedAt = now;
  atomicWriteJSONSync(ledgerPath, ledger);
  return ledger.entries.find(entry => entry.fingerprint === normalized.fingerprint);
}

function summarizeFlakeLedger(projectRoot) {
  const ledger = loadFlakeLedger(projectRoot);
  const byCategory = {
    product_regression: 0,
    test_defect: 0,
    env_nondeterminism: 0,
    unknown: 0,
  };
  let totalOccurrences = 0;

  for (const entry of ledger.entries) {
    const occurrences = Number(entry.occurrences || 0);
    totalOccurrences += occurrences;
    byCategory[normalizeCategory(entry.category)] += occurrences;
  }

  return {
    ledgerPath: resolveLedgerPath(projectRoot),
    updatedAt: ledger.updatedAt,
    totalEntries: ledger.entries.length,
    totalOccurrences,
    byCategory,
  };
}

module.exports = {
  DEFAULT_LEDGER_RELATIVE_PATH,
  VALID_FAILURE_CATEGORIES,
  buildFailureFingerprint,
  loadFlakeLedger,
  recordFlakeFailure,
  summarizeFlakeLedger,
};
