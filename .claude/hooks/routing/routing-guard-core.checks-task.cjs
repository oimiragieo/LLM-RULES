/* eslint-disable max-lines */
'use strict';

const { getEnforcementMode, auditSecurityOverride } = require('../../lib/utils/hook-input.cjs');
const {
  getHierarchicalTaskContext,
  isHierarchicalRoutingEnabled,
  validateHierarchicalTaskContext,
} = require('../../lib/routing/sub-router-selection.cjs');
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
const {
  hasExplicitAgentContext,
  isNonEmptyString,
  buildMissingFieldsMessage,
  buildPlannerFirstMessage,
  buildTaskCreateMessage,
  buildSecurityReviewMessage,
  buildCodeSimplifierMessage,
  buildHighRiskSpecialistMessage,
  buildSpecialistOverrideMessage,
  buildTaskListFirstBypassMessage,
  buildTaskListFirstMessage,
  buildTaskListFirstAutoRerouteMessage,
  buildTaskListFirstRepeatedRerouteMessage,
  buildCreatorIntentGuardMessage,
  buildReflectionBackgroundMessage,
  buildSkillAgentConfusionMessage,
} = require('./routing-guard-core.helpers.cjs');

function checkTaskPayloadContract(toolName, toolInput = {}, hookInput = null) {
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
    const hierarchicalContext = getHierarchicalTaskContext(hookInput, toolInput);
    const allowPromptOmission =
      isHierarchicalRoutingEnabled() &&
      (hierarchicalContext.currentIsSubRouter || hierarchicalContext.targetIsSubRouter);

    if (!allowPromptOmission && !isNonEmptyString(toolInput.prompt)) {
      missing.push('prompt');
    }
    if (!isNonEmptyString(toolInput.subagent_type || toolInput.agent_type)) {
      missing.push('subagent_type');
    }
  }

  if (missing.length === 0) {
    return { pass: true };
  }

  const message = buildMissingFieldsMessage(toolName, missing);

  if (enforcement === 'block') {
    return { pass: false, result: 'block', message };
  }
  return { pass: true, result: 'warn', message };
}

