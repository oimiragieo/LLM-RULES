#!/usr/bin/env node
/**
 * file-placement-guard.cjs
 *
 * PreToolUse hook that enforces file placement rules.
 * Blocks writes to invalid locations unless override is set.
 *
 * Triggers: PreToolUse on Edit, Write, NotebookEdit
 * Environment: FILE_PLACEMENT_GUARD=block|warn|off (default: block)
 *
 * See: .claude/docs/FILE_PLACEMENT_RULES.md for complete rules
 */

'use strict';

const path = require('path');
const fs = require('fs');

// PERF-006/PERF-007: Use shared utilities instead of duplicated code
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const {
  parseHookInputAsync,
  getToolInput: sharedGetToolInput,
  extractFilePath: sharedExtractFilePath,
  getToolName: sharedGetToolName,
  auditSecurityOverride,
} = require('../../lib/utils/hook-input.cjs');
const eventBus = require('../../lib/events/event-bus.cjs');
const { EventTypes } = require('../../lib/events/event-types.cjs');

// SEC-SF-001 FIX: Import safe JSON parser
const { _safeParseJSON, _SCHEMAS } = require('../../lib/utils/safe-json.cjs');

// PERF-004 FIX: Import state cache for TTL-based caching of evolution-state.json
const { getCachedState } = require('../../lib/utils/state-cache.cjs');

// Tools that this guard watches
const WRITE_TOOLS = ['Edit', 'Write', 'NotebookEdit'];
const MEMORY_JSON_FILES = new Set(['patterns.json', 'gotchas.json']);
const MEMORY_JSON_WRITE_ENFORCEMENT = String(
  process.env.MEMORY_JSON_WRITE_ENFORCEMENT || 'block'
).toLowerCase();

// Valid path patterns for each directory category
const VALID_PATHS = {
  // Agent definitions
  agents: /^\.claude[/\\]agents[/\\](core|domain|specialized|orchestrators)[/\\][a-z0-9-]+\.md$/i,

  // Skill definitions (must be SKILL.md in skill folder, or metadata/tests/examples)
  skills:
    /^\.claude[/\\]skills[/\\][a-z0-9-]+[/\\](SKILL\.md|metadata\.json|examples[/\\]|tests[/\\])/i,

  // Hooks (categorized by function) - NO TEST FILES (tests go in tests/hooks/)
  hooks:
    /^\.claude[/\\]hooks[/\\](routing|safety|memory|evolution|session|validation|reflection|self-healing|audit|cost-tracking|monitoring)[/\\][a-z0-9-]+\.cjs$/i,

  // Workflows (categorized)
  workflows:
    /^\.claude[/\\]workflows[/\\](core|enterprise|operations|rapid)[/\\][a-z0-9-]+\.(md|yaml)$/i,

  // Context artifacts - plans
  context_plans: /^\.claude[/\\]context[/\\]artifacts[/\\]plans[/\\]/i,

  // Context artifacts - reports
  context_reports: /^\.claude[/\\]context[/\\]artifacts[/\\]reports[/\\]/i,

  // Context artifacts - research reports
  context_research: /^\.claude[/\\]context[/\\]artifacts[/\\]research-reports[/\\]/i,

  // Context artifacts - diagrams
  context_diagrams: /^\.claude[/\\]context[/\\]artifacts[/\\]diagrams[/\\]/i,

  // Context artifacts - audits (ADR-076)
  context_audits: /^\.claude[/\\]context[/\\]artifacts[/\\]audits[/\\]/i,

  // Context artifacts - audit-logs
  context_audit_logs: /^\.claude[/\\]context[/\\]artifacts[/\\]audit-logs[/\\]/i,

  // Context artifacts - error-reports
  context_error_reports: /^\.claude[/\\]context[/\\]artifacts[/\\]error-reports[/\\]/i,

  // Context memory
  context_memory: /^\.claude[/\\]context[/\\]memory[/\\]/i,

  // Context config
  context_config: /^\.claude[/\\]context[/\\]config[/\\]/i,

  // Context runtime (temporary state)
  context_runtime: /^\.claude[/\\]context[/\\]runtime[/\\]/i,

  // Context checkpoints
  context_checkpoints: /^\.claude[/\\]context[/\\]checkpoints[/\\]/i,

  // Context sessions
  context_sessions: /^\.claude[/\\]context[/\\]sessions[/\\]/i,

  // Context tmp (auto-cleaned)
  context_tmp: /^\.claude[/\\]context[/\\]tmp[/\\]/i,

  // Context backups
  context_backups: /^\.claude[/\\]context[/\\]backups[/\\]/i,

  // Templates
  templates: /^\.claude[/\\]templates[/\\]/i,

  // Schemas
  schemas: /^\.claude[/\\]schemas[/\\][a-z0-9-]+\.schema\.json$/i,

  // Documentation
  docs: /^\.claude[/\\]docs[/\\][a-zA-Z0-9_-]+\.md$/i,

  // Root-level CLAUDE.md
  claude_md: /^\.claude[/\\]CLAUDE\.md$/i,

  // Config files at root
  config_yaml: /^\.claude[/\\]config\.yaml$/i,
  settings_json: /^\.claude[/\\]settings(\.local)?\.json$/i,
  mcp_json: /^\.claude[/\\]\.mcp\.json$/i,

  // Gitkeep files anywhere in .claude
  gitkeep: /^\.claude[/\\].*[/\\]?\.gitkeep$/i,
};

// Forbidden paths - always blocked (framework internals)
const FORBIDDEN_PATHS = [
  /^\.claude[/\\]lib[/\\]/i, // Internal libraries - framework only
  /^\.claude[/\\]tools[/\\]/i, // CLI tools - should not be auto-generated
];

// ADR-076: Test file patterns that are ALWAYS blocked in .claude/
// All tests must go in the root tests/ directory
const TEST_FILE_PATTERNS = [/\.test\.cjs$/i, /\.test\.mjs$/i, /\.spec\.cjs$/i, /\.spec\.mjs$/i];

// Files that are always allowed (framework internal operations)
const ALWAYS_ALLOWED_PATTERNS = [
  /\.claude[/\\]context[/\\]runtime[/\\]/, // Runtime state files
  /\.claude[/\\]context[/\\]tmp[/\\]/, // Temporary files
  /\.gitkeep$/, // Git keep files
];

