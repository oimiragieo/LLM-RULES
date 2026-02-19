#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { safeParseJSON } = require('../utils/safe-json.cjs');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');

const DEFAULT_QUEUE_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'evolution-requests.jsonl'
);
const DEFAULT_DISPATCH_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'evolution-dispatch-plan.json'
);

function readEvolutionRequests(queuePath = DEFAULT_QUEUE_PATH) {
  if (!fs.existsSync(queuePath)) return [];
  const raw = fs.readFileSync(queuePath, 'utf8');
  if (!raw.trim()) return [];
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => safeParseJSON(line, null))
    .filter(entry => entry && typeof entry === 'object');
}

function extractTargetName(request) {
  const explicit = String(request?.targetArtifact?.name || '').trim();
  if (explicit) return explicit;
  const evidence = String(request?.evidence || '');
  const summary = String(request?.summary || '');
  const combined = `${evidence} ${summary}`;
  const match = combined.match(/\b(skill|agent)\s+([a-z0-9][a-z0-9-_]{1,80})\b/i);
  return match ? match[2] : '';
}

function buildDispatchAction(request) {
  const trigger = String(request?.trigger || '').trim();
  const requestId = String(request?.id || '').trim() || null;
  const targetName = extractTargetName(request);

  // Explicit priority path: stale_skill always routes to skill-updater.
  if (trigger === 'stale_skill') {
    const args = targetName
      ? `--skill ${targetName} --trigger stale_skill --mode plan`
      : '--trigger stale_skill --mode plan';
    return {
      requestId,
      trigger,
      priority: 'high',
      executorSkill: 'skill-updater',
      args,
      reason: 'stale artifact recommendation routed to skill-updater',
    };
  }

  const suggestedType = String(request?.suggestedArtifactType || '').trim();
  if (suggestedType === 'skill') {
    return {
      requestId,
      trigger,
      priority: 'medium',
      executorSkill: 'skill-updater',
      args: targetName
        ? `--skill ${targetName} --trigger evolve --mode plan`
        : '--trigger evolve --mode plan',
      reason: 'skill recommendation routed to skill-updater',
    };
  }

  if (suggestedType === 'agent') {
    return {
      requestId,
      trigger,
      priority: 'medium',
      executorSkill: 'agent-updater',
      args: targetName
        ? `--agent ${targetName} --trigger evolve --mode plan`
        : '--trigger evolve --mode plan',
      reason: 'agent recommendation routed to agent-updater',
    };
  }

  return {
    requestId,
    trigger,
    priority: 'low',
    executorSkill: 'recommend-evolution',
    args: '--trigger other',
    reason: 'fallback route for unsupported recommendation type',
  };
}

function buildDispatchPlan(requests, options = {}) {
  const maxItems = Number(options.maxItems || 50);
  const pending = requests.filter(entry => String(entry?.status || 'proposed') === 'proposed');
  const sorted = pending.sort((a, b) => {
    const aStale = a?.trigger === 'stale_skill' ? 0 : 1;
    const bStale = b?.trigger === 'stale_skill' ? 0 : 1;
    if (aStale !== bStale) return aStale - bStale;
    const aTs = Date.parse(a?.timestamp || '') || 0;
    const bTs = Date.parse(b?.timestamp || '') || 0;
    return aTs - bTs;
  });

  const actions = sorted.slice(0, maxItems).map(buildDispatchAction);
  return {
    timestamp: new Date().toISOString(),
    sourceQueue: options.queuePath || DEFAULT_QUEUE_PATH,
    totalPending: pending.length,
    actions,
  };
}

function writeDispatchPlan(plan, outputPath = DEFAULT_DISPATCH_PATH) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(plan, null, 2), 'utf8');
  return outputPath;
}

function generateAndPersistDispatchPlan(options = {}) {
  const queuePath = options.queuePath || DEFAULT_QUEUE_PATH;
  const outputPath = options.outputPath || DEFAULT_DISPATCH_PATH;
  const requests = readEvolutionRequests(queuePath);
  const plan = buildDispatchPlan(requests, { ...options, queuePath });
  writeDispatchPlan(plan, outputPath);
  return plan;
}

module.exports = {
  DEFAULT_QUEUE_PATH,
  DEFAULT_DISPATCH_PATH,
  readEvolutionRequests,
  extractTargetName,
  buildDispatchAction,
  buildDispatchPlan,
  writeDispatchPlan,
  generateAndPersistDispatchPlan,
};
