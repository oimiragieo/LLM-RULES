#!/usr/bin/env node
/**
 * Router Write Guard Hook
 *
 * Trigger: PreToolUse (Edit|Write|NotebookEdit)
 *
 * Blocks or warns when Edit/Write/NotebookEdit tools are used directly
 * by the Router without first spawning a Task agent.
 *
 * This enforces the multi-agent architecture by ensuring the Router
 * delegates work to agents rather than executing directly.
 *
 * ENFORCEMENT MODES:
 * - block (default): Violations are blocked with error message
 * - warn: Violations produce warning but are allowed
 * - off: Enforcement disabled (not recommended)
 *
 * Override via environment variable:
 *   ROUTER_WRITE_GUARD=warn  (warning only)
 *   ROUTER_WRITE_GUARD=off   (disable guard)
 *   ALLOW_ROUTER_WRITE=true  (one-time override)
 *   ROUTER_DEBUG=true        (verbose logging)
 *
 * Exit codes:
 * - 0: Allow operation
 * - 2: Block operation (when ROUTER_WRITE_GUARD=block or on error - fail-closed)
 */

const path = require('path');

// Import router state module
const routerState = require('../routing/router-state.cjs');

// PERF-006: Use shared hook-input utility instead of duplicated functions
const {
  parseHookInputSync,
  extractFilePath,
  getToolName,
  getToolInput,
} = require('../../lib/utils/hook-input.cjs');
const eventBus = require('../../lib/events/event-bus.cjs');
const { EventTypes } = require('../../lib/events/event-types.cjs');

// Tools that this guard watches
const WRITE_TOOLS = ['Edit', 'Write', 'NotebookEdit'];

// Files that are always allowed (framework internal operations)
const ALWAYS_ALLOWED_PATTERNS = [
  /\.claude[/\\]context[/\\]runtime[/\\]/, // Runtime state files
  /\.claude[/\\]context[/\\]memory[/\\]/, // Memory files (learnings, etc.)
  /\.gitkeep$/, // Git keep files
];

/**
 * Check if file should always be allowed
 */
function isAlwaysAllowed(filePath) {
  if (!filePath) return false;
  const normalizedPath = path.normalize(filePath);
  return ALWAYS_ALLOWED_PATTERNS.some(pattern => pattern.test(normalizedPath));
}

/**
 * Format blocked message box
 */
function formatBlockedMessage(toolName, filePath, _state) {
  const fileName = filePath ? path.basename(filePath) : 'unknown';
  const lines = [
    '',
    '┌─────────────────────────────────────────────────┐',
    '│ 🛑 ROUTER WRITE BLOCKED                         │',
    '├─────────────────────────────────────────────────┤',
    `│ Tool: ${toolName.padEnd(41)} │`,
    `│ File: ${fileName.slice(0, 41).padEnd(41)} │`,
    '│                                                 │',
    '│ The Router cannot directly edit files.         │',
    '│ You must spawn an agent using the Task tool.   │',
    '│                                                 │',
    '│ Example:                                        │',
    '│   Task({                                        │',
    '│     subagent_type: "developer",                │',
    '│     description: "Fix login bug",              │',
    '│     prompt: "..."                              │',
    '│   })                                           │',
    '└─────────────────────────────────────────────────┘',
    '',
  ];
  return lines.join('\n');
}

/**
 * Format warning message box
 */
function formatWarningMessage(toolName, filePath, _state) {
  const fileName = filePath ? path.basename(filePath) : 'unknown';
  const lines = [
    '',
    '┌─────────────────────────────────────────────────┐',
    '│ ⚠️  ROUTER WRITE WARNING                         │',
    '├─────────────────────────────────────────────────┤',
    `│ Tool: ${toolName.padEnd(41)} │`,
    `│ File: ${fileName.slice(0, 41).padEnd(41)} │`,
    '│                                                 │',
    '│ Direct writes without spawning a Task agent    │',
    '│ bypass the multi-agent architecture.           │',
    '│                                                 │',
    '│ Consider using Task tool to spawn an agent:    │',
    '│   • developer - for code changes               │',
    '│   • planner - for design documents             │',
    '│   • technical-writer - for documentation       │',
    '│                                                 │',
    '│ Set ROUTER_WRITE_GUARD=block to enforce.       │',
    '└─────────────────────────────────────────────────┘',
    '',
  ];
  return lines.join('\n');
}

