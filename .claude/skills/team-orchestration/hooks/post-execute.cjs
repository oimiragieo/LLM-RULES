'use strict';

/**
 * team-orchestration/hooks/post-execute.cjs
 * Records pipeline phase completion event.
 */

const path = require('path');
const fs = require('fs');

function postExecute(context = {}) {
  const eventLogPath = path.resolve(__dirname, '../../../../context/runtime/tool-events.jsonl');
  const event = {
    timestamp: new Date().toISOString(),
    tool_name: 'team-orchestration',
    agent_id: context.agentId || process.env.AGENT_ID || 'unknown',
    session_id: context.sessionId || process.env.SESSION_ID || 'unknown',
    outcome: context.success !== false ? 'success' : 'failure',
    metadata: {
      phase: context.phase || 'unknown',
      taskId: context.taskId || 'unknown',
      phasesCompleted: context.phasesCompleted || [],
    },
  };

  try {
    const dir = path.dirname(eventLogPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(eventLogPath, JSON.stringify(event) + '\n', 'utf8');
  } catch (err) {
    process.stderr.write(`[team-orchestration/post-execute] Event write failed: ${err.message}\n`);
  }
}

module.exports = { postExecute };

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', d => (raw += d));
  process.stdin.on('end', () => {
    let ctx = {};
    try {
      ctx = JSON.parse(raw);
    } catch (_err) {
      /* non-JSON stdin ignored */
    }
    postExecute(ctx);
    process.exit(0);
  });
}
