'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { PROJECT_ROOT, validatePathWithinProject } = require('../utils/project-root.cjs');
const { atomicWriteSync } = require('../utils/atomic-write.cjs');

const OBSERVATIONS_FILE = path.join('.claude', 'context', 'memory', 'observations.jsonl');
const OBSERVATIONS_SUMMARY_FILE = path.join(
  '.claude',
  'context',
  'memory',
  'observations_summary.md'
);

function resolveProjectRoot(projectRoot = PROJECT_ROOT) {
  if (!projectRoot || typeof projectRoot !== 'string') {
    throw new Error('projectRoot is required');
  }
  return path.resolve(projectRoot);
}

function resolveObservationsPath(projectRoot = PROJECT_ROOT) {
  const root = resolveProjectRoot(projectRoot);
  const observationsPath = path.join(root, OBSERVATIONS_FILE);
  const validation = validatePathWithinProject(observationsPath, root);
  if (!validation.safe) {
    throw new Error(`Invalid observations path: ${validation.reason}`);
  }
  return validation.resolvedPath;
}

function resolveObservationsSummaryPath(projectRoot = PROJECT_ROOT) {
  const root = resolveProjectRoot(projectRoot);
  const summaryPath = path.join(root, OBSERVATIONS_SUMMARY_FILE);
  const validation = validatePathWithinProject(summaryPath, root);
  if (!validation.safe) {
    throw new Error(`Invalid observations summary path: ${validation.reason}`);
  }
  return validation.resolvedPath;
}

function normalizeObservation(record) {
  if (!record || typeof record !== 'object') {
    throw new Error('Observation record is required');
  }

  const requiredFields = ['timestamp', 'topic', 'fact', 'confidence', 'source_session'];
  for (const field of requiredFields) {
    if (!(field in record)) {
      throw new Error(`Observation is missing required field: ${field}`);
    }
  }

  const normalized = {
    timestamp: String(record.timestamp).trim(),
    topic: String(record.topic).trim(),
    fact: String(record.fact).trim(),
    confidence: Number(record.confidence),
    source_session: String(record.source_session).trim(),
  };

  if (!normalized.timestamp || Number.isNaN(Date.parse(normalized.timestamp))) {
    throw new Error('Observation timestamp must be a valid ISO timestamp');
  }
  if (!normalized.topic) {
    throw new Error('Observation topic must be non-empty');
  }
  if (!normalized.fact) {
    throw new Error('Observation fact must be non-empty');
  }
  if (!Number.isFinite(normalized.confidence)) {
    throw new Error('Observation confidence must be a finite number');
  }
  if (normalized.confidence < 0 || normalized.confidence > 1) {
    throw new Error('Observation confidence must be in range [0,1]');
  }
  if (!normalized.source_session) {
    throw new Error('Observation source_session must be non-empty');
  }

  if (record.id) normalized.id = String(record.id).trim();
  if (record.supersedes) normalized.supersedes = String(record.supersedes).trim();

  return normalized;
}

function appendObservation(projectRoot, record) {
  const observationsPath = resolveObservationsPath(projectRoot);
  const normalized = normalizeObservation(record);
  fs.mkdirSync(path.dirname(observationsPath), { recursive: true });
  fs.appendFileSync(observationsPath, JSON.stringify(normalized) + '\n', 'utf8');
  return normalized;
}

function readObservations(projectRoot, options = {}) {
  const observationsPath = resolveObservationsPath(projectRoot);
  if (!fs.existsSync(observationsPath)) return [];

  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 10;
  const sinceTs = options.since ? Date.parse(String(options.since)) : null;
  const lines = fs.readFileSync(observationsPath, 'utf8').split('\n').filter(Boolean);

  const parsed = [];
  for (const line of lines) {
    try {
      const row = JSON.parse(line);
      if (!row || typeof row !== 'object') continue;
      if (sinceTs && Number.isFinite(sinceTs)) {
        const rowTs = Date.parse(String(row.timestamp || ''));
        if (!Number.isFinite(rowTs) || rowTs < sinceTs) continue;
      }
      parsed.push(row);
    } catch (_err) {
      // Skip malformed JSON lines.
    }
  }

  return parsed.slice(-limit);
}

function getByTopic(projectRoot, topic, options = {}) {
  const normalizedTopic = String(topic || '').trim();
  if (!normalizedTopic) return [];

  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 5;
  const rows = readObservations(projectRoot, { limit: Number.MAX_SAFE_INTEGER });

  return rows
    .filter(row => String(row?.topic || '').trim() === normalizedTopic)
    .sort((a, b) => Date.parse(String(b?.timestamp || 0)) - Date.parse(String(a?.timestamp || 0)))
    .slice(0, limit);
}

function compactObservationsToSummary(projectRoot, options = {}) {
  const maxObservations =
    Number.isInteger(options.maxObservations) && options.maxObservations > 0
      ? options.maxObservations
      : 50;
  const summaryPath = resolveObservationsSummaryPath(projectRoot);
  const rows = readObservations(projectRoot, { limit: maxObservations });

  const byTopic = new Map();
  for (const row of rows) {
    const topic = String(row?.topic || 'general').trim() || 'general';
    if (!byTopic.has(topic)) byTopic.set(topic, []);
    byTopic.get(topic).push(row);
  }

  const lines = ['## Observational summary', '', `Generated: ${new Date().toISOString()}`, ''];
  if (rows.length === 0) {
    lines.push('- No observations captured yet.');
  } else {
    lines.push(`Source observations: ${rows.length}`, '');
    for (const [topic, topicRows] of byTopic.entries()) {
      const latest = topicRows[topicRows.length - 1];
      lines.push(`### ${topic}`);
      lines.push(`- ${String(latest?.fact || '').trim()}`);
      lines.push(`- Entries: ${topicRows.length}`);
      lines.push('');
    }
  }

  const summary = lines.join('\n').trimEnd() + '\n';
  atomicWriteSync(summaryPath, summary, 'utf8');

  return { summaryPath, summary, count: rows.length };
}

module.exports = {
  OBSERVATIONS_FILE,
  OBSERVATIONS_SUMMARY_FILE,
  appendObservation,
  readObservations,
  getByTopic,
  compactObservationsToSummary,
  resolveObservationsPath,
  resolveObservationsSummaryPath,
  normalizeObservation,
};
