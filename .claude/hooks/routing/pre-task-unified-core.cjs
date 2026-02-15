'use strict';

const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const LIB_DIR = path.join(PROJECT_ROOT, '.claude', 'lib');

function libRequire(modulePath) {
  return require(path.join(LIB_DIR, modulePath));
}

const { getToolName, getToolInput, getEnforcementMode, auditLog } = libRequire(
  path.join('utils', 'hook-input.cjs')
);
const routerState = libRequire(path.join('routing', 'router-state.cjs'));
const loopStateManager = libRequire(path.join('self-healing', 'loop-state-manager.cjs'));

const state = require('./pre-task-unified-state.cjs');
const helpers = require('./pre-task-unified-helpers.cjs');
const ownership = require('./pre-task-unified-ownership.cjs');

const {
  LOOP_STATE_FILE,
  TASKLIST_LOOP_BREAKER_THRESHOLD,
  AGENT_GUARDRAILS_STATE_FILE,
  getPlannerFirstLoopBreakerThreshold,
  invalidateCachedState,
  getLoopState,
  readTaskListLoopState,
  writeTaskListLoopState,
  registerTaskListFirstViolation,
  clearTaskListFirstViolation,
  readPlannerFirstLoopState,
  writePlannerFirstLoopState,
  registerPlannerFirstViolation,
  clearPlannerFirstViolation,
  resolveStableSessionId,
  readAgentGuardrailsState,
  writeAgentGuardrailsState,
} = state;

const {
  PLANNER_PATTERNS,
  SECURITY_PATTERNS,
  IMPLEMENTATION_AGENTS,
  EVOLUTION_TRIGGERS,
  EVOLUTION_TYPES,
  isPlannerSpawn,
  isSecuritySpawn,
  isArchitectSpawn,
  isCodeSimplifierSpawn,
  isHighRiskSpecialistSpawn,
  extractSpawnAgentType,
  isImplementationAgentSpawn,
  extractTaskDescription,
  extractAgentType,
  isEvolutionTrigger,
  detectEvolutionType,
  getDepthLimit,
  getPatternThreshold,
  getPatternWindowMs,
  parseIsoToMs,
  getEvolutionBudget,
  getCooldownMs,
  extractTaskIdFromTaskInput,
  parseAllowedFilesFromPrompt,
  extractGuardrailPolicy,
  hasResumeDirective,
  hasMultiWaveDirective,
  checkSpawnRoleGuardrails,
} = helpers;

function checkTaskListFirst(toolName, hookInput = null) {
  if (toolName !== 'Task') {
    return { pass: true };
  }
  const permissionMode = String(
    hookInput?.permission_mode || hookInput?.permissionMode || ''
  ).toLowerCase();
  if (permissionMode === 'bypasspermissions') {
    return { pass: true };
  }
  const mode = (process.env.TASKLIST_FIRST_ENFORCEMENT || 'warn').toLowerCase();
  if (mode === 'off') {
    return { pass: true };
  }
  if (routerState.isTaskListCalledSincePrompt()) {
    const sessionId = resolveStableSessionId(hookInput);
    clearTaskListFirstViolation(sessionId);
    return { pass: true };
  }
  const sessionId = resolveStableSessionId(hookInput);
  const repeated = registerTaskListFirstViolation(sessionId);
  if (repeated >= TASKLIST_LOOP_BREAKER_THRESHOLD) {
    const message = `[TASKLIST-FIRST LOOP-BREAKER] TaskList-first violation repeated ${repeated}x in this session window.
Temporarily allowing Task spawn to avoid autonomous deadlock.`;
    return { pass: true, result: 'warn', message };
  }
  const message =
    'TaskList() must be called before Task(). Call TaskList() first, then spawn with Task().';
  if (mode === 'warn') {
    return { pass: true, result: 'warn', message };
  }
  return { pass: false, result: 'block', message };
}

function checkAgentContextPreTracker(hookInput) {
  const toolInput = getToolInput(hookInput);
  const taskDescription = extractTaskDescription(toolInput);

  routerState.enterAgentMode(taskDescription);

  if (process.env.ROUTER_DEBUG === 'true') {
    console.error(`[pre-task-unified:context] Pre-set mode=agent for: ${taskDescription}`);
  }

  return { pass: true };
}

