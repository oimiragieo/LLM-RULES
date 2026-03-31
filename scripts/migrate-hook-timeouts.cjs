#!/usr/bin/env node
/**
 * migrate-hook-timeouts.cjs
 *
 * One-time migration: add timeout_ms to every hook registration in
 * .claude/settings.json that is currently missing it.
 *
 * Timeout assignment rules (from feature hooks-timeout-coverage):
 * - Security/blocking PreToolUse hooks: 5000-10000ms
 * - Advisory async hooks: 10000ms
 * - Simple advisory hooks (statusline, audit): 5000ms
 * - SessionEnd/cleanup hooks: 15000ms (30000ms for queue processor)
 * - Hooks that do file scanning (post-pipeline-token-report): preserve existing
 * - PreCompact hooks: 10000ms
 * - Stop hooks: 5000ms
 *
 * Existing timeout_ms values are ALWAYS preserved.
 *
 * Usage: node scripts/migrate-hook-timeouts.cjs
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SETTINGS_PATH = path.join(PROJECT_ROOT, '.claude', 'settings.json');

// ─── Timeout assignment maps ───────────────────────────────────────────────────

/**
 * Per-script timeout defaults (used for UserPromptSubmit, PreToolUse,
 * PostToolUse, PostToolUseFailure).
 * Does NOT apply to SessionEnd / Stop / PreCompact — those use event defaults.
 */
const SCRIPT_TIMEOUTS = {
  // UserPromptSubmit — non-async control/routing hooks
  'user-prompt-unified.cjs': 5000,
  'force-step0-execution.cjs': 5000,

  // UserPromptSubmit — simple advisory (statusline, audit)
  'ccusage-statusline.cjs': 5000,
  'audit-skill-recency.cjs': 5000,

  // UserPromptSubmit — advisory async
  'startup-failopen-audit.cjs': 10000,
  'worktree-prune-on-start.cjs': 10000,
  'handover-detector.cjs': 10000,
  'session-budget-watchdog.cjs': 10000,
  'drift-detector.cjs': 10000,
  'stale-task-detector.cjs': 10000,
  'channel-auto-start.cjs': 10000,
  'a2a-server-autostart.cjs': 10000,

  // PreToolUse — security/blocking (simple)
  'pre-tool-unified.cjs': 5000,
  'router-tool-lockdown.cjs': 5000,
  'external-content-guard.cjs': 5000,
  'dlp-pretool.cjs': 5000,
  'hybrid-search-enforcer.cjs': 5000,
  'routing-guard.cjs': 5000,
  'write-pretool-bundle.cjs': 5000,
  'conflict-detector.cjs': 5000,
  'validate-skill-invocation.cjs': 5000,
  'reflection-step0-guard.cjs': 5000,
  'heartbeat-step05-check.cjs': 5000,
  'worktree-preflight-check.cjs': 5000,
  'spawn-token-guard.cjs': 5000,
  'finish-only-guard.cjs': 5000,
  'taskupdate-contract-validator.cjs': 5000,
  'creator-compliance-validator.cjs': 5000,
  'pre-spawn-hook-check.cjs': 5000,
  'context-monitor.cjs': 5000,

  // PreToolUse — security/blocking (complex validation/orchestration)
  'bash-pretool-bundle.cjs': 10000,
  'task-pretool-orchestrator.cjs': 10000,
  'pre-completion-validation.cjs': 10000,
  'quality-gate-validator.cjs': 10000,

  // PostToolUse — simple advisory monitoring
  'post-tool-metrics-unified.cjs': 5000,
  'context-window-monitor.cjs': 5000,
  'hook-error-detector.cjs': 5000,
  'recurring-issue-detector.cjs': 5000,
  'subagent-citation-guard.cjs': 5000,
  'bypass-audit-hook.cjs': 5000,

  // PostToolUse — advisory async
  'post-task-unified.cjs': 10000,
  'sync-memory-index.cjs': 10000,
  'agent-registry-auto-refresh.cjs': 10000,
  'code-index-updater.cjs': 10000,
  'post-edit-scanner.cjs': 10000,
  'analysis-paralysis-guard.cjs': 10000,
  'unified-reflection-handler.cjs': 10000,

  // PreCompact (default, overridden by EVENT_DEFAULTS)
  'pre-compact.cjs': 10000,

  // Stop (default, overridden by EVENT_DEFAULTS)
  'check-console-log.cjs': 5000,
  'sanitize-debug-log.cjs': 5000,
};

/**
 * Per-event defaults. For SessionEnd, Stop, and PreCompact, we override the
 * per-script lookup entirely to ensure correct category-level timeouts.
 */
const EVENT_DEFAULTS = {
  SessionEnd: 15000,
  Stop: 5000,
  PreCompact: 10000,
};

/**
 * Script-in-event-specific overrides (highest priority).
 * Key format: "EventName::scriptBasename"
 */
const SPECIFIC_OVERRIDES = {
  'SessionEnd::reflection-queue-processor.cjs': 30000,
};

// ─── Helper ────────────────────────────────────────────────────────────────────

function getScriptBasename(command) {
  const match = (command || '').match(/([^/\\]+\.cjs)(?:\s|$)/);
  return match ? match[1] : null;
}

function determineTimeout(eventName, hook) {
  // Always preserve existing timeout_ms
  if (hook.timeout_ms !== undefined) {
    return hook.timeout_ms;
  }

  const script = getScriptBasename(hook.command || '');

  // Check specific overrides first
  if (script) {
    const specificKey = `${eventName}::${script}`;
    if (SPECIFIC_OVERRIDES[specificKey] !== undefined) {
      return SPECIFIC_OVERRIDES[specificKey];
    }
  }

  // Check event-level defaults (SessionEnd, Stop, PreCompact)
  if (EVENT_DEFAULTS[eventName] !== undefined) {
    return EVENT_DEFAULTS[eventName];
  }

  // Check per-script defaults
  if (script && SCRIPT_TIMEOUTS[script] !== undefined) {
    return SCRIPT_TIMEOUTS[script];
  }

  // Final fallback: 5000ms
  console.warn(`  [WARN] No timeout mapping for ${eventName}::${script} — defaulting to 5000ms`);
  return 5000;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

const raw = fs.readFileSync(SETTINGS_PATH, 'utf8');
const settings = JSON.parse(raw);

let modified = 0;
let preserved = 0;

for (const [eventName, eventHooks] of Object.entries(settings.hooks || {})) {
  if (!Array.isArray(eventHooks)) continue;
  for (const hookGroup of eventHooks) {
    for (const hook of hookGroup.hooks || []) {
      const hadTimeout = hook.timeout_ms !== undefined;
      const newTimeout = determineTimeout(eventName, hook);
      if (!hadTimeout) {
        hook.timeout_ms = newTimeout;
        modified++;
        const script = getScriptBasename(hook.command || '') || hook.command;
        console.log(`  + ${eventName} [${hookGroup.matcher || '*'}] → ${script}: ${newTimeout}ms`);
      } else {
        preserved++;
      }
    }
  }
}

// Write back with same 2-space indentation
fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n');

console.log(
  `\nDone. Added timeout_ms to ${modified} hooks, preserved ${preserved} existing timeouts.`
);
