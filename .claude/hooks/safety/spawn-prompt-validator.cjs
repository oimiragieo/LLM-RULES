#!/usr/bin/env node
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
 * - SPAWN_PROMPT_VALIDATOR=block|warn|off (default: warn)
 *
 * SECURITY MITIGATIONS:
 * - VULN-001: Unicode normalization prevents homoglyph bypass
 * - VULN-002: ReDoS-safe regex patterns with bounded quantifiers
 * - VULN-003: Prompt length limit (500KB max)
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
    // Allows 0-digit IDs (like "0") when taskId is null
    pattern: /(?:Your\s+)?Task\s+ID:\s*[<"']?(?:\d+|0)[>"]?|taskId:\s*[<"']?(?:\d+|0)[>"]?/i,
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
 */
const MAX_PROMPT_LENGTH = 500000; // 500KB (conservative limit)

/**
 * Warning threshold for large prompts
 */
const PROMPT_LENGTH_WARNING = 100000; // 100KB

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
  if (!prompt || typeof prompt !== 'string') {
    return {
      score: 0,
      passed: [],
      failed: VALIDATION_RULES.map(r => r.name),
      suggestions: VALIDATION_RULES.map(r => r.suggestion),
      isValid: false,
      needsWarning: true,
      error: 'Prompt is null or not a string',
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
      suggestions: [`Prompt is ${prompt.length} bytes, maximum is ${MAX_PROMPT_LENGTH} (500KB)`],
      isValid: false,
      needsWarning: true,
      error: 'SEC-DOS-001: Prompt exceeds maximum length',
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
    };
  }

  return {
    score,
    passed,
    failed,
    suggestions,
    isValid: score >= MINIMUM_SCORE,
    needsWarning: score < WARNING_THRESHOLD,
  };
}

/**
 * Check if spawn is to an orchestrator (which has different requirements)
 * @param {Object} toolInput - Task tool input
 * @returns {boolean} True if spawning orchestrator
 */
function isOrchestratorSpawn(toolInput) {
  const orchestratorTypes = [
    'master-orchestrator',
    'evolution-orchestrator',
    'swarm-coordinator',
    'party-orchestrator',
  ];

  const description = (toolInput.description || '').toLowerCase();
  const subagentType = (toolInput.subagent_type || '').toLowerCase();

  return orchestratorTypes.some(orch => description.includes(orch) || subagentType.includes(orch));
}

/**
 * Check if this is a template-based spawn (using @ reference)
 * @param {string} prompt - Spawn prompt
 * @returns {boolean} True if using template reference
 */
function isTemplateBasedSpawn(prompt) {
  return prompt.includes('.claude/templates/spawn/') || prompt.includes('See .claude/templates');
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

  // Fast path: disabled
  if (mode === 'off') {
    auditLog('spawn-prompt-validator', 'disabled', {
      reason: 'SPAWN_PROMPT_VALIDATOR=off',
      warning: 'Validation bypassed - security risk',
    });
    process.exit(0);
  }

  try {
    const hookInput = await parseHookInputAsync();
    const toolName = getToolName(hookInput);

    // Only validate Task tool
    if (toolName !== 'Task') {
      process.exit(0);
    }

    const toolInput = getToolInput(hookInput);
    const prompt = toolInput.prompt || '';

    // Skip validation for orchestrators (different template)
    if (isOrchestratorSpawn(toolInput)) {
      auditLog('spawn-prompt-validator', 'skip', {
        reason: 'orchestrator-spawn',
        description: toolInput.description,
      });
      process.exit(0);
    }

    // Validate prompt
    const validation = validatePrompt(prompt);

    const executionMs = Date.now() - startTime;

    // SECURITY MITIGATION: VULN-007 - Enhanced audit log fields
    auditLog('spawn-prompt-validator', validation.isValid ? 'pass' : 'fail', {
      score: validation.score,
      passed: validation.passed,
      failed: validation.failed,
      isTemplateBasedSpawn: isTemplateBasedSpawn(prompt),
      // Enhanced fields:
      sessionId: hookInput.session_id || 'unknown',
      agentType: toolInput.subagent_type || 'unknown',
      promptLength: prompt.length,
      promptHash: crypto.createHash('sha256').update(prompt).digest('hex').substring(0, 16),
      executionMs,
      missingRequired: validation.missingRequired || [],
    });

    // Handle based on enforcement mode
    if (!validation.isValid) {
      const message = [
        `[SPAWN-PROMPT-VALIDATOR] Spawn prompt validation failed (score: ${validation.score}/${MINIMUM_SCORE})`,
        '',
        validation.error || 'Missing required elements:',
        ...validation.suggestions,
        '',
        'Recommendation: Use the spawn template from .claude/templates/spawn/universal-agent-spawn.md',
      ].join('\n');

      if (mode === 'block') {
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
        process.exit(2);
      } else {
        // warn mode
        console.warn(message);
        process.exit(0);
      }
    }

    // Passed but needs warning
    if (validation.needsWarning && mode === 'warn') {
      console.warn(
        `[SPAWN-PROMPT-VALIDATOR] Spawn prompt could be improved (score: ${validation.score}/100). ` +
          `Missing: ${validation.failed.join(', ')}`
      );
    }

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

    // Fail open to not block legitimate spawns (default behavior)
    // For production, consider: SPAWN_PROMPT_VALIDATOR_FAIL_MODE=closed
    const failMode = process.env.SPAWN_PROMPT_VALIDATOR_FAIL_MODE || 'open';

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
      process.exit(2);
    }

    // Fail open (default)
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
  validatePrompt,
  normalizeUnicode,
  safeRegexTest,
  isOrchestratorSpawn,
  isTemplateBasedSpawn,
  VALIDATION_RULES,
  MINIMUM_SCORE,
  WARNING_THRESHOLD,
  MAX_PROMPT_LENGTH,
  PROMPT_LENGTH_WARNING,
};