// SEC-IV-002 FIX: Sensitive path patterns that should never trigger auto-evolution
const SENSITIVE_PATH_PATTERNS = [
  /\.env/i,
  /credentials?/i,
  /secrets?/i,
  /password/i,
  /\.pem$/i,
  /\.key$/i,
  /\.claude[/\\]hooks[/\\]safety[/\\]/i, // Block auto-evolving safety hooks
  /\.claude[/\\]hooks[/\\]routing[/\\]/i, // Block auto-evolving routing hooks
];

// SEC-IV-001 FIX: Dangerous characters that must be stripped from paths in prompts
const DANGEROUS_PATH_CHARS = [
  '$',
  '`',
  '|',
  '&',
  ';',
  '(',
  ')',
  '<',
  '>',
  '!',
  '*',
  '?',
  '[',
  ']',
  '{',
  '}',
  '\n',
  '\r',
  '"',
  "'",
];

// SEC-PT-001: Path traversal patterns to detect
const PATH_TRAVERSAL_PATTERNS = [
  /\.\./, // Basic traversal
  /%2e%2e/i, // URL-encoded traversal (single)
  /%252e%252e/i, // Double URL-encoded traversal
  /\x00/, // Null bytes
];

// SEC-WIN-001: Windows reserved device names
// These names cannot be used as file names on Windows and cause special behavior
// Creating files with these names on Windows is a security risk (denial of service,
// device access, or in the case of NUL creates regular files that shouldn't exist)
const WINDOWS_RESERVED_NAMES = [
  'CON', // Console device
  'PRN', // Printer device
  'AUX', // Auxiliary device
  'NUL', // Null device (like /dev/null)
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9', // Serial ports
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9', // Parallel ports
];

// Artifact directories requiring EVOLVE workflow for new files
const ARTIFACT_DIRECTORIES = [
  '.claude/agents/',
  '.claude/skills/',
  '.claude/hooks/',
  '.claude/workflows/',
  '.claude/templates/',
  '.claude/schemas/',
];

// Evolution states that allow artifact creation
const CREATION_ALLOWED_STATES = ['lock', 'verify', 'enable'];

/**
 * Find the project root by looking for .claude directory
 * @param {string} [startPath] - Starting path for search (unused, kept for API compatibility)
 * @returns {string|null} Project root path or null
 * @deprecated HOOK-002 FIX: Use PROJECT_ROOT from shared utility instead.
 *             This function is kept for backward compatibility with module.exports.
 */
function findProjectRoot(_startPath) {
  // HOOK-002 FIX: Simply return the pre-computed PROJECT_ROOT from shared utility
  // The shared utility already handles finding project root correctly.
  // startPath parameter is ignored - the shared utility computes root at module load time.
  return PROJECT_ROOT || null;
}

/**
 * SEC-WIN-001: Check if a filename is a Windows reserved device name
 * Windows reserved names cannot be used as file names. They have special meaning
 * regardless of extension (e.g., NUL.txt, CON.anything are still reserved).
 *
 * @param {string} filePath - File path to check
 * @returns {{reserved: boolean, name?: string, reason?: string}}
 */
function isWindowsReservedName(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return { reserved: false };
  }

  // Get the basename (filename only, no directory)
  const basename = path.basename(filePath);

  if (!basename) {
    return { reserved: false };
  }

  // Extract name without extension (Windows reserves names regardless of extension)
  // e.g., "NUL.txt" -> "NUL", "CON" -> "CON", "nul.test.md" -> "nul"
  const nameWithoutExt = basename.split('.')[0].toUpperCase();

  if (WINDOWS_RESERVED_NAMES.includes(nameWithoutExt)) {
    return {
      reserved: true,
      name: nameWithoutExt,
      reason: `"${basename}" uses Windows reserved device name "${nameWithoutExt}". These names cannot be used as files on Windows.`,
    };
  }

  return { reserved: false };
}

/**
 * SEC-PT-001: Validate that a file path is safe (no path traversal attacks)
 * @param {string} filePath - File path to validate
 * @param {string} projectRoot - Project root path
 * @returns {{safe: boolean, reason?: string}}
 */
function isPathSafe(filePath, projectRoot) {
  // Fail-closed: Reject null/undefined/empty paths
  if (!filePath || typeof filePath !== 'string') {
    return { safe: false, reason: 'Invalid path: null, undefined, or empty' };
  }

  if (!projectRoot || typeof projectRoot !== 'string') {
    return { safe: false, reason: 'Invalid projectRoot: null, undefined, or empty' };
  }

  // Normalize both paths for comparison
  const normalizedFilePath = filePath.replace(/\\/g, '/');
  const _normalizedRoot = projectRoot.replace(/\\/g, '/');

  // Check for path traversal patterns BEFORE resolution
  for (const pattern of PATH_TRAVERSAL_PATTERNS) {
    if (pattern.test(normalizedFilePath)) {
      return { safe: false, reason: 'Path contains traversal sequence or invalid characters' };
    }
  }

  // Resolve to absolute path
  let resolvedPath;
  try {
    resolvedPath = path.resolve(projectRoot, filePath);
  } catch (_e) {
    return { safe: false, reason: 'Failed to resolve path' };
  }

  // Normalize the resolved path and project root for consistent comparison
  const normalizedResolved = path.normalize(resolvedPath).replace(/\\/g, '/');
  const normalizedProjectRoot = path.normalize(projectRoot).replace(/\\/g, '/');

  // Ensure the resolved path starts with the project root
  // Add trailing slash to prevent partial matches (e.g., /foo matching /foobar)
  const rootWithSlash = normalizedProjectRoot.endsWith('/')
    ? normalizedProjectRoot
    : normalizedProjectRoot + '/';

  const resolvedWithSlash = normalizedResolved.endsWith('/')
    ? normalizedResolved
    : normalizedResolved + '/';

  // Check if resolved path is within project root (or is the project root itself)
  if (
    !resolvedWithSlash.startsWith(rootWithSlash) &&
    normalizedResolved !== normalizedProjectRoot
  ) {
    return { safe: false, reason: 'Path escapes PROJECT_ROOT' };
  }

  return { safe: true };
}

/**
 * Get evolution state from evolution-state.json
 * SEC-SF-001 FIX: Use safe JSON parsing to prevent prototype pollution
 * PERF-004 FIX: Use state-cache.cjs for TTL-based caching to reduce I/O
 * @param {string} [projectRoot] - Project root path
 * @returns {{state: string, currentEvolution: object|null, spawnDepth: number, circuitBreaker: {timestamps: string[]}, evolutions?: Array}}
 */
