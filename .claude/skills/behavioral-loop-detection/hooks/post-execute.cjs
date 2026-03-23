#!/usr/bin/env node
// behavioral-loop-detection/hooks/post-execute.cjs
'use strict';

const path = require('path');

function postExecute(context = {}) {
  try {
    const sendEvent = require(
      path.resolve(__dirname, '../../../../tools/observability/send-event.cjs')
    );
    sendEvent({
      tool_name: 'behavioral-loop-detection',
      agent_id: context.agentId || process.env.AGENT_ID || 'unknown',
      session_id: context.sessionId || process.env.SESSION_ID || 'unknown',
      outcome: context.success ? 'success' : 'failure',
      metadata: {
        loopDetected: context.loopDetected || false,
        escalationLevel: context.escalationLevel || 0,
        runLength: context.runLength || 0,
      },
    });
  } catch {
    // Fail open — observability is advisory
    process.stderr.write('[behavioral-loop-detection/post-execute] send-event unavailable\n');
  }
}

if (require.main === module) {
  postExecute({ success: true });
  process.exit(0);
}

module.exports = { postExecute };
