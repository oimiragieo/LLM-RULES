'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('./project-root.cjs');

const SCOPES = new Set(['soft', 'memory', 'full']);

function normalizeScope(scope) {
  const normalized = String(scope || '')
    .trim()
    .toLowerCase();
  return SCOPES.has(normalized) ? normalized : 'soft';
}

function buildResetPlan(scope, options = {}) {
  const normalizedScope = normalizeScope(scope);
  const includeLanceDb = Boolean(options.includeLanceDb);
  const targets = [];

  const runtimeDir = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
  const metricsDir = path.join(PROJECT_ROOT, '.claude', 'context', 'metrics');
  const spawnAudit = path.join(PROJECT_ROOT, '.claude', 'context', 'spawn-size-audit.jsonl');

  const memoryDir = path.join(PROJECT_ROOT, '.claude', 'context', 'memory');
  const codeIndexDir = path.join(PROJECT_ROOT, '.claude', 'context', 'code-index');

  const agentRegistry = path.join(PROJECT_ROOT, '.claude', 'context', 'agent-registry.json');
  const agentCatalog = path.join(PROJECT_ROOT, '.claude', 'context', 'agent-catalog.json');
  const routingPrototypes = path.join(PROJECT_ROOT, '.claude', 'config', 'routing-prototypes.json');

  const evolutionState = path.join(PROJECT_ROOT, '.claude', 'context', 'evolution-state.json');
  const selfHealingDir = path.join(PROJECT_ROOT, '.claude', 'context', 'self-healing');

  const lancedbDir = path.join(PROJECT_ROOT, '.claude', 'data', 'lancedb');

  targets.push({ path: runtimeDir, type: 'dir' });
  targets.push({ path: metricsDir, type: 'dir' });
  targets.push({ path: spawnAudit, type: 'file' });

  if (normalizedScope === 'memory' || normalizedScope === 'full') {
    targets.push({ path: memoryDir, type: 'dir' });
    if (includeLanceDb) {
      targets.push({ path: lancedbDir, type: 'dir' });
    }
  }

  if (normalizedScope === 'full') {
    targets.push({ path: codeIndexDir, type: 'dir' });
    targets.push({ path: agentRegistry, type: 'file' });
    targets.push({ path: agentCatalog, type: 'file' });
    targets.push({ path: routingPrototypes, type: 'file' });
    targets.push({ path: evolutionState, type: 'file' });
    targets.push({ path: selfHealingDir, type: 'dir' });
  }

  return {
    scope: normalizedScope,
    includeLanceDb,
    targets,
  };
}

function removeTarget(target, dryRun) {
  const targetPath = target.path;
  if (!fs.existsSync(targetPath)) return false;
  if (dryRun) return true;
  if (target.type === 'dir') {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } else {
    fs.rmSync(targetPath, { force: true });
  }
  return true;
}

function executeReset(plan, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const removed = [];
  for (const target of plan.targets) {
    if (removeTarget(target, dryRun)) {
      removed.push(target);
    }
  }
  return { removed, dryRun };
}

module.exports = {
  buildResetPlan,
  executeReset,
  normalizeScope,
};
