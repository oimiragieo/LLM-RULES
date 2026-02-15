#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { appendJsonl } = require('../utils/jsonl-utils.cjs');
const { parseAndValidateTaskUpdate } = require('../routing/task-update-contract.cjs');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');

function getRuntimePaths(projectRoot = PROJECT_ROOT) {
  const runtimeDir = path.join(projectRoot, '.claude', 'context', 'runtime');
  return {
    runtimeDir,
    ledgerPath: path.join(runtimeDir, 'artifact-score-ledger.jsonl'),
    remediationPath: path.join(runtimeDir, 'remediation-queue.jsonl'),
  };
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function average(values) {
  const nums = values.map(toNumber).filter(v => v != null);
  if (nums.length === 0) return null;
  return nums.reduce((sum, x) => sum + x, 0) / nums.length;
}

function normalizeArtifactType(raw) {
  const value = String(raw || 'unknown')
    .trim()
    .toLowerCase();
  if (
    ['agent', 'skill', 'hook', 'workflow', 'schema', 'template', 'tool', 'command'].includes(value)
  ) {
    return value;
  }
  return 'unknown';
}

function buildScoreEntry(hookInput) {
  const toolUse = hookInput?.toolUse || {};
  if (toolUse.tool !== 'TaskUpdate') return null;

  const toolInput = toolUse.input || {};
  const parsed = parseAndValidateTaskUpdate(toolInput, {
    requireTaskId: false,
    requireStatus: false,
  });
  const normalized = parsed.normalized || {};
  if (normalized.status !== 'completed') return null;

  const metadata =
    toolInput.metadata && typeof toolInput.metadata === 'object' ? toolInput.metadata : {};
  const scores = metadata.scores && typeof metadata.scores === 'object' ? metadata.scores : {};

  const dimensions = {
    completeness: toNumber(scores.completeness),
    accuracy: toNumber(scores.accuracy),
    clarity: toNumber(scores.clarity),
    consistency: toNumber(scores.consistency),
    actionability: toNumber(scores.actionability),
  };

  const derivedOverall = average(Object.values(dimensions));
  const overallScore =
    toNumber(metadata.overallScore) ??
    toNumber(metadata.qualityScore) ??
    toNumber(metadata.score) ??
    toNumber(scores.overall) ??
    derivedOverall;

  const artifactType = normalizeArtifactType(metadata.artifactType || metadata.type);
  const artifactName = String(
    metadata.artifactName ||
      metadata.name ||
      metadata.artifact ||
      normalized.taskId ||
      'unknown-artifact'
  ).trim();
  const artifactPath =
    typeof metadata.artifactPath === 'string' && metadata.artifactPath.trim()
      ? metadata.artifactPath.trim()
      : null;

  return {
    timestamp: new Date().toISOString(),
    sessionId: hookInput?.session_id || process.env.CLAUDE_SESSION_ID || null,
    taskId: normalized.taskId || null,
    artifactType,
    artifactName,
    artifactPath,
    source: metadata.source || 'taskupdate_metadata',
    dimensions,
    overallScore,
    thresholdPass: toNumber(process.env.ARTIFACT_SCORE_PASS_THRESHOLD) ?? 0.7,
    thresholdCritical: toNumber(process.env.ARTIFACT_SCORE_CRITICAL_THRESHOLD) ?? 0.4,
    notes: typeof metadata.summary === 'string' ? metadata.summary : null,
  };
}

function artifactKey(entry) {
  const type = normalizeArtifactType(entry?.artifactType);
  const name = String(entry?.artifactName || 'unknown-artifact')
    .trim()
    .toLowerCase();
  return `${type}:${name}`;
}

function readJsonlSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const lines = fs
      .readFileSync(filePath, 'utf8')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
    const out = [];
    for (const line of lines) {
      try {
        out.push(JSON.parse(line));
      } catch (_e) {
        // best effort
      }
    }
    return out;
  } catch (_e) {
    return [];
  }
}

function readLastScoreByArtifact(ledgerPath) {
  const entries = readJsonlSafe(ledgerPath);
  const latest = new Map();
  for (const item of entries) {
    latest.set(artifactKey(item), item);
  }
  return latest;
}

function appendScoreEntry(entry, ledgerPath) {
  appendJsonl(ledgerPath, entry, { maxLines: 20000 });
}

function readRemediationState(remediationPath) {
  const entries = readJsonlSafe(remediationPath);
  const state = new Map();
  for (const item of entries) {
    const key = String(item?.artifactKey || '');
    if (!key) continue;
    state.set(key, item);
  }
  return state;
}

function classifySeverity(entry, previousEntry) {
  const score = toNumber(entry?.overallScore);
  const critical = toNumber(entry?.thresholdCritical) ?? 0.4;
  const pass = toNumber(entry?.thresholdPass) ?? 0.7;
  const previousScore = toNumber(previousEntry?.overallScore);

  if (score == null) return null;
  if (score < critical) return 'critical';
  if (score < pass) return 'high';
  if (previousScore != null && score + 0.1 < previousScore) return 'medium';
  return null;
}

function maybeQueueRemediation(entry, previousEntry, remediationPath) {
  const key = artifactKey(entry);
  const severity = classifySeverity(entry, previousEntry);
  const currentState = readRemediationState(remediationPath).get(key);
  const now = new Date().toISOString();

  if (severity) {
    const event = {
      timestamp: now,
      action: 'open',
      status: 'open',
      artifactKey: key,
      artifactType: entry.artifactType,
      artifactName: entry.artifactName,
      artifactPath: entry.artifactPath,
      severity,
      overallScore: entry.overallScore,
      source: entry.source,
      notes: entry.notes || `Score below threshold (${entry.overallScore})`,
    };
    appendJsonl(remediationPath, event, { maxLines: 20000 });
    return event;
  }

  if (currentState && currentState.status === 'open') {
    const resolved = {
      timestamp: now,
      action: 'resolve',
      status: 'resolved',
      artifactKey: key,
      artifactType: entry.artifactType,
      artifactName: entry.artifactName,
      artifactPath: entry.artifactPath,
      severity: currentState.severity || 'high',
      overallScore: entry.overallScore,
      source: entry.source,
      notes: 'Auto-resolved: score returned to acceptable range',
    };
    appendJsonl(remediationPath, resolved, { maxLines: 20000 });
    return resolved;
  }

  return null;
}

function ensureRuntimeDirs(projectRoot = PROJECT_ROOT) {
  const { runtimeDir } = getRuntimePaths(projectRoot);
  if (!fs.existsSync(runtimeDir)) fs.mkdirSync(runtimeDir, { recursive: true });
}

module.exports = {
  getRuntimePaths,
  buildScoreEntry,
  artifactKey,
  readJsonlSafe,
  readLastScoreByArtifact,
  appendScoreEntry,
  readRemediationState,
  classifySeverity,
  maybeQueueRemediation,
  ensureRuntimeDirs,
};
