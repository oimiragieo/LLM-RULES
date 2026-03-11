const fs = require('fs');
const path = require('path');
const { isDraining } = require('../../lib/context/drain-state.cjs');

function getSessionId() {
  if (process.env.CLAUDE_SESSION_ID) {
    return process.env.CLAUDE_SESSION_ID;
  }
  const sessionPath = path.join(process.cwd(), '.claude/context/runtime/session-id.json');
  if (fs.existsSync(sessionPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
      if (data.sessionId) return data.sessionId;
    } catch (_e) {
      /* empty */
    }
  }
  return null;
}

function run() {
  try {
    const inputStr = fs.readFileSync(0, 'utf8');
    if (!inputStr) {
      console.log(JSON.stringify({ allow: true }));
      return;
    }

    const input = JSON.parse(inputStr);

    if (input.tool_name !== 'TaskCreate' && input.tool_name !== 'Task') {
      console.log(JSON.stringify({ allow: true }));
      return;
    }

    const sessionId = getSessionId();
    if (sessionId && isDraining(sessionId)) {
      console.log(
        JSON.stringify({
          allow: false,
          message: 'Session is draining. Please finish current tasks and do not create new ones.',
        })
      );
      return;
    }

    console.log(JSON.stringify({ allow: true }));
  } catch (_error) {
    // Fail-open
    console.log(JSON.stringify({ allow: true }));
  }
}

run();
