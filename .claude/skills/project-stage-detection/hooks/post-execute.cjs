'use strict';

/**
 * project-stage-detection/hooks/post-execute.cjs
 * Records project stage detection event and detected stage.
 */

const path = require('path');
const fs = require('fs');
const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');

function postExecute(context = {}) {
  const eventLogPath = path.resolve(__dirname, '../../../../context/runtime/tool-events.jsonl');
  const event = {
    timestamp: new Date().toISOString(),
    tool_name: 'project-stage-detection',
    agent_id: context.agentId || process.env.AGENT_ID || 'unknown',
    session_id: context.sessionId || process.env.SESSION_ID || 'unknown',
    outcome: context.success !== false ? 'success' : 'failure',
    metadata: {
      stage: context.stage || 'unknown',
      confidence: context.confidence || 0,
      projectRoot: context.projectRoot || 'unknown',
    },
  };

  try {
    const dir = path.dirname(eventLogPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(eventLogPath, JSON.stringify(event) + '\n', 'utf8');
  } catch (err) {
    process.stderr.write(
      `[project-stage-detection/post-execute] Event write failed: ${err.message}\n`
    );
  }
}

module.exports = { postExecute };

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', d => (raw += d));
  process.stdin.on('end', () => {
    let ctx = {};
    try {
      ctx = safeParseJSON(raw);
    } catch (_err) {
      /* non-JSON stdin ignored */
    }
    postExecute(ctx);
    process.exit(0);
  });
}
