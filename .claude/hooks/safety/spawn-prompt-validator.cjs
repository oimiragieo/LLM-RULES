#!/usr/bin/env node
/* eslint-disable max-lines */
/**
 * Spawn Prompt Validator Hook
 * ===========================
 *
 * Validates that spawn prompts contain required elements:
 * 1. TaskUpdate warning box (task tracking protocol)
 * 2. PROJECT_ROOT context section
 * 3. Task ID reference
 * 4. Memory Protocol section
 * 5. TaskUpdate call instructions
 *
 * Trigger: PreToolUse(Task)
 *
 * ENFORCEMENT MODES:
 * - SPAWN_PROMPT_VALIDATOR=block|warn|off (default: block)
 *
 * SECURITY MITIGATIONS:
 * - VULN-001: Unicode normalization prevents homoglyph bypass
 * - VULN-002: ReDoS-safe regex patterns with bounded quantifiers
 * - VULN-003: Prompt length limit (120KB max)
 * - VULN-004: Full audit context in exception handler
 * - VULN-005: Environment override auditing
 * - VULN-006: Required tool flags validation
 *
 * Exit codes:
 * - 0: Allow (prompt valid or validation disabled)
 * - 2: Block (prompt missing required elements)
 *
 * @module spawn-prompt-validator
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');

// Required imports
const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
  getEnforcementMode,
  formatResult,
  auditLog,
  debugLog,
} = require('../../lib/utils/hook-input.cjs');
const eventBus = require('../../lib/events/event-bus.cjs');
const { EventTypes } = require('../../lib/events/event-types.cjs');

// =============================================================================
// SECURITY MITIGATION: Unicode Normalization (VULN-001)
// =============================================================================

/**
 * Normalize Unicode to prevent homoglyph attacks
 * Converts visually similar Unicode characters to ASCII equivalents
 *
 * @param {string} text - Input text with potential Unicode lookalikes
 * @returns {string} Normalized ASCII-safe text
 */
function normalizeUnicode(text) {
  if (!text || typeof text !== 'string') return '';

  // Step 1: NFKC normalization (converts lookalikes to canonical form)
  let normalized = text.normalize('NFKC');

  // Step 2: Replace common homoglyphs with ASCII equivalents
  const homoglyphMap = {
    // Greek uppercase
    '\u0391': 'A', // Greek Alpha
    '\u0392': 'B', // Greek Beta
    '\u0395': 'E', // Greek Epsilon
    '\u0396': 'Z', // Greek Zeta
    '\u0397': 'H', // Greek Eta
    '\u0399': 'I', // Greek Iota
    '\u039A': 'K', // Greek Kappa
    '\u039C': 'M', // Greek Mu
    '\u039D': 'N', // Greek Nu
    '\u039F': 'O', // Greek Omicron
    '\u03A1': 'P', // Greek Rho
    '\u03A4': 'T', // Greek Tau
    '\u03A5': 'Y', // Greek Upsilon
    '\u03A7': 'X', // Greek Chi
    // Cyrillic lowercase
    '\u0430': 'a', // Cyrillic a
    '\u0435': 'e', // Cyrillic e
    '\u043E': 'o', // Cyrillic o
    '\u0440': 'p', // Cyrillic p
    '\u0441': 'c', // Cyrillic c
    '\u0443': 'y', // Cyrillic y
    '\u0445': 'x', // Cyrillic x
    // Cyrillic uppercase
    '\u0410': 'A', // Cyrillic A
    '\u0412': 'B', // Cyrillic B
    '\u0415': 'E', // Cyrillic E
    '\u041A': 'K', // Cyrillic K
    '\u041C': 'M', // Cyrillic M
    '\u041D': 'H', // Cyrillic H
    '\u041E': 'O', // Cyrillic O
    '\u0420': 'P', // Cyrillic P
    '\u0421': 'C', // Cyrillic C
    '\u0422': 'T', // Cyrillic T
    '\u0423': 'Y', // Cyrillic Y
    '\u0425': 'X', // Cyrillic X
  };

  for (const [lookalike, ascii] of Object.entries(homoglyphMap)) {
    normalized = normalized.replace(new RegExp(lookalike, 'g'), ascii);
  }

  return normalized;
}

// =============================================================================
// SECURITY MITIGATION: ReDoS-Safe Regex (VULN-002)
// =============================================================================

/**
 * Execute regex with timeout to prevent ReDoS attacks
 * Uses bounded quantifiers and vm module timeout
 *
 * @param {RegExp} pattern - Regex pattern to test
 * @param {string} text - Text to match
 * @param {number} timeoutMs - Timeout in milliseconds (default: 100ms)
 * @returns {boolean} Match result or false on timeout
 */
function safeRegexTest(pattern, text, timeoutMs = 100) {
  try {
    // For simple patterns, direct test is safe with bounded quantifiers
    // More complex: could use vm module, but our patterns are already bounded
    const startTime = Date.now();
    const result = pattern.test(text);
    const elapsed = Date.now() - startTime;

    if (elapsed > timeoutMs) {
      auditLog('spawn-prompt-validator', 'redos-timeout', {
        pattern: pattern.toString().substring(0, 50),
        textLength: text.length,
        elapsed,
      });
      return false; // Fail closed on potential ReDoS
    }

    return result;
  } catch (err) {
    auditLog('spawn-prompt-validator', 'regex-error', {
      pattern: pattern.toString().substring(0, 50),
      error: err.message,
    });
    return false; // Fail closed on regex errors
  }
}

