#!/usr/bin/env node
/* eslint max-lines: ["warn", 900] */
/**
 * Unified Creator Guard Hook
 * ==========================
 *
 * Prevents direct writes to creator artifact paths without invoking
 * the corresponding creator workflow. This is a unified replacement
 * for individual guards (skill-creation-guard, agent-creation-guard, etc.)
 *
 * Root Cause (from reflection): Router bypass patterns discovered
 * during skill creation sessions where artifacts were created without
 * proper workflow, resulting in "invisible" artifacts missing from
 * CLAUDE.md, catalogs, and agent assignments.
 *
 * Trigger: PreToolUse (matches: Edit|Write|NotebookEdit)
 *
 * ENFORCEMENT MODES:
 * - CREATOR_GUARD=block (default): Block unauthorized writes
 * - CREATOR_GUARD=warn: Warn but allow
 * - CREATOR_GUARD=off: Disable enforcement
 *
 * Exit codes:
 * - 0: Allow operation
 * - 2: Block operation (SEC-008: fail-closed on error)
 *
 * @module unified-creator-guard
 */

'use strict';

const path = require('path');
const fs = require('fs');
const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
  extractFilePath,
  formatResult,
  auditLog,
  auditSecurityOverride,
} = require('../../lib/utils/hook-input.cjs');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
// MED-001 FIX: Use shared PROJECT_ROOT utility instead of duplicating
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');

// SEC-AUDIT-020: Bypass audit instrumentation (best-effort)
let _emitBlockVerdict;
try {
  _emitBlockVerdict = require('../safety/bypass-audit-hook.cjs').emitBlockVerdict;
} catch (_) {
  /* best-effort: bypass-audit-hook unavailable, continue without instrumentation */
}

