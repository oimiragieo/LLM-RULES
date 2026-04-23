'use strict';
/* eslint-disable max-lines */

const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

const { getWorktreeDepth, getActiveWorktreeCount } = require(
  path.join(PROJECT_ROOT, '.claude', 'lib', 'utils', 'worktree-context.cjs')
);
const LIB_DIR = path.join(PROJECT_ROOT, '.claude', 'lib');

function libRequire(modulePath) {
  return require(path.join(LIB_DIR, modulePath));
}

const { getToolName, getToolInput, getEnforcementMode, auditLog } = libRequire(
  path.join('utils', 'hook-input.cjs')
);
const { safeParseJSON } = libRequire(path.join('utils', 'safe-json.cjs'));
const routerState = libRequire(path.join('routing', 'router-state.cjs'));
const loopStateManager = libRequire(path.join('self-healing', 'loop-state-manager.cjs'));
const { getHierarchicalTaskContext, validateHierarchicalTaskContext } = libRequire(
  path.join('routing', 'sub-router-selection.cjs')
);
// A2A dispatch integration for channel session routing
const a2aDispatch = libRequire(path.join('routing', 'a2a-dispatch.cjs'));

const state = require('./pre-task-unified-state.cjs');
const helpers = require('./pre-task-unified-helpers.cjs');
const ownership = require('./pre-task-unified-ownership.cjs');

// Severity helpers — fail-open: graceful fallback if unavailable
let _asWarning;
let _formatForStderr;
try {
  ({ asWarning: _asWarning, formatForStderr: _formatForStderr } = require(
    path.join(PROJECT_ROOT, '.claude', 'lib', 'hooks', 'severity.cjs')
  ));
} catch (_) {
  _asWarning = msg => ({ severity: 'warning', message: String(msg || '') });
  _formatForStderr = result => `[WARNING] ${(result && result.message) || ''}`;
}
const TOOL_GOVERNANCE_STATE_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'tool-governance-state.json'
);
const CORE_MEMORY_READ_WINDOW_MS = Number(process.env.CORE_MEMORY_READ_WINDOW_MS || 60 * 60 * 1000);

const {
  LOOP_STATE_FILE,
  TASKLIST_LOOP_BREAKER_THRESHOLD,
  AGENT_GUARDRAILS_STATE_FILE,
  getPlannerFirstLoopBreakerThreshold,
  invalidateCachedState,
  getLoopState,
  readTaskListLoopStateAsync,
  writeTaskListLoopStateAsync,
  registerTaskListFirstViolationAsync,
  clearTaskListFirstViolationAsync,
  readPlannerFirstLoopStateAsync,
  writePlannerFirstLoopStateAsync,
  registerPlannerFirstViolationAsync,
  clearPlannerFirstViolationAsync,
  resolveStableSessionId,
  readAgentGuardrailsStateAsync,
  writeAgentGuardrailsStateAsync,
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
  hasUpdateIntent,
  getDepthLimit,
  getPatternThreshold,
  getPatternWindowMs,
  getEvolutionBudget,
  getCooldownMs,
  extractTaskIdFromTaskInput,
  parseAllowedFilesFromPrompt,
  extractGuardrailPolicy,
  hasResumeDirective,
  hasMultiWaveDirective,
  checkSpawnRoleGuardrails,
} = helpers;

