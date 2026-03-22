#!/usr/bin/env node
/**
 * Hook Trace Logger (OBS-001)
 * ============================
 *
 * Structured NDJSON logging for hooks with checkedBy field support.
 * Inspired by node9-proxy audit log patterns.
 *
 * Each entry records WHICH specific check/rule in a hook made the decision,
 * enabling analytics: "which rules fire most?", "which agents trigger blocks?"
 *
 * Usage:
 *   const { createHookTracer } = require('./hook-trace.cjs');
 *   const trace = createHookTracer('routing-guard');
 *
 *   trace.decision('Task', 'specialist-routing:developer→code-simplifier', 'block', {
 *     agent: 'developer', suggested: 'code-simplifier'
 *   });
 *
 *   trace.allow('Write', 'creator-guard:active-creator-session');
 *   trace.block('Edit', 'creator-guard:no-active-creator', { path: '.claude/skills/...' });
 *   trace.error('Bash', new Error('parse failed'), { command: 'rm -rf' });
 */

'use strict';

const crypto = require('crypto');
const { appendJsonl } = require('./jsonl-utils.cjs');
const { redactObject } = require('./redact-secrets.cjs');

const TRACE_FILE = '.claude/context/runtime/hook-trace.jsonl';
const MAX_LINES = 5000;

/**
 * Create a hook tracer for a specific hook.
 *
 * @param {string} hookName - Name of the hook (e.g. 'routing-guard', 'creator-guard')
 * @returns {Object} Tracer with decision(), allow(), block(), error() methods
 */
function createHookTracer(hookName) {
  const correlationId = crypto.randomUUID();

  /**
   * Log a hook decision with checkedBy field.
   *
   * @param {string} tool - Tool being evaluated (e.g. 'Task', 'Write', 'Bash')
   * @param {string} checkedBy - Which specific check/rule fired (e.g. 'specialist-routing:planner-first')
   * @param {'allow'|'block'|'warn'|'error'} decision - The decision made
   * @param {Object} [metadata] - Additional context (will be redacted before logging)
   */
  function decision(tool, checkedBy, decisionType, metadata) {
    const entry = {
      ts: new Date().toISOString(),
      hook: hookName,
      cid: correlationId,
      tool: tool || 'unknown',
      checkedBy: checkedBy || 'unknown',
      decision: decisionType || 'allow',
    };

    if (metadata && typeof metadata === 'object') {
      entry.meta = redactObject(metadata);
    }

    appendJsonl(TRACE_FILE, entry, { maxLines: MAX_LINES });
  }

  /** Shorthand for allow decision */
  function allow(tool, checkedBy, metadata) {
    decision(tool, checkedBy || `${hookName}:pass`, 'allow', metadata);
  }

  /** Shorthand for block decision */
  function block(tool, checkedBy, metadata) {
    decision(tool, checkedBy || `${hookName}:block`, 'block', metadata);
  }

  /** Shorthand for warn decision */
  function warn(tool, checkedBy, metadata) {
    decision(tool, checkedBy || `${hookName}:warn`, 'warn', metadata);
  }

  /** Log a hook error */
  function error(tool, err, metadata) {
    const entry = {
      ts: new Date().toISOString(),
      hook: hookName,
      cid: correlationId,
      tool: tool || 'unknown',
      checkedBy: `${hookName}:error`,
      decision: 'error',
      error: err instanceof Error ? err.message : String(err || ''),
    };

    if (metadata && typeof metadata === 'object') {
      entry.meta = redactObject(metadata);
    }

    appendJsonl(TRACE_FILE, entry, { maxLines: MAX_LINES });
  }

  return {
    correlationId,
    decision,
    allow,
    block,
    warn,
    error,
  };
}

module.exports = {
  createHookTracer,
  TRACE_FILE,
  MAX_LINES,
};