/**
 * Main execution
 *
 * SEC-AUDIT-003 FIX: Wrapped in try-catch with fail-closed behavior.
 * Security hooks must deny by default when state is unknown.
 * Override: Set ROUTER_WRITE_GUARD_FAIL_OPEN=true for debugging only.
 */
function main() {
  try {
    const enforcementMode = routerState.getEnforcementMode();

    // Skip if enforcement is off
    if (enforcementMode === 'off') {
      // SEC-010 FIX: Audit log when security override is used
      console.error(
        JSON.stringify({
          hook: 'router-write-guard',
          event: 'security_override_used',
          override: 'ROUTER_WRITE_GUARD=off',
          timestamp: new Date().toISOString(),
          warning: 'Security enforcement disabled - Router write protection bypassed',
        })
      );
      process.exit(0);
    }

    const hookInput = parseHookInputSync();
    if (!hookInput) {
      process.exit(0);
    }

    // Get tool name and input using shared utilities
    const toolName = getToolName(hookInput);
    const toolInput = getToolInput(hookInput);

    // Only check write tools
    if (!WRITE_TOOLS.includes(toolName)) {
      process.exit(0);
    }

    // Get file path using shared utility
    const filePath = extractFilePath(toolInput);

    // Check if file is always allowed (framework internal)
    if (isAlwaysAllowed(filePath)) {
      if (process.env.ROUTER_DEBUG === 'true') {
        console.log(`[router-write-guard] Always allowed: ${filePath}`);
      }
      process.exit(0);
    }

    // Check if write is allowed
    const { allowed, reason } = routerState.checkWriteAllowed();

    if (allowed) {
      if (process.env.ROUTER_DEBUG === 'true') {
        console.log(`[router-write-guard] Allowed: ${reason}`);
      }
      process.exit(0);
    }

    // Write not allowed - show message based on enforcement mode
    const state = routerState.getState();

    if (enforcementMode === 'block') {
      try {
        eventBus.emit(EventTypes.TOOL_BLOCKED, {
          type: EventTypes.TOOL_BLOCKED,
          timestamp: new Date().toISOString(),
          toolName,
          reason: 'router_write_blocked',
        });
      } catch (_err) {
        // Best-effort
      }
      console.log(formatBlockedMessage(toolName, filePath, state));
      // HOOK-005 FIX: Use exit(2) for blocking consistency with other security hooks
      process.exit(2);
    } else {
      // warn mode (default)
      console.log(formatWarningMessage(toolName, filePath, state));
      process.exit(0);
    }
  } catch (err) {
    // SEC-AUDIT-003 FIX: Fail closed on errors (defense-in-depth)
    // Security hooks must deny by default when state is unknown
    // Override: Set ROUTER_WRITE_GUARD_FAIL_OPEN=true for debugging only
    if (process.env.ROUTER_WRITE_GUARD_FAIL_OPEN === 'true') {
      console.error(
        JSON.stringify({
          hook: 'router-write-guard',
          event: 'fail_open_override',
          error: err.message,
          timestamp: new Date().toISOString(),
        })
      );
      process.exit(0);
    }

    // Audit log the error
    console.error(
      JSON.stringify({
        hook: 'router-write-guard',
        event: 'error_fail_closed',
        error: err.message,
        timestamp: new Date().toISOString(),
      })
    );

    // Fail closed: block the operation when security state is unknown
    try {
      eventBus.emit(EventTypes.TOOL_FAILED, {
        type: EventTypes.TOOL_FAILED,
        timestamp: new Date().toISOString(),
        toolName: 'router-write-guard',
        error: err.message,
      });
    } catch (_err) {
      // Best-effort
    }
    process.exit(2);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, parseHookInput: parseHookInputSync };
