'use strict';

/**
 * Post-execution hook for transcription skill.
 * Emits observability event to tool-events.jsonl.
 */

const path = require('path');
const fs = require('fs');

function postExecute(context = {}) {
  try {
    const sendEventPath = path.resolve(__dirname, '../../../../tools/observability/send-event.cjs');

    if (fs.existsSync(sendEventPath)) {
      const { sendEvent } = require(sendEventPath);
      sendEvent({
        tool_name: 'transcription',
        agent_id: context.agentId || process.env.AGENT_ID || 'unknown',
        session_id: context.sessionId || process.env.SESSION_ID || 'unknown',
        outcome: context.success ? 'success' : 'failure',
        metadata: {
          model: context.model || 'unknown',
          backend: context.backend || 'unknown',
          inputType: context.inputType || 'unknown',
        },
      });
    } else {
      // Fallback: append directly to tool-events.jsonl
      const eventsPath = path.resolve(__dirname, '../../../../context/runtime/tool-events.jsonl');
      const event = JSON.stringify({
        timestamp: new Date().toISOString(),
        tool_name: 'transcription',
        agent_id: context.agentId || process.env.AGENT_ID || 'unknown',
        session_id: context.sessionId || process.env.SESSION_ID || 'unknown',
        outcome: context.success ? 'success' : 'failure',
      });
      fs.appendFileSync(eventsPath, event + '\n');
    }
  } catch (err) {
    // Fail-open — post hooks must not block workflow
    process.stderr.write(
      `[post-execute:transcription] Event emit failed (fail-open): ${err.message}\n`
    );
  }
}

module.exports = { postExecute };