function getEvolutionState(projectRoot) {
  const root = projectRoot || findProjectRoot();
  const defaultState = {
    state: 'idle',
    currentEvolution: null,
    spawnDepth: 0,
    circuitBreaker: { timestamps: [] },
    evolutions: [], // Legacy backwards compatibility
  };

  if (!root) {
    return defaultState;
  }

  const statePath = path.join(root, '.claude', 'context', 'evolution-state.json');
  try {
    // PERF-004 FIX: Use cached state with 1s TTL (default)
    // This reduces redundant file reads across hooks in the same tool operation
    // Pass null as default so we can detect when cache returns nothing
    const cached = getCachedState(statePath, null);
    if (cached !== null && typeof cached === 'object') {
      // PERF-004: Cache hit - extract only known properties to prevent prototype pollution
      // This is equivalent to safeParseJSON but without re-serialization overhead
      const result = { ...defaultState };

      // Only copy known properties (SEC-SF-001 safe extraction)
      if (typeof cached.state === 'string') {
        result.state = cached.state;
      }
      if (cached.currentEvolution && typeof cached.currentEvolution === 'object') {
        result.currentEvolution = cached.currentEvolution;
      }
      if (typeof cached.spawnDepth === 'number') {
        result.spawnDepth = cached.spawnDepth;
      }
      if (cached.circuitBreaker && typeof cached.circuitBreaker === 'object') {
        result.circuitBreaker = {
          timestamps: Array.isArray(cached.circuitBreaker.timestamps)
            ? cached.circuitBreaker.timestamps
            : [],
        };
      }
      // Legacy evolutions array for backwards compatibility with checkCircuitBreaker
      if (Array.isArray(cached.evolutions)) {
        result.evolutions = cached.evolutions.filter(
          e => e && typeof e === 'object' && typeof e.completedAt === 'string'
        );
      }

      return result;
    }
  } catch (e) {
    // Ignore errors, default to idle - fail closed
    if (process.env.PLACEMENT_DEBUG === 'true') {
      console.log(`[file-placement-guard] Error reading evolution state: ${e.message}`);
    }
  }
  return defaultState;
}

/**
 * Check if a file path is in an artifact directory
 * @param {string} filePath - File path to check
 * @param {string} projectRoot - Project root path
 * @returns {boolean}
 */
function isInArtifactDirectory(filePath, projectRoot) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const root = projectRoot.replace(/\\/g, '/');

  // Get relative path from project root
  let relativePath;
  if (normalizedPath.startsWith(root)) {
    relativePath = normalizedPath.substring(root.length);
    if (relativePath.startsWith('/')) {
      relativePath = relativePath.substring(1);
    }
  } else {
    // Try to extract .claude path
    const claudeIndex = normalizedPath.indexOf('.claude/');
    if (claudeIndex !== -1) {
      relativePath = normalizedPath.substring(claudeIndex);
    } else {
      return false;
    }
  }

  return ARTIFACT_DIRECTORIES.some(dir => relativePath.startsWith(dir));
}

/**
 * Check if file path represents a new artifact creation (vs edit)
 * @param {string} filePath - Absolute file path
 * @param {string} projectRoot - Project root path
 * @returns {boolean} True if this is a new artifact being created
 */
function isNewArtifactCreation(filePath, projectRoot) {
  // Check if it's in an artifact directory
  if (!isInArtifactDirectory(filePath, projectRoot)) {
    return false;
  }

  // Normalize path for checking
  const normalizedPath = path.normalize(filePath);

  // Check if file already exists (edit vs create)
  return !fs.existsSync(normalizedPath);
}

/**
 * Check if file is exempt from EVOLVE enforcement (test/spec files)
 * @param {string} filePath - File path to check
 * @returns {boolean}
 */
function isTestFile(filePath) {
  const normalized = filePath.toLowerCase();
  return normalized.includes('.test.') || normalized.includes('.spec.');
}

/**
 * Check EVOLVE enforcement for a file path
 * @param {string} filePath - File path to check
 * @param {string} [projectRoot] - Project root path
 * @returns {{blocked: boolean, reason?: string, suggestion?: string}}
 */
function checkEvolveEnforcement(filePath, projectRoot) {
  // Check for override
  if (process.env.EVOLVE_ENFORCEMENT_OVERRIDE === 'true') {
    return { blocked: false };
  }

  const root = projectRoot || findProjectRoot(filePath);
  if (!root) {
    // Can't determine project root, allow
    return { blocked: false };
  }

  // Test files are always exempt
  if (isTestFile(filePath)) {
    return { blocked: false };
  }

  // Check if this is a new artifact creation
  if (!isNewArtifactCreation(filePath, root)) {
    // Not a new artifact, allow
    return { blocked: false };
  }

  // Check evolution state
  const evolutionState = getEvolutionState(root);

  // If state allows creation, permit
  if (CREATION_ALLOWED_STATES.includes(evolutionState.state)) {
    return { blocked: false };
  }

  // State is idle or other non-creation state - block
  const fileName = path.basename(filePath);
  return {
    blocked: true,
    reason: `EVOLVE REQUIRED: Cannot create new artifact "${fileName}" without EVOLVE workflow. Current state: ${evolutionState.state}. Spawn evolution-orchestrator first.`,
    suggestion:
      'Use: Task({ subagent_type: "evolution-orchestrator", prompt: "Create new artifact..." })',
  };
}

/**
 * Get enforcement mode from environment
 * @returns {'block'|'warn'|'off'}
 */
function getEnforcementMode() {
  const mode = process.env.FILE_PLACEMENT_GUARD || 'block';
  return ['block', 'warn', 'off'].includes(mode) ? mode : 'block';
}

/**
 * SEC-AUDIT-010 FIX: Schema for validating hook input
 * Only known properties are allowed, stripping potential injection payloads
 */
const HOOK_INPUT_SCHEMA = {
  required: [],
  defaults: {
    tool_name: null,
    tool: null,
    tool_input: null,
    input: null,
  },
};

/**
 * SEC-AUDIT-010 FIX: Validate and sanitize hook input
 * Strips unknown properties and applies schema validation
 * @param {string} content - JSON string to parse
 * @returns {Object|null} Validated object or null
 */