// Event Bus integration (P1-6.4)
let eventBus;
try {
  eventBus = require('../../lib/events/event-bus.cjs');
} catch (_err) {
  // Graceful degradation: EventBus unavailable, continue without events
  eventBus = null;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Creator configuration - maps file patterns to required creators
 *
 * MAINTAINABILITY: To add a new creator:
 * 1. Add entry to this array
 * 2. Update active-creators.json schema
 * 3. Add pre-execute hook to creator skill
 */
const CREATOR_CONFIGS = [
  // STEP 1 SECURITY FIXES: Protect critical infrastructure files
  // These must come FIRST to match before general artifact patterns
  {
    creator: 'hook-creator',
    patterns: [/\.claude[/\\]settings\.json$/i],
    artifactType: 'config:settings',
    primaryFile: 'settings.json',
  },
  {
    creator: 'agent-creator',
    patterns: [/\.claude[/\\]context[/\\]agent-registry\.json$/i],
    artifactType: 'config:agent-registry',
    primaryFile: 'agent-registry.json',
  },
  // Original 6 artifact types
  {
    creator: 'skill-creator',
    // skill-updater is also allowed to write SKILL.md (updates existing skills)
    allowedCreators: ['skill-creator', 'skill-updater'],
    patterns: [/\.claude[/\\]skills[/\\][^/\\]+[/\\]SKILL\.md$/i],
    artifactType: 'skill',
    primaryFile: 'SKILL.md',
  },
  {
    creator: 'agent-creator',
    patterns: [
      /\.claude[/\\]agents[/\\](?:core|domain|specialized|orchestrators)[/\\][^/\\]+\.md$/i,
    ],
    artifactType: 'agent',
    primaryFile: '*.md',
    excludePatterns: [/README\.md$/i],
  },
  {
    creator: 'hook-creator',
    patterns: [
      /\.claude[/\\]hooks[/\\](?:routing|safety|memory|evolution|reflection|validation|session|self-healing)[/\\][^/\\]+\.cjs$/i,
    ],
    artifactType: 'hook',
    primaryFile: '*.cjs',
    excludePatterns: [/\.test\.cjs$/i],
  },
  {
    creator: 'workflow-creator',
    patterns: [/\.claude[/\\]workflows[/\\](?:core|enterprise|operations|rapid)[/\\][^/\\]+\.md$/i],
    artifactType: 'workflow',
    primaryFile: '*.md',
    excludePatterns: [/README\.md$/i],
  },
  {
    creator: 'template-creator',
    patterns: [/\.claude[/\\]templates[/\\]/i],
    artifactType: 'template',
    primaryFile: '*',
    excludePatterns: [/README\.md$/i, /_archive[/\\]/i],
  },
  {
    creator: 'schema-creator',
    patterns: [/\.claude[/\\]schemas[/\\][^/\\]+\.(?:schema\.)?json$/i],
    artifactType: 'schema',
    primaryFile: '*.schema.json',
  },
  // STEP 3: New artifact types (rules, commands, tools)
  // Initially warn-only until creators exist (Steps 10-12)
  {
    creator: 'rule-creator',
    patterns: [/\.claude[/\\]rules[/\\][^/\\]+\.md$/i],
    artifactType: 'rule',
    primaryFile: '*.md',
  },
  {
    creator: 'command-creator',
    patterns: [/\.claude[/\\]commands[/\\][^/\\]+\.md$/i],
    artifactType: 'command',
    primaryFile: '*.md',
  },
  {
    creator: 'tool-creator',
    patterns: [/\.claude[/\\]tools[/\\].*\.(?:cjs|mjs)$/i],
    artifactType: 'tool',
    primaryFile: '*.cjs|*.mjs',
    excludePatterns: [/\.test\.cjs$/i, /_archive[/\\]/i],
  },
  {
    creator: 'reflection-agent',
    patterns: [/\.claude[/\\]context[/\\]runtime[/\\]reflection-.*\.json$/i],
    artifactType: 'state:reflection',
    primaryFile: 'reflection-spawn-request.json',
  },
];

/**
 * State file to track active creators
 * Format: { "skill-creator": { active: true, invokedAt: "...", ttl: 600000 }, ... }
 */
const STATE_FILE = '.claude/context/runtime/active-creators.json';

/**
 * TTL bounds for creator state (HIGH-002 security fix)
 * Minimum: 30 seconds (prevents zero-window attacks)
 * Maximum: 10 minutes (prevents permanent bypass)
 */
const MIN_TTL_MS = 30 * 1000; // 30 seconds minimum
const MAX_TTL_MS = 10 * 60 * 1000; // 10 minutes maximum

/**
 * Default time-to-live for active creator state (3 minutes)
 * SEC-REMEDIATION-001: Reduced from 10 to 3 minutes to minimize
 * state tampering window while still allowing creator workflow completion.
 * HIGH-002 FIX: Add bounds checking for CREATOR_STATE_TTL_MS env var
 */
const DEFAULT_TTL_MS = (() => {
  const envVal = Number(process.env.CREATOR_STATE_TTL_MS);
  // Invalid values (NaN, Infinity, -Infinity, 0, negative) fall back to default
  if (!Number.isFinite(envVal) || envVal <= 0) {
    return 3 * 60 * 1000; // 180000ms
  }
  // Clamp to MIN/MAX bounds
  return Math.max(MIN_TTL_MS, Math.min(envVal, MAX_TTL_MS));
})();

/**
 * Tools that this hook monitors
 */
const WATCHED_TOOLS = ['Edit', 'Write', 'NotebookEdit'];

/**
 * MCP tool name prefixes that map to watched native tools.
 * SEC-FIX MCP-BYPASS-001: MCP filesystem tools bypass the creator guard
 * because their names don't match the WATCHED_TOOLS list. This mapping
 * ensures MCP equivalents are treated identically to native tools.
 *
 * @type {Array<{prefix: string, nativeTool: string}>}
 */
const MCP_WATCHED_MAPPINGS = [
  { prefix: 'mcp__filesystem__write', nativeTool: 'Write' },
  { prefix: 'mcp__filesystem__edit', nativeTool: 'Edit' },
  { prefix: 'mcp__filesystem__create', nativeTool: 'Write' },
  { prefix: 'mcp__filesystem__delete', nativeTool: 'Write' },
  { prefix: 'mcp__filesystem__move', nativeTool: 'Write' },
  { prefix: 'mcp__filesystem__copy', nativeTool: 'Write' },
];

/**
 * Map an MCP tool name to its equivalent native watched tool.
 * Returns the native tool name if a mapping is found, or null otherwise.
 *
 * @param {string} toolName - The tool name to check
 * @returns {string|null} The equivalent native tool name, or null if not an MCP tool
 */
function mapMcpToWatchedTool(toolName) {
  if (!toolName || typeof toolName !== 'string') return null;
  if (!toolName.startsWith('mcp__')) return null;
  const lower = toolName.toLowerCase();
  for (const mapping of MCP_WATCHED_MAPPINGS) {
    if (lower.startsWith(mapping.prefix)) {
      return mapping.nativeTool;
    }
  }
  return null;
}

// =============================================================================
// CORE FUNCTIONS
// =============================================================================

/**
 * Find which creator is required for a given file path
 * @param {string} filePath - File path to check
 * @returns {{ creator: string, artifactType: string } | null}
 */
function findRequiredCreator(filePath) {
  if (!filePath) return null;

  // Normalize path separators for consistent matching
  const normalizedPath = filePath.replace(/\\/g, '/');

  for (const config of CREATOR_CONFIGS) {
    // Check exclude patterns first
    if (config.excludePatterns) {
      const excluded = config.excludePatterns.some(pattern => pattern.test(normalizedPath));
      if (excluded) continue;
    }

    // Check include patterns
    const matched = config.patterns.some(pattern => pattern.test(normalizedPath));

    if (matched) {
      return {
        creator: config.creator,
        artifactType: config.artifactType,
      };
    }
  }

  return null;
}

/**
 * Check if a specific creator is currently active
 * @param {string} creatorName - Name of creator to check
 * @returns {{ active: boolean, invokedAt?: string, elapsedMs?: number, artifactName?: string }}
 */
function isCreatorActive(creatorName) {
  try {
    const statePath = path.join(PROJECT_ROOT, STATE_FILE);
    if (!fs.existsSync(statePath)) {
      return { active: false };
    }

    const state = safeParseJSON(fs.readFileSync(statePath, 'utf8'), 'creator-state');
    if (!state || typeof state !== 'object') {
      return { active: false };
    }
    const creatorState = state[creatorName];

    if (!creatorState || !creatorState.active || !creatorState.invokedAt) {
      return { active: false };
    }

    const invokedAt = new Date(creatorState.invokedAt).getTime();
    const ttl = creatorState.ttl || DEFAULT_TTL_MS;
    const elapsedMs = Date.now() - invokedAt;

    if (elapsedMs <= ttl) {
      return {
        active: true,
        invokedAt: creatorState.invokedAt,
        elapsedMs,
        artifactName: creatorState.artifactName,
      };
    }

    return { active: false, elapsedMs };
  } catch (_err) {
    return { active: false };
  }
}

/**
 * Mark a creator as active
 * @param {string} creatorName - Name of creator
 * @param {string} [artifactName] - Optional artifact being created
 * @returns {boolean} Success status
 */
function markCreatorActive(creatorName, artifactName = null) {
  try {
    const statePath = path.join(PROJECT_ROOT, STATE_FILE);
    const stateDir = path.dirname(statePath);

    // Ensure directory exists
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }

    // Load existing state or create new
    let state = {};
    if (fs.existsSync(statePath)) {
      const parsed = safeParseJSON(fs.readFileSync(statePath, 'utf8'), 'creator-state');
      if (parsed && typeof parsed === 'object') {
        state = parsed;
      }
    }

    // Update specific creator
    state[creatorName] = {
      active: true,
      invokedAt: new Date().toISOString(),
      artifactName: artifactName,
      ttl: DEFAULT_TTL_MS,
    };

    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    return true;
  } catch (err) {
    if (process.env.DEBUG_HOOKS) {
      console.error('Failed to mark creator active:', err.message);
    }
    return false;
  }
}

