'use strict';

const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const LIB_DIR = path.join(PROJECT_ROOT, '.claude', 'lib');

function libRequire(modulePath) {
  return require(path.join(LIB_DIR, modulePath));
}

const { getEnforcementMode, auditLog } = libRequire(path.join('utils', 'hook-input.cjs'));
const routerState = libRequire(path.join('routing', 'router-state.cjs'));
const taskClaimLedger = libRequire(path.join('routing', 'task-claim-ledger.cjs'));

const {
  extractTaskIdFromTaskInput,
  extractSpawnAgentType,
} = require('./pre-task-unified-helpers.cjs');

function parseParallelGroup(toolInput = {}) {
  const direct = toolInput.parallel_group ?? toolInput.parallelGroup;
  if (direct != null && String(direct).trim()) {
    return String(direct).trim();
  }
  const prompt = String(toolInput.prompt || '');
  const match = prompt.match(/^\s*PARALLEL_GROUP\s*:\s*(.+)$/im);
  if (!match || !match[1]) return '';
  return String(match[1]).trim();
}

function normalizeComplexity(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (['medium', 'high', 'epic'].includes(normalized)) return normalized;
  if (normalized === 'med') return 'medium';
  return normalized;
}

function checkParallelOwnershipRequired(toolInput) {
  const mode = getEnforcementMode('TASK_PARALLEL_OWNERSHIP_REQUIRED', 'block');
  if (mode === 'off') {
    return { pass: true };
  }

  const parallelGroup = parseParallelGroup(toolInput);
  if (!parallelGroup) {
    return { pass: true };
  }

  const stateSnapshot = routerState.getState();
  const explicitComplexity = toolInput?.complexity || toolInput?.task_complexity;
  const complexity = normalizeComplexity(explicitComplexity || stateSnapshot.complexity);
  const isMediumOrHigher =
    complexity === 'medium' || complexity === 'high' || complexity === 'epic';
  if (!isMediumOrHigher) {
    return { pass: true };
  }

  const claimMeta = taskClaimLedger.extractClaimMetadataFromTaskInput(toolInput);
  if (claimMeta.ownedPaths.length > 0) {
    return { pass: true };
  }

  const taskId = extractTaskIdFromTaskInput(toolInput) || 'unknown-task';
  const message =
    `[PARALLEL-OWNERSHIP-REQUIRED] Task ${taskId} is in parallel_group '${parallelGroup}' with ${complexity} complexity, ` +
    'but has no ownership metadata.\n' +
    'Provide owned_paths (or allowed_files/OWNED_PATHS/ALLOWED_FILES) before parallel spawn.';
  if (mode === 'block') {
    return { pass: false, result: 'block', message };
  }
  return { pass: true, warnings: [message] };
}

function checkTaskOwnershipConflicts(toolInput) {
  const mode = getEnforcementMode('TASK_OWNERSHIP_GUARD', 'block');
  if (mode === 'off') {
    return { pass: true };
  }

  const taskId = extractTaskIdFromTaskInput(toolInput);
  const claimMeta = taskClaimLedger.extractClaimMetadataFromTaskInput(toolInput);
  if (!taskId || claimMeta.ownedPaths.length === 0) {
    return { pass: true };
  }

  const conflicts = taskClaimLedger.findOwnershipConflicts({
    taskId,
    ownedPaths: claimMeta.ownedPaths,
  });
  if (conflicts.length === 0) {
    return { pass: true };
  }

  const summary = conflicts
    .slice(0, 3)
    .map(claim => {
      const owner = claim.agentType || claim.taskId;
      const samplePath =
        Array.isArray(claim.ownedPaths) && claim.ownedPaths[0] ? claim.ownedPaths[0] : '*';
      return `${owner} (${samplePath})`;
    })
    .join(', ');
  const message =
    `[OWNERSHIP-CONFLICT] Task ${taskId} declares overlapping ownership for ` +
    `${claimMeta.ownedPaths.join(', ')}.\n` +
    `Conflicts: ${summary}\n` +
    `Resolve with non-overlapping owned_paths/allowed_files or wait for blocking tasks to complete.`;

  if (mode === 'block') {
    return { pass: false, result: 'block', message };
  }
  return { pass: true, warnings: [message] };
}

function registerTaskOwnershipClaimAfterAllow(hookInput, toolInput) {
  try {
    const input =
      toolInput && typeof toolInput === 'object'
        ? toolInput
        : hookInput?.tool_input || hookInput?.toolInput || {};
    const taskId = extractTaskIdFromTaskInput(input);
    if (!taskId) return;

    const claimMeta = taskClaimLedger.extractClaimMetadataFromTaskInput(input);
    if (claimMeta.ownedPaths.length === 0) return;

    taskClaimLedger.upsertClaim({
      taskId,
      sessionId:
        hookInput?.session_id || hookInput?.sessionId || process.env.CLAUDE_SESSION_ID || null,
      agentType: extractSpawnAgentType(input) || null,
      ownedPaths: claimMeta.ownedPaths,
      dependsOn: claimMeta.dependsOn,
      dependencyType: claimMeta.dependencyType,
      active: true,
    });
  } catch (err) {
    auditLog('pre-task-unified', 'task_claim_register_failed', { error: err.message });
  }
}

module.exports = {
  checkParallelOwnershipRequired,
  checkTaskOwnershipConflicts,
  registerTaskOwnershipClaimAfterAllow,
};
