#!/usr/bin/env node
/**
 * unified-evolution-guard.cjs
 * PreToolUse hook for Edit/Write operations
 *
 * PERF-002: Consolidates 4 evolution checks into a single hook to reduce
 * process spawn overhead from 4 spawns to 1 per Edit/Write operation.
 *
 * Consolidated checks:
 * 1. evolution-state-guard - State machine transitions
 * 2. conflict-detector - Naming conflicts
 * 3. quality-gate-validator - Quality gates in VERIFY phase
 * 4. research-enforcement - Research requirement before artifact creation
 *
 * Performance impact:
 * - Before: 4 process spawns per Edit/Write (~300-500ms overhead)
 * - After: 1 process spawn per Edit/Write (~80ms overhead)
 * - Expected: 80% reduction in evolution hook overhead
 *
 * ENFORCEMENT MODES (UNIFIED_EVOLUTION_GUARD):
 * - block (default): Violations are blocked with error message
 * - warn: Violations produce warning but are allowed
 * - off: All evolution enforcement disabled
 *
 * Individual check overrides still work:
 * - EVOLUTION_STATE_GUARD=off
 * - CONFLICT_DETECTOR=off
 * - QUALITY_GATE_ENFORCEMENT=off
 * - RESEARCH_ENFORCEMENT=off
 *
 * Exit codes:
 * - 0: Allow operation
 * - 2: Block operation
 */

'use strict';

const fs = require('fs');
const path = require('path');

// PERF-006/PERF-007: Use shared utilities
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
const { safeReadJSON } = require('../../lib/utils/safe-json.cjs');

// ============================================================================
// Constants (consolidated from individual hooks)
// ============================================================================

const EVOLUTION_STATE_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'evolution-state.json');

// State machine transitions (from evolution-state-guard.cjs)
const STATE_TRANSITIONS = {
  idle: ['evaluating'],
  evaluating: ['validating', 'aborted'],
  validating: ['obtaining', 'aborted'],
  obtaining: ['locking', 'obtaining'],
  locking: ['verifying', 'locking'],
  verifying: ['enabling', 'locking'],
  enabling: ['idle'],
  aborted: [],
  blocked: ['evaluating', 'validating', 'obtaining', 'locking', 'verifying', 'enabling'],
  failed: ['idle'],
};

// Artifact name pattern (from conflict-detector.cjs)
const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

// Placeholder patterns (from quality-gate-validator.cjs)
const PLACEHOLDER_PATTERNS = [
  /\bTODO\b/i,
  /\bTBD\b/i,
  /\bFIXME\b/i,
  /\[FILL[ _-]?IN\]/i,
  /\[PLACEHOLDER\]/i,
  /<fill[- ]?in>/i,
  /\.\.\.\s*$/m,
  /\[INSERT\]/i,
  /\bXXX\b/,
  /\bHACK\b/i,
];