function validateHookInput(content) {
  if (!content || typeof content !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(content);

    // Must be an object
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    // Create validated object with only known properties
    const validated = Object.create(null);
    const dangerousKeys = ['__proto__', 'constructor', 'prototype'];

    for (const key of Object.keys(HOOK_INPUT_SCHEMA.defaults)) {
      if (Object.prototype.hasOwnProperty.call(parsed, key) && !dangerousKeys.includes(key)) {
        const value = parsed[key];
        // Deep copy nested objects to prevent reference manipulation
        if (value !== null && typeof value === 'object') {
          try {
            validated[key] = JSON.parse(JSON.stringify(value));
          } catch (_e) {
            validated[key] = null;
          }
        } else {
          validated[key] = value;
        }
      }
    }

    return Object.assign({}, validated);
  } catch (_e) {
    // JSON parse failed
    return null;
  }
}

// parseHookInput removed - now using parseHookInputAsync from shared hook-input.cjs
// SEC-AUDIT-010: The shared utility already provides sanitization via sanitizeObject()
// PERF-006/PERF-007: This is the shared utility migration

/**
 * Extract file path from tool input
 */
function _getFilePath(toolInput) {
  if (!toolInput) return null;

  // Try common parameter names
  if (toolInput.file_path) return toolInput.file_path;
  if (toolInput.filePath) return toolInput.filePath;
  if (toolInput.path) return toolInput.path;
  if (toolInput.notebook_path) return toolInput.notebook_path;

  return null;
}

/**
 * Check if path is within .claude directory
 */
function isClaudePath(filePath) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  return normalizedPath.includes('.claude/') || normalizedPath.includes('.claude\\');
}

/**
 * Extract relative path from .claude directory
 */
function getRelativePath(filePath) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const claudeIndex = normalizedPath.indexOf('.claude/');
  if (claudeIndex === -1) {
    const claudeIndexWin = normalizedPath.indexOf('.claude\\');
    if (claudeIndexWin === -1) return null;
    return normalizedPath.substring(claudeIndexWin);
  }
  return normalizedPath.substring(claudeIndex);
}

/**
 * Check if file should always be allowed (skip all checks)
 */
function isAlwaysAllowed(filePath) {
  if (!filePath) return false;
  const normalizedPath = path.normalize(filePath);
  return ALWAYS_ALLOWED_PATTERNS.some(pattern => pattern.test(normalizedPath));
}

/**
 * Check if path is valid according to placement rules
 * @param {string} filePath - Full file path
 * @returns {{valid: boolean, reason: string, category?: string}}
 */
function isValidPath(filePath) {
  // Normalize path for consistent checking
  const normalizedPath = filePath.replace(/\\/g, '/');

  // If not a .claude path, allow it (outside framework scope)
  if (!isClaudePath(normalizedPath)) {
    return { valid: true, reason: 'Outside .claude directory' };
  }

  // Extract relative path from .claude
  const relativePath = getRelativePath(normalizedPath);
  if (!relativePath) {
    return { valid: true, reason: 'Could not determine relative path' };
  }

  // Check forbidden paths first (always blocked)
  for (const pattern of FORBIDDEN_PATHS) {
    if (pattern.test(relativePath)) {
      return {
        valid: false,
        reason: `Forbidden path - framework internal: ${relativePath.substring(8, 30)}...`,
      };
    }
  }

  // ADR-076: Block test files in .claude/ - all tests must go in root tests/ directory
  // This check comes before valid patterns to ensure no test files are ever allowed in .claude/
  const fileName = path.basename(relativePath);
  for (const pattern of TEST_FILE_PATTERNS) {
    if (pattern.test(fileName)) {
      return {
        valid: false,
        reason: `Test files are forbidden in .claude/ - use tests/ directory instead`,
      };
    }
  }

  // Check if matches any valid pattern
  for (const [category, pattern] of Object.entries(VALID_PATHS)) {
    if (pattern.test(relativePath)) {
      return { valid: true, category, reason: `Matches ${category} pattern` };
    }
  }

  // Special case: root level files that aren't in our allow list
  const rootLevelMatch = /^\.claude[/\\]([^/\\]+)$/.exec(relativePath);
  if (rootLevelMatch) {
    const fileName = rootLevelMatch[1];
    return {
      valid: false,
      reason: `Invalid root-level file: ${fileName} (only CLAUDE.md, config.yaml, settings.json allowed)`,
    };
  }

  // Check for direct writes to context/ without proper subdirectory
  if (/^\.claude[/\\]context[/\\][^/\\]+$/.test(relativePath)) {
    return {
      valid: false,
      reason: 'Files must be in context subdirectories (artifacts/, memory/, config/, etc.)',
    };
  }

  // Check for direct writes to artifacts/ without category subdirectory
  if (/^\.claude[/\\]context[/\\]artifacts[/\\][^/\\]+$/.test(relativePath)) {
    const match = /^\.claude[/\\]context[/\\]artifacts[/\\]([^/\\]+)$/.exec(relativePath);
    const fileName = match ? match[1] : 'file';
    // Allow .gitkeep
    if (fileName === '.gitkeep') {
      return { valid: true, reason: 'Gitkeep allowed' };
    }
    return {
      valid: false,
      reason: `Files must be in artifacts subdirectories (plans/, reports/, research-reports/, diagrams/), not directly in artifacts/`,
    };
  }

  // No matching rule found
  return {
    valid: false,
    reason: `No matching placement rule for: ${relativePath.substring(0, 50)}...`,
  };
}

/**
 * Format blocked message box
 */
function formatBlockedMessage(toolName, filePath, result) {
  const fileName = filePath ? path.basename(filePath) : 'unknown';
  const reasonText = result.reason.substring(0, 48);

  const lines = [
    '',
    '╔══════════════════════════════════════════════════════════════════╗',
    '║  FILE PLACEMENT VIOLATION                                        ║',
    '╠══════════════════════════════════════════════════════════════════╣',
    `║  Tool: ${toolName.padEnd(56)}   ║`,
    `║  File: ${fileName.slice(0, 56).padEnd(56)}   ║`,
    `║  Reason: ${reasonText.padEnd(54)}   ║`,
    '╠══════════════════════════════════════════════════════════════════╣',
    '║  Valid locations include:                                        ║',
    '║    agents/      -> agents/{core,domain,specialized,orchestrators}/║',
    '║    skills/      -> skills/{name}/SKILL.md                        ║',
    '║    hooks/       -> hooks/{routing,safety,validation,...}/        ║',
    '║    workflows/   -> workflows/{core,enterprise,operations}/       ║',
    '║    context/     -> context/{artifacts,memory,config}/            ║',
    '║    schemas/     -> schemas/{name}.schema.json                    ║',
    '║    docs/        -> docs/{NAME}.md                                ║',
    '╠══════════════════════════════════════════════════════════════════╣',
    '║  See: .claude/docs/FILE_PLACEMENT_RULES.md                       ║',
    '╚══════════════════════════════════════════════════════════════════╝',
    '',
  ];
  return lines.join('\n');
}

