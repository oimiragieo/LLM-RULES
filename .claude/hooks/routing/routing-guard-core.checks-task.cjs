'use strict';

const { getEnforcementMode, auditSecurityOverride } = require('../../lib/utils/hook-input.cjs');
const {
  isPlannerSpawn,
  isSecuritySpawn,
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
  const message = `[PLANNER-FIRST VIOLATION] Complexity=${complexity}. Spawn PLANNER first via Task().`;

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
        'TASK-CREATE VIOLATION',
        toolName,
        dedupe.count,
        'Spawn PLANNER via Task() before creating additional tasks.'
      )
    : `[TASK-CREATE VIOLATION] Complex task (${complexity}) requires PLANNER first.`;

  if (enforcement === 'block' && !dedupe.dedupe) {
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

  const message = `[SEC-004] Security review required before implementation.
Spawn SECURITY-ARCHITECT first to review security implications.`;

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
  const isDeveloperSpawn =
    prompt.includes('you are developer') || prompt.includes('you are the developer');

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
        const message = `[SPECIALIST-OVERRIDE] Developer spawn detected for ${specialist} task.
Keyword: "${phrase}"
Suggestion: Use ${specialist} agent instead for better results.

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

  const state = getCachedRouterState();
  if (state.mode === 'agent' || state.taskSpawned) {
    return { pass: true };
  }

  if (state.taskListCalledSincePrompt) {
    return { pass: true };
  }

  const dedupe = registerBlockAttempt('tasklist-first-gate', toolName, hookInput);
  const isReadOnlyDiscoveryTool = toolName === 'Glob' || toolName === 'Grep';
  const message = dedupe.dedupe
    ? compactFallbackMessage(
        'TASKLIST-FIRST VIOLATION',
        toolName,
        dedupe.count,
        'TaskList() once, then continue with Task()/tool call'
      )
    : `[TASKLIST-FIRST VIOLATION] Router must call TaskList() before using ${toolName}.
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

module.exports = {
  checkPlannerFirst,
  checkTaskCreate,
  checkSecurityReview,
  checkSpecialistOverride,
  checkTaskListFirstGate,
  checkCreatorIntentGuard,
};
