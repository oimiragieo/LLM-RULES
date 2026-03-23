'use strict';

/**
 * instinct-learning — post-execute hook
 * Emits observability event after skill execution.
 */

const path = require('path');

function postExecute(context = {}) {
  try {
    const { sendEvent } = require(
      path.resolve(__dirname, '../../../../tools/observability/send-event.cjs')
    );
    sendEvent({
      tool_name: 'instinct-learning',
      agent_id: context.agentId || process.env.AGENT_ID || 'unknown',
      session_id: context.sessionId || process.env.SESSION_ID || 'unknown',
      outcome: context.success ? 'success' : 'failure',
    });
  } catch {
    // fail-open — observability must not block execution
  }
}

// stdin hook protocol
let _inputData = '';
process.stdin.on('data', chunk => {
  _inputData += chunk;
});
process.stdin.on('end', () => {
  try {
    postExecute({ success: true });
  } catch {
    // fail-open
  }
  process.exit(0);
});

module.exports = { postExecute };
