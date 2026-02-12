'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PROJECT_ROOT, validatePathWithinProject } = require('../utils/project-root.cjs');
const { atomicWriteSync } = require('../utils/atomic-write.cjs');

const OBSERVATIONS_FILE = path.join('.claude', 'context', 'memory', 'observations.jsonl');
const OBSERVATIONS_SUMMARY_FILE = path.join(
  '.claude',
  'context',
  'memory',
  'observations_summary.md'
);
const MEMORY_CACHE_STABILITY_FILE = path.join(
  '.claude',
  'context',
  'metrics',
  'memory-cache-stability.jsonl'
);
const DEFAULT_OBSERVATION_DECAY_PER_HOUR = 0.02;

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

function resolveMemoryCacheStabilityPath(projectRoot = PROJECT_ROOT) {
  const root = resolveProjectRoot(projectRoot);
  const metricsPath = path.join(root, MEMORY_CACHE_STABILITY_FILE);
  const validation = validatePathWithinProject(metricsPath, root);
  if (!validation.safe) {
    throw new Error(`Invalid memory cache stability path: ${validation.reason}`);
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

function getObservationDecayPerHour() {
  const configured = Number(process.env.OBSERVATIONS_DECAY_PER_HOUR);
  if (!Number.isFinite(configured) || configured < 0) {
    return DEFAULT_OBSERVATION_DECAY_PER_HOUR;
  }
  return configured;
}

function scoreObservations(observations, options = {}) {
  const rows = Array.isArray(observations) ? observations.slice() : [];
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const decayPerHour = Number.isFinite(options.decayPerHour)
    ? options.decayPerHour
    : getObservationDecayPerHour();

  return rows
    .map(row => {
      const tsMs = Date.parse(String(row?.timestamp || ''));
      const ageHours =
        Number.isFinite(tsMs) && tsMs <= nowMs ? (nowMs - tsMs) / (1000 * 60 * 60) : 0;
      const recency_factor = Math.exp(-decayPerHour * ageHours);
      const confidence = Number.isFinite(Number(row?.confidence)) ? Number(row.confidence) : 0;
      const score = confidence * recency_factor;
      return { ...row, recency_factor, score };
    })
    .sort((a, b) => Number(b?.score || 0) - Number(a?.score || 0));
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

function recordMemoryBlockChurn(projectRoot, memorySectionString) {
  const metricsPath = resolveMemoryCacheStabilityPath(projectRoot);
  const content = String(memorySectionString || '');
  const memory_block_hash = crypto.createHash('sha256').update(content).digest('hex');

  fs.mkdirSync(path.dirname(metricsPath), { recursive: true });

  let previous_hash = null;
  if (fs.existsSync(metricsPath)) {
    const lines = fs.readFileSync(metricsPath, 'utf8').split('\n').filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const row = JSON.parse(lines[i]);
        if (row && typeof row.previous_hash !== 'undefined' && row.memory_block_hash) {
          previous_hash = String(row.memory_block_hash);
          break;
        }
      } catch (_err) {
        // Skip malformed lines
      }
    }
  }

  const churned = previous_hash !== null ? memory_block_hash !== previous_hash : false;
  const entry = {
    timestamp: new Date().toISOString(),
    memory_block_hash,
    previous_hash,
    churned,
  };
  fs.appendFileSync(metricsPath, JSON.stringify(entry) + '\n', 'utf8');
  return entry;
}

module.exports = {
  OBSERVATIONS_FILE,
  OBSERVATIONS_SUMMARY_FILE,
  MEMORY_CACHE_STABILITY_FILE,
  DEFAULT_OBSERVATION_DECAY_PER_HOUR,
  appendObservation,
  readObservations,
  scoreObservations,
  getByTopic,
  compactObservationsToSummary,
  recordMemoryBlockChurn,
  resolveObservationsPath,
  resolveObservationsSummaryPath,
  resolveMemoryCacheStabilityPath,
  getObservationDecayPerHour,
  normalizeObservation,
};
