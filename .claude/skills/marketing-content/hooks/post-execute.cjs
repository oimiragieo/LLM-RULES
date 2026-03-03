'use strict';

/**
 * post-execute.cjs — marketing-content skill observability
 * Emits structured event to tool-events.jsonl after execution.
 */

const path = require('path');
const fs = require('fs');

function postExecute(context = {}) {
  try {
    const sendEventPath = path.resolve(__dirname, '../../../../tools/observability/send-event.cjs');

    if (fs.existsSync(sendEventPath)) {
      const { sendEvent } = require(sendEventPath);
      sendEvent({
        tool_name: 'marketing-content',
        agent_id: context.agentId || process.env.AGENT_ID || 'unknown',
        session_id: context.sessionId || process.env.SESSION_ID || 'unknown',
        outcome: context.success ? 'success' : 'failure',
        action: context.action || 'unknown',
      });
    } else {
      // Fallback: write event directly
      const eventPath = path.resolve(__dirname, '../../../../context/runtime/tool-events.jsonl');
      const event = {
        timestamp: new Date().toISOString(),
        tool_name: 'marketing-content',
        agent_id: context.agentId || process.env.AGENT_ID || 'unknown',
        session_id: context.sessionId || process.env.SESSION_ID || 'unknown',
        outcome: context.success ? 'success' : 'failure',
        action: context.action || 'unknown',
      };
      fs.appendFileSync(eventPath, JSON.stringify(event) + '\n', 'utf8');
    }
  } catch (err) {
    // Fail-open: post hooks should not break workflow
    process.stderr.write(`[marketing-content/post-execute] Event emit failed: ${err.message}\n`);
  }
}

module.exports = { postExecute };

// CLI support
if (require.main === module) {
  postExecute({ action: 'manual', success: true });
}