async function checkTaskListFirst(toolName, hookInput = null) {
  if (toolName !== 'Task') {
    return { pass: true };
  }
  const toolInput = getToolInput(hookInput);
  const hierarchicalDispatch = validateHierarchicalTaskContext(hookInput, toolInput);
  if (!hierarchicalDispatch.pass) {
    return hierarchicalDispatch;
  }
  if (hierarchicalDispatch.context.allowSubRouterToSpecialist) {
    return { pass: true };
  }
  const permissionMode = String(
    hookInput?.permission_mode || hookInput?.permissionMode || ''
  ).toLowerCase();
  if (permissionMode === 'bypasspermissions') {
    return { pass: true };
  }
  const mode = getEnforcementMode('TASKLIST_FIRST_ENFORCEMENT', 'block').toLowerCase();
  if (mode === 'off') {
    return { pass: true };
  }
  if (routerState.isTaskListCalledSincePrompt()) {
    const sessionId = resolveStableSessionId(hookInput);
    await clearTaskListFirstViolationAsync(sessionId);
    return { pass: true };
  }
  const sessionId = resolveStableSessionId(hookInput);
  const repeated = await registerTaskListFirstViolationAsync(sessionId);
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

async function checkCoreMemoryReadBeforeTask(hookInput) {
  const memReadMode = String(process.env.TASK_REQUIRE_CORE_MEMORY_READ || 'on')
    .trim()
    .toLowerCase();
  if (memReadMode === 'off') {
    return { pass: true };
  }

  const permissionMode = String(
    hookInput?.permission_mode || hookInput?.permissionMode || ''
  ).toLowerCase();
  const agentId = String(hookInput?.agent_id || hookInput?.agentId || '').toLowerCase();

  if (permissionMode === 'bypasspermissions' || agentId === 'router') {
    return { pass: true };
  }

  const hierarchicalContext = getHierarchicalTaskContext(hookInput, getToolInput(hookInput));
  if (hierarchicalContext.allowSubRouterToSpecialist) {
    return { pass: true };
  }

  const sessionId = resolveStableSessionId(hookInput);
  const now = Date.now();
  let sessions = {};
  if (!fs.existsSync(TOOL_GOVERNANCE_STATE_FILE)) {
    return {
      pass: false,
      result: 'block',
      message:
        '[MEMORY-FIRST] Core memory evidence missing for this session. ' +
        'Read `.claude/context/memory/patterns.json`, `.claude/context/memory/gotchas.json`, ' +
        '`.claude/context/memory/decisions.md`, and `.claude/context/memory/issues.md` before Task spawn.',
    };
  }
  try {
    const content = await fs.promises.readFile(TOOL_GOVERNANCE_STATE_FILE, 'utf8');
    const parsed = safeParseJSON(content, null);
    sessions = parsed?.sessions || {};
  } catch (_e) {
    // Treat as missing file or corrupted
    sessions = {};
  }

  const entry = sessions[sessionId];
  const lastReadAt = Number(entry?.lastCoreMemoryReadAt || 0);
  const hasRecentMemoryRead = lastReadAt > 0 && now - lastReadAt <= CORE_MEMORY_READ_WINDOW_MS;
  if (hasRecentMemoryRead) {
    return { pass: true };
  }

  return {
    pass: false,
    result: 'block',
    message:
      '[MEMORY-FIRST] Task spawn blocked: no recent core memory read found for this session. ' +
      'Read `.claude/context/memory/patterns.json`, `.claude/context/memory/gotchas.json`, ' +
      '`.claude/context/memory/decisions.md`, and `.claude/context/memory/issues.md`, then retry Task().',
  };
}

async function checkRoutingGuard(toolName, toolInput, hookInput = null) {
  if (toolName !== 'Task') {
    return { pass: true };
  }

  const taskCheckOwner = String(process.env.ROUTING_GUARD_TASK_CHECKS || 'delegate')
    .trim()
    .toLowerCase();
  if (taskCheckOwner === 'force') {
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
        await clearPlannerFirstViolationAsync(sessionId);
        return { pass: true, markPlanner: true };
      }

      const sessionId = resolveStableSessionId(hookInput);
      const repeated = await registerPlannerFirstViolationAsync(sessionId);
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
      process.stderr.write(_formatForStderr(_asWarning(message)) + '\n');
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
        process.stderr.write(_formatForStderr(_asWarning(message)) + '\n');
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
  const activeLoopGuardResult =
    typeof loopStateManager.checkAndBlock === 'function'
      ? loopStateManager.checkAndBlock({
          state: loopState,
          spawnAction,
          depthLimit,
          patternThreshold: threshold,
          patternWindowMs,
        })
      : { blocked: false };
  if (activeLoopGuardResult.blocked) {
    const message = `${activeLoopGuardResult.message}

This is a safety mechanism to prevent infinite loops.`;
    if (enforcement === 'block') {
      return { pass: false, result: 'block', message };
    }
    console.warn(message);
  }

  // Skip evolution budget/cooldown checks when the prompt has update intent.
  // Updater spawns are not creation events and should not start or be blocked by cooldowns.
  if (isEvolutionTrigger(prompt) && !hasUpdateIntent(prompt)) {
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

    // Do not record an evolution event for update-intent spawns.
    // Updater spawns are not creation events and must not start the evolution cooldown.
    if (isEvolutionTrigger(prompt) && !hasUpdateIntent(prompt)) {
      const evolutionType = detectEvolutionType(prompt) || 'unknown';
      loopStateManager.recordEvolution(evolutionType);
    }
  } catch (err) {
    auditLog('pre-task-unified', 'loop_state_update_failed', { error: err.message });
  }
}

async function persistGuardrailPolicy(hookInput, toolInput) {
  try {
    const sessionId =
      hookInput?.session_id || hookInput?.sessionId || process.env.CLAUDE_SESSION_ID || null;
    if (!sessionId) return;

    const taskId = extractTaskIdFromTaskInput(toolInput);
    const policy = extractGuardrailPolicy(toolInput);
    const stateSnapshot = await readAgentGuardrailsStateAsync();
    stateSnapshot.sessions[sessionId] = {
      taskId: taskId || stateSnapshot.sessions[sessionId]?.taskId || null,
      allowGitCommit: Boolean(policy.allowGitCommit),
      allowedFiles: policy.allowedFiles,
      firstMutationSeen: false,
      checkpointDone: false,
      touchedFiles: [],
      updatedAt: Date.now(),
    };
    await writeAgentGuardrailsStateAsync(stateSnapshot);
  } catch (err) {
    auditLog('pre-task-unified', 'guardrail_policy_persist_failed', { error: err.message });
  }
}

async function updateTaskLifecycleStateAfterAllow(hookInput) {
  try {
    const toolInput = getToolInput(hookInput);
    const taskId = extractTaskIdFromTaskInput(toolInput);
    if (!taskId) return;

    routerState.setCurrentSpawnTaskId(taskId);
    routerState.recordTaskUpdate(taskId, 'in_progress');

    // Unify with lifecycle validation layer
    const lifecycleState = require('../../lib/routing/task-lifecycle-state.cjs');
    await lifecycleState.writeTaskStatus(String(taskId), 'in_progress');
  } catch (err) {
    auditLog('pre-task-unified', 'task_lifecycle_update_failed', { error: err.message });
  }
}

/**
 * Fix 3: Block Task() spawns from inside a worktree (depth >= 1).
 * Prevents recursive nesting which causes memory exhaustion.
 *
 * Env: NESTED_WORKTREE_ENFORCEMENT=block|warn|off (default: block)
 *
 * @param {Object} hookInput - Hook input context
 * @param {string} [cwd] - Current working directory override for testing
 * @returns {{ pass: boolean, result?: string, message?: string }}
 */
function checkNestedWorktreeSpawn(hookInput, cwd = process.cwd()) {
  const enforcement = getEnforcementMode('NESTED_WORKTREE_ENFORCEMENT', 'block');
  if (enforcement === 'off') {
    return { pass: true };
  }

  const hierarchicalContext = getHierarchicalTaskContext(hookInput, getToolInput(hookInput));
  if (hierarchicalContext.allowSubRouterToSpecialist) {
    return { pass: true };
  }

  const depth = getWorktreeDepth(cwd);
  if (depth < 1) {
    return { pass: true }; // Not in a worktree — router context, allow
  }

  const message =
    `[NESTED-WORKTREE] Task() spawn blocked: current process is running inside ` +
    `a worktree (depth=${depth}). Nested worktrees cause memory exhaustion. ` +
    `Sub-agents must not spawn further sub-agents. ` +
    `Set NESTED_WORKTREE_ENFORCEMENT=warn to downgrade to a warning.`;

  if (enforcement === 'block') {
    return { pass: false, result: 'block', message };
  }
  // warn mode — pass but emit warning
  return { pass: true, result: 'warn', message };
}

/**
 * A2A Dispatch Intercept for channel-responder tasks.
 *
 * When the target agent is channel-responder and A2A_AUTO_START is enabled,
 * intercept the spawn and dispatch via A2A instead of spawning a local process.
 *
 * This allows the router to communicate with the channel session via HTTP
 * instead of spawning a new process.
 *
 * @param {Object} toolInput - Task tool input
 * @returns {Promise<{intercepted: boolean, dispatch?: object, message?: string}>}
 */
async function checkA2ADispatchIntercept(toolInput) {
  // Check if A2A dispatch is explicitly disabled
  const a2aDispatchMode = String(process.env.A2A_DISPATCH_MODE || 'auto').toLowerCase();
  if (a2aDispatchMode === 'off') {
    return { intercepted: false };
  }

  // Extract target agent type
  const subagentType = String(toolInput.subagent_type || toolInput.agent_type || '').trim();

  // Only intercept channel-responder targets
  if (!a2aDispatch.isChannelSessionTarget(subagentType)) {
    return { intercepted: false };
  }

  // Check if A2A is enabled and reachable (unless forced)
  const forceA2A = a2aDispatchMode === 'force';
  const a2aStatus = await a2aDispatch.getA2AStatus();

  if (!a2aStatus.enabled && !forceA2A) {
    return { intercepted: false };
  }

  // If A2A is not reachable and not forced, fall back to normal spawn
  if (!a2aStatus.reachable && !forceA2A) {
    process.stderr.write(
      '[pre-task-unified] A2A dispatch: channel-responder target but A2A not reachable, using local spawn\n'
    );
    return { intercepted: false };
  }

  // Dispatch via A2A
  const dispatchResult = await a2aDispatch.dispatchToChannelSession({
    target: subagentType,
    input: toolInput.prompt || '',
    context: {
      taskId: toolInput.task_id || toolInput.id,
      description: toolInput.description,
    },
    taskId: toolInput.task_id || toolInput.id,
    forceA2A,
  });

  if (dispatchResult.success) {
    process.stderr.write(
      `[pre-task-unified] A2A dispatch: task ${dispatchResult.taskId} sent to channel-responder via A2A (${dispatchResult.method})\n`
    );
    return {
      intercepted: true,
      dispatch: dispatchResult,
      message: `Task dispatched via A2A to channel-responder. Task ID: ${dispatchResult.taskId}`,
    };
  }

  // A2A dispatch failed but we have fallback
  if (dispatchResult.fallback) {
    process.stderr.write(
      `[pre-task-unified] A2A dispatch: fallback to file IPC, task ${dispatchResult.taskId}\n`
    );
    return {
      intercepted: true,
      dispatch: dispatchResult,
      message: `Task dispatched via file IPC fallback. Task ID: ${dispatchResult.taskId}`,
    };
  }

  // Dispatch failed completely - log warning but allow normal spawn
  process.stderr.write(
    `[pre-task-unified] A2A dispatch failed: ${dispatchResult.error}, falling back to local spawn\n`
  );
  return { intercepted: false };
}

/**
 * Fix 4: Cap concurrent agents by counting active worktree directories.
 * Prevents spawning too many parallel agents which exhausts memory.
 *
 * Env: CONCURRENT_AGENT_CAP=N (default: 3)
 *      CONCURRENT_AGENT_CAP_ENFORCEMENT=block|warn|off (default: block)
 *
 * @param {Object} hookInput - Hook input context
 * @param {string} [projectRoot] - Project root override for testing
 * @returns {{ pass: boolean, result?: string, message?: string }}
 */
function checkConcurrentAgentCap(hookInput, projectRoot) {
  const enforcement = getEnforcementMode('CONCURRENT_AGENT_CAP_ENFORCEMENT', 'block');
  if (enforcement === 'off') {
    return { pass: true };
  }

  const cap = Math.max(1, Number(process.env.CONCURRENT_AGENT_CAP || 3));
  const root = projectRoot || PROJECT_ROOT;
  const activeCount = getActiveWorktreeCount(root);

  if (activeCount <= cap) {
    return { pass: true }; // Within cap
  }

  const message =
    `[CONCURRENT-AGENT-CAP] Task() spawn blocked: ${activeCount} active worktrees exceed ` +
    `the cap of ${cap}. Too many parallel agents cause memory exhaustion. ` +
    `Wait for agents to complete, or set CONCURRENT_AGENT_CAP=${activeCount + 1} to raise the cap. ` +
    `Set CONCURRENT_AGENT_CAP_ENFORCEMENT=off to disable this check.`;

  if (enforcement === 'block') {
    return { pass: false, result: 'block', message };
  }
  // warn mode — pass but emit warning
  return { pass: true, result: 'warn', message };
}

async function runAllChecks(hookInput) {
  const toolName = getToolName(hookInput);
  if (toolName !== 'Task') {
    return { pass: true, exitCode: 0 };
  }

  invalidateCachedState();
  const toolInput = getToolInput(hookInput);
  const hierarchicalDispatch = validateHierarchicalTaskContext(hookInput, toolInput);
  if (!hierarchicalDispatch.pass) {
    return {
      pass: false,
      exitCode: hierarchicalDispatch.result === 'block' ? 2 : 0,
      message: hierarchicalDispatch.message,
    };
  }

  // Fix 3: Block nested worktree spawns (subagent trying to spawn a sub-subagent)
  const nestedWorktreeResult = checkNestedWorktreeSpawn(hookInput);
  if (!nestedWorktreeResult.pass) {
    return {
      pass: false,
      exitCode: 2,
      message: nestedWorktreeResult.message,
    };
  }
  if (nestedWorktreeResult.result === 'warn' && nestedWorktreeResult.message) {
    console.warn(nestedWorktreeResult.message);
  }

  // Fix 4: Cap concurrent agents by active worktree count
  const concurrentCapResult = checkConcurrentAgentCap(hookInput);
  if (!concurrentCapResult.pass) {
    return {
      pass: false,
      exitCode: 2,
      message: concurrentCapResult.message,
    };
  }
  if (concurrentCapResult.result === 'warn' && concurrentCapResult.message) {
    console.warn(concurrentCapResult.message);
  }

  const taskListFirstResult = await checkTaskListFirst(toolName, hookInput);
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

  const memoryFirstResult = await checkCoreMemoryReadBeforeTask(hookInput);
  if (!memoryFirstResult.pass) {
    return {
      pass: false,
      exitCode: memoryFirstResult.result === 'block' ? 2 : 0,
      message: memoryFirstResult.message,
    };
  }

  const routingResult = await checkRoutingGuard(toolName, toolInput, hookInput);
  if (!routingResult.pass) {
    return {
      pass: false,
      exitCode: routingResult.result === 'block' ? 2 : 0,
      message: routingResult.message,
    };
  }

  // ── Dynamic model selection (MODEL_ROUTER_ENABLED, default off) ──────────
  if (
    String(process.env.MODEL_ROUTER_ENABLED || 'off').toLowerCase() === 'on' &&
    toolName === 'Task' &&
    !toolInput.model // Don't override user-specified model
  ) {
    try {
      const { ModelRouter } = libRequire('routing/model-router.cjs');
      const { ModelRegistry } = libRequire('routing/model-registry.cjs');
      const { CostPredictor } = libRequire('routing/cost-predictor.cjs');
      const { classifyIntent } = libRequire('routing/intent-classifier.cjs');

      const router = new ModelRouter({
        registry: new ModelRegistry(),
        costPredictor: new CostPredictor(),
        intentClassifier: { classifyIntent },
      });

      const selection = router.selectModel(toolInput.prompt || '', {
        agentType: toolInput.subagent_type,
      });

      if (selection && selection.model) {
        toolInput.model = selection.shorthand || selection.model;
        console.error(
          `[pre-task-unified] Model router selected: ${selection.shorthand || selection.model}` +
            ` (reason: ${selection.reason}, source: ${selection.source})`
        );
      }
    } catch (modelErr) {
      // Model router is best-effort — never block on failure
      console.error(`[pre-task-unified] Model router error (ignored): ${modelErr.message}`);
    }
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

  // ── A2A dispatch intercept for channel-responder ────────────────────────
  // When the target is channel-responder and A2A is available, dispatch via A2A.
  const a2aInterceptResult = await checkA2ADispatchIntercept(toolInput);
  if (a2aInterceptResult.intercepted) {
    // Return the A2A dispatch result to the caller
    // The hook passes (allow), but provides the dispatch result for the caller
    return {
      pass: true,
      exitCode: 0,
      a2aDispatch: a2aInterceptResult.dispatch,
      message: a2aInterceptResult.message,
    };
  }

  // Preserve synchronous return contract for test and hook callers where possible.
  // Task lifecycle persistence is best-effort and can continue asynchronously.
  void updateTaskLifecycleStateAfterAllow(hookInput);
  ownership.registerTaskOwnershipClaimAfterAllow(hookInput, toolInput);
  await persistGuardrailPolicy(hookInput, toolInput);
  return { pass: true, exitCode: 0 };
}

module.exports = {
  runAllChecks,
  checkTaskListFirst,
  checkAgentContextPreTracker,
  checkCoreMemoryReadBeforeTask,
  checkRoutingGuard,
  checkLoopPrevention,
  checkNestedWorktreeSpawn,
  checkConcurrentAgentCap,
  checkA2ADispatchIntercept,
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
  getLoopState,
  readTaskListLoopStateAsync,
  writeTaskListLoopStateAsync,
  registerTaskListFirstViolationAsync,
  clearTaskListFirstViolationAsync,
  readPlannerFirstLoopStateAsync,
  writePlannerFirstLoopStateAsync,
  registerPlannerFirstViolationAsync,
  clearPlannerFirstViolationAsync,
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
  readAgentGuardrailsStateAsync,
  writeAgentGuardrailsStateAsync,
  persistGuardrailPolicy,
  PLANNER_PATTERNS,
  SECURITY_PATTERNS,
  IMPLEMENTATION_AGENTS,
  EVOLUTION_TRIGGERS,
  EVOLUTION_TYPES,
  LOOP_STATE_FILE,
  AGENT_GUARDRAILS_STATE_FILE,
};
