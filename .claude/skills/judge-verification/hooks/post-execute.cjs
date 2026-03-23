#!/usr/bin/env node
// judge-verification/hooks/post-execute.cjs
'use strict';

const path = require('path');

function postExecute(context = {}) {
  try {
    const sendEvent = require(
      path.resolve(__dirname, '../../../../tools/observability/send-event.cjs')
    );
    sendEvent({
      tool_name: 'judge-verification',
      agent_id: context.agentId || process.env.AGENT_ID || 'unknown',
      session_id: context.sessionId || process.env.SESSION_ID || 'unknown',
      outcome: context.success ? 'success' : 'failure',
      metadata: {
        verdict: context.verdict || 'unknown',
        confidence: context.confidence || 0,
        totalScore: context.totalScore || 0,
      },
    });
  } catch {
    process.stderr.write('[judge-verification/post-execute] send-event unavailable\n');
  }
}

if (require.main === module) {
  postExecute({ success: true });
  process.exit(0);
}

module.exports = { postExecute };