function checkRoutingGuard(toolName, toolInput, hookInput = null) {
  if (toolName !== 'Task') {
    return { pass: true };
  }

  const stateSnapshot = routerState.getState();

  const plannerEnforcement = getEnforcementMode('PLANNER_FIRST_ENFORCEMENT', 'block');
  if (plannerEnforcement !== 'off') {
    const isPlannerRequired = stateSnapshot.requiresPlannerFirst;
    const plannerAlreadySpawned = stateSnapshot.plannerSpawned;

    if (isPlannerRequired && !plannerAlreadySpawned) {
      if (isPlannerSpawn(toolInput)) {
        const sessionId = resolveStableSessionId(hookInput);
        clearPlannerFirstViolation(sessionId);
        return { pass: true, markPlanner: true };
      }

      const sessionId = resolveStableSessionId(hookInput);
      const repeated = registerPlannerFirstViolation(sessionId);
      if (repeated >= getPlannerFirstLoopBreakerThreshold()) {
        const message =
          `[PLANNER-FIRST LOOP-BREAKER] Planner-first violation repeated ${repeated}x in this session window.\n` +
          'Temporarily allowing Task spawn to avoid autonomous deadlock.';
        return { pass: true, result: 'warn', message };
      }

      const complexity = stateSnapshot.complexity || 'unknown';
      const message = `[PLANNER-FIRST VIOLATION] High/Epic complexity (${complexity}) requires PLANNER agent first.
Spawn PLANNER first: Task({ task_id: 'task-1', description: 'Planner designing...', prompt: 'You are PLANNER...' })`;

      if (plannerEnforcement === 'block') {
        return { pass: false, result: 'block', message };
      }
      console.warn(message);
    }
  }

  const securityEnforcement = getEnforcementMode('SECURITY_REVIEW_ENFORCEMENT', 'block');
  if (securityEnforcement !== 'off') {
    if (stateSnapshot.requiresSecurityReview && !stateSnapshot.securitySpawned) {
      if (isSecuritySpawn(toolInput)) {
        return { pass: true, markSecurity: true };
      }

      if (isImplementationAgentSpawn(toolInput)) {
        const message = `[SEC-004] Security review required before implementation.
Spawn SECURITY-ARCHITECT first to review security implications.`;

        if (securityEnforcement === 'block') {
          return { pass: false, result: 'block', message };
        }
        console.warn(message);
      }
    }
  }

  const architectEnforcement = getEnforcementMode('CODE_SIMPLIFIER_ARCHITECT_ENFORCEMENT', 'block');
  if (architectEnforcement !== 'off') {
    if (isArchitectSpawn(toolInput)) {
      return { pass: true, markArchitect: true };
    }

    if (isCodeSimplifierSpawn(toolInput) && !stateSnapshot.architectSpawned) {
      const message = `[ARCH-001] Code simplification requires architect review first.
Spawn ARCHITECT first to validate structural safety, then run CODE-SIMPLIFIER.`;

      if (architectEnforcement === 'block') {
        return { pass: false, result: 'block', message };
      }
      console.warn(message);
    }
  }

  const highRiskArchitectEnforcement = getEnforcementMode(
    'HIGH_RISK_SPECIALIST_ARCHITECT_ENFORCEMENT',
    'block'
  );
  if (highRiskArchitectEnforcement !== 'off') {
    if (isArchitectSpawn(toolInput)) {
      return { pass: true, markArchitect: true };
    }

    if (isHighRiskSpecialistSpawn(toolInput) && !stateSnapshot.architectSpawned) {
      const agentType = extractSpawnAgentType(toolInput) || 'specialist';
      const message = `[ARCH-002] ${agentType} requires architect review first for high-risk changes.
Spawn ARCHITECT first to validate system-level safety, then run ${agentType}.`;

      if (highRiskArchitectEnforcement === 'block') {
        return { pass: false, result: 'block', message };
      }
      console.warn(message);
    }
  }

  return { pass: true };
}

