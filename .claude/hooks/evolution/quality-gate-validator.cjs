#!/usr/bin/env node
/**
 * quality-gate-validator.cjs
 * PreToolUse hook for Write/Edit operations during VERIFY phase
 *
 * Enforces: Artifact must pass quality checks before ENABLE phase.
 * Checks for:
 * - No placeholder content (TODO, TBD, FIXME, etc.)
 * - Task Progress Protocol section present
 * - Memory Protocol section present
 * - Iron Laws documented
 *
 * ENFORCEMENT MODES (QUALITY_GATE_ENFORCEMENT):
 * - block (default): Violations are blocked with error message
 * - warn: Violations produce warning but are allowed
 * - off: Enforcement disabled
 *
 * Override via environment variable:
 *   QUALITY_GATE_ENFORCEMENT=warn
 *   QUALITY_GATE_ENFORCEMENT=off
 *
 * Exit codes:
 * - 0: Allow operation (quality checks pass, not in verify phase, or warn/off mode)
 * - 2: Block operation (quality checks fail in block mode)
 *
 * The hook fails open (exits 0) on errors to avoid blocking legitimate work.
 */

'use strict';

const path = require('path');
// PERF-006/PERF-007: Use shared utilities instead of duplicated code
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const {
  parseHookInputAsync,
  extractFilePath,
  getToolInput,
  getEnforcementMode: getEnfMode,
} = require('../../lib/utils/hook-input.cjs');
const eventBus = require('../../lib/events/event-bus.cjs');
const { EventTypes } = require('../../lib/events/event-types.cjs');
const { getCachedState } = require('../../lib/utils/state-cache.cjs');
const { ROUTING_TABLE } = require('../../lib/routing/routing-table-core-map.cjs');

// Placeholder patterns that indicate incomplete content
const PLACEHOLDER_PATTERNS = [
  /\bTODO\b/i,
  /\bTBD\b/i,
  /\bFIXME\b/i,
  /\[FILL[ _-]?IN\]/i,
  /\[PLACEHOLDER\]/i,
  /<fill[- ]?in>/i,
  /\.\.\.\s*$/m, // Trailing ellipsis (incomplete)
  /\[INSERT\]/i,
  /\bXXX\b/,
  /\bHACK\b/i,
];