/**
 * Format warning message box
 */
function formatWarningMessage(toolName, filePath, result) {
  const fileName = filePath ? path.basename(filePath) : 'unknown';
  const reasonText = result.reason.substring(0, 48);

  const lines = [
    '',
    '┌──────────────────────────────────────────────────────────────────┐',
    '│  ⚠️  FILE PLACEMENT WARNING                                       │',
    '├──────────────────────────────────────────────────────────────────┤',
    `│  Tool: ${toolName.padEnd(56)}   │`,
    `│  File: ${fileName.slice(0, 56).padEnd(56)}   │`,
    `│  Reason: ${reasonText.padEnd(54)}   │`,
    '├──────────────────────────────────────────────────────────────────┤',
    '│  This file may be in the wrong location.                        │',
    '│  See: .claude/docs/FILE_PLACEMENT_RULES.md                      │',
    '│                                                                  │',
    '│  Set FILE_PLACEMENT_GUARD=block to enforce.                     │',
    '└──────────────────────────────────────────────────────────────────┘',
    '',
  ];
  return lines.join('\n');
}

/**
 * Format EVOLVE blocked message box
 */
function formatEvolveBlockedMessage(toolName, filePath, evolveResult) {
  const fileName = filePath ? path.basename(filePath) : 'unknown';
  const reasonText = (evolveResult.reason || 'EVOLVE required').substring(0, 54);

  const lines = [
    '',
    '+=======================================================================+',
    '|  EVOLVE WORKFLOW REQUIRED                                             |',
    '+-----------------------------------------------------------------------+',
    `|  Tool: ${toolName.padEnd(60)}   |`,
    `|  File: ${fileName.slice(0, 60).padEnd(60)}   |`,
    `|  Reason: ${reasonText.padEnd(58)}   |`,
    '+-----------------------------------------------------------------------+',
    '|  New artifacts require the EVOLVE workflow.                           |',
    '|  Spawn evolution-orchestrator first to create this artifact.          |',
    '+-----------------------------------------------------------------------+',
    '|  Task({ subagent_type: "evolution-orchestrator",                      |',
    '|         prompt: "Create new artifact: <name>" })                      |',
    '+=======================================================================+',
    '',
  ];
  return lines.join('\n');
}

/**
 * Format EVOLVE warning message box
 */
function formatEvolveWarningMessage(toolName, filePath, _evolveResult) {
  const fileName = filePath ? path.basename(filePath) : 'unknown';

  const lines = [
    '',
    '+-----------------------------------------------------------------------+',
    '|  EVOLVE WORKFLOW RECOMMENDED                                          |',
    '+-----------------------------------------------------------------------+',
    `|  Tool: ${toolName.padEnd(60)}   |`,
    `|  File: ${fileName.slice(0, 60).padEnd(60)}   |`,
    '+-----------------------------------------------------------------------+',
    '|  New artifacts should use the EVOLVE workflow.                        |',
    '|  Consider spawning evolution-orchestrator instead.                    |',
    '+-----------------------------------------------------------------------+',
    '',
  ];
  return lines.join('\n');
}

/**
 * Main entry point for file placement guard hook.
 *
 * Validates file placement rules and prevents writes to invalid locations.
 * Enforces that agents create files only in designated directories.
 *
 * Checks (in order):
 * 1. Path traversal attacks (critical)
 * 2. Windows reserved device names (high)
 * 3. Always-allowed framework internal files (low)
 * 4. EVOLVE enforcement for new artifact creation (low)
 * 5. General file placement rules (medium)
 *
 * State File: None (stateless validation)
 * Rules File: .claude/docs/FILE_PLACEMENT_RULES.md
 *
 * @returns {void} Exits with:
 *   - 0 if file placement is valid
 *   - 2 if file placement is invalid or critical error
 *
 * @throws {Error} Caught internally; triggers exit(2) on unknown state.
 *
 * Environment Variables:
 *   - FILE_PLACEMENT_GUARD: block (default) | warn | off
 *   - FILE_PLACEMENT_OVERRIDE: true enables dangerous skip
 *   - PLACEMENT_DEBUG: true enables debug output
 *   - EVOLVE_AUTO_START: true (default) enables auto-spawn on block
 *
 * Exit Behavior:
 *   - Valid: process.exit(0)
 *   - Invalid: process.exit(2) + formatted message to stderr
 *   - Warning: process.exit(0) + formatted message to stderr (warn mode)
 *   - Override: process.exit(0) + audit log to stderr
 *   - Error: process.exit(2) + JSON audit log to stderr
 */
