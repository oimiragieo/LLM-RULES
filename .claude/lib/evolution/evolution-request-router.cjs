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
const DEFAULT_DEAD_LETTER_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'evolution-requests-dead-letter.jsonl'
);
const DEFAULT_REQUEST_TTL_HOURS = Number(process.env.EVOLUTION_REQUEST_TTL_HOURS || 24);
const DEFAULT_MAX_PENDING_REQUESTS = Number(process.env.EVOLUTION_REQUEST_MAX_PENDING || 200);
const DEFAULT_REQUIRE_EVAL_GATE =
  String(process.env.EVOLUTION_REQUIRE_EVAL_GATE || 'on').toLowerCase() !== 'off';

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
  const requireEvalGate =
    options.requireEvalGate == null ? DEFAULT_REQUIRE_EVAL_GATE : Boolean(options.requireEvalGate);
  const pending = requests.filter(entry => String(entry?.status || 'proposed') === 'proposed');
  const gated = [];
  const eligible = [];
  for (const entry of pending) {
    if (!requireEvalGate || entry?.trigger === 'stale_skill') {
      eligible.push(entry);
      continue;
    }
    const evalPassed =
      entry?.eval?.passed === true ||
      entry?.evaluation?.passed === true ||
      (typeof entry?.eval?.deltaScore === 'number' && entry.eval.deltaScore > 0) ||
      (typeof entry?.evaluation?.deltaScore === 'number' && entry.evaluation.deltaScore > 0);
    if (evalPassed) {
      eligible.push(entry);
    } else {
      gated.push(entry);
    }
  }
  const sorted = eligible.sort((a, b) => {
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
    gatedCount: gated.length,
    gatedRequestIds: gated
      .slice(0, 25)
      .map(entry => entry.id)
      .filter(Boolean),
    actions,
  };
}

function writeDispatchPlan(plan, outputPath = DEFAULT_DISPATCH_PATH) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(plan, null, 2), 'utf8');
  return outputPath;
}

function appendDeadLetters(deadLetters, deadLetterPath = DEFAULT_DEAD_LETTER_PATH) {
  if (!Array.isArray(deadLetters) || deadLetters.length === 0) return null;
  fs.mkdirSync(path.dirname(deadLetterPath), { recursive: true });
  const payload = deadLetters.map(entry => `${JSON.stringify(entry)}\n`).join('');
  fs.appendFileSync(deadLetterPath, payload, 'utf8');
  return deadLetterPath;
}

function writeQueueEntries(entries, queuePath = DEFAULT_QUEUE_PATH) {
  fs.mkdirSync(path.dirname(queuePath), { recursive: true });
  if (!Array.isArray(entries) || entries.length === 0) {
    fs.writeFileSync(queuePath, '', 'utf8');
    return queuePath;
  }
  const payload = entries.map(entry => `${JSON.stringify(entry)}\n`).join('');
  fs.writeFileSync(queuePath, payload, 'utf8');
  return queuePath;
}

function applyQueueGovernance(requests, options = {}) {
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const ttlHoursRaw = Number(
    options.ttlHours != null ? options.ttlHours : DEFAULT_REQUEST_TTL_HOURS
  );
  const ttlHours = Number.isFinite(ttlHoursRaw) && ttlHoursRaw > 0 ? ttlHoursRaw : 24;
  const maxPendingRaw = Number(
    options.maxPending != null ? options.maxPending : DEFAULT_MAX_PENDING_REQUESTS
  );
  const maxPending = Number.isFinite(maxPendingRaw) && maxPendingRaw > 0 ? maxPendingRaw : 200;
  const cutoffMs = nowMs - ttlHours * 60 * 60 * 1000;
  const deadLetteredAt = new Date(nowMs).toISOString();

  const active = [];
  const deadLetters = [];
  const proposed = [];

  for (const request of requests) {
    const status = String(request?.status || 'proposed').trim();
    if (status !== 'proposed') {
      active.push(request);
      continue;
    }

    const tsMs = Date.parse(request?.timestamp || '');
    if (!Number.isFinite(tsMs) || tsMs < cutoffMs) {
      deadLetters.push({
        ...request,
        status: 'dead_letter',
        deadLetterReason: Number.isFinite(tsMs) ? 'ttl_expired' : 'invalid_timestamp',
        deadLetteredAt,
      });
      continue;
    }
    proposed.push(request);
  }

  if (proposed.length > maxPending) {
    const byOldest = proposed.slice().sort((a, b) => {
      const aTs = Date.parse(a?.timestamp || '') || 0;
      const bTs = Date.parse(b?.timestamp || '') || 0;
      return aTs - bTs;
    });
    const overflow = byOldest.slice(0, proposed.length - maxPending);
    const overflowIds = new Set(overflow.map(item => item.id));
    for (const request of overflow) {
      deadLetters.push({
        ...request,
        status: 'dead_letter',
        deadLetterReason: 'queue_overflow',
        deadLetteredAt,
      });
    }
    active.push(...proposed.filter(item => !overflowIds.has(item.id)));
  } else {
    active.push(...proposed);
  }

  return {
    activeRequests: active,
    deadLetters,
  };
}

function generateAndPersistDispatchPlan(options = {}) {
  const queuePath = options.queuePath || DEFAULT_QUEUE_PATH;
  const outputPath = options.outputPath || DEFAULT_DISPATCH_PATH;
  const deadLetterPath = options.deadLetterPath || DEFAULT_DEAD_LETTER_PATH;
  const requests = readEvolutionRequests(queuePath);
  const governed = applyQueueGovernance(requests, options);
  if (governed.deadLetters.length > 0) {
    appendDeadLetters(governed.deadLetters, deadLetterPath);
    writeQueueEntries(governed.activeRequests, queuePath);
  }
  const plan = buildDispatchPlan(governed.activeRequests, { ...options, queuePath });
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
  appendDeadLetters,
  writeQueueEntries,
  applyQueueGovernance,
  generateAndPersistDispatchPlan,
  DEFAULT_DEAD_LETTER_PATH,
  DEFAULT_REQUEST_TTL_HOURS,
  DEFAULT_MAX_PENDING_REQUESTS,
  DEFAULT_REQUIRE_EVAL_GATE,
};
