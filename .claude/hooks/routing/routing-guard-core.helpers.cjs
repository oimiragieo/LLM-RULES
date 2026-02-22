'use strict';

/**
 * Helper functions extracted from routing-guard-core.checks-task.cjs
 * to keep checks-task.cjs under 500 lines (max-lines ESLint limit)
 */

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

function buildMissingFieldsMessage(toolName, missing) {
  return (
    `[ROUTER-FIRST PROTOCOL VIOLATION][TASK-PAYLOAD-CONTRACT] ${toolName} missing required field(s): ` +
    `${missing.join(', ')}. ` +
    `Use TaskList() first, then provide a complete ${toolName} payload with description.`
  );
}

function buildPlannerFirstMessage(complexity) {
  return `[ROUTER-FIRST PROTOCOL VIOLATION][PLANNER-FIRST VIOLATION] Complexity=${complexity}. Spawn PLANNER first via Task().`;
}

function buildTaskCreateMessage(complexity) {
  return `[ROUTER-FIRST PROTOCOL VIOLATION][TASK-CREATE VIOLATION] Complex task (${complexity}) requires PLANNER first.`;
}

function buildSecurityReviewMessage() {
  return `[ROUTER-FIRST PROTOCOL VIOLATION][SEC-004] Security review required before implementation.
Spawn SECURITY-ARCHITECT first to review security implications.`;
}

function buildCodeSimplifierMessage() {
  return `[ROUTER-FIRST PROTOCOL VIOLATION][ARCH-001] Code simplification requires architect review first.
Spawn ARCHITECT first to validate structural safety, then run CODE-SIMPLIFIER.`;
}

function buildHighRiskSpecialistMessage(agentType) {
  return `[ROUTER-FIRST PROTOCOL VIOLATION][ARCH-002] ${agentType} requires architect review first for high-risk changes.
Spawn ARCHITECT first to validate system-level safety, then run ${agentType}.`;
}

function buildSpecialistOverrideMessage(specialist, phrase) {
  const canonicalHint = specialist === 'qa' ? '\nCanonical trigger: "run tests"' : '';
  return `[ROUTER-FIRST PROTOCOL VIOLATION][SPECIALIST-OVERRIDE] Developer spawn detected for ${specialist} task.
Keyword: "${phrase}"
Suggestion: Use ${specialist} agent instead for better results.
${canonicalHint}

Developer should be LAST RESORT. Specialists have domain-specific prompts and skills.`;
}

function buildTaskListFirstBypassMessage(toolName) {
  return (
    `[TASKLIST-FIRST BYPASS] Allowing ${toolName} before TaskList() in bypassPermissions mode. ` +
    'Call TaskList() as soon as possible to sync task state.'
  );
}

function buildTaskListFirstMessage(toolName) {
  return `[ROUTER-FIRST PROTOCOL VIOLATION][TASKLIST-FIRST VIOLATION] Router must call TaskList() before using ${toolName}.
Call TaskList() first to check existing tasks, then proceed with your operation.`;
}

function buildTaskListFirstAutoRerouteMessage(toolName) {
  return (
    `[TASKLIST-FIRST AUTO-REROUTE] ${toolName} attempted before TaskList(). ` +
    'Auto-reroute mode engaged. Call TaskList() now, then continue with exploration tools.'
  );
}

function buildTaskListFirstRepeatedRerouteMessage(count, toolName) {
  return (
    `[TASKLIST-FIRST AUTO-REROUTE] Repeated violation (${count}x) for ${toolName}. ` +
    'Auto-reroute mode engaged to break denial loops. Next step: call TaskList() immediately, ' +
    'then continue with TaskGet/TaskUpdate for existing work or Task() for new work.'
  );
}

function buildCreatorIntentGuardMessage(creatorType, requiredSkill) {
  return `
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
|    task_id: 'task-5',
|    subagent_type: 'general-purpose',                                 |
|    prompt: \`You are a general-purpose agent.                         |
|      Invoke Skill({ skill: "${requiredSkill}" }) and follow it...\`   |
|  })                                                                  |
|                                                                      |
+======================================================================+
`;
}

function buildReflectionBackgroundMessage() {
  return (
    '[ROUTING-GUARD] reflection-agent MUST NOT be spawned with run_in_background: true. ' +
    'Background spawns restrict the tool whitelist, making TaskUpdate unavailable. ' +
    'The atomic handshake will fail. Remove run_in_background: true from this Task() call.'
  );
}

function buildSkillAgentConfusionMessage(skillName) {
  return `
+======================================================================+
|  ROUTER-FIRST PROTOCOL VIOLATION                                     |
|  SKILL-AGENT CONFUSION DETECTED                                      |
+======================================================================+
|  Requested subagent_type: '${skillName.padEnd(25)}'               |
|                                                                      |
|  '${skillName}' is a SKILL, not an agent type.                    |
|  You cannot spawn a skill via Task().                                |
|                                                                      |
|  CORRECT APPROACH:                                                   |
|  1. Spawn a valid agent (e.g., 'developer' or 'general-purpose')     |
|  2. That agent must invoke the skill via Skill():                    |
|                                                                      |
|  Skill({ skill: "${skillName}" })                                 |
|                                                                      |
+======================================================================+
`;
}

module.exports = {
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
};
