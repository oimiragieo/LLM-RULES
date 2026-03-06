'use strict';

const path = require('path');

/**
 * Post-execute hook for lsp-navigator.
 * Emits a structured observability event after LSP operations complete.
 *
 * Appends to .claude/context/runtime/tool-events.jsonl
 */

function postExecute(context = {}) {
  try {
    const sendEventPath = path.resolve(__dirname, '../../../../tools/observability/send-event.cjs');

    // Attempt to use centralized event emitter; fail-open if unavailable
    try {
      const { sendEvent } = require(sendEventPath);
      sendEvent({
        tool_name: 'lsp-navigator',
        agent_id: context.agentId || process.env.AGENT_ID || 'unknown',
        session_id: context.sessionId || process.env.SESSION_ID || 'unknown',
        outcome: context.success ? 'success' : 'failure',
        operation: context.operation || 'unknown',
      });
    } catch (_sendErr) {
      // send-event not available; write directly to tool-events.jsonl
      const fs = require('fs');
      const eventsPath = path.resolve(__dirname, '../../../../context/runtime/tool-events.jsonl');
      const entry = JSON.stringify({
        timestamp: new Date().toISOString(),
        tool_name: 'lsp-navigator',
        agent_id: context.agentId || process.env.AGENT_ID || 'unknown',
        session_id: context.sessionId || process.env.SESSION_ID || 'unknown',
        outcome: context.success ? 'success' : 'failure',
        operation: context.operation || 'unknown',
      });
      try {
        fs.appendFileSync(eventsPath, entry + '\n');
      } catch (_writeErr) {
        // Fail-open: post hook must never block execution
      }
    }
  } catch (_err) {
    // Fail-open: post hook errors must not block the tool pipeline
  }

  return { continue: true };
}

module.exports = { postExecute };