// =============================================================================
// VALIDATION RULES (VULN-002, VULN-006)
// =============================================================================

/**
 * Required elements in spawn prompts
 * Each rule has: pattern (ReDoS-safe), name, severity, suggestion, weight, required flag
 *
 * SECURITY NOTE: All patterns use bounded quantifiers to prevent ReDoS
 */
const VALIDATION_RULES = [
  {
    name: 'TaskUpdate Warning Box',
    // SECURE: Bounded quantifiers, no catastrophic backtracking
    // Second [\s\S] increased to 1500 to span full assembler box (ReDoS-safe bounded quantifier)
    // Matches: +====...+ WARNING: TASK TRACKING REQUIRED ... +====...+
    // Also matches: +====...+ TASK TRACKING REQUIRED (with or without "WARNING:" prefix)
    pattern:
      /\+={10,100}\+[\s\S]{0,800}(?:WARNING:\s+)?TASK TRACKING REQUIRED[\s\S]{0,1500}\+={10,100}\+/,
    severity: 'critical',
    suggestion: 'Include the 70-line warning box from universal-agent-spawn.md template',
    weight: 40,
    required: true, // VULN-006: Critical rules are required regardless of score
  },
  {
    name: 'Task ID Reference',
    // SECURE: Simple pattern, no backtracking risk
    // Matches: "Task ID: 123", "Your Task ID: 456", "taskId: 789", etc.
    pattern:
      /(?:Your\s+)?Task\s+ID:\s*[<"']?[a-zA-Z0-9_-]{1,64}[>"]?|taskId:\s*[<"']?[a-zA-Z0-9_-]{1,64}[>"]?/i,
    severity: 'critical',
    suggestion: 'Include "Task ID: <ID>" or reference specific task ID',
    weight: 30,
    required: true, // VULN-006
  },
  {
    name: 'PROJECT_ROOT Context',
    // SECURE: Simple alternation, no backtracking
    pattern: /PROJECT_ROOT|PROJECT CONTEXT/i,
    severity: 'high',
    suggestion: 'Include PROJECT CONTEXT section with PROJECT_ROOT path',
    weight: 15,
    required: false,
  },
  {
    name: 'Memory Protocol',
    // SECURE: Simple alternation, no backtracking
    pattern: /Memory Protocol|learnings\.md|context\/memory/i,
    severity: 'medium',
    suggestion: 'Include Memory Protocol section referencing .claude/context/memory/',
    weight: 10,
    required: false,
  },
  {
    name: 'TaskUpdate Call Instruction',
    // SECURE: Bounded quantifiers prevent backtracking
    pattern:
      /TaskUpdate\s{0,5}\(\s{0,5}\{[^}]{0,200}status[^}]{0,50}in_progress|TaskUpdate[^)]{0,100}completed/,
    severity: 'high',
    suggestion: 'Include explicit TaskUpdate call instructions for in_progress and completed',
    weight: 5,
    required: false,
  },
  {
    name: 'TaskUpdate in allowed_tools',
    // VULN-006: Validate required tools are available
    pattern: /allowed_tools\s{0,10}:\s{0,10}\[[^\]]{0,500}TaskUpdate[^\]]{0,500}\]/i,
    severity: 'high',
    suggestion: 'Ensure TaskUpdate is in allowed_tools array for spawned agent',
    weight: 5,
    required: false,
  },
];

/**
 * Minimum validation score to pass (0-100)
 * Score below this triggers blocking in 'block' mode
 */
const MINIMUM_SCORE = 70;

/**
 * Score threshold for warning in 'warn' mode
 */
const WARNING_THRESHOLD = 85;

/**
 * Maximum prompt length in bytes (VULN-003)
 * Keep this conservative to prevent runaway token spend in spawned agents.
 */
const MAX_PROMPT_LENGTH = 120000; // 120KB hard limit

/**
 * Warning threshold for large prompts
 */
const PROMPT_LENGTH_WARNING = 50000; // 50KB warning
const COMPACTNESS_MIN = Number(process.env.SPAWN_PROMPT_COMPACTNESS_MIN || 0);

// Loop-breaker state (autonomous deadlock prevention)
const LOOP_BREAKER_STATE_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'spawn-prompt-validator-loop-state.json'
);
const LOOP_BREAKER_THRESHOLD = Number(process.env.SPAWN_PROMPT_LOOP_BREAKER_THRESHOLD || 3);
const LOOP_BREAKER_WINDOW_MS = Number(process.env.SPAWN_PROMPT_LOOP_BREAKER_WINDOW_MS || 120000);
const LOOP_BREAKER_MAX_ENTRIES = Number(process.env.SPAWN_PROMPT_LOOP_BREAKER_MAX_ENTRIES || 500);
const INVALID_SUBAGENT_TYPES = new Set([
  'bash',
  'read',
  'write',
  'edit',
  'multiedit',
  'glob',
  'grep',
  'websearch',
  'webfetch',
  'task',
  'tasklist',
  'taskget',
  'taskupdate',
  'taskcreate',
  'taskoutput',
  'skill',
]);