/**
 * Clear a creator's active state
 * @param {string} creatorName - Name of creator
 * @returns {boolean} Success status
 */
function clearCreatorActive(creatorName) {
  try {
    const statePath = path.join(PROJECT_ROOT, STATE_FILE);
    if (!fs.existsSync(statePath)) return true;

    const state = safeParseJSON(fs.readFileSync(statePath, 'utf8'), 'creator-state');
    if (state && typeof state === 'object' && state[creatorName]) {
      state[creatorName].active = false;
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
    }

    return true;
  } catch (_err) {
    return false;
  }
}

/**
 * Generate violation message
 * @param {string} filePath - File being written
 * @param {string} requiredCreator - Creator that should be invoked
 * @param {string} artifactType - Type of artifact
 * @returns {string} Formatted violation message
 */
function generateViolationMessage(filePath, requiredCreator, artifactType) {
  // Truncate path for display
  const displayPath = filePath.length > 55 ? '...' + filePath.slice(-52) : filePath;

  return `
+======================================================================+
|  CREATOR GUARD VIOLATION                                             |
+======================================================================+
|  You are attempting to write directly to a ${artifactType.padEnd(8)} artifact:     |
|    ${displayPath.padEnd(60)}|
|                                                                      |
|  This bypasses the ${requiredCreator.padEnd(16)} workflow, which ensures:        |
|    - CLAUDE.md is updated with routing/documentation                 |
|    - Relevant catalogs are updated for discoverability               |
|    - Related agents are assigned the artifact                        |
|    - Proper validation and testing occurs                            |
|                                                                      |
|  CORRECT APPROACH: Invoke the creator skill first                    |
|                                                                      |
|  Skill({ skill: "${requiredCreator}" })${' '.repeat(Math.max(0, 35 - requiredCreator.length))}|
|                                                                      |
|  Without the creator workflow, the ${artifactType.padEnd(8)} will be INVISIBLE:   |
|    - Router won't know about it                                      |
|    - Agents won't be assigned it                                     |
|    - Users can't discover it                                         |
+======================================================================+
`;
}

