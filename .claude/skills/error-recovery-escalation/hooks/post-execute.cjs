#!/usr/bin/env node
// error-recovery-escalation/hooks/post-execute.cjs
'use strict';

const path = require('path');

function postExecute(context = {}) {
  try {
    const sendEvent = require(
      path.resolve(__dirname, '../../../../tools/observability/send-event.cjs')
    );
    sendEvent({
      tool_name: 'error-recovery-escalation',
      agent_id: context.agentId || process.env.AGENT_ID || 'unknown',
      session_id: context.sessionId || process.env.SESSION_ID || 'unknown',
      outcome: context.success ? 'success' : 'failure',
      metadata: {
        level: context.level || 0,
        action: context.action || 'unknown',
        errorType: context.errorType || 'unknown',
        partial: context.partial || false,
        escalationPath: context.escalationPath || [],
      },
    });
  } catch {
    process.stderr.write('[error-recovery-escalation/post-execute] send-event unavailable\n');
  }
}

if (require.main === module) {
  postExecute({ success: true });
  process.exit(0);
}

module.exports = { postExecute };