function checkHierarchicalSubRouterDispatch(toolName, toolInput = {}, hookInput = null) {
  if (toolName !== 'Task' || !isHierarchicalRoutingEnabled()) {
    return { pass: true };
  }

  return validateHierarchicalTaskContext(hookInput, toolInput);
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
  const message = buildPlannerFirstMessage(complexity);

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
    : buildTaskCreateMessage(complexity);

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

  const message = buildSecurityReviewMessage();

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

  const message = buildCodeSimplifierMessage();

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
  const message = buildHighRiskSpecialistMessage(agentType);

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

  // Check researcher→artifact-integrator misrouting (P2-1)
  if (declaredSubagent === 'researcher') {
    const description = (toolInput.description || '').toLowerCase();
    const combined = `${prompt} ${description}`;
    const integrationKeywords = ['integrate', 'onboard', 'ingest', 'repository', 'repo'];
    const hasIntegrationIntent = integrationKeywords.some(kw => combined.includes(kw));
    if (hasIntegrationIntent) {
      const message =
        '[ROUTING] Use artifact-integrator for repo integration tasks, not researcher. ' +
        'researcher is for external research/investigation; artifact-integrator handles repo ingestion, onboarding, and integration.';
      if (enforcement === 'block') {
        return { pass: false, result: 'block', message };
      }
      return { pass: true, result: 'warn', warnings: [message] };
    }
  }

  if (!isDeveloperSpawn) {
    return { pass: true };
  }

  const description = (toolInput.description || '').toLowerCase();
  const combined = `${prompt} ${description}`;

  // Creator specialists whose keywords should be bypassed when the spawn has update intent.
  // Non-creator specialists (technical-writer, qa, etc.) always apply.
  const CREATOR_SPECIALISTS = new Set([
    'skill-creator',
    'agent-creator',
    'hook-creator',
    'workflow-creator',
    'template-creator',
    'schema-creator',
  ]);

  // Detect update intent: -updater suffix OR update/updating + artifact word in same sentence.
  // Split by sentence boundary so we don't cross-match unrelated sentences.
  const hasUpdateIntent =
    /-updater\b/.test(combined) ||
    combined
      .split(/[.!?\n]+/)
      .some(
        sentence =>
          /\bupdat/.test(sentence) &&
          /\b(?:skill|agent|hook|workflow|template|schema)\b/.test(sentence)
      );

  for (const [specialist, phrases] of Object.entries(SPECIALIST_KEYWORD_MAP)) {
    // If the spawn has update intent, skip creator-type specialist keyword checks
    // so incidental creator references don't redirect to a creator specialist.
    if (hasUpdateIntent && CREATOR_SPECIALISTS.has(specialist)) {
      continue;
    }

    for (const phrase of phrases) {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp('\\b' + escaped + '\\b', 'i');

      if (regex.test(combined)) {
        const message = buildSpecialistOverrideMessage(specialist, phrase);

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

        try {
          const fs = require('node:fs');
          const path = require('node:path');
          let currentDir = __dirname;
          while (
            currentDir !== path.parse(currentDir).root &&
            !fs.existsSync(path.join(currentDir, '.claude'))
          ) {
            currentDir = path.dirname(currentDir);
          }
          const issuesPath = path.join(currentDir, '.claude', 'context', 'memory', 'issues.md');
          if (fs.existsSync(issuesPath)) {
            const entry = `\n- [ROUTING WARN] Developer task routing warned. Keyword "${phrase}" suggests specialist "${specialist}". Prompt triggered warning instead of block. Date: ${new Date().toISOString()}`;
            fs.appendFileSync(issuesPath, entry + '\n', 'utf8');
          }
        } catch (_err) {
          // Best effort logging
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
      message: buildTaskListFirstBypassMessage(toolName),
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
    : buildTaskListFirstMessage(toolName);

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
        message: buildTaskListFirstAutoRerouteMessage(toolName),
      };
    }
    const autoReroute = getTaskListAutoRerouteConfig();
    if (
      shouldAutoReroute(
        'tasklist-first-gate',
        enforcement,
        dedupe.count,
        autoReroute.threshold,
        autoReroute.enabledValue
      )
    ) {
      return {
        pass: true,
        result: 'warn',
        message: buildTaskListFirstRepeatedRerouteMessage(dedupe.count, toolName),
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

  const message = buildCreatorIntentGuardMessage(creatorType, requiredSkill);

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

function checkReflectionBackgroundSpawn(toolName, toolInput = {}) {
  if (toolName !== 'Task') {
    return { pass: true };
  }

  const enforcement = getEnforcementMode('REFLECTION_BACKGROUND_ENFORCEMENT', 'block');
  if (enforcement === 'off') {
    return { pass: true };
  }

  const subagentType = String(toolInput.subagent_type || toolInput.agent_type || '')
    .trim()
    .toLowerCase();
  if (subagentType !== 'reflection-agent') {
    return { pass: true };
  }

  // run_in_background strips the tool whitelist, making TaskUpdate unavailable
  // which causes the atomic handshake to fail silently
  if (toolInput.run_in_background !== true) {
    return { pass: true };
  }

  const message = buildReflectionBackgroundMessage();

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
    const message = buildSkillAgentConfusionMessage(subagentType);

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
  checkHierarchicalSubRouterDispatch,
  checkPlannerFirst,
  checkTaskCreate,
  checkSecurityReview,
  checkCodeSimplifierArchitectReview,
  checkHighRiskSpecialistArchitectReview,
  checkSpecialistOverride,
  checkTaskListFirstGate,
  checkCreatorIntentGuard,
  checkSkillAgentConfused,
  checkReflectionBackgroundSpawn,
};