// Required sections for agents
const REQUIRED_AGENT_SECTIONS = [
  { pattern: /## Task Progress Protocol/i, name: 'Task Progress Protocol' },
  { pattern: /## Memory Protocol/i, name: 'Memory Protocol' },
  { pattern: /Iron Law/i, name: 'Iron Laws' },
];

// Required sections for skills
const REQUIRED_SKILL_SECTIONS = [
  { pattern: /## (When to|Purpose|Usage)/i, name: 'Purpose/Usage section' },
];

const EVOLUTION_STATE_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'evolution-state.json');

/**
 * Get enforcement mode from environment variable
 * @returns {'block' | 'warn' | 'off'}
 */
function getEnforcementMode() {
  return getEnfMode('QUALITY_GATE_ENFORCEMENT', 'block');
}

/**
 * Detect artifact type from file path
 * @param {string} filePath - The file path
 * @returns {'agent' | 'skill' | 'workflow' | 'hook' | 'schema' | null}
 */
function detectArtifactType(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return null;
  }
  const normalized = filePath.replace(/\\/g, '/');

  if (/\.claude\/agents\//.test(normalized)) return 'agent';
  if (/\.claude\/skills\//.test(normalized)) return 'skill';
  if (/\.claude\/workflows\//.test(normalized)) return 'workflow';
  if (/\.claude\/hooks\//.test(normalized)) return 'hook';
  if (/\.claude\/schemas\//.test(normalized)) return 'schema';

  return null;
}

/**
 * Get the evolution state from file
 * PERF-004: Uses state-cache for TTL-based caching
 * @returns {Object|null}
 */
function getEvolutionState() {
  // PERF-004: Use cached state with 1s TTL
  return getCachedState(EVOLUTION_STATE_PATH, null);
}

/**
 * Check if we're in the VERIFY phase
 * @param {Object|null} state - Evolution state
 * @returns {boolean}
 */
function isInVerifyPhase(state) {
  if (!state || !state.currentEvolution) {
    return false;
  }
  return state.state === 'verifying' || state.currentEvolution.phase === 'verify';
}

/**
 * Check content for placeholder patterns
 * @param {string} content - File content to check
 * @returns {Array<{pattern: string, line: number}>}
 */
function findPlaceholders(content) {
  const issues = [];
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    PLACEHOLDER_PATTERNS.forEach(pattern => {
      if (pattern.test(line)) {
        issues.push({
          pattern: pattern.source,
          line: index + 1,
          text: line.trim().substring(0, 80),
        });
      }
    });
  });

  return issues;
}

/**
 * Check for required sections based on artifact type
 * @param {string} content - File content
 * @param {string} artifactType - Type of artifact
 * @returns {Array<string>} Missing section names
 */
function findMissingSections(content, artifactType) {
  const missing = [];

  if (artifactType === 'agent') {
    REQUIRED_AGENT_SECTIONS.forEach(({ pattern, name }) => {
      if (!pattern.test(content)) {
        missing.push(name);
      }
    });
  } else if (artifactType === 'skill') {
    REQUIRED_SKILL_SECTIONS.forEach(({ pattern, name }) => {
      if (!pattern.test(content)) {
        missing.push(name);
      }
    });
  }

  return missing;
}

function extractTriggerKeywords(content) {
  const keywords = new Set();
  const inlineArray = content.match(/triggerPhrases\s*:\s*\[([^\]]+)\]/i);
  if (inlineArray) {
    const raw = inlineArray[1];
    raw
      .split(',')
      .map(v => v.replace(/['"`]/g, '').trim().toLowerCase())
      .filter(Boolean)
      .forEach(v => keywords.add(v));
  }

  const lines = content.split('\n');
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (!lower.includes('trigger') && !lower.includes('keyword')) continue;
    const tokens = line
      .split(/[:,]/)
      .slice(1)
      .join(' ')
      .split(/\s+/)
      .map(v =>
        v
          .replace(/[^a-z0-9-]/gi, '')
          .trim()
          .toLowerCase()
      )
      .filter(v => v.length >= 3);
    for (const token of tokens) keywords.add(token);
  }
  return [...keywords];
}

function detectRoutingCollisions(content, targetAgent) {
  const agent = typeof targetAgent === 'string' ? targetAgent.trim() : '';
  if (!agent) return [];
  const keywords = extractTriggerKeywords(content);
  const collisions = [];
  for (const keyword of keywords) {
    const mapped = ROUTING_TABLE[keyword];
    if (mapped && mapped !== agent) {
      collisions.push({ keyword, mappedTo: mapped });
    }
  }
  return collisions;
}

/**
 * Validate artifact content quality
 * @param {string} content - File content
 * @param {string} artifactType - Type of artifact
 * @returns {{ valid: boolean, issues: Array }}
 */
function validateQuality(content, artifactType, options = {}) {
  const issues = [];

  // Check for placeholders
  const placeholders = findPlaceholders(content);
  if (placeholders.length > 0) {
    issues.push({
      type: 'placeholder',
      message: `Found ${placeholders.length} placeholder(s)`,
      details: placeholders.slice(0, 5), // Limit to first 5
    });
  }

  // Check for required sections
  const missingSections = findMissingSections(content, artifactType);
  if (missingSections.length > 0) {
    issues.push({
      type: 'missing_section',
      message: `Missing required section(s): ${missingSections.join(', ')}`,
      details: missingSections,
    });
  }

  // Check minimum content length (avoid empty/stub artifacts)
  if (content.length < 500) {
    issues.push({
      type: 'too_short',
      message: `Content too short (${content.length} chars, minimum 500)`,
    });
  }

  if (artifactType === 'agent') {
    const collisions = detectRoutingCollisions(content, options.targetAgent);
    if (collisions.length > 0) {
      issues.push({
        type: 'routing_collision',
        message: `Routing keyword collision(s): ${collisions
          .slice(0, 5)
          .map(c => `${c.keyword}->${c.mappedTo}`)
          .join(', ')}`,
        details: collisions.slice(0, 10),
      });
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

// PERF-006: parseHookInput is now imported from hook-input.cjs
// Alias for backward compatibility with exports
const parseHookInput = parseHookInputAsync;

/**
 * Format the violation message for output.
 * @param {Array} issues - Quality issues found
 * @returns {string} Formatted violation message
 */
function formatViolationMessage(issues) {
  const issueDetails = issues.map(i => `  - ${i.message}`).join('\n');
  return `[EVOLUTION WORKFLOW VIOLATION] Artifact failed quality gate (VERIFY phase).
Quality issues found:
${issueDetails}

Fix these issues before proceeding to ENABLE phase.
Refer to: .claude/workflows/core/evolution-workflow.md Phase 5 (VERIFY)`;
}

/**
 * Main execution function.
 */
async function main() {
  try {
    // Check enforcement mode
    const enforcement = getEnforcementMode();
    if (enforcement === 'off') {
      process.exit(0);
    }

    // Parse the hook input using shared utility
    const hookInput = await parseHookInputAsync();

    if (!hookInput) {
      // No input provided - fail open
      process.exit(0);
    }

    // PERF-006: Get the file path and content using shared utilities
    const toolInput = getToolInput(hookInput);
    const filePath = extractFilePath(toolInput) || '';
    const content = toolInput.content || toolInput.new_string || '';

    // Detect artifact type
    const artifactType = detectArtifactType(filePath);
    if (!artifactType) {
      // Not an artifact path - allow
      process.exit(0);
    }

    // Check if we're in VERIFY phase (only enforce during verification)
    const state = getEvolutionState();
    if (!isInVerifyPhase(state)) {
      // Not in verify phase - allow (LOCK phase creates initial content)
      process.exit(0);
    }

    // Validate quality
    const targetAgent = state?.currentEvolution?.name || null;
    const validation = validateQuality(content, artifactType, { targetAgent });

    // If quality is good, allow
    if (validation.valid) {
      process.exit(0);
    }

    // Quality issues found - violation
    const message = formatViolationMessage(validation.issues);

    if (enforcement === 'block') {
      try {
        await eventBus.emit(EventTypes.TOOL_BLOCKED, {
          type: EventTypes.TOOL_BLOCKED,
          timestamp: new Date().toISOString(),
          toolName: 'Write',
          reason: 'quality_gate_failed',
        });
      } catch (_err) {
        // Best-effort
      }
      console.log(JSON.stringify({ result: 'block', message }));
      process.exit(2);
    } else {
      // Default to warn
      console.log(JSON.stringify({ result: 'warn', message }));
      process.exit(0);
    }
  } catch (err) {
    // Fail open on errors to avoid blocking legitimate work
    if (process.env.DEBUG_HOOKS) {
      console.error('quality-gate-validator error:', err.message);
      console.error('Stack trace:', err.stack);
    }
    process.exit(0);
  }
}

// Run if this is the main module
if (require.main === module) {
  main();
}

// Export for testing
module.exports = {
  main,
  getEnforcementMode,
  detectArtifactType,
  isInVerifyPhase,
  findPlaceholders,
  findMissingSections,
  extractTriggerKeywords,
  detectRoutingCollisions,
  validateQuality,
  getEvolutionState,
  PLACEHOLDER_PATTERNS,
  REQUIRED_AGENT_SECTIONS,
  REQUIRED_SKILL_SECTIONS,
  PROJECT_ROOT,
  EVOLUTION_STATE_PATH,
};