function checkLoopPrevention(hookInput) {
  const toolName = getToolName(hookInput);
  if (toolName !== 'Task') {
    return { pass: true };
  }

  const enforcement = getEnforcementMode('LOOP_PREVENTION_MODE', 'block');
  if (enforcement === 'off') {
    auditLog('pre-task-unified', 'security_override_used', {
      check: 'loop-prevention',
      override: 'LOOP_PREVENTION_MODE=off',
    });
    return { pass: true };
  }

  const toolInput = getToolInput(hookInput);
  const prompt = toolInput.prompt || '';
  const description = toolInput.description || '';
  const loopState = loopStateManager.getState();

  const depthLimit = getDepthLimit();
  if (loopState.spawnDepth >= depthLimit) {
    const message = `[LOOP PREVENTION] Spawn depth limit exceeded (${loopState.spawnDepth}/${depthLimit}). Too many nested agent spawns.

This is a safety mechanism to prevent infinite loops.`;

    if (enforcement === 'block') {
      return { pass: false, result: 'block', message };
    }
    console.warn(message);
  }

  const agentType = extractAgentType(prompt, description, toolInput);
  const spawnAction = `spawn:${agentType}`;
  const threshold = getPatternThreshold();
  const patternWindowMs = getPatternWindowMs();

  const entry = loopState.actionHistory?.find(a => a.action === spawnAction);
  const count = entry ? Number(entry.count || 0) : 0;
  const lastAtMs = parseIsoToMs(entry?.lastAt);
  const hasRecentPattern = lastAtMs > 0 && Date.now() - lastAtMs <= patternWindowMs;
  const activeNestedSpawn = Number(loopState.spawnDepth || 0) > 0;

  if (activeNestedSpawn && hasRecentPattern && count >= threshold) {
    const message = `[LOOP PREVENTION] Pattern detected: "${spawnAction}" repeated ${count} times. Threshold is ${threshold}.

This is a safety mechanism to prevent infinite loops.`;

    if (enforcement === 'block') {
      return { pass: false, result: 'block', message };
    }
    console.warn(message);
  }

  if (isEvolutionTrigger(prompt)) {
    const budget = getEvolutionBudget();
    if (loopState.evolutionCount >= budget) {
      const message = `[LOOP PREVENTION] Evolution budget exhausted (${loopState.evolutionCount}/${budget}). Session limit reached.

This is a safety mechanism to prevent infinite loops.`;

      if (enforcement === 'block') {
        return { pass: false, result: 'block', message };
      }
      console.warn(message);
    }

    const evolutionType = detectEvolutionType(prompt);
    if (evolutionType && loopState.lastEvolutions?.[evolutionType]) {
      const cooldownMs = getCooldownMs();
      const lastTime = new Date(loopState.lastEvolutions[evolutionType]).getTime();
      const elapsed = Date.now() - lastTime;
      const remainingMs = cooldownMs - elapsed;

      if (remainingMs > 0) {
        const remainingMin = Math.ceil(remainingMs / 60000);
        const message = `[LOOP PREVENTION] Cooldown period active for ${evolutionType} evolution. Wait ${remainingMin} minute(s).

This is a safety mechanism to prevent infinite loops.`;

        if (enforcement === 'block') {
          return { pass: false, result: 'block', message };
        }
        console.warn(message);
      }
    }
  }

  return { pass: true };
}

function updateLoopStateAfterAllow(hookInput) {
  try {
    const toolInput = getToolInput(hookInput);
    const prompt = toolInput.prompt || '';
    const description = toolInput.description || '';

    const agentType = extractAgentType(prompt, description, toolInput);
    loopStateManager.recordSpawn(agentType);

    if (isEvolutionTrigger(prompt)) {
      const evolutionType = detectEvolutionType(prompt) || 'unknown';
      loopStateManager.recordEvolution(evolutionType);
    }
  } catch (err) {
    auditLog('pre-task-unified', 'loop_state_update_failed', { error: err.message });
  }
}

function persistGuardrailPolicy(hookInput, toolInput) {
  try {
    const sessionId =
      hookInput?.session_id || hookInput?.sessionId || process.env.CLAUDE_SESSION_ID || null;
    if (!sessionId) return;

    const taskId = extractTaskIdFromTaskInput(toolInput);
    const policy = extractGuardrailPolicy(toolInput);
    const stateSnapshot = readAgentGuardrailsState();
    stateSnapshot.sessions[sessionId] = {
      taskId: taskId || stateSnapshot.sessions[sessionId]?.taskId || null,
      allowGitCommit: Boolean(policy.allowGitCommit),
      allowedFiles: policy.allowedFiles,
      firstMutationSeen: false,
      checkpointDone: false,
      touchedFiles: [],
      updatedAt: Date.now(),
    };
    writeAgentGuardrailsState(stateSnapshot);
  } catch (err) {
    auditLog('pre-task-unified', 'guardrail_policy_persist_failed', { error: err.message });
  }
}

function updateTaskLifecycleStateAfterAllow(hookInput) {
  try {
    const toolInput = getToolInput(hookInput);
    const taskId = extractTaskIdFromTaskInput(toolInput);
    if (!taskId) return;

    routerState.setCurrentSpawnTaskId(taskId);
    routerState.recordTaskUpdate(taskId, 'in_progress');
  } catch (err) {
    auditLog('pre-task-unified', 'task_lifecycle_update_failed', { error: err.message });
  }
}

