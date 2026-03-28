'use strict';

const {
  getEnforcementMode,
  auditLog,
  auditSecurityOverride,
} = require('../../lib/utils/hook-input.cjs');
const {
  getViolationTracker,
  registerBlockAttempt,
  shouldAutoReroute,
  getIntentAutoRerouteConfig,
} = require('./routing-guard-core.shared.cjs');
const {
  classifyIntent,
  classifyDomain,
  isHierarchicalRoutingEnabled,
} = require('../../lib/routing/intent-classifier.cjs');
const { getPreferredAgent } = require('../../lib/routing/routing-table.cjs');
const {
  getHookAgentId,
  isDomainSubRouterName,
  selectSubRouterAgent,
} = require('../../lib/routing/sub-router-selection.cjs');

let eventBus;
try {
  eventBus = require('../../lib/events/event-bus.cjs');
} catch (_err) {
  eventBus = null;
}
const { EventTypes } = require('../../lib/events/event-types.cjs');

function detectIntent(text) {
  const normalized = String(text || '').trim();
  if (!normalized) {
    return { detectedSignals: [], suggestedAgents: [], isCritical: false, classification: null };
  }

  const classification = classifyIntent(normalized, {
    includeAlternatives: true,
    maxAlternatives: 3,
  });
  const nonEnforcingAgents = new Set(['developer', 'planner', 'general-assistant']);
  const suggestedAgents = new Set();
  const detectedSignals = [];

  if (
    classification?.intent &&
    classification.intent !== 'general' &&
    !nonEnforcingAgents.has(classification?.defaultAgent)
  ) {
    detectedSignals.push(classification.intent);
  }
  if (classification?.defaultAgent && !nonEnforcingAgents.has(classification.defaultAgent)) {
    suggestedAgents.add(classification.defaultAgent);
  }
  for (const alternative of classification?.alternatives || []) {
    const alternativeAgent = getPreferredAgent(alternative.intent);
    if (alternativeAgent && !nonEnforcingAgents.has(alternativeAgent)) {
      suggestedAgents.add(alternativeAgent);
    }
    if (alternative?.intent) {
      detectedSignals.push(alternative.intent);
    }
  }

  return {
    detectedSignals: [...new Set(detectedSignals)],
    suggestedAgents: Array.from(suggestedAgents),
    isCritical: classification?.defaultAgent === 'artifact-integrator',
    classification,
  };
}

function getIntentSignalText(prompt, description = '') {
  const promptText = String(prompt || '');
  const cutoffMarkers = [
    '\n## Agent Constitution',
    '\n## Memory Context (Auto-Loaded)',
    '\n## Dynamic behaviour rules',
    '\n### Model (from config)',
  ];

  let trimmedPrompt = promptText;
  for (const marker of cutoffMarkers) {
    const idx = trimmedPrompt.indexOf(marker);
    if (idx !== -1) {
      trimmedPrompt = trimmedPrompt.slice(0, idx);
      break;
    }
  }

  return `${String(description || '')}\n${trimmedPrompt}`.trim();
}

function agentMatchesIntent(
  subagentType,
  suggestedAgents,
  prompt = '',
  hookInput = null,
  toolInput = {}
) {
  const normalizedSubagentType = String(subagentType || '')
    .trim()
    .toLowerCase();
  if (suggestedAgents.length === 0) {
    return true;
  }

  if (suggestedAgents.includes(normalizedSubagentType)) {
    return true;
  }

  if (!isHierarchicalRoutingEnabled()) {
    return false;
  }

  const currentAgent = getHookAgentId(hookInput, toolInput);
  if (isDomainSubRouterName(currentAgent) && !isDomainSubRouterName(normalizedSubagentType)) {
    return selectSubRouterAgent(currentAgent, prompt).agent === normalizedSubagentType;
  }

  if (isDomainSubRouterName(normalizedSubagentType)) {
    const hierarchicalMatch = classifyDomain(prompt);
    return (
      hierarchicalMatch.type === 'domain' && hierarchicalMatch.router === normalizedSubagentType
    );
  }

  return false;
}