// Required sections for agents (from quality-gate-validator.cjs)
const REQUIRED_AGENT_SECTIONS = [
  { pattern: /## Task Progress Protocol/i, name: 'Task Progress Protocol' },
  { pattern: /## Memory Protocol/i, name: 'Memory Protocol' },
  { pattern: /Iron Law/i, name: 'Iron Laws' },
];

// Required sections for skills (from quality-gate-validator.cjs)
const REQUIRED_SKILL_SECTIONS = [
  { pattern: /## (When to|Purpose|Usage)/i, name: 'Purpose/Usage section' },
];

// Artifact paths requiring research (from research-enforcement.cjs)
const ARTIFACT_PATH_PATTERNS = [
  /\.claude\/agents\//,
  /\.claude\/skills\//,
  /\.claude\/workflows\//,
];

// Minimum research entries required
const MIN_RESEARCH_ENTRIES = 3;

// ============================================================================
// Enforcement Mode
// ============================================================================

/**
 * Get the main enforcement mode for the unified guard
 * @returns {'block' | 'warn' | 'off'}
 */
function getEnforcementMode() {
  return getEnfMode('UNIFIED_EVOLUTION_GUARD', 'block');
}

/**
 * Get enforcement mode for a specific check
 * Allows individual overrides even when unified guard is enabled
 * @param {string} checkName - Check name for env var lookup
 * @param {string} mainMode - Main unified guard mode
 * @returns {'block' | 'warn' | 'off'}
 */
function getCheckEnforcementMode(checkName, mainMode) {
  const envVars = {
    stateTransition: 'EVOLUTION_STATE_GUARD',
    conflict: 'CONFLICT_DETECTOR',
    qualityGate: 'QUALITY_GATE_ENFORCEMENT',
    research: 'RESEARCH_ENFORCEMENT',
  };

  const envVar = envVars[checkName];
  if (!envVar) return mainMode;

  const checkMode = process.env[envVar];
  if (checkMode === 'off') return 'off';
  if (checkMode === 'warn' && mainMode !== 'off') return 'warn';

  return mainMode;
}

// ============================================================================
// Evolution State (single cached read)
// ============================================================================

/**
 * Get evolution state with caching (PERF-004)
 * @returns {Object|null}
 */
function getEvolutionState() {
  try {
    const cached = getCachedState(EVOLUTION_STATE_PATH, null);
    if (cached !== null) return cached;
    return safeReadJSON(EVOLUTION_STATE_PATH, 'evolution-state');
  } catch (_e) {
    return null;
  }
}

// ============================================================================
// Check 1: Evolution State Transitions (from evolution-state-guard.cjs)
// ============================================================================

/**
 * Check if editing evolution-state.json with valid state transition
 * @param {Object|null} currentState - Current evolution state
 * @param {Object} hookInput - Parsed hook input
 * @returns {{ block: boolean, warn: boolean, message: string }}
 */
function checkEvolutionStateTransition(currentState, hookInput) {
  const toolInput = getToolInput(hookInput);
  const filePath = extractFilePath(toolInput) || '';
  const normalizedPath = filePath.replace(/\\/g, '/');

  // Only check writes to evolution-state.json
  if (!normalizedPath.includes('evolution-state.json')) {
    return { block: false, warn: false, message: '' };
  }

  // Extract target state from content
  const content = toolInput.content || toolInput.new_string || '';
  const stateMatch = content.match(/"state"\s*:\s*"([^"]+)"/);
  if (!stateMatch) {
    return { block: false, warn: false, message: '' };
  }

  const targetState = stateMatch[1];
  const fromState = currentState?.state || 'idle';
  const validTargets = STATE_TRANSITIONS[fromState] || [];

  if (validTargets.includes(targetState)) {
    return { block: false, warn: false, message: '' };
  }

  return {
    block: true,
    warn: false,
    message: `[EVOLUTION STATE VIOLATION] Invalid state transition: ${fromState} -> ${targetState}
Valid transitions from ${fromState}: ${validTargets.join(', ') || 'none'}
Follow the EVOLVE workflow: E -> V -> O -> L -> V -> E`,
  };
}

// ============================================================================
// Check 2: Naming Conflicts (from conflict-detector.cjs)
// ============================================================================

/**
 * Extract artifact name from file path
 * @param {string} filePath - File path
 * @returns {string|null}
 */
function extractArtifactName(filePath) {
  if (!filePath) return null;
  const normalized = filePath.replace(/\\/g, '/');

  const agentMatch = normalized.match(/\.claude\/agents\/[^/]+\/([^/]+)\.md$/);
  if (agentMatch) return agentMatch[1];

  const skillMatch = normalized.match(/\.claude\/skills\/([^/]+)\/SKILL\.md$/);
  if (skillMatch) return skillMatch[1];

  const workflowMatch = normalized.match(/\.claude\/workflows\/[^/]+\/([^/]+)\.md$/);
  if (workflowMatch) return workflowMatch[1];

  return null;
}

/**
 * Extract artifact category from file path
 * @param {string} filePath - File path
 * @returns {string|null}
 */
function extractArtifactCategory(filePath) {
  if (!filePath) return null;
  const normalized = filePath.replace(/\\/g, '/');

  if (normalized.includes('.claude/agents/')) return 'agents';
  if (normalized.includes('.claude/skills/')) return 'skills';
  if (normalized.includes('.claude/workflows/')) return 'workflows';

  return null;
}

/**
 * Recursively collect artifact names from directory
 * @param {string} dir - Directory path
 * @param {string[]} names - Array to populate
 */
function collectArtifactNames(dir, names) {
  try {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (dir.includes('skills') && fs.existsSync(path.join(fullPath, 'SKILL.md'))) {
          names.push(entry.name);
        }
        collectArtifactNames(fullPath, names);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const name = entry.name.replace(/\.md$/, '');
        if (name !== 'SKILL' && name !== 'README') {
          names.push(name);
        }
      }
    }
  } catch (_e) {
    // Ignore errors
  }
}