function main() {
  const enforcementMode = getEnforcementMode();

  // Skip if enforcement is off
  if (enforcementMode === 'off') {
    // SEC-AUDIT-016 FIX: Use centralized auditSecurityOverride for consistent logging
    auditSecurityOverride(
      'file-placement-guard',
      'FILE_PLACEMENT_GUARD',
      'off',
      'File placement validation bypassed'
    );
    process.exit(0);
  }

  // Check for override
  if (process.env.FILE_PLACEMENT_OVERRIDE === 'true') {
    // SEC-AUDIT-016 FIX: Use centralized auditSecurityOverride for consistent logging
    auditSecurityOverride(
      'file-placement-guard',
      'FILE_PLACEMENT_OVERRIDE',
      'true',
      'File placement validation bypassed'
    );
    if (process.env.PLACEMENT_DEBUG === 'true') {
      console.log('[file-placement-guard] Override enabled, skipping checks');
    }
    process.exit(0);
  }

  // PERF-006/PERF-007: Use shared hook-input.cjs utility
  // SEC-AUDIT-010: validateHookInput provides schema validation
  const hookInput = validateHookInput(process.argv[2]);
  if (!hookInput) {
    process.exit(0);
  }

  // Get tool name and input using shared helpers
  const toolName = sharedGetToolName(hookInput);
  const toolInput = sharedGetToolInput(hookInput);

  // Only check write tools
  if (!WRITE_TOOLS.includes(toolName)) {
    process.exit(0);
  }

  // Get file path using shared helper
  const filePath = sharedExtractFilePath(toolInput);

  if (!filePath) {
    process.exit(0);
  }

  // SEC-PT-001: Path traversal validation (CRITICAL - check early)
  const projectRoot = findProjectRoot(filePath);
  if (projectRoot) {
    const pathSafetyCheck = isPathSafe(filePath, projectRoot);
    if (!pathSafetyCheck.safe) {
      // Audit log the blocked path traversal attempt
      console.error(
        JSON.stringify({
          hook: 'file-placement-guard',
          event: 'path_traversal_blocked',
          tool: toolName,
          path: filePath.substring(0, 100),
          reason: pathSafetyCheck.reason,
          timestamp: new Date().toISOString(),
          severity: 'CRITICAL',
        })
      );
      // Output human-readable blocked message
      console.error(`\n[BLOCKED] Path traversal detected: ${pathSafetyCheck.reason}\n`);
      try {
        eventBus.emit(EventTypes.TOOL_BLOCKED, {
          type: EventTypes.TOOL_BLOCKED,
          timestamp: new Date().toISOString(),
          toolName,
          reason: 'path_traversal_blocked',
        });
      } catch (_err) {
        // Best-effort
      }
      process.exit(2);
    }
  }

  // Memory JSON enforcement: prevent direct Write/Edit to structured memory files.
  if (MEMORY_JSON_WRITE_ENFORCEMENT !== 'off') {
    const normalizedPath = filePath.replace(/\\/g, '/');
    const baseName = path.basename(filePath);
    const isMemoryJson =
      (normalizedPath.includes('/.claude/context/memory/') ||
        normalizedPath.includes('.claude/context/memory/')) &&
      MEMORY_JSON_FILES.has(baseName);

    if (isMemoryJson) {
      const warning = `Direct edits to ${baseName} are blocked. Use MemoryRecord instead.`;
      console.error(
        JSON.stringify({
          hook: 'file-placement-guard',
          event: 'memory_json_write_blocked',
          tool: toolName,
          path: filePath.substring(0, 120),
          reason: warning,
          timestamp: new Date().toISOString(),
          severity: 'HIGH',
        })
      );
      console.error(`\n[BLOCKED] ${warning}\n`);

      try {
        eventBus.emit(EventTypes.TOOL_BLOCKED, {
          type: EventTypes.TOOL_BLOCKED,
          timestamp: new Date().toISOString(),
          toolName,
          reason: 'memory_json_write_blocked',
        });
      } catch (_err) {
        // Best-effort
      }

      if (MEMORY_JSON_WRITE_ENFORCEMENT === 'warn' || enforcementMode === 'warn') {
        process.exit(0);
      }
      process.exit(2);
    }
  }

  // SEC-WIN-001: Windows reserved device name validation (CRITICAL - check early)
  // This prevents creating files like "nul", "con", "prn" which cause issues on Windows
  // Even on non-Windows platforms, block these to maintain cross-platform compatibility
  const reservedNameCheck = isWindowsReservedName(filePath);
  if (reservedNameCheck.reserved) {
    // Audit log the blocked reserved name attempt
    console.error(
      JSON.stringify({
        hook: 'file-placement-guard',
        event: 'windows_reserved_name_blocked',
        tool: toolName,
        path: filePath.substring(0, 100),
        reservedName: reservedNameCheck.name,
        reason: reservedNameCheck.reason,
        timestamp: new Date().toISOString(),
        severity: 'HIGH',
      })
    );
    // Output human-readable blocked message
    console.error(`
+======================================================================+
|  BLOCKED: Windows Reserved Device Name Detected                      |
+======================================================================+
|  Tool: ${toolName.padEnd(60)}|
|  File: ${path.basename(filePath).slice(0, 60).padEnd(60)}|
|  Reserved Name: ${(reservedNameCheck.name || 'UNKNOWN').padEnd(52)}|
+----------------------------------------------------------------------+
|  Windows reserved device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)  |
|  cannot be used as file names. They have special OS-level meaning.   |
|                                                                      |
|  Creating files with these names causes:                             |
|  - Denial of service (can't delete/access properly)                  |
|  - Unexpected device interactions                                    |
|  - Cross-platform compatibility issues                               |
+======================================================================+
`);
    try {
      eventBus.emit(EventTypes.TOOL_BLOCKED, {
        type: EventTypes.TOOL_BLOCKED,
        timestamp: new Date().toISOString(),
        toolName,
        reason: 'windows_reserved_name_blocked',
      });
    } catch (_err) {
      // Best-effort
    }
    process.exit(2);
  }

  // Check if file is always allowed (framework internal)
  if (isAlwaysAllowed(filePath)) {
    if (process.env.PLACEMENT_DEBUG === 'true') {
      console.log(`[file-placement-guard] Always allowed: ${filePath}`);
    }
    process.exit(0);
  }

  // EVOLVE enforcement: Block new artifact creation when not in evolution workflow
  const evolveCheck = checkEvolveEnforcement(filePath);
  if (evolveCheck.blocked) {
    // Build structured trigger data for auto-start capability
    const triggerData = buildEvolveTriggerData(filePath);

    if (enforcementMode === 'block') {
      // Output human-readable message
      console.error(formatEvolveBlockedMessage(toolName, filePath, evolveCheck));

      // Output structured JSON for Router consumption
      // This allows the Router to auto-spawn evolution-orchestrator if EVOLVE_AUTO_START=true
      if (triggerData) {
        console.error('');
        console.error('=== EVOLVE TRIGGER DATA (JSON) ===');
        console.error(JSON.stringify(triggerData, null, 2));

        // If auto-start is enabled and circuit breaker allows, output spawn instructions
        if (triggerData.spawnInstructions) {
          console.error('');
          console.error('=== AUTO-SPAWN INSTRUCTIONS ===');
          console.error(triggerData.spawnInstructions);
        }
      }

      try {
        eventBus.emit(EventTypes.TOOL_BLOCKED, {
          type: EventTypes.TOOL_BLOCKED,
          timestamp: new Date().toISOString(),
          toolName,
          reason: 'evolve_enforcement_blocked',
        });
      } catch (_err) {
        // Best-effort
      }
      process.exit(2);
    } else {
      console.warn(formatEvolveWarningMessage(toolName, filePath, evolveCheck));
      // Continue to normal path validation in warn mode
    }
  }

  // Validate path against placement rules
  const result = isValidPath(filePath);

  if (result.valid) {
    if (process.env.PLACEMENT_DEBUG === 'true') {
      console.log(`[file-placement-guard] Valid: ${result.reason} (${result.category || 'n/a'})`);
    }
    process.exit(0);
  }

  // Path is invalid - show message based on enforcement mode
  if (enforcementMode === 'block') {
    console.error(formatBlockedMessage(toolName, filePath, result));
    try {
      eventBus.emit(EventTypes.TOOL_BLOCKED, {
        type: EventTypes.TOOL_BLOCKED,
        timestamp: new Date().toISOString(),
        toolName,
        reason: 'invalid_file_placement',
      });
    } catch (_err) {
      // Best-effort
    }
    process.exit(2);
  } else {
    // warn mode (default during rollout)
    console.warn(formatWarningMessage(toolName, filePath, result));
    process.exit(0);
  }
}