// =============================================================================
// SCHEMA VALIDATION (Step 7 - Write-time schema validation, warn-only)
// =============================================================================

/**
 * Schema file mapping: artifactType -> schema filename
 * null means no schema exists for that type (skip validation)
 */
const SCHEMA_MAP = {
  skill: 'skill-output.schema.json',
  agent: 'agent-definition.schema.json',
  hook: 'hook-definition.schema.json',
  workflow: 'workflow-definition.schema.json',
  schema: null, // self-referential
  'config:settings': null,
  'config:agent-registry': 'agent-config.schema.json',
  template: 'template-definition.schema.json',
  rule: 'rule-definition.schema.json',
  command: 'command-definition.schema.json',
  tool: null,
};

/**
 * Validate artifact content against its schema at write time.
 * Always runs in warn mode (never blocks).
 *
 * @param {string} artifactType - Type of artifact being written
 * @param {string} content - Raw content being written (string)
 * @returns {{ valid: boolean, errors: string[], mode: string }}
 */
function validateArtifactContent(artifactType, content) {
  const rawMode = (process.env.SCHEMA_ENFORCEMENT || '').trim().toLowerCase();
  const mode = ['block', 'warn', 'off'].includes(rawMode) ? rawMode : 'warn';
  const result = { valid: true, errors: [], mode };

  // Look up schema
  const schemaFile = SCHEMA_MAP[artifactType];
  if (schemaFile === undefined || schemaFile === null) {
    // No schema for this type - skip validation
    return result;
  }

  const trimmed = typeof content === 'string' ? content.trim() : '';
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return result;
  }

  // Try to parse content as JSON
  const parsed = safeParseJSON(content, null);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    // Content is not JSON or invalid - skip validation gracefully
    return result;
  }

  // Skill definitions are frequently authored from lightweight metadata
  // during creation workflows. Keep validation strict on core identity
  // fields while avoiding over-coupling to evolving schema-required keys.
  if (artifactType === 'skill') {
    if (typeof parsed.name !== 'string' || parsed.name.trim() === '') {
      result.errors.push('Missing required field: name');
    }
    if (parsed.description !== undefined && typeof parsed.description !== 'string') {
      result.errors.push("Field 'description' must be a string");
    }
    result.valid = result.errors.length === 0;
    return result;
  }

  // Load schema
  const schemaPath = path.join(PROJECT_ROOT, '.claude', 'schemas', schemaFile);
  if (!fs.existsSync(schemaPath)) {
    return result;
  }

  const schema = safeParseJSON(fs.readFileSync(schemaPath, 'utf8'), 'artifact-schema');
  if (!schema || typeof schema !== 'object') {
    return result;
  }

  // Lightweight validation: check required fields
  const requiredFields = schema.required || [];
  for (const field of requiredFields) {
    if (parsed[field] === undefined || parsed[field] === null) {
      result.errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate field types where schema specifies them
  const properties = schema.properties || {};
  for (const [field, fieldSchema] of Object.entries(properties)) {
    if (parsed[field] === undefined) continue;
    const value = parsed[field];

    if (fieldSchema.type === 'string' && typeof value !== 'string') {
      result.errors.push(`Field '${field}' must be a string`);
    }
    if (fieldSchema.pattern && typeof value === 'string') {
      const regex = new RegExp(fieldSchema.pattern);
      if (!regex.test(value)) {
        result.errors.push(`Field '${field}' does not match pattern: ${fieldSchema.pattern}`);
      }
    }
    if (
      fieldSchema.minLength &&
      typeof value === 'string' &&
      value.length < fieldSchema.minLength
    ) {
      result.errors.push(`Field '${field}' is too short (min ${fieldSchema.minLength} chars)`);
    }
  }

  result.valid = result.errors.length === 0;
  return result;
}

// =============================================================================
// MAIN VALIDATION
// =============================================================================

/**
 * Validate creator workflow compliance
 * @param {string} toolName - Tool being used
 * @param {Object} toolInput - Tool input
 * @returns {{ pass: boolean, result?: string, message?: string }}
 */
function validateCreatorWorkflow(toolName, toolInput) {
  // SEC-FIX MCP-BYPASS-001: Map MCP tools to their native equivalents.
  // If an MCP tool maps to a watched native tool, enforce the same restrictions.
  let effectiveToolName = toolName;
  const mcpMapping = mapMcpToWatchedTool(toolName);
  if (mcpMapping) {
    effectiveToolName = mcpMapping;
  }

  // Only check Edit/Write/NotebookEdit tools (or their MCP equivalents)
  if (!WATCHED_TOOLS.includes(effectiveToolName)) {
    return { pass: true };
  }

  // Check enforcement mode
  // NOTE: CREATOR_GUARD defaults to 'block' (not 'warn') - use env var directly
  // to avoid the centralized enforcement-defaults.cjs returning 'warn' as fallback.
  const rawGuard = (process.env.CREATOR_GUARD || '').trim().toLowerCase();
  const enforcement = ['block', 'warn', 'off'].includes(rawGuard) ? rawGuard : 'block';
  if (enforcement === 'off') {
    // SEC-AUDIT-016 FIX: Use centralized auditSecurityOverride for consistent logging
    auditSecurityOverride(
      'unified-creator-guard',
      'CREATOR_GUARD',
      'off',
      'Creator workflow requirement bypassed'
    );
    return { pass: true };
  }

  // Extract file path
  const filePath = extractFilePath(toolInput);
  if (!filePath) {
    return { pass: true };
  }

  // Check if this file requires a creator
  const required = findRequiredCreator(filePath);
  if (!required) {
    return { pass: true }; // Not a protected artifact
  }

  // Infrastructure files are always protected, even when already present.
  const requiresAlwaysOnCreator =
    required.artifactType === 'config:settings' ||
    required.artifactType === 'config:agent-registry';

  // LAYER 2A FIX: Distinguish "creating new artifact" from "editing existing artifact"
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(PROJECT_ROOT, filePath);
  const fileExists = fs.existsSync(fullPath);

  // Write/Edit to existing file = updating, not creating - allow without creator token
  // Skill-updater and similar updater workflows edit existing artifacts legitimately
  // SEC-FIX MCP-BYPASS-001: Use effectiveToolName to catch MCP equivalents too
  if (
    (effectiveToolName === 'Write' || effectiveToolName === 'Edit') &&
    fileExists &&
    !requiresAlwaysOnCreator
  ) {
    return { pass: true };
  }

  // Write to new file at creator output path - REQUIRE creator token
  // Check if the required creator (or any allowed creator) is active
  const creatorsToCheck = required.allowedCreators || [required.creator];
  let creatorState = { active: false };
  for (const creator of creatorsToCheck) {
    creatorState = isCreatorActive(creator);
    if (creatorState.active) break;
  }

  if (creatorState.active) {
    // LAYER 2B: Refresh TTL on each successful write to support batch operations
    markCreatorActive(required.creator, creatorState.artifactName);
    return { pass: true }; // Creator workflow is active - allow
  }

  // VIOLATION: Direct write to NEW file without creator workflow
  const message = generateViolationMessage(filePath, required.creator, required.artifactType);

  if (enforcement === 'block') {
    return { pass: false, result: 'block', message };
  } else {
    return { pass: true, result: 'warn', message };
  }
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

/**
 * Main entry point for unified creator guard hook.
 *
 * Enforces creator workflow compliance by blocking direct writes to
 * artifact paths (skills, agents, hooks, workflows, templates, schemas)
 * without invoking the corresponding creator skill first.
 *
 * Prevents "invisible artifacts" that lack CLAUDE.md updates,
 * catalog registration, and agent assignment.
 *
 * @async
 * @returns {Promise<void>} Exits with:
 *   - 0 if operation is allowed or warning issued
 *   - 2 if operation is blocked (fail-closed on error)
 *
 * @throws {Error} Caught internally; triggers fail-closed behavior.
 *   When creator state is unknown, exits with code 2 to prevent bypass.
 *
 * Checked by: isCreatorActive(), checkRecentCreatorInvocation()
 * Exit Behavior:
 *   - Allowed: process.exit(0)
 *   - Blocked: process.exit(2) + message to stdout
 *   - Warning: process.exit(0) + message to stderr (warn mode)
 *   - Error: process.exit(2) + JSON audit log to stderr
 */
async function main() {
  try {
    if (process.env.CREATOR_GUARD_TEST_FORCE_THROW === '1') {
      throw new Error('Forced unified-creator-guard test failure');
    }

    // Parse the hook input
    const hookInput = await parseHookInputAsync();

    if (!hookInput) {
      // No input - allow (fail open for missing input)
      process.exit(0);
    }

    // Get tool name and input
    const toolName = getToolName(hookInput);
    const toolInput = getToolInput(hookInput);

    // Skip if not a watched tool (or its MCP equivalent)
    // SEC-FIX MCP-BYPASS-001: Check MCP mappings before skipping
    const effectiveTool = mapMcpToWatchedTool(toolName) || toolName;
    if (!toolName || !WATCHED_TOOLS.includes(effectiveTool)) {
      process.exit(0);
    }

    // Emit TOOL_INVOKED event (P1-6.4 - async, non-blocking)
    if (eventBus) {
      try {
        const filePath = extractFilePath(toolInput);
        const required = findRequiredCreator(filePath);

        eventBus.emit('TOOL_INVOKED', {
          type: 'TOOL_INVOKED',
          toolName,
          input: toolInput,
          agentId: process.env.CLAUDE_AGENT_ID || 'router',
          taskId: process.env.CLAUDE_TASK_ID || 'unknown',
          timestamp: new Date().toISOString(),
          metadata: {
            hook: 'unified-creator-guard',
            artifactType: required?.artifactType || 'unknown',
            requiredCreator: required?.creator || null,
          },
        });
      } catch (err) {
        // Graceful degradation: event emission failed, continue
        console.error('[unified-creator-guard] Event emission failed:', err.message);
      }
    }

    // Validate creator workflow
    const result = validateCreatorWorkflow(toolName, toolInput);

    if (!result.pass) {
      // Log the violation
      const filePath = extractFilePath(toolInput);
      const required = findRequiredCreator(filePath);
      auditLog('unified-creator-guard', `security_${result.result}`, {
        tool: toolName,
        file: filePath,
        requiredCreator: required?.creator,
        artifactType: required?.artifactType,
        reason: 'Direct artifact write without creator workflow',
      });

      // SEC-AUDIT-020: Emit block verdict before exit(2) for bypass audit trail
      if (result.result === 'block' && _emitBlockVerdict) {
        try {
          _emitBlockVerdict({
            hook: 'unified-creator-guard.cjs',
            tool: toolName,
            filePath: filePath || '',
            reason: 'Direct artifact write without creator workflow',
            artifactType: required?.artifactType,
            requiredCreator: required?.creator,
            enforcementMode: 'block',
          });
        } catch (_) {
          /* best-effort, never block on audit */
        }
      }

      // Output block/warn result
      console.log(formatResult(result.result, result.message));
      process.exit(result.result === 'block' ? 2 : 0);
    }

    if (result.result === 'warn') {
      console.warn(result.message);
    }

    // All checks passed
    process.exit(0);
  } catch (err) {
    // SEC-008: Allow emergency fail-open only with explicit dual-control acknowledgement.
    if (isFailOpenOverrideAuthorized()) {
      auditLog('unified-creator-guard', 'fail_open_override', { error: err.message });
      process.exit(0);
    }

    if (String(process.env.HOOK_FAIL_OPEN || '').toLowerCase() === 'true') {
      auditLog('unified-creator-guard', 'fail_open_override_denied', {
        error: err.message,
        reason: 'HOOK_FAIL_OPEN set without required acknowledgment/scope',
      });
    }

    // Audit log the error
    auditLog('unified-creator-guard', 'error_fail_closed', { error: err.message });

    // SEC-AUDIT-020: Emit block verdict before fail-closed exit(2)
    if (_emitBlockVerdict) {
      try {
        _emitBlockVerdict({
          hook: 'unified-creator-guard.cjs',
          tool: 'unknown',
          filePath: '',
          reason: `Fail-closed on error: ${err.message}`,
          enforcementMode: 'block',
        });
      } catch (_) {
        /* best-effort, never block on audit */
      }
    }

    // SEC-008: Fail closed - deny when security state unknown
    process.exit(2);
  }
}

function isFailOpenOverrideAuthorized() {
  if (String(process.env.HOOK_FAIL_OPEN || '').toLowerCase() !== 'true') {
    return false;
  }
  const ack = String(process.env.HOOK_FAIL_OPEN_ACK || '').trim();
  const scope = String(process.env.HOOK_FAIL_OPEN_SCOPE || '')
    .toLowerCase()
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (ack !== 'ALLOW_HOOK_FAIL_OPEN') {
    return false;
  }
  return (
    scope.includes('all') ||
    scope.includes('creator-guard') ||
    scope.includes('unified-creator-guard')
  );
}

// Run if this is the main module
if (require.main === module) {
  main();
}

/**
 * Module exports for unified-creator-guard hook.
 *
 * @typedef {Object} CreatorGuardExports
 * @property {Function} main - Main entry point for creator guard hook
 * @property {Function} validateCreatorWorkflow - Validate creator workflow state
 * @property {Function} findRequiredCreator - Find creator needed for artifact type
 * @property {Function} generateViolationMessage - Generate formatted violation message
 * @property {Function} isCreatorActive - Check if creator is currently active
 * @property {Function} markCreatorActive - Mark creator as active in state
 * @property {Function} clearCreatorActive - Clear creator active state
 * @property {Object} CREATOR_CONFIGS - Configuration for each creator type
 * @property {string} STATE_FILE - Path to creator state file
 * @property {number} DEFAULT_TTL_MS - Default time-to-live for creator state
 * @property {Array<string>} WATCHED_TOOLS - Tools that trigger creator check
 * @property {string} PROJECT_ROOT - Project root directory path
 */

// Export for testing and programmatic use
module.exports = {
  main,
  // Validation functions
  validateCreatorWorkflow,
  findRequiredCreator,
  generateViolationMessage,
  // MCP bypass prevention (SEC-FIX MCP-BYPASS-001)
  mapMcpToWatchedTool,
  MCP_WATCHED_MAPPINGS,
  // State management
  isCreatorActive,
  markCreatorActive,
  clearCreatorActive,
  // Schema validation (Step 7)
  validateArtifactContent,
  SCHEMA_MAP,
  // Constants
  CREATOR_CONFIGS,
  STATE_FILE,
  DEFAULT_TTL_MS,
  WATCHED_TOOLS,
  PROJECT_ROOT,
  isFailOpenOverrideAuthorized,
};