/**
 * Check for naming conflicts and convention violations
 * @param {Object} hookInput - Parsed hook input
 * @returns {{ block: boolean, warn: boolean, message: string }}
 */
function checkConflicts(hookInput) {
  const toolInput = getToolInput(hookInput);
  const filePath = extractFilePath(toolInput) || '';

  const name = extractArtifactName(filePath);
  const category = extractArtifactCategory(filePath);

  if (!name || !category) {
    return { block: false, warn: false, message: '' };
  }

  // Check naming convention
  if (!NAME_PATTERN.test(name)) {
    return {
      block: true,
      warn: false,
      message: `[NAMING CONVENTION VIOLATION] Invalid artifact name: "${name}"
Names must be kebab-case, lowercase, start with a letter: ^[a-z][a-z0-9-]*$
Examples: python-pro, mobile-ux-reviewer, c4-context`,
    };
  }

  // Check for existing names
  const categoryDir = path.join(PROJECT_ROOT, '.claude', category);
  const existingNames = [];
  collectArtifactNames(categoryDir, existingNames);

  if (existingNames.includes(name)) {
    return {
      block: true,
      warn: false,
      message: `[NAMING CONFLICT] Artifact "${name}" already exists in ${category}.
Choose a unique name or enhance the existing artifact.
Run: Grep("${name}", ".claude/${category}/") to see existing artifact.`,
    };
  }

  return { block: false, warn: false, message: '' };
}

// ============================================================================
// Check 3: Quality Gates (from quality-gate-validator.cjs)
// ============================================================================

/**
 * Detect artifact type from file path
 * @param {string} filePath - File path
 * @returns {string|null}
 */