function isExplicitAuditRoutingOverride(subagentType, prompt, description = '') {
  const agent = String(subagentType || '')
    .trim()
    .toLowerCase();
  if (!agent) return false;

  const auditAgents = new Set(['code-reviewer', 'qa', 'architect']);
  if (!auditAgents.has(agent)) return false;

  const text = `${String(prompt || '')} ${String(description || '')}`.toLowerCase();
  const explicitAuditSignals = [
    'code quality audit',
    'code quality bug sweep',
    'code review',
    'test quality audit',
    'architecture audit',
    'architecture improvement sweep',
    'improvement sweep',
    'structural audit',
    'bug-focused code audit',
    'bug sweep',
    'bug hunt',
    'bugs and issues',
    'review for bugs',
    'codebase audit',
    'issue sweep',
    'issue scan',
    'codebase scan',
    'bug and issue scan',
    'codebase bug and issue scan',
  ];
  const hasExplicitSignal = explicitAuditSignals.some(signal => text.includes(signal));
  const isCodebaseScan = text.includes('codebase') && text.includes('scan');
  const hasCodebaseIssueSweep =
    text.includes('codebase') &&
    ((text.includes('issues') && text.includes('bugs')) ||
      text.includes('bug sweep') ||
      text.includes('issue sweep') ||
      text.includes('improve') ||
      text.includes('do better'));
  return text.includes('audit') || hasExplicitSignal || isCodebaseScan || hasCodebaseIssueSweep;
}

function checkIntentAgentMatch(toolName, toolInput = {}, hookInput = null) {
  if (toolName !== 'Task') {
    return { pass: true };
  }

  const enforcement = getEnforcementMode('INTENT_AGENT_MATCH', 'block');
  if (enforcement === 'off') {
    return { pass: true };
  }

  const subagentType = toolInput.subagent_type || 'general-purpose';
  const prompt = toolInput.prompt || '';
  const description = toolInput.description || '';

  const intentSignalText = getIntentSignalText(prompt, description);
  const { detectedSignals, suggestedAgents, isCritical } = detectIntent(intentSignalText);

  if (!agentMatchesIntent(subagentType, suggestedAgents, intentSignalText, hookInput, toolInput)) {
    const dedupe = registerBlockAttempt('intent-agent-match', `Task:${subagentType}`);
    if (isExplicitAuditRoutingOverride(subagentType, prompt, description)) {
      return {
        pass: true,
        result: 'warn',
        message:
          `[INTENT-AGENT MATCH] Audit routing override for '${subagentType}' with intent signals ` +
          `[${detectedSignals.join(', ')}]. Allowing explicit audit assignment.`,
      };
    }

    const reason = `Intent signals [${detectedSignals.join(', ')}] detected but spawning '${subagentType}' instead of including '${suggestedAgents.join("' or '")}'`;
    const message = `[INTENT-AGENT MATCH] ${reason}`;

    const tracker = getViolationTracker();
    if (tracker) {
      tracker.recordViolation({
        tool: 'Task',
        action: enforcement === 'block' ? 'blocked' : 'warned',
        checkName: 'intent-agent-match',
        routerMode: 'router',
        sessionId: process.env.CLAUDE_SESSION_ID || 'unknown',
        metadata: {
          detectedSignals,
          suggestedAgents,
          spawnedAgent: subagentType,
          isCritical,
        },
      });
    }

    const autoReroute = getIntentAutoRerouteConfig();
    if (
      !isCritical &&
      shouldAutoReroute(
        'intent-agent-match',
        enforcement,
        dedupe.count,
        autoReroute.threshold,
        autoReroute.enabledValue
      )
    ) {
      return {
        pass: true,
        result: 'warn',
        message:
          `[INTENT-AGENT AUTO-REROUTE] Repeated mismatch (${dedupe.count}x). ` +
          `Requested '${subagentType}' but inferred '${suggestedAgents[0]}' from signals ` +
          `[${detectedSignals.join(', ')}]. Continue only as temporary loop-breaker and reroute the next Task() to the inferred specialist.`,
      };
    }

    if (enforcement === 'block') {
      return { pass: false, result: 'block', message };
    }
    return { pass: true, result: 'warn', message };
  }

  return { pass: true };
}

function extractAgentTypeFromPrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return null;
  }

  const promptLower = prompt.toLowerCase();

  const youAreMatch = promptLower.match(/you are\s+(?:(?:the|an?)\s+)?([a-z][-a-z0-9]*)/i);
  if (youAreMatch) {
    return youAreMatch[1].toLowerCase();
  }

  const pathMatch = prompt.match(
    /\.claude\/agents\/(?:core|specialized|domain|orchestrators)\/([^/.]+)\.md/i
  );
  if (pathMatch) {
    return pathMatch[1].toLowerCase();
  }

  const subagentMatch = prompt.match(/\[?subagent_type:\s*([a-z][-a-z0-9]*)\]?/i);
  if (subagentMatch) {
    return subagentMatch[1].toLowerCase();
  }

  return null;
}

function extractModelFromToolInput(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') {
    return null;
  }

  const model = toolInput.model;
  if (!model || typeof model !== 'string') {
    return null;
  }

  return model.trim();
}

