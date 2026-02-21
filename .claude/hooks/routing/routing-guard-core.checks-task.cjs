'use strict';

const { getEnforcementMode, auditSecurityOverride } = require('../../lib/utils/hook-input.cjs');
const {
  isPlannerSpawn,
  isSecuritySpawn,
  isArchitectSpawn,
  isCodeSimplifierSpawn,
  isHighRiskSpecialistSpawn,
  extractSpawnAgentType,
  isImplementationAgentSpawn,
  SPECIALIST_KEYWORD_MAP,
} = require('./routing-guard-core.policy.cjs');
const {
  getViolationTracker,
  getCachedRouterState,
  registerBlockAttempt,
  compactFallbackMessage,
  shouldAutoReroute,
  getTaskListAutoRerouteConfig,
} = require('./routing-guard-core.shared.cjs');

function hasExplicitAgentContext(hookInput = null) {
  if (!hookInput || typeof hookInput !== 'object') return false;
  const taskId = String(hookInput.task_id || hookInput.taskId || '').trim();
  if (taskId) return true;
  const agentId = String(process.env.CLAUDE_AGENT_ID || '')
    .trim()
    .toLowerCase();
  if (agentId && agentId !== 'router') return true;
  return false;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function checkTaskPayloadContract(toolName, toolInput = {}) {
  if (toolName !== 'Task' && toolName !== 'TaskCreate') {
    return { pass: true };
  }

  const enforcement = getEnforcementMode('TASK_PAYLOAD_CONTRACT_ENFORCEMENT', 'block');
  if (enforcement === 'off') {
    return { pass: true };
  }

  const missing = [];
  if (!isNonEmptyString(toolInput.description)) {
    missing.push('description');
  }

  if (toolName === 'Task') {
    if (!isNonEmptyString(toolInput.prompt)) {
      missing.push('prompt');
    }
    if (!isNonEmptyString(toolInput.subagent_type || toolInput.agent_type)) {
      missing.push('subagent_type');
    }
  }

  if (missing.length === 0) {
    return { pass: true };
  }

  const message =
    `[ROUTER-FIRST PROTOCOL VIOLATION][TASK-PAYLOAD-CONTRACT] ${toolName} missing required field(s): ` +
    `${missing.join(', ')}. ` +
    `Use TaskList() first, then provide a complete ${toolName} payload with description.`;

  if (enforcement === 'block') {
    return { pass: false, result: 'block', message };
  }
  return { pass: true, result: 'warn', message };
}

function checkPlannerFirst(toolName, toolInput) {
  if (toolName !== 'Task') {
    return { pass: true };
  }

  const enforcement = getEnforcementMode('PLANNER_FIRST_ENFORCEMENT', 'block');
  if (enforcement === 'off') {
    auditSecurityOverride(
      'routing-guard',
      'PLANNER_FIRST_ENFORCEMENT',
      'off',
      'Planner-first requirement bypassed'
    );
    return { pass: true };
  }

  const state = getCachedRouterState();
  const isPlannerRequired = state.requiresPlannerFirst;
  const plannerAlreadySpawned = state.plannerSpawned;

  if (!isPlannerRequired || plannerAlreadySpawned) {
    return { pass: true };
  }

  if (isPlannerSpawn(toolInput)) {
    return { pass: true, markPlanner: true };
  }

  const complexity = state.complexity || 'unknown';
  const message = `[ROUTER-FIRST PROTOCOL VIOLATION][PLANNER-FIRST VIOLATION] Complexity=${complexity}. Spawn PLANNER first via Task().`;

  if (enforcement === 'block') {
    return { pass: false, result: 'block', message };
  }
  return { pass: true, result: 'warn', message };
}

function checkTaskCreate(toolName, hookInput = null) {
  if (toolName !== 'TaskCreate') {
    return { pass: true };
  }

  const enforcement = getEnforcementMode('PLANNER_FIRST_ENFORCEMENT', 'block');
  if (enforcement === 'off') {
    auditSecurityOverride(
      'routing-guard',
      'PLANNER_FIRST_ENFORCEMENT',
      'off',
      'TaskCreate without planner allowed'
    );
    return { pass: true };
  }

  const state = getCachedRouterState();
  const isPlannerRequired = state.requiresPlannerFirst;
  const isPlannerSpawned = state.plannerSpawned;

  if (!isPlannerRequired || isPlannerSpawned) {
    return { pass: true };
  }

  const complexity = state.complexity || 'unknown';
  const dedupe = registerBlockAttempt('task-create-guard', toolName, hookInput);
  const message = dedupe.dedupe
    ? compactFallbackMessage(
        'ROUTER-FIRST PROTOCOL VIOLATION | TASK-CREATE VIOLATION',
        toolName,
        dedupe.count,
        'Spawn PLANNER via Task() before creating additional tasks.'
      )
    : `[ROUTER-FIRST PROTOCOL VIOLATION][TASK-CREATE VIOLATION] Complex task (${complexity}) requires PLANNER first.`;

  if (enforcement === 'block') {
    return { pass: false, result: 'block', message };
  }
  return { pass: true, result: 'warn', message };
}

function checkSecurityReview(toolName, toolInput) {
  if (toolName !== 'Task') {
    return { pass: true };
  }

  const enforcement = getEnforcementMode('SECURITY_REVIEW_ENFORCEMENT', 'block');
  if (enforcement === 'off') {
    return { pass: true };
  }

  const state = getCachedRouterState();

  if (!state.requiresSecurityReview || state.securitySpawned) {
    return { pass: true };
  }

  if (isSecuritySpawn(toolInput)) {
    return { pass: true, markSecurity: true };
  }

  if (!isImplementationAgentSpawn(toolInput)) {
    return { pass: true };
  }

  const message = `[ROUTER-FIRST PROTOCOL VIOLATION][SEC-004] Security review required before implementation.
Spawn SECURITY-ARCHITECT first to review security implications.`;

  if (enforcement === 'block') {
    return { pass: false, result: 'block', message };
  }
  return { pass: true, result: 'warn', message };
}

function checkCodeSimplifierArchitectReview(toolName, toolInput = {}) {
  if (toolName !== 'Task') {
    return { pass: true };
  }

  const enforcement = getEnforcementMode('CODE_SIMPLIFIER_ARCHITECT_ENFORCEMENT', 'block');
  if (enforcement === 'off') {
    return { pass: true };
  }

  if (isArchitectSpawn(toolInput)) {
    return { pass: true, markArchitect: true };
  }

  const state = getCachedRouterState();
  if (state.architectSpawned || !isCodeSimplifierSpawn(toolInput)) {
    return { pass: true };
  }

  const message = `[ROUTER-FIRST PROTOCOL VIOLATION][ARCH-001] Code simplification requires architect review first.
Spawn ARCHITECT first to validate structural safety, then run CODE-SIMPLIFIER.`;

  if (enforcement === 'block') {
    return { pass: false, result: 'block', message };
  }
  return { pass: true, result: 'warn', message };
}

function checkHighRiskSpecialistArchitectReview(toolName, toolInput = {}) {
  if (toolName !== 'Task') {
    return { pass: true };
  }

  const enforcement = getEnforcementMode('HIGH_RISK_SPECIALIST_ARCHITECT_ENFORCEMENT', 'block');
  if (enforcement === 'off') {
    return { pass: true };
  }

  if (isArchitectSpawn(toolInput)) {
    return { pass: true, markArchitect: true };
  }

  const state = getCachedRouterState();
  if (state.architectSpawned || !isHighRiskSpecialistSpawn(toolInput)) {
    return { pass: true };
  }

  const agentType = extractSpawnAgentType(toolInput) || 'specialist';
  const message = `[ROUTER-FIRST PROTOCOL VIOLATION][ARCH-002] ${agentType} requires architect review first for high-risk changes.
Spawn ARCHITECT first to validate system-level safety, then run ${agentType}.`;

  if (enforcement === 'block') {
    return { pass: false, result: 'block', message };
  }
  return { pass: true, result: 'warn', message };
}

function checkSpecialistOverride(toolName, toolInput = {}) {
  if (toolName !== 'Task') {
    return { pass: true };
  }

  const enforcement = getEnforcementMode('SPECIALIST_ROUTING_ENFORCEMENT', 'block');
  if (enforcement === 'off') {
    return { pass: true };
  }

  const prompt = (toolInput.prompt || '').toLowerCase();
  const declaredSubagent = String(toolInput.subagent_type || '')
    .trim()
    .toLowerCase();
  const isDeveloperSpawn =
    declaredSubagent === 'developer' || /\byou are (?:a |the )?developer\b/i.test(prompt);

  if (!isDeveloperSpawn) {
    return { pass: true };
  }

  const description = (toolInput.description || '').toLowerCase();
  const combined = `${prompt} ${description}`;

  for (const [specialist, phrases] of Object.entries(SPECIALIST_KEYWORD_MAP)) {
    for (const phrase of phrases) {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp('\\b' + escaped + '\\b', 'i');

      if (regex.test(combined)) {
        const canonicalHint = specialist === 'qa' ? '\nCanonical trigger: "run tests"' : '';
        const message = `[ROUTER-FIRST PROTOCOL VIOLATION][SPECIALIST-OVERRIDE] Developer spawn detected for ${specialist} task.
Keyword: "${phrase}"
Suggestion: Use ${specialist} agent instead for better results.
${canonicalHint}

Developer should be LAST RESORT. Specialists have domain-specific prompts and skills.`;

        const tracker = getViolationTracker();
        if (tracker) {
          tracker.recordViolation({
            tool: 'Task',
            action: enforcement === 'block' ? 'blocked' : 'warned',
            checkName: 'specialist-override',
            routerMode: 'router',
            sessionId: process.env.CLAUDE_SESSION_ID || 'unknown',
            metadata: {
              keyword: phrase,
              suggestedSpecialist: specialist,
            },
          });
        }

        if (enforcement === 'block') {
          return { pass: false, result: 'block', message };
        }
        return { pass: true, result: 'warn', message };
      }
    }
  }

  return { pass: true };
}

function checkTaskListFirstGate(toolName, hookInput = null) {
  const enforcement = getEnforcementMode('TASKLIST_FIRST_ENFORCEMENT', 'block');
  if (enforcement === 'off') {
    return { pass: true };
  }

  if (hasExplicitAgentContext(hookInput)) {
    return { pass: true };
  }

  // Step 0 deadlock fix: allow Task(reflection-agent) before TaskList() so Router can
  // process pending reflections; otherwise tasklist-first blocks Task() while
  // reflection-step0-guard blocks TaskList(), causing a 5-turn deadlock.
  const toolInput =
    hookInput?.tool_input || hookInput?.input || hookInput?.parameters || hookInput || {};
  const subagentType = String(toolInput.subagent_type || toolInput.agent_type || '')
    .trim()
    .toLowerCase();
  if (toolName === 'Task' && subagentType === 'reflection-agent') {
    return {
      pass: true,
      result: 'warn',
      message:
        '[TASKLIST-FIRST STEP0 EXEMPTION] Allowing Task(reflection-agent) before TaskList() to process pending reflections. ' +
        'After spawning reflection-agent(s), call TaskList() then continue routing.',
    };
  }

  const state = getCachedRouterState();
  if (state.taskListCalledSincePrompt) {
    return { pass: true };
  }

  const permissionMode = String(
    hookInput?.permission_mode || hookInput?.permissionMode || ''
  ).toLowerCase();
  const isBypassPermissions = permissionMode === 'bypasspermissions';
  if (
    isBypassPermissions &&
    (toolName === 'Bash' ||
      toolName === 'Read' ||
      toolName === 'Write' ||
      toolName === 'Edit' ||
      toolName === 'NotebookEdit')
  ) {
    return {
      pass: true,
      result: 'warn',
      message:
        `[TASKLIST-FIRST BYPASS] Allowing ${toolName} before TaskList() in bypassPermissions mode. ` +
        'Call TaskList() as soon as possible to sync task state.',
    };
  }

  const dedupe = registerBlockAttempt('tasklist-first-gate', toolName, hookInput);
  const isReadOnlyDiscoveryTool = toolName === 'Glob' || toolName === 'Grep' || toolName === 'Read';
  const message = dedupe.dedupe
    ? compactFallbackMessage(
        'ROUTER-FIRST PROTOCOL VIOLATION | TASKLIST-FIRST VIOLATION',
        toolName,
        dedupe.count,
        'TaskList() once, then continue with Task()/tool call'
      )
    : `[ROUTER-FIRST PROTOCOL VIOLATION][TASKLIST-FIRST VIOLATION] Router must call TaskList() before using ${toolName}.
Call TaskList() first to check existing tasks, then proceed with your operation.`;

  const tracker = getViolationTracker();
  if (tracker) {
    tracker.recordViolation({
      tool: toolName,
      action: enforcement === 'block' ? 'blocked' : 'warned',
      checkName: 'tasklist-first-gate',
      routerMode: 'router',
      sessionId: process.env.CLAUDE_SESSION_ID || 'unknown',
    });
  }

  if (enforcement === 'block') {
    if (isReadOnlyDiscoveryTool) {
      return {
        pass: true,
        result: 'warn',
        message:
          `[TASKLIST-FIRST AUTO-REROUTE] ${toolName} attempted before TaskList(). ` +
          'Auto-reroute mode engaged. Call TaskList() now, then continue with exploration tools.',
      };
    }
    const autoReroute = getTaskListAutoRerouteConfig();
    if (
      shouldAutoReroute(enforcement, dedupe.count, autoReroute.threshold, autoReroute.enabledValue)
    ) {
      return {
        pass: true,
        result: 'warn',
        message:
          `[TASKLIST-FIRST AUTO-REROUTE] Repeated violation (${dedupe.count}x) for ${toolName}. ` +
          'Auto-reroute mode engaged to break denial loops. Next step: call TaskList() immediately, ' +
          'then continue with TaskGet/TaskUpdate for existing work or Task() for new work.',
      };
    }
    return { pass: false, result: 'block', message };
  }
  return { pass: true, result: 'warn', message };
}

function checkCreatorIntentGuard(toolName, toolInput = {}) {
  if (toolName !== 'Task') {
    return { pass: true };
  }

  const enforcement = getEnforcementMode('CREATOR_ROUTING_ENFORCEMENT', 'block');
  if (enforcement === 'off') {
    return { pass: true };
  }

  const state = getCachedRouterState();
  if (!state.creatorIntentDetected) {
    return { pass: true };
  }

  const prompt = (toolInput.prompt || '').toLowerCase();
  const description = (toolInput.description || '').toLowerCase();
  const combined = `${prompt} ${description}`;

  const creatorSkills = [
    'agent-creator',
    'skill-creator',
    'hook-creator',
    'workflow-creator',
    'template-creator',
    'schema-creator',
  ];

  const hasCreatorSkill = creatorSkills.some(skill => combined.includes(skill));

  if (hasCreatorSkill) {
    return { pass: true };
  }

  const creatorType = state.detectedCreatorType || 'creator';
  const requiredSkill = state.requiredCreatorSkill || creatorType;

  const message = `
+======================================================================+
|  ROUTER-FIRST PROTOCOL VIOLATION                                     |
|  CREATOR ROUTING VIOLATION                                           |
+======================================================================+
|  Creator intent detected: ${creatorType.padEnd(40)}|
|  You are spawning a non-creator agent for artifact creation.         |
|                                                                      |
|  Artifact creation MUST use creator skills to ensure:                |
|    - CLAUDE.md is updated with routing/documentation                 |
|    - Relevant catalogs are updated for discoverability               |
|    - Related agents are assigned the artifact                        |
|    - Proper validation and testing occurs                            |
|                                                                      |
|  CORRECT APPROACH: Spawn general-purpose agent with creator skill    |
|                                                                      |
|  Task({                                                              |
  task_id: 'task-5',
|    subagent_type: 'general-purpose',                                 |
|    prompt: \`You are a general-purpose agent.                         |
|      Invoke Skill({ skill: "${requiredSkill}" }) and follow it...\`   |
|  })                                                                  |
|                                                                      |
+======================================================================+
`;

  const tracker = getViolationTracker();
  if (tracker) {
    tracker.recordViolation({
      tool: 'Task',
      action: enforcement === 'block' ? 'blocked' : 'warned',
      checkName: 'creator-intent-guard',
      routerMode: 'router',
      sessionId: process.env.CLAUDE_SESSION_ID || 'unknown',
      metadata: {
        detectedType: creatorType,
        requiredSkill,
        batchCreation: state.batchCreation || false,
      },
    });
  }

  if (enforcement === 'block') {
    return { pass: false, result: 'block', message };
  }
  return { pass: true, result: 'warn', message };
}

function checkSkillAgentConfused(toolName, toolInput = {}) {
  if (toolName !== 'Task') {
    return { pass: true };
  }

  const subagentType = String(toolInput.subagent_type || '').trim();
  if (!subagentType) {
    return { pass: true };
  }

  const skillNames = [
    'agent-creator',
    'skill-creator',
    'hook-creator',
    'workflow-creator',
    'template-creator',
    'schema-creator',
    'tool-creator',
    'command-creator',
    'agent-updater',
    'skill-updater',
    'workflow-updater',
    'artifact-updater',
    'research-synthesis',
    'github-ops',
    'ripgrep',
    'tdd',
  ];

  if (skillNames.includes(subagentType)) {
    const message = `
+======================================================================+
|  ROUTER-FIRST PROTOCOL VIOLATION                                     |
|  SKILL-AGENT CONFUSION DETECTED                                      |
+======================================================================+
|  Requested subagent_type: '${subagentType.padEnd(25)}'               |
|                                                                      |
|  '${subagentType}' is a SKILL, not an agent type.                    |
|  You cannot spawn a skill via Task().                                |
|                                                                      |
|  CORRECT APPROACH:                                                   |
|  1. Spawn a valid agent (e.g., 'developer' or 'general-purpose')     |
|  2. That agent must invoke the skill via Skill():                    |
|                                                                      |
|  Skill({ skill: "${subagentType}" })                                 |
|                                                                      |
+======================================================================+
`;

    const tracker = getViolationTracker();
    if (tracker) {
      tracker.recordViolation({
        tool: 'Task',
        action: 'blocked',
        checkName: 'skill-agent-confusion',
        routerMode: 'router',
        sessionId: process.env.CLAUDE_SESSION_ID || 'unknown',
        metadata: {
          requestedType: subagentType,
        },
      });
    }

    return { pass: false, result: 'block', message };
  }

  return { pass: true };
}

module.exports = {
  checkTaskPayloadContract,
  checkPlannerFirst,
  checkTaskCreate,
  checkSecurityReview,
  checkCodeSimplifierArchitectReview,
  checkHighRiskSpecialistArchitectReview,
  checkSpecialistOverride,
  checkTaskListFirstGate,
  checkCreatorIntentGuard,
  checkSkillAgentConfused,
};