function detectArtifactType(filePath) {
  if (!filePath) return null;
  const normalized = filePath.replace(/\\/g, '/');

  if (/\.claude\/agents\//.test(normalized)) return 'agent';
  if (/\.claude\/skills\//.test(normalized)) return 'skill';
  if (/\.claude\/workflows\//.test(normalized)) return 'workflow';
  if (/\.claude\/hooks\//.test(normalized)) return 'hook';
  if (/\.claude\/schemas\//.test(normalized)) return 'schema';

  return null;
}

/**
 * Check if in VERIFY phase
 * @param {Object|null} state - Evolution state
 * @returns {boolean}
 */
function isInVerifyPhase(state) {
  if (!state || !state.currentEvolution) return false;
  return state.state === 'verifying' || state.currentEvolution.phase === 'verify';
}

/**
 * Find placeholder patterns in content
 * @param {string} content - Content to check
 * @returns {Array}
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
 * Find missing required sections
 * @param {string} content - Content to check
 * @param {string} artifactType - Artifact type
 * @returns {string[]}
 */
function findMissingSections(content, artifactType) {
  const missing = [];

  if (artifactType === 'agent') {
    REQUIRED_AGENT_SECTIONS.forEach(({ pattern, name }) => {
      if (!pattern.test(content)) missing.push(name);
    });
  } else if (artifactType === 'skill') {
    REQUIRED_SKILL_SECTIONS.forEach(({ pattern, name }) => {
      if (!pattern.test(content)) missing.push(name);
    });
  }

  return missing;
}

/**
 * Check quality gates (only in VERIFY phase)
 * @param {Object|null} currentState - Evolution state
 * @param {Object} hookInput - Parsed hook input
 * @returns {{ block: boolean, warn: boolean, message: string }}
 */
function checkQualityGates(currentState, hookInput) {
  const toolInput = getToolInput(hookInput);
  const filePath = extractFilePath(toolInput) || '';
  const content = toolInput.content || toolInput.new_string || '';

  const artifactType = detectArtifactType(filePath);
  if (!artifactType) {
    return { block: false, warn: false, message: '' };
  }

  // Only enforce during VERIFY phase
  if (!isInVerifyPhase(currentState)) {
    return { block: false, warn: false, message: '' };
  }

  const issues = [];

  // Check for placeholders
  const placeholders = findPlaceholders(content);
  if (placeholders.length > 0) {
    issues.push({
      type: 'placeholder',
      message: `Found ${placeholders.length} placeholder(s)`,
      details: placeholders.slice(0, 5),
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

  // Check minimum content length
  if (content.length < 500) {
    issues.push({
      type: 'too_short',
      message: `Content too short (${content.length} chars, minimum 500)`,
    });
  }

  if (issues.length === 0) {
    return { block: false, warn: false, message: '' };
  }

  const issueDetails = issues.map(i => `  - ${i.message}`).join('\n');
  return {
    block: true,
    warn: false,
    message: `[EVOLUTION WORKFLOW VIOLATION] Artifact failed quality gate (VERIFY phase).
Quality issues found:
${issueDetails}

Fix these issues before proceeding to ENABLE phase.
Refer to: .claude/workflows/core/evolution-workflow.md Phase 5 (VERIFY)`,
  };
}

// ============================================================================
// Check 4: Research Enforcement (from research-enforcement.cjs)
// ============================================================================

/**
 * Check if path is an artifact path
 * @param {string} filePath - File path
 * @returns {boolean}
 */
function isArtifactPath(filePath) {
  if (!filePath) return false;
  const normalized = filePath.replace(/\\/g, '/');
  return ARTIFACT_PATH_PATTERNS.some(pattern => pattern.test(normalized));
}

/**
 * Check research requirement before artifact creation
 * @param {Object|null} currentState - Evolution state
 * @param {Object} hookInput - Parsed hook input
 * @returns {{ block: boolean, warn: boolean, message: string }}
 */
function checkResearchEnforcement(currentState, hookInput) {
  const toolInput = getToolInput(hookInput);
  const filePath = extractFilePath(toolInput) || '';

  if (!isArtifactPath(filePath)) {
    return { block: false, warn: false, message: '' };
  }

  const research = currentState?.currentEvolution?.research || [];
  const count = research.length;

  if (count >= MIN_RESEARCH_ENTRIES) {
    return { block: false, warn: false, message: '' };
  }

  return {
    block: true,
    warn: false,
    message: `[EVOLUTION WORKFLOW VIOLATION] Cannot create artifact without completing research.
Phase O (OBTAIN) requires minimum ${MIN_RESEARCH_ENTRIES} research entries. Current: ${count}.
Complete research phase first by invoking: Skill({ skill: "research-synthesis" })`,
  };
}

// ============================================================================
// Main Execution
// ============================================================================

/**
 * Run all evolution checks
 * @param {Object|null} evolutionState - Evolution state
 * @param {Object} hookInput - Parsed hook input
 * @returns {Array<{ check: string, block: boolean, warn: boolean, message: string }>}
 */
function runAllChecks(evolutionState, hookInput) {
  const results = [];
  const mainMode = getEnforcementMode();

  // Check 1: State transitions
  const stateMode = getCheckEnforcementMode('stateTransition', mainMode);
  if (stateMode !== 'off') {
    const result = checkEvolutionStateTransition(evolutionState, hookInput);
    if (result.block || result.warn) {
      results.push({ check: 'stateTransition', ...result });
    }
  }

  // Check 2: Naming conflicts
  const conflictMode = getCheckEnforcementMode('conflict', mainMode);
  if (conflictMode !== 'off') {
    const result = checkConflicts(hookInput);
    if (result.block || result.warn) {
      results.push({ check: 'conflict', ...result });
    }
  }

  // Check 3: Quality gates
  const qualityMode = getCheckEnforcementMode('qualityGate', mainMode);
  if (qualityMode !== 'off') {
    const result = checkQualityGates(evolutionState, hookInput);
    if (result.block || result.warn) {
      results.push({ check: 'qualityGate', ...result });
    }
  }

  // Check 4: Research enforcement
  const researchMode = getCheckEnforcementMode('research', mainMode);
  if (researchMode !== 'off') {
    const result = checkResearchEnforcement(evolutionState, hookInput);
    if (result.block || result.warn) {
      results.push({ check: 'research', ...result });
    }
  }

  return results;
}

/**
 * Main entry point for unified evolution guard hook.
 *
 * Enforces evolution constraints during artifact creation by consolidating
 * 4 separate checks into a single PreToolUse hook.
 *
 * Consolidated checks:
 * 1. evolution-state-guard - State machine transitions (IDLE -> EVALUATING -> ... -> IDLE)
 * 2. conflict-detector - Naming conflicts (prevents duplicate artifact names)
 * 3. quality-gate-validator - Quality gates in VERIFY phase (placeholders, missing sections)
 * 4. research-enforcement - Research requirement before creation (minimum 3 sources)
 *
 * Performance: 4 spawns -> 1 spawn (80% reduction in hook overhead)
 *
 * State File: .claude/context/evolution-state.json
 *
 * @async
 * @returns {Promise<void>} Exits with:
 *   - 0 if all evolution checks pass
 *   - 2 if any check blocks (fail-closed on error)
 *
 * @throws {Error} Caught internally; triggers fail-closed behavior.
 *   When evolution state is unknown, exits with code 2.
 *
 * Environment Variables:
 *   - UNIFIED_EVOLUTION_GUARD: block (default) | warn | off
 *   - EVOLUTION_STATE_GUARD: off (overrides state check)
 *   - CONFLICT_DETECTOR: off (overrides conflict check)
 *   - QUALITY_GATE_ENFORCEMENT: off (overrides quality check)
 *   - RESEARCH_ENFORCEMENT: off (overrides research check)
 *   - HOOK_FAIL_OPEN: true (debug override, fail open on error)
 *
 * Exit Behavior:
 *   - Allowed: process.exit(0)
 *   - Blocked: process.exit(2) + JSON message to stdout
 *   - Warning: process.exit(0) + JSON message to stdout (warn mode)
 *   - Error: process.exit(2) + JSON audit log to stderr
 */
async function main() {
  try {
    // Check main enforcement mode
    const enforcement = getEnforcementMode();
    if (enforcement === 'off') {
      process.exit(0);
    }

    // Parse hook input
    const hookInput = await parseHookInputAsync();
    if (!hookInput) {
      process.exit(0);
    }

    // Load evolution state once (PERF-002: single read instead of 4)
    const evolutionState = getEvolutionState();

    // Run all checks
    const results = runAllChecks(evolutionState, hookInput);

    // Find first blocking result
    const blockingResult = results.find(r => r.block);

    if (blockingResult) {
      if (enforcement === 'block') {
        try {
          await eventBus.emit(EventTypes.TOOL_BLOCKED, {
            type: EventTypes.TOOL_BLOCKED,
            timestamp: new Date().toISOString(),
            toolName: 'Write',
            reason: 'unified_evolution_blocked',
          });
        } catch (_err) {
          // Best-effort
        }
        console.log(JSON.stringify({ result: 'block', message: blockingResult.message }));
        process.exit(2);
      } else {
        console.log(JSON.stringify({ result: 'warn', message: blockingResult.message }));
        process.exit(0);
      }
    }

    // All checks passed
    process.exit(0);
  } catch (err) {
    // SEC-008: Fail closed on errors
    if (process.env.HOOK_FAIL_OPEN === 'true') {
      console.error(
        JSON.stringify({
          hook: 'unified-evolution-guard',
          event: 'fail_open_override',
          error: err.message,
        })
      );
      process.exit(0);
    }

    console.error(
      JSON.stringify({
        hook: 'unified-evolution-guard',
        event: 'error_fail_closed',
        error: err.message,
        timestamp: new Date().toISOString(),
      })
    );

    try {
      await eventBus.emit(EventTypes.TOOL_FAILED, {
        type: EventTypes.TOOL_FAILED,
        timestamp: new Date().toISOString(),
        toolName: 'unified-evolution-guard',
        error: err.message,
      });
    } catch (_err) {
      // Best-effort
    }
    process.exit(2);
  }
}

// Run if main module
if (require.main === module) {
  main();
}

// Export for testing
module.exports = {
  main,
  getEnforcementMode,
  getCheckEnforcementMode,
  getEvolutionState,
  runAllChecks,
  checkEvolutionStateTransition,
  checkConflicts,
  checkQualityGates,
  checkResearchEnforcement,
  extractArtifactName,
  extractArtifactCategory,
  detectArtifactType,
  isInVerifyPhase,
  findPlaceholders,
  findMissingSections,
  isArtifactPath,
  STATE_TRANSITIONS,
  NAME_PATTERN,
  PLACEHOLDER_PATTERNS,
  MIN_RESEARCH_ENTRIES,
  PROJECT_ROOT,
  EVOLUTION_STATE_PATH,
};
