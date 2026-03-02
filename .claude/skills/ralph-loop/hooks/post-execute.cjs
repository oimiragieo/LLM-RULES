'use strict';

/**
 * ralph-loop post-execute hook
 * Emits observability event via centralized send-event.cjs.
 * Iron Law III: Observability & Event Tracking (The Audit Trail)
 */

const path = require('path');

function postExecute(_context = {}) {
  try {
    const { sendEvent } = require(
      path.resolve(__dirname, '../../../../tools/observability/send-event.cjs')
    );

    sendEvent({
      tool_name: _context.skillName || 'ralph-loop',
      agent_id: _context.agentId || process.env.AGENT_ID || 'unknown',
      session_id: _context.sessionId || process.env.SESSION_ID || 'unknown',
      outcome: _context.success ? 'success' : 'failure',
    });
  } catch (err) {
    process.stderr.write(`[ralph-loop:post-execute] Event emission failed: ${err.message}\n`);
  }
}

module.exports = { postExecute };