function checkConfigModelValidator(toolName, toolInput = {}, _hookInput = null) {
  if (toolName !== 'Task') {
    return { pass: true };
  }

  const enforcement = getEnforcementMode('CONFIG_MODEL_VALIDATOR', 'block');
  if (enforcement === 'off') {
    auditSecurityOverride(
      'routing-guard',
      'CONFIG_MODEL_VALIDATOR',
      'off',
      'Model configuration validation disabled'
    );
    return { pass: true };
  }

  const prompt = toolInput?.prompt || '';
  const agentType = extractAgentTypeFromPrompt(prompt);

  if (!agentType) {
    return { pass: true };
  }

  const spawnModel = extractModelFromToolInput(toolInput);

  if (!spawnModel) {
    return { pass: true };
  }

  let resolveAgentModel, getShorthand;
  try {
    const agentConfigReader = require('../../lib/utils/agent-config-reader.cjs');
    resolveAgentModel = agentConfigReader.resolveAgentModel;
    getShorthand = agentConfigReader.getShorthand;
  } catch (err) {
    auditLog('routing-guard', 'config_model_validator_error', {
      error: 'agent-config-reader unavailable',
      details: err.message,
    });
    return { pass: true };
  }

  const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
  const configResult = resolveAgentModel(agentType, PROJECT_ROOT);
  const configuredModel = configResult.shorthand;
  const configSource = configResult.source;
  const rawSpawnModel = typeof spawnModel === 'string' ? spawnModel.trim().toLowerCase() : '';

  const spawnShorthand = getShorthand(spawnModel);

  const mismatch = spawnShorthand !== configuredModel;

  if (mismatch && configSource === 'complexity-default' && spawnShorthand === 'haiku') {
    auditLog('routing-guard', 'config_model_validator_default_model_skipped', {
      agentType,
      spawnModel: spawnShorthand,
      configuredModel,
      source: configSource,
    });
    return { pass: true };
  }

  const isShorthandAlias =
    rawSpawnModel === 'haiku' || rawSpawnModel === 'sonnet' || rawSpawnModel === 'opus';
  if (mismatch && isShorthandAlias) {
    const message =
      `[CONFIG MODEL VALIDATOR] Shorthand model "${rawSpawnModel}" differs from configured "${configuredModel}". ` +
      'Allowing spawn so prompt-assembler can autocorrect to config model.';
    return { pass: true, result: 'warn', message };
  }

  if (mismatch) {
    const effectiveEnforcement = enforcement;
    const message = `
+======================================================================+
|  CONFIG MODEL VALIDATOR - MODEL MISMATCH DETECTED                    |
+======================================================================+
|  Agent Type:       ${(agentType || 'unknown').padEnd(45)}|
|  Spawn Model:      ${(spawnShorthand || 'none').padEnd(45)}|
|  Configured Model: ${(configuredModel || 'none').padEnd(45)}|
|  Config Source:    ${(configSource || 'unknown').padEnd(45)}|
|                                                                      |
|  The spawn model does not match the configured model.                |
|  To fix: Use resolveAgentModel() before spawning to get the correct  |
|  model from config.yaml.                                             |
|                                                                      |
|  Mode: ${effectiveEnforcement.padEnd(58)}|
+======================================================================+
`;

    const tracker = getViolationTracker();
    if (tracker) {
      tracker.recordViolation({
        tool: 'Task',
        action: effectiveEnforcement === 'block' ? 'blocked' : 'warned',
        checkName: 'config-model-validator',
        routerMode: 'router',
        sessionId: process.env.CLAUDE_SESSION_ID || 'unknown',
        metadata: {
          agentType,
          spawnModel: spawnShorthand,
          configuredModel,
          source: configSource,
        },
      });
    }

    if (eventBus && effectiveEnforcement === 'block') {
      try {
        eventBus.emit(EventTypes.TOOL_BLOCKED, {
          type: EventTypes.TOOL_BLOCKED,
          timestamp: new Date().toISOString(),
          toolName: 'Task',
          reason: 'config_model_mismatch',
        });
      } catch (_err) {
        // Best-effort
      }
    }

    if (effectiveEnforcement === 'block') {
      return { pass: false, result: 'block', message };
    }
    return { pass: true, result: 'warn', message };
  }

  return { pass: true };
}

module.exports = {
  detectIntent,
  agentMatchesIntent,
  checkIntentAgentMatch,
  extractAgentTypeFromPrompt,
  extractModelFromToolInput,
  checkConfigModelValidator,
};