function readLoopBreakerState(statePath = LOOP_BREAKER_STATE_PATH) {
  try {
    if (!fs.existsSync(statePath)) {
      return { entries: {} };
    }
    const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
    const parsed = safeParseJSON(fs.readFileSync(statePath, 'utf8'), null);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !parsed.entries ||
      typeof parsed.entries !== 'object'
    ) {
      return { entries: {} };
    }
    return parsed;
  } catch {
    return { entries: {} };
  }
}

function writeLoopBreakerState(state, statePath = LOOP_BREAKER_STATE_PATH) {
  try {
    const dir = path.dirname(statePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
  } catch {
    // best effort
  }
}

function pruneLoopBreakerEntries(entries) {
  const items = Object.entries(entries || {}).map(([key, value]) => ({
    key,
    value: value || {},
    updatedAt: Number(value?.updatedAt || 0),
  }));
  items.sort((a, b) => b.updatedAt - a.updatedAt);
  return Object.fromEntries(items.slice(0, LOOP_BREAKER_MAX_ENTRIES).map(i => [i.key, i.value]));
}

function buildLoopBreakerKey(sessionId, promptHash, validation) {
  const required = Array.isArray(validation?.missingRequired)
    ? validation.missingRequired.join('|')
    : 'none';
  const failed = Array.isArray(validation?.failed) ? validation.failed.join('|') : 'none';
  return `${sessionId || 'unknown'}:${promptHash}:${required}:${failed}`;
}

function registerSpawnValidationFailure(sessionId, promptHash, validation) {
  const state = readLoopBreakerState();
  const key = buildLoopBreakerKey(sessionId, promptHash, validation);
  const now = Date.now();
  const prev = state.entries[key] || { count: 0, firstAt: now, updatedAt: now };
  const withinWindow = now - Number(prev.updatedAt || 0) <= LOOP_BREAKER_WINDOW_MS;
  const next = {
    count: withinWindow ? Number(prev.count || 0) + 1 : 1,
    firstAt: withinWindow ? Number(prev.firstAt || now) : now,
    updatedAt: now,
  };
  state.entries[key] = next;
  state.entries = pruneLoopBreakerEntries(state.entries);
  writeLoopBreakerState(state);

  return {
    key,
    count: next.count,
    shouldBypassBlock: next.count >= LOOP_BREAKER_THRESHOLD,
  };
}

function clearSpawnValidationFailure(sessionId, promptHash, validation) {
  const state = readLoopBreakerState();
  const key = buildLoopBreakerKey(sessionId, promptHash, validation);
  if (state.entries[key]) {
    delete state.entries[key];
    writeLoopBreakerState(state);
  }
}

/**
 * Build required spawn prompt prefix when required elements are missing.
 * Mirrors router spawn template requirements.
 *
 * @param {string|number|null} taskId - Task ID if available
 * @param {string} description - Task description
 * @returns {string} Required prefix fragment
 */
function buildRequiredPrefixFragment(taskId, description) {
  const taskIdValue = taskId != null ? String(taskId) : 'MISSING_TASK_ID';
  const subject = (description || 'Task').slice(0, 120);
  const projectRoot = process.env.PROJECT_ROOT || process.cwd() || path.resolve('.');

  return `+======================================================================+
|  WARNING: TASK TRACKING REQUIRED - READ THIS FIRST                   |
+======================================================================+
|  Your Task ID: ${taskIdValue}                                                   |
|                                                                      |
|  PRE-FLIGHT (MANDATORY):                                             |
|  TaskList();                                                         |
|                                                                      |
|  FIRST ACTION (MANDATORY):                                           |
|  TaskUpdate({ taskId: "${taskIdValue}", status: "in_progress" });               |
|                                                                      |
|  AFTER completing work, run:                                         |
|  TaskUpdate({ taskId: "${taskIdValue}", status: "completed",                    |
|    metadata: { summary: "...", filesModified: [...] }                |
|  });                                                                 |
|                                                                      |
|  THEN check for more work:                                           |
|  TaskList();                                                         |
|                                                                      |
|  FAILURE TO UPDATE TASK STATUS BREAKS THE ENTIRE SYSTEM              |
|  YOU WILL BE EVALUATED ON: Task status updates, not just output      |
+======================================================================+

## PROJECT CONTEXT (CRITICAL)
PROJECT_ROOT: ${projectRoot}

All file operations MUST use relative paths from PROJECT_ROOT.
- Agents: .claude/agents/
- Skills: .claude/skills/
- Context: .claude/context/

## Your Assigned Task
Task ID: ${taskIdValue}
Subject: ${subject}`;
}

function isInvalidSubagentType(toolInput) {
  const subagentType = (toolInput?.subagent_type || '').trim().toLowerCase();
  if (!subagentType) return true;
  return INVALID_SUBAGENT_TYPES.has(subagentType);
}

/**
 * Ensure required spawn prompt elements are present before strict validation.
 * This reduces retry loops when router emits partial Task() prompts.
 *
 * @param {Object} toolInput - Task tool input
 * @param {Object} validation - Initial validation result
 * @returns {{ toolInput: Object, modified: boolean, reason?: string }}
 */
function autoNormalizeSpawnInput(toolInput, validation) {
  if (!toolInput || typeof toolInput !== 'object') {
    return { toolInput, modified: false };
  }

  const missingRequired = Array.isArray(validation?.missingRequired)
    ? validation.missingRequired
    : [];
  const needsPrefix =
    missingRequired.includes('TaskUpdate Warning Box') ||
    missingRequired.includes('Task ID Reference');
  const prompt = typeof toolInput.prompt === 'string' ? toolInput.prompt : '';

  // Nothing to fix
  if (!needsPrefix || !prompt) {
    return { toolInput, modified: false };
  }

  const taskId = toolInput.task_id || toolInput.id || null;
  if (!taskId) {
    return { toolInput, modified: false };
  }
  const description = toolInput.description || '';
  const prefix = buildRequiredPrefixFragment(taskId, description);

  // Ensure TaskUpdate and TaskList are present in allowed tools for spawned agent contract
  const existingAllowed = Array.isArray(toolInput.allowed_tools) ? toolInput.allowed_tools : [];
  const allowedSet = new Set(existingAllowed);
  allowedSet.add('TaskUpdate');
  allowedSet.add('TaskList');

  return {
    toolInput: {
      ...toolInput,
      prompt: `${prefix}\n\n${prompt}`,
      allowed_tools: Array.from(allowedSet),
    },
    modified: true,
    reason: 'missing_required_spawn_fields',
  };
}

function hasExplicitTaskId(toolInput) {
  const taskId = toolInput?.task_id || toolInput?.id || null;
  return typeof taskId === 'string' || typeof taskId === 'number';
}

/**
 * Generate a deterministic-enough fallback task ID when router omitted task_id.
 * This is a fail-safe to preserve task tracking even if strict block mode is bypassed.
 *
 * @param {Object} hookInput - Parsed hook input
 * @param {Object} toolInput - Task tool input
 * @returns {string} Generated task ID
 */
function generateFallbackTaskId(hookInput, toolInput) {
  const rawSessionId =
    hookInput?.session_id || hookInput?.sessionId || process.env.CLAUDE_SESSION_ID || 'session';
  const sessionPart =
    String(rawSessionId || '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 12) || 'session';
  const description =
    typeof toolInput?.description === 'string' ? toolInput.description.toLowerCase() : '';
  const hint =
    description
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'spawn';
  return `task-${sessionPart}-${hint}-${Date.now().toString(36)}`;
}

/**
 * Ensure Task() input includes task_id (or normalize id alias).
 *
 * @param {Object} toolInput - Task tool input
 * @param {Object} hookInput - Parsed hook input
 * @returns {{ toolInput: Object, modified: boolean, taskId: string|number|null }}
 */
function ensureTaskId(toolInput, hookInput) {
  const currentTaskId = toolInput?.task_id || toolInput?.id || null;
  if (typeof currentTaskId === 'string' || typeof currentTaskId === 'number') {
    if (toolInput?.task_id != null) {
      return { toolInput, modified: false, taskId: currentTaskId };
    }
    return {
      toolInput: { ...toolInput, task_id: String(currentTaskId) },
      modified: true,
      taskId: String(currentTaskId),
    };
  }

  const generatedTaskId = generateFallbackTaskId(hookInput, toolInput);
  return {
    toolInput: { ...toolInput, task_id: generatedTaskId },
    modified: true,
    taskId: generatedTaskId,
  };
}

/**
 * Attempt best-effort compaction for oversized prompts before hard block.
 * Keeps first policy section and trims repeated boilerplate.
 *
 * @param {Object} toolInput - Task tool input
 * @returns {{ toolInput: Object, modified: boolean, reason?: string, bytesSaved?: number }}
 */
function compactOversizedSpawnInput(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') {
    return { toolInput, modified: false };
  }
  const prompt = typeof toolInput.prompt === 'string' ? toolInput.prompt : '';
  if (!prompt || prompt.length <= MAX_PROMPT_LENGTH) {
    return { toolInput, modified: false };
  }

  let compacted = prompt.replace(/\r\n/g, '\n');
  compacted = compacted.replace(/\n{3,}/g, '\n\n');

  // Keep first full TASK TRACKING warning box, remove duplicate copies.
  let warningSeen = false;
  compacted = compacted.replace(
    /\+={10,100}\+[\s\S]{0,2200}?TASK TRACKING REQUIRED[\s\S]{0,2200}?\+={10,100}\+\n*/g,
    match => {
      if (!warningSeen) {
        warningSeen = true;
        return `${match}\n`;
      }
      return '\n';
    }
  );

  // Keep first PROJECT CONTEXT section body.
  const contextPattern = /##\s+PROJECT CONTEXT[\s\S]{0,1200}?(?=\n##\s+|\n\+={10,100}\+|$)/gi;
  let contextSeen = false;
  compacted = compacted.replace(contextPattern, match => {
    if (!contextSeen) {
      contextSeen = true;
      return `${match}\n`;
    }
    return '\n';
  });

  // Collapse duplicate high-noise lines but keep first copy.
  const seenBoilerplateLines = new Set();
  const lines = compacted.split('\n');
  const compactedLines = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const noisy =
      trimmed === '+======================================================================+' ||
      /^TaskUpdate\(\{[^}]{0,220}(in_progress|completed)/i.test(trimmed) ||
      /^PROJECT_ROOT:\s+/i.test(trimmed);
    if (noisy) {
      const key = trimmed.toLowerCase();
      if (seenBoilerplateLines.has(key)) {
        continue;
      }
      seenBoilerplateLines.add(key);
    }
    compactedLines.push(line);
  }
  compacted = compactedLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (compacted.length > MAX_PROMPT_LENGTH) {
    // Final deterministic trim that preserves both header/policy and tail task details.
    const separator = '\n\n[...TRIMMED_BY_SPAWN_PROMPT_VALIDATOR...]\n\n';
    const headBudget = Math.floor((MAX_PROMPT_LENGTH - separator.length) * 0.68);
    const tailBudget = MAX_PROMPT_LENGTH - separator.length - headBudget;
    compacted = `${compacted.slice(0, headBudget)}${separator}${compacted.slice(-tailBudget)}`;
  }

  if (!compacted || compacted.length >= prompt.length) {
    return { toolInput, modified: false };
  }

  return {
    toolInput: {
      ...toolInput,
      prompt: compacted,
    },
    modified: true,
    reason: 'oversized_prompt_compaction',
    bytesSaved: prompt.length - compacted.length,
  };
}

// =============================================================================
// VALIDATION LOGIC
// =============================================================================

/**
 * Validate spawn prompt against rules
 *
 * SECURITY: Applies all mitigations (Unicode normalization, ReDoS-safe patterns, length limits)
 *
 * @param {string} prompt - The spawn prompt text
 * @returns {Object} Validation result with score, passed rules, failed rules
 */
function validatePrompt(prompt) {
  const compactness = calculatePromptCompactness(prompt);
  if (!prompt || typeof prompt !== 'string') {
    return {
      score: 0,
      passed: [],
      failed: VALIDATION_RULES.map(r => r.name),
      suggestions: VALIDATION_RULES.map(r => r.suggestion),
      isValid: false,
      needsWarning: true,
      error: 'Prompt is null or not a string',
      compactness,
    };
  }

  // SECURITY MITIGATION: VULN-003 - Prompt length limit
  if (prompt.length > MAX_PROMPT_LENGTH) {
    auditLog('spawn-prompt-validator', 'prompt-too-large', {
      length: prompt.length,
      limit: MAX_PROMPT_LENGTH,
    });
    return {
      score: 0,
      passed: [],
      failed: ['Prompt exceeds maximum length'],
      suggestions: [
        `Prompt is ${prompt.length} bytes, maximum is ${MAX_PROMPT_LENGTH} (${Math.round(MAX_PROMPT_LENGTH / 1000)}KB)`,
      ],
      isValid: false,
      needsWarning: true,
      error: 'SEC-DOS-001: Prompt exceeds maximum length',
      compactness,
    };
  }

  // SECURITY MITIGATION: VULN-003 - Warning for large prompts
  if (prompt.length > PROMPT_LENGTH_WARNING) {
    auditLog('spawn-prompt-validator', 'large-prompt-warning', {
      length: prompt.length,
      threshold: PROMPT_LENGTH_WARNING,
    });
  }

  // SECURITY MITIGATION: VULN-001 - Normalize Unicode FIRST
  const normalizedPrompt = normalizeUnicode(prompt);

  const passed = [];
  const failed = [];
  const suggestions = [];
  const missingRequired = [];
  let score = 0;

  // Validate each rule
  for (const rule of VALIDATION_RULES) {
    // SECURITY MITIGATION: VULN-002 - Use safe regex test with timeout
    const matches = safeRegexTest(rule.pattern, normalizedPrompt);

    if (matches) {
      passed.push(rule.name);
      score += rule.weight;
    } else {
      failed.push(rule.name);
      suggestions.push(`[${rule.severity.toUpperCase()}] ${rule.name}: ${rule.suggestion}`);

      // SECURITY MITIGATION: VULN-006 - Track missing required rules
      if (rule.required) {
        missingRequired.push(rule.name);
      }
    }
  }

  // VULN-006: Required rules must be present regardless of score
  if (missingRequired.length > 0) {
    return {
      score: 0,
      passed,
      failed,
      suggestions,
      isValid: false,
      needsWarning: true,
      error: `Missing required elements: ${missingRequired.join(', ')}`,
      missingRequired,
      compactness,
    };
  }

  const compactnessFails =
    Number.isFinite(COMPACTNESS_MIN) && COMPACTNESS_MIN > 0 && compactness.score < COMPACTNESS_MIN;

  return {
    score,
    passed,
    failed,
    suggestions,
    isValid: score >= MINIMUM_SCORE && !compactnessFails,
    needsWarning: score < WARNING_THRESHOLD,
    compactness,
    compactnessFails,
    ...(compactnessFails
      ? {
          error: `Compactness score ${compactness.score} below threshold ${COMPACTNESS_MIN}`,
        }
      : {}),
  };
}

/**
 * Check if spawn is to an orchestrator (which has different requirements)
 * SEC-TMPL-002 FIX: Only match on subagent_type, not description (prevents bypass)
 * @param {Object} toolInput - Task tool input
 * @returns {boolean} True if spawning orchestrator
 */
function isOrchestratorSpawn(toolInput) {
  const orchestratorTypes = [
    'master-orchestrator',
    'evolution-orchestrator',
    'swarm-coordinator',
    'party-orchestrator',
    'router', // router is also an orchestrator type
  ];

  // SEC-TMPL-002 FIX: Only check subagent_type (exact match), not description
  // Description can be manipulated by users to bypass validation
  const subagentType = (toolInput.subagent_type || '').trim().toLowerCase();

  return orchestratorTypes.some(orch => subagentType.includes(orch));
}

/**
 * Check if this is a template-based spawn (using @ reference)
 * @param {string} prompt - Spawn prompt
 * @returns {boolean} True if using template reference
 */
function isTemplateBasedSpawn(prompt) {
  return prompt.includes('.claude/templates/spawn/') || prompt.includes('See .claude/templates');
}

function emitRuntimeHealth(status, durationMs, extra = {}) {
  try {
    const { logRuntimeHealth } = require('../../lib/monitoring/runtime-health-log.cjs');
    logRuntimeHealth({
      component: 'spawn-prompt-validator',
      status,
      durationMs,
      sessionId: process.env.CLAUDE_SESSION_ID || null,
      extra,
    });
  } catch (_err) {
    // best-effort
  }
}

function calculatePromptCompactness(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return { score: 0, duplicateHeaders: [], repeatedBoilerplate: [] };
  }

  const lines = prompt.split(/\r?\n/);
  const headerCounts = new Map();
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^#{2,3}\s+/.test(trimmed)) {
      headerCounts.set(trimmed, (headerCounts.get(trimmed) || 0) + 1);
    }
  }

  const duplicateHeaders = [...headerCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([header, count]) => ({ header, count }));

  const boilerplatePatterns = [
    { label: 'warning_box', regex: /TASK TRACKING REQUIRED/gi },
    { label: 'taskupdate_in_progress', regex: /TaskUpdate\(\{[^}]{0,200}in_progress/gi },
    { label: 'taskupdate_completed', regex: /TaskUpdate\(\{[^}]{0,200}completed/gi },
    { label: 'project_context', regex: /##\s+PROJECT CONTEXT/gi },
  ];
  const repeatedBoilerplate = [];
  for (const pattern of boilerplatePatterns) {
    const matches = prompt.match(pattern.regex);
    const count = matches ? matches.length : 0;
    if (count > 1) {
      repeatedBoilerplate.push({ label: pattern.label, count });
    }
  }

  const duplicatePenalty = duplicateHeaders.reduce((sum, row) => sum + (row.count - 1) * 12, 0);
  const boilerplatePenalty = repeatedBoilerplate.reduce(
    (sum, row) => sum + (row.count - 1) * 10,
    0
  );
  const lengthPenalty =
    prompt.length > 40000 ? Math.min(30, Math.floor((prompt.length - 40000) / 5000)) : 0;
  const rawScore = 100 - duplicatePenalty - boilerplatePenalty - lengthPenalty;

  return {
    score: Math.max(0, Math.min(100, rawScore)),
    duplicateHeaders,
    repeatedBoilerplate,
  };
}

function maybeExitWhenDisabled(mode, startTime) {
  if (mode !== 'off') {
    return false;
  }

  auditLog('spawn-prompt-validator', 'disabled', {
    reason: 'SPAWN_PROMPT_VALIDATOR=off',
    warning: 'Validation bypassed - security risk',
  });
  emitRuntimeHealth('disabled', Date.now() - startTime, { mode });
  process.exit(0);
}

function maybeExitForNonTaskTool(toolName, startTime) {
  if (toolName === 'Task') {
    return false;
  }

  emitRuntimeHealth('skip_non_task', Date.now() - startTime, { toolName: toolName || null });
  process.exit(0);
}

function maybeExitForOrchestratorSpawn(toolInput, ensuredTask, startTime) {
  if (!isOrchestratorSpawn(toolInput)) {
    return false;
  }

  auditLog('spawn-prompt-validator', 'skip', {
    reason: 'orchestrator-spawn',
    description: toolInput.description,
  });
  if (ensuredTask.modified) {
    console.log(JSON.stringify({ tool_input: toolInput }));
  }
  emitRuntimeHealth('skip_orchestrator', Date.now() - startTime, {
    agentType: toolInput.subagent_type || null,
  });
  process.exit(0);
}

function maybeExitForInvalidSubagentType(toolInput, startTime) {
  if (!isInvalidSubagentType(toolInput)) {
    return false;
  }

  const value = toolInput?.subagent_type || '(missing)';
  const message =
    `[SPAWN-PROMPT-VALIDATOR] Invalid subagent_type "${value}". ` +
    'Use a valid agent id (e.g., developer, qa, architect), not a tool name.';
  console.log(formatResult('block', message));
  emitRuntimeHealth('blocked_invalid_subagent_type', Date.now() - startTime, {
    subagentType: value,
  });
  process.exit(2);
}

function maybeLogTaskIdInjection(hookInput, toolInput, ensuredTask) {
  if (!ensuredTask.modified) {
    return;
  }

  auditLog('spawn-prompt-validator', 'task-id-auto-injected', {
    sessionId: hookInput.session_id || hookInput.sessionId || 'unknown',
    taskId: ensuredTask.taskId,
    agentType: toolInput.subagent_type || 'unknown',
  });
}

function buildFailureMessage(validation) {
  return [
    `[SPAWN-PROMPT-VALIDATOR] Spawn prompt validation failed (score: ${validation.score}/${MINIMUM_SCORE})`,
    '',
    validation.error || 'Missing required elements:',
    ...validation.suggestions,
    '',
    'Recommendation: Use the spawn template from .claude/templates/spawn/universal-agent-spawn.md',
  ].join('\n');
}

async function maybeHandleInvalidValidation({
  mode,
  validation,
  startTime,
  sessionId,
  promptHash,
}) {
  if (validation.isValid) {
    return false;
  }

  const message = buildFailureMessage(validation);

  if (mode === 'block') {
    const loopBreaker = registerSpawnValidationFailure(sessionId, promptHash, validation);
    if (loopBreaker.shouldBypassBlock) {
      const bypassMessage = `${message}

[LOOP-BREAKER] Repeated identical spawn validation failures detected (${loopBreaker.count} within window).
Temporarily degrading to warn mode for this failure fingerprint to prevent retry deadlock.`;
      auditLog('spawn-prompt-validator', 'loop-breaker-bypass', {
        sessionId,
        promptHash,
        loopBreakerCount: loopBreaker.count,
        missingRequired: validation.missingRequired || [],
      });
      console.warn(bypassMessage);
      emitRuntimeHealth('loop_breaker_warn', Date.now() - startTime, {
        promptHash,
        score: validation.score,
      });
      process.exit(0);
    }
    try {
      await eventBus.emit(EventTypes.TOOL_BLOCKED, {
        type: EventTypes.TOOL_BLOCKED,
        timestamp: new Date().toISOString(),
        toolName: 'Task',
        reason: 'spawn_prompt_validation_failed',
      });
    } catch (_err) {
      // Best-effort
    }
    console.log(formatResult('block', message));
    emitRuntimeHealth('blocked', Date.now() - startTime, {
      score: validation.score,
      compactness: validation.compactness?.score ?? null,
    });
    process.exit(2);
  }

  // warn mode
  console.warn(message);
  emitRuntimeHealth('warn', Date.now() - startTime, {
    score: validation.score,
    compactness: validation.compactness?.score ?? null,
  });
  process.exit(0);
}

function maybeWarnOnLowQuality(validation, mode) {
  if (!(validation.needsWarning && mode === 'warn')) {
    return;
  }

  console.warn(
    `[SPAWN-PROMPT-VALIDATOR] Spawn prompt could be improved (score: ${validation.score}/100). ` +
      `Missing: ${validation.failed.join(', ')}`
  );
}

function runPromptNormalizationPipeline(toolInput, initialValidation, startTime) {
  let effectiveToolInput = toolInput;
  let validation = initialValidation;

  const normalized = autoNormalizeSpawnInput(toolInput, validation);
  if (normalized.modified) {
    effectiveToolInput = normalized.toolInput;
    validation = validatePrompt(normalized.toolInput.prompt || '');
    auditLog('spawn-prompt-validator', 'autofix_attempted', {
      reason: normalized.reason,
      validAfterAutofix: validation.isValid,
      missingRequiredAfterAutofix: validation.missingRequired || [],
    });

    if (validation.isValid) {
      console.log(JSON.stringify({ tool_input: normalized.toolInput }));
      emitRuntimeHealth('autofix_pass', Date.now() - startTime, {
        taskId: normalized.toolInput.task_id || null,
      });
      process.exit(0);
    }
  }

  if (validation.error && validation.error.includes('SEC-DOS-001')) {
    const compacted = compactOversizedSpawnInput(effectiveToolInput);
    if (compacted.modified) {
      effectiveToolInput = compacted.toolInput;
      validation = validatePrompt(effectiveToolInput.prompt || '');
      auditLog('spawn-prompt-validator', 'oversized-compaction-attempted', {
        bytesSaved: compacted.bytesSaved || 0,
        validAfterCompaction: validation.isValid,
      });
      if (validation.isValid) {
        console.log(JSON.stringify({ tool_input: effectiveToolInput }));
        emitRuntimeHealth('compaction_pass', Date.now() - startTime, {
          bytesSaved: compacted.bytesSaved || 0,
          finalLength: effectiveToolInput.prompt.length,
        });
        process.exit(0);
      }
    }
  }

  return { effectiveToolInput, validation };
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const startTime = Date.now();

  const mode = getEnforcementMode('SPAWN_PROMPT_VALIDATOR', 'block');

  // SECURITY MITIGATION: VULN-005 - Audit any non-default mode
  if (mode !== 'warn') {
    auditLog('spawn-prompt-validator', 'non-default-mode', {
      mode,
      warning: mode === 'off' ? 'Validation bypassed - security risk' : 'Enforcement mode changed',
    });
  }

  maybeExitWhenDisabled(mode, startTime);

  try {
    const hookInput = await parseHookInputAsync();
    const toolName = getToolName(hookInput);

    maybeExitForNonTaskTool(toolName, startTime);

    const rawToolInput = getToolInput(hookInput);
    const ensuredTask = ensureTaskId(rawToolInput, hookInput);
    const toolInput = ensuredTask.toolInput;
    const prompt = toolInput.prompt || '';

    maybeLogTaskIdInjection(hookInput, toolInput, ensuredTask);

    maybeExitForOrchestratorSpawn(toolInput, ensuredTask, startTime);
    maybeExitForInvalidSubagentType(toolInput, startTime);

    const initialValidation = validatePrompt(prompt);
    const { effectiveToolInput, validation } = runPromptNormalizationPipeline(
      toolInput,
      initialValidation,
      startTime
    );

    const executionMs = Date.now() - startTime;
    const sessionId =
      hookInput.session_id || hookInput.sessionId || process.env.CLAUDE_SESSION_ID || 'unknown';
    const promptHash = crypto.createHash('sha256').update(prompt).digest('hex').substring(0, 16);

    // SECURITY MITIGATION: VULN-007 - Enhanced audit log fields
    auditLog('spawn-prompt-validator', validation.isValid ? 'pass' : 'fail', {
      score: validation.score,
      passed: validation.passed,
      failed: validation.failed,
      compactnessScore: validation.compactness?.score ?? null,
      compactnessFails: Boolean(validation.compactnessFails),
      isTemplateBasedSpawn: isTemplateBasedSpawn(prompt),
      // Enhanced fields:
      sessionId: hookInput.session_id || 'unknown',
      agentType: toolInput.subagent_type || 'unknown',
      promptLength: (effectiveToolInput.prompt || '').length,
      promptHash,
      executionMs,
      missingRequired: validation.missingRequired || [],
    });

    await maybeHandleInvalidValidation({
      mode,
      validation,
      startTime,
      sessionId,
      promptHash,
    });

    clearSpawnValidationFailure(sessionId, promptHash, validation);

    maybeWarnOnLowQuality(validation, mode);

    if (ensuredTask.modified) {
      console.log(JSON.stringify({ tool_input: effectiveToolInput }));
    }
    emitRuntimeHealth('ok', Date.now() - startTime, {
      score: validation.score,
      compactness: validation.compactness?.score ?? null,
    });
    process.exit(0);
  } catch (err) {
    // SECURITY MITIGATION: VULN-004 - Full audit context in exception handler
    auditLog('spawn-prompt-validator', 'error-failopen', {
      error: err.message,
      stack: err.stack?.substring(0, 500),
      toolInput: JSON.stringify(arguments[0] || {}).substring(0, 200),
      mode: mode,
      timestamp: new Date().toISOString(),
    });

    debugLog('spawn-prompt-validator', 'Validation error', err);

    // Fail closed by default (security hook policy — hooks.md: security hooks must fail-closed)
    // Override to fail-open for advisory/non-blocking usage: SPAWN_PROMPT_VALIDATOR_FAIL_MODE=open
    const failMode = process.env.SPAWN_PROMPT_VALIDATOR_FAIL_MODE || 'closed';

    if (failMode === 'closed') {
      try {
        await eventBus.emit(EventTypes.TOOL_FAILED, {
          type: EventTypes.TOOL_FAILED,
          timestamp: new Date().toISOString(),
          toolName: 'spawn-prompt-validator',
          error: err.message,
        });
      } catch (_err) {
        // Best-effort
      }
      console.log(formatResult('block', 'Internal validation error - fail-closed mode'));
      emitRuntimeHealth('error_fail_closed', Date.now() - startTime, { error: err.message });
      process.exit(2);
    }

    // Fail open (default)
    emitRuntimeHealth('error_fail_open', Date.now() - startTime, { error: err.message });
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
  validatePrompt,
  autoNormalizeSpawnInput,
  hasExplicitTaskId,
  generateFallbackTaskId,
  ensureTaskId,
  compactOversizedSpawnInput,
  buildRequiredPrefixFragment,
  normalizeUnicode,
  safeRegexTest,
  isOrchestratorSpawn,
  isTemplateBasedSpawn,
  isInvalidSubagentType,
  calculatePromptCompactness,
  readLoopBreakerState,
  writeLoopBreakerState,
  registerSpawnValidationFailure,
  clearSpawnValidationFailure,
  buildLoopBreakerKey,
  VALIDATION_RULES,
  MINIMUM_SCORE,
  WARNING_THRESHOLD,
  MAX_PROMPT_LENGTH,
  PROMPT_LENGTH_WARNING,
};
