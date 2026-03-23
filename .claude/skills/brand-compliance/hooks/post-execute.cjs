'use strict';

/**
 * Brand Compliance Skill — Post-Execution Hook
 * Emits observability event to tool-events.jsonl (Iron Law III).
 */

const path = require('path');
const fs = require('fs');
const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');

function postExecute(context = {}) {
  try {
    const sendEventPath = path.resolve(__dirname, '../../../../tools/observability/send-event.cjs');

    if (fs.existsSync(sendEventPath)) {
      const { sendEvent } = require(sendEventPath);
      sendEvent({
        tool_name: 'brand-compliance',
        agent_id: context.agentId || process.env.AGENT_ID || 'unknown',
        session_id: context.sessionId || process.env.SESSION_ID || 'unknown',
        outcome: context.success ? 'success' : 'failure',
        metadata: {
          action: context.action || 'unknown',
          complianceScore: context.complianceScore || null,
          errorCount: context.errorCount || 0,
          warningCount: context.warningCount || 0,
        },
      });
    } else {
      // Fallback: append event directly when send-event.cjs not available
      const eventsPath = path.resolve(__dirname, '../../../../context/runtime/tool-events.jsonl');
      const event = JSON.stringify({
        timestamp: new Date().toISOString(),
        tool_name: 'brand-compliance',
        agent_id: context.agentId || process.env.AGENT_ID || 'unknown',
        session_id: context.sessionId || process.env.SESSION_ID || 'unknown',
        outcome: context.success ? 'success' : 'failure',
      });
      const dir = path.dirname(eventsPath);
      if (fs.existsSync(dir)) {
        fs.appendFileSync(eventsPath, event + '\n', 'utf8');
      }
    }
  } catch (err) {
    // Fail-open — post hooks must not block workflow
    process.stderr.write(`[brand-compliance/post-execute] Event emit error: ${err.message}\n`);
  }
}

// Support stdin-based protocol when run as hook
if (require.main === module) {
  let data = '';
  process.stdin.on('data', chunk => {
    data += chunk;
  });
  process.stdin.on('end', () => {
    try {
      const context = data ? safeParseJSON(data) : {};
      postExecute(context);
      process.stdout.write(JSON.stringify({ allow: true }) + '\n');
      process.exit(0);
    } catch (err) {
      process.stderr.write(`[brand-compliance/post-execute] Parse error: ${err.message}\n`);
      process.exit(0); // fail-open
    }
  });
}

module.exports = { postExecute };