function runAllChecks(hookInput) {
  const toolName = getToolName(hookInput);
  if (toolName !== 'Task') {
    return { pass: true, exitCode: 0 };
  }

  invalidateCachedState();
  const toolInput = getToolInput(hookInput);

  const taskListFirstResult = checkTaskListFirst(toolName, hookInput);
  if (!taskListFirstResult.pass) {
    return {
      pass: false,
      exitCode: taskListFirstResult.result === 'block' ? 2 : 0,
      message: taskListFirstResult.message,
    };
  }
  if (taskListFirstResult.result === 'warn') {
    console.warn(taskListFirstResult.message);
  }

  checkAgentContextPreTracker(hookInput);

  const routingResult = checkRoutingGuard(toolName, toolInput, hookInput);
  if (!routingResult.pass) {
    return {
      pass: false,
      exitCode: routingResult.result === 'block' ? 2 : 0,
      message: routingResult.message,
    };
  }
  if (routingResult.markPlanner) {
    routerState.markPlannerSpawned();
  }
  if (routingResult.markSecurity) {
    routerState.markSecuritySpawned();
  }
  if (routingResult.markArchitect) {
    routerState.markArchitectSpawned();
  }

  const spawnGuardrailResult = checkSpawnRoleGuardrails(toolInput);
  if (!spawnGuardrailResult.pass) {
    return {
      pass: false,
      exitCode: spawnGuardrailResult.result === 'block' ? 2 : 0,
      message: spawnGuardrailResult.message,
    };
  }
  if (Array.isArray(spawnGuardrailResult.warnings)) {
    for (const warning of spawnGuardrailResult.warnings) {
      console.warn(warning);
    }
  }

  const ownershipRequiredResult = ownership.checkParallelOwnershipRequired(toolInput);
  if (!ownershipRequiredResult.pass) {
    return {
      pass: false,
      exitCode: ownershipRequiredResult.result === 'block' ? 2 : 0,
      message: ownershipRequiredResult.message,
    };
  }
  if (Array.isArray(ownershipRequiredResult.warnings)) {
    for (const warning of ownershipRequiredResult.warnings) {
      console.warn(warning);
    }
  }

  const ownershipResult = ownership.checkTaskOwnershipConflicts(toolInput, hookInput);
  if (!ownershipResult.pass) {
    return {
      pass: false,
      exitCode: ownershipResult.result === 'block' ? 2 : 0,
      message: ownershipResult.message,
    };
  }
  if (Array.isArray(ownershipResult.warnings)) {
    for (const warning of ownershipResult.warnings) {
      console.warn(warning);
    }
  }

  const loopResult = checkLoopPrevention(hookInput);
  if (!loopResult.pass) {
    return {
      pass: false,
      exitCode: loopResult.result === 'block' ? 2 : 0,
      message: loopResult.message,
    };
  }

  updateLoopStateAfterAllow(hookInput);
  updateTaskLifecycleStateAfterAllow(hookInput);
  ownership.registerTaskOwnershipClaimAfterAllow(hookInput, toolInput);
  persistGuardrailPolicy(hookInput, toolInput);
  return { pass: true, exitCode: 0 };
}

module.exports = {
  runAllChecks,
  checkTaskListFirst,
  checkAgentContextPreTracker,
  checkRoutingGuard,
  checkLoopPrevention,
  isPlannerSpawn,
  isSecuritySpawn,
  isArchitectSpawn,
  isCodeSimplifierSpawn,
  isHighRiskSpecialistSpawn,
  extractSpawnAgentType,
  isImplementationAgentSpawn,
  extractTaskDescription,
  extractAgentType,
  isEvolutionTrigger,
  detectEvolutionType,
  getLoopState,
  readTaskListLoopState,
  writeTaskListLoopState,
  registerTaskListFirstViolation,
  clearTaskListFirstViolation,
  readPlannerFirstLoopState,
  writePlannerFirstLoopState,
  registerPlannerFirstViolation,
  clearPlannerFirstViolation,
  invalidateCachedState,
  updateLoopStateAfterAllow,
  checkParallelOwnershipRequired: ownership.checkParallelOwnershipRequired,
  checkTaskOwnershipConflicts: ownership.checkTaskOwnershipConflicts,
  registerTaskOwnershipClaimAfterAllow: ownership.registerTaskOwnershipClaimAfterAllow,
  checkSpawnRoleGuardrails,
  hasResumeDirective,
  hasMultiWaveDirective,
  parseAllowedFilesFromPrompt,
  extractGuardrailPolicy,
  readAgentGuardrailsState,
  writeAgentGuardrailsState,
  persistGuardrailPolicy,
  PLANNER_PATTERNS,
  SECURITY_PATTERNS,
  IMPLEMENTATION_AGENTS,
  EVOLUTION_TRIGGERS,
  EVOLUTION_TYPES,
  LOOP_STATE_FILE,
  AGENT_GUARDRAILS_STATE_FILE,
};