// ============================================================================
// EVOLVE Auto-Start Feature
// ============================================================================

// Default rate limit: 3 evolutions per hour
const DEFAULT_RATE_LIMIT = 3;

// Time window for rate limiting (1 hour in milliseconds)
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

/**
 * Get rate limit from environment or default
 * @returns {number}
 */
function getRateLimit() {
  const envLimit = process.env.EVOLVE_RATE_LIMIT;
  if (envLimit) {
    const parsed = parseInt(envLimit, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_RATE_LIMIT;
}

/**
 * Check if auto-start is enabled via environment variable
 * DEFAULT: true (auto-start enabled unless explicitly disabled)
 * @returns {boolean}
 */
function isAutoStartEnabled() {
  // Opt-out mode: default true unless explicitly set to 'false'
  return process.env.EVOLVE_AUTO_START !== 'false';
}

/**
 * Detect artifact type from file path
 * @param {string} filePath - File path
 * @returns {string} Artifact type (agent, skill, hook, workflow, template, schema, unknown)
 */
function detectArtifactType(filePath) {
  const normalized = filePath.replace(/\\/g, '/');

  if (normalized.includes('.claude/agents/')) return 'agent';
  if (normalized.includes('.claude/skills/')) return 'skill';
  if (normalized.includes('.claude/hooks/')) return 'hook';
  if (normalized.includes('.claude/workflows/')) return 'workflow';
  if (normalized.includes('.claude/templates/')) return 'template';
  if (normalized.includes('.claude/schemas/')) return 'schema';

  return 'unknown';
}

/**
 * Extract artifact name from file path
 * @param {string} filePath - File path
 * @param {string} artifactType - Artifact type
 * @returns {string} Artifact name
 */
function extractArtifactName(filePath, artifactType) {
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/');

  switch (artifactType) {
    case 'agent': {
      // agents/core/name.md -> name
      const fileName = parts[parts.length - 1];
      return fileName.replace(/\.md$/, '');
    }
    case 'skill': {
      // skills/name/SKILL.md -> name
      const skillIndex = parts.findIndex(p => p === 'skills');
      if (skillIndex !== -1 && parts.length > skillIndex + 1) {
        return parts[skillIndex + 1];
      }
      break;
    }
    case 'hook': {
      // hooks/category/name.cjs -> name
      const fileName = parts[parts.length - 1];
      return fileName.replace(/\.(cjs|js)$/, '');
    }
    case 'workflow': {
      // workflows/category/name.md -> name
      const fileName = parts[parts.length - 1];
      return fileName.replace(/\.(md|yaml)$/, '');
    }
    case 'template': {
      // templates/name.md -> name
      const fileName = parts[parts.length - 1];
      return fileName.replace(/\.(md|yaml|json)$/, '');
    }
    case 'schema': {
      // schemas/name.schema.json -> name
      const fileName = parts[parts.length - 1];
      return fileName.replace(/\.schema\.json$/, '');
    }
  }

  // Fallback: use file name without extension
  const fileName = parts[parts.length - 1];
  return fileName.replace(/\.[^.]+$/, '');
}

/**
 * Get artifact directory from file path
 * @param {string} filePath - File path
 * @returns {string} Directory portion
 */
function getArtifactDirectory(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  const claudeIndex = normalized.indexOf('.claude/');
  if (claudeIndex === -1) return '';

  const relativePath = normalized.substring(claudeIndex);
  const parts = relativePath.split('/');

  // Return up to and including the artifact type directory
  // e.g., .claude/agents/core/ or .claude/skills/
  if (parts.length >= 2) {
    return parts.slice(0, 3).join('/') + '/';
  }
  return parts.join('/');
}

/**
 * Check circuit breaker to prevent excessive evolutions
 * SEC-AS-001 FIX: Use timestamp array instead of simple counter for tamper resistance
 * SEC-AS-002 FIX: Prune old timestamps on read to handle clock edge cases
 * @param {string} [projectRoot] - Project root path
 * @returns {{allowed: boolean, remaining: number, recentCount: number}}
 */
function checkCircuitBreaker(projectRoot) {
  const rateLimit = getRateLimit();
  const evolutionState = getEvolutionState(projectRoot);

  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  // SEC-AS-001 FIX: Use circuitBreaker.timestamps array instead of counting evolutions
  // This is more tamper-resistant as each timestamp must be a valid ISO date within the window
  const timestamps = evolutionState.circuitBreaker?.timestamps || [];

  // SEC-AS-002 FIX: Filter to only timestamps within the last hour (prune on read)
  // This prevents clock manipulation bypasses
  const recentTimestamps = timestamps.filter(ts => {
    if (!ts) return false;
    const tsTime = new Date(ts).getTime();
    // Invalid dates return NaN, which will fail this check
    return !isNaN(tsTime) && tsTime > windowStart;
  });

  // Also check legacy evolutions array for backwards compatibility
  const evolutions = evolutionState.evolutions || [];
  const recentEvolutions = evolutions.filter(e => {
    if (!e.completedAt) return false;
    const completedTime = new Date(e.completedAt).getTime();
    return !isNaN(completedTime) && completedTime > windowStart;
  });

  // Use the higher of the two counts (timestamps takes precedence if both exist)
  const recentCount = Math.max(recentTimestamps.length, recentEvolutions.length);
  const remaining = Math.max(0, rateLimit - recentCount);
  const allowed = recentCount < rateLimit;

  return {
    allowed,
    remaining,
    recentCount,
  };
}

/**
 * SEC-AS-004 FIX: Check spawn depth to prevent recursive spawn loops
 * @param {string} [projectRoot] - Project root path
 * @returns {{allowed: boolean, depth: number}}
 */
function checkSpawnDepth(projectRoot) {
  const evolutionState = getEvolutionState(projectRoot);
  const depth = evolutionState.spawnDepth || 0;

  return {
    allowed: depth === 0,
    depth,
  };
}

/**
 * SEC-IV-001 FIX: Sanitize path for inclusion in spawn prompts
 * Removes shell metacharacters and truncates to prevent injection attacks
 * @param {string} filePath - File path to sanitize
 * @returns {string} Sanitized path safe for prompt inclusion
 */
function sanitizePathForPrompt(filePath) {
  if (!filePath || typeof filePath !== 'string') return '';

  let safe = filePath;

  // Remove all dangerous characters
  for (const char of DANGEROUS_PATH_CHARS) {
    safe = safe.split(char).join('');
  }

  // Truncate to prevent prompt overflow (500 chars max)
  if (safe.length > 500) {
    safe = safe.substring(0, 500);
  }

  return safe;
}

/**
 * SEC-IV-002 FIX: Check if path is sensitive and should not trigger auto-spawn
 * @param {string} filePath - File path to check
 * @returns {boolean} True if path is sensitive and should be blocked
 */
function isSensitivePath(filePath) {
  if (!filePath || typeof filePath !== 'string') return true; // Fail-closed
  const normalizedPath = filePath.replace(/\\/g, '/');
  return SENSITIVE_PATH_PATTERNS.some(pattern => pattern.test(normalizedPath));
}

/**
 * Build EVOLVE trigger data for structured output
 * @param {string} filePath - File path that was blocked
 * @param {string} [projectRoot] - Project root path
 * @returns {Object|null} Trigger data or null if not blocked
 */
function buildEvolveTriggerData(filePath, projectRoot) {
  const root = projectRoot || findProjectRoot(filePath);

  // Check if this would be blocked
  const evolveCheck = checkEvolveEnforcement(filePath, root);
  if (!evolveCheck.blocked) {
    return null;
  }

  const evolutionState = getEvolutionState(root);
  const circuitBreaker = checkCircuitBreaker(root);
  const spawnDepthCheck = checkSpawnDepth(root);
  const artifactType = detectArtifactType(filePath);
  const artifactName = extractArtifactName(filePath, artifactType);

  // Get relative path
  let relativePath = filePath;
  if (root) {
    const normalizedFile = filePath.replace(/\\/g, '/');
    const normalizedRoot = root.replace(/\\/g, '/');
    if (normalizedFile.startsWith(normalizedRoot)) {
      relativePath = normalizedFile.substring(normalizedRoot.length);
      if (relativePath.startsWith('/')) {
        relativePath = relativePath.substring(1);
      }
    } else {
      // Try to extract from .claude path
      const claudeIndex = normalizedFile.indexOf('.claude/');
      if (claudeIndex !== -1) {
        relativePath = normalizedFile.substring(claudeIndex);
      }
    }
  }

  // SEC-IV-002 FIX: Check if path is sensitive (never auto-spawn for sensitive paths)
  const pathIsSensitive = isSensitivePath(relativePath);

  // SEC-AS-004 FIX: Check spawn depth (prevent recursive spawn loops)
  // SEC-IV-002 FIX: Block auto-spawn for sensitive paths
  // Determine if auto-start should be enabled
  // Only enable if:
  // 1. Env var is set AND
  // 2. Circuit breaker allows AND
  // 3. Spawn depth is 0 AND
  // 4. Path is not sensitive
  const autoStartEnabled =
    isAutoStartEnabled() && circuitBreaker.allowed && spawnDepthCheck.allowed && !pathIsSensitive;

  const triggerData = {
    blocked: true,
    reason: evolveCheck.reason,
    artifact: {
      type: artifactType,
      path: sanitizePathForPrompt(relativePath), // SEC-IV-001 FIX: Sanitize path
      directory: getArtifactDirectory(filePath),
      name: artifactName,
    },
    evolve: {
      autoStart: autoStartEnabled,
      currentState: evolutionState.state || 'idle',
      circuitBreaker,
      spawnDepth: spawnDepthCheck.depth, // SEC-AS-004: Include spawn depth
    },
  };

  // Add spawn instructions if auto-start is enabled
  const spawnInstructions = generateSpawnInstructions(triggerData);
  if (spawnInstructions) {
    triggerData.spawnInstructions = spawnInstructions;
  }

  return triggerData;
}

/**
 * Generate spawn instructions for evolution-orchestrator
 * @param {Object} triggerData - Trigger data from buildEvolveTriggerData
 * @returns {string|null} Spawn instructions or null
 */
function generateSpawnInstructions(triggerData) {
  if (!triggerData) return null;
  if (!triggerData.evolve.autoStart) return null;
  if (!triggerData.evolve.circuitBreaker.allowed) return null;

  const { artifact } = triggerData;

  return `Task({
  subagent_type: 'evolution-orchestrator',
  description: 'Creating new ${artifact.type}: ${artifact.name}',
  allowed_tools: ['Read', 'Write', 'Edit', 'Task', 'Skill', 'TaskUpdate', 'TaskList', 'mcp__Exa__*'],
  prompt: \`You are EVOLUTION-ORCHESTRATOR. Follow the EVOLVE workflow to create a new ${artifact.type}.

Requested artifact: ${artifact.name}
Target path: ${artifact.path}

Read: .claude/agents/orchestrators/evolution-orchestrator.md
Follow: .claude/workflows/core/evolution-workflow.md

CRITICAL: Phase O (Obtain/Research) is MANDATORY. You cannot create the artifact without completing research first.\`
})`;
}

// Export for testing
module.exports = {
  isValidPath,
  getEnforcementMode,
  VALID_PATHS,
  FORBIDDEN_PATHS,
  // ADR-076: Test file patterns for blocking
  TEST_FILE_PATTERNS,
  ARTIFACT_DIRECTORIES,
  getEvolutionState,
  isNewArtifactCreation,
  checkEvolveEnforcement,
  findProjectRoot,
  // New auto-start exports
  buildEvolveTriggerData,
  checkCircuitBreaker,
  generateSpawnInstructions,
  detectArtifactType,
  extractArtifactName,
  isAutoStartEnabled,
  // SEC-AS-004: Spawn depth tracking
  checkSpawnDepth,
  // SEC-IV-001: Path sanitization
  sanitizePathForPrompt,
  // SEC-IV-002: Sensitive path blocking
  isSensitivePath,
  SENSITIVE_PATH_PATTERNS,
  DANGEROUS_PATH_CHARS,
  // SEC-PT-001: Path traversal validation
  isPathSafe,
  PATH_TRAVERSAL_PATTERNS,
  // SEC-WIN-001: Windows reserved device names validation
  isWindowsReservedName,
  WINDOWS_RESERVED_NAMES,
};

// Run if called directly
if (require.main === module) {
  main();
}
