#!/usr/bin/env node
// Agent: developer | Task: #9 | Session: 2026-03-10
/**
 * Finish-Only Guard Hook (PreToolUse — matcher: TaskCreate|Task)
 *
 * Blocks new TaskCreate/Task spawns when the current session is in drain mode.
 * Fail-open: any error allows the tool call through (drain guard is advisory).
 * SessionId-aware: only blocks if drain-state.json belongs to THIS session.
 */
'use strict';

const path = require('path');

const BLOCKED_TOOLS = new Set(['TaskCreate', 'Task']);
const RUNTIME_DIR = process.env.SHIFT_CHANGE_RUNTIME_DIR || path.join(__dirname, '../../context/runtime');

function main() {
  let input = '';
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const parsed = JSON.parse(input);
      const toolName = parsed.tool_name || parsed.tool || '';

      if (!BLOCKED_TOOLS.has(toolName)) {
        process.stdout.write(JSON.stringify({ allow: true }));
        return;
      }

      // Lazy-require to avoid module load errors crashing the hook
      const { isDraining } = require('../../lib/context/drain-state.cjs');
      const { getOrCreateSessionId } = require('../../lib/context/session-id-manager.cjs');

      const sessionId = getOrCreateSessionId(RUNTIME_DIR);

      if (isDraining(sessionId, RUNTIME_DIR)) {
        process.stdout.write(JSON.stringify({
          allow: false,
          message: `Session is in Finish-Only drain mode (session: ${sessionId}). New task creation is blocked until drain completes or deadline expires. Use TaskUpdate to complete existing tasks.`
        }));
        return;
      }

      process.stdout.write(JSON.stringify({ allow: true }));
    } catch {
      // Fail-open: drain guard errors must not freeze the framework
      process.stdout.write(JSON.stringify({ allow: true }));
    }
  });
}

main();
