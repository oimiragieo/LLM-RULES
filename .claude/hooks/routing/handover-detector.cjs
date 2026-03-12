const fs = require('fs');
const path = require('path');

const { getOrCreateSessionId } = require('../../lib/context/session-id-manager.cjs');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const {
  readHandoverLog,
  claimHandoverLog,
} = require('../../lib/context/shift-change-log-reader.cjs');
const { exitDrainMode, getDrainState } = require('../../lib/context/drain-state.cjs');

function formatResumeMessage(log) {
  // M8.1: Step 0 pre-flight block — prepended so it has highest attention priority
  let msg = `## SHIFT CHANGE RESUME — MANDATORY PRE-FLIGHT (DO NOT SKIP)\n\n`;
  msg += `**DO NOT call TaskList() until Steps 0–0.5 are fully complete.**\n\n`;
  msg += `Execute in order before routing:\n`;
  msg += `- **Step 0**: Check \`reflection-reminder.txt\` + \`reflection-spawn-request.json\` — spawn reflection-agent for each pending request\n`;
  msg += `- **Step 0.4**: Check \`.claude/context/runtime/stale-tasks.json\` — close each stale task via TaskUpdate before proceeding\n`;
  msg += `- **Step 0.5**: Check \`.claude/context/runtime/integration-queue.jsonl\` — spawn artifact-integrator (background) if entries exist\n\n`;
  msg += `---\n\n`;

  // Handover context
  msg += `SHIFT CHANGE RESUME: ${log.resumeInstructions || log.fallbackInstruction || 'Run TaskList() to discover pending work, check active_context.md'}\n\n`;
  if (log.contextSummary) {
    msg += `Context: ${log.contextSummary}\n\n`;
  }
  if (log.pendingActions && log.pendingActions.length > 0) {
    msg += `Pending:\n`;
    log.pendingActions.forEach(a => {
      msg += `- [${a.priority}] ${a.description}\n`;
    });
  } else if (log.fallbackInstruction) {
    msg += `Fallback: ${log.fallbackInstruction}\n`;
  }
  return msg;
}

function run() {
  try {
    const inputStr = fs.readFileSync(0, 'utf8');
    if (!inputStr) {
      console.log(JSON.stringify({ allow: true }));
      return;
    }

    const runtimeDir = path.join(process.cwd(), '.claude/context/runtime');
    const sessionPath = path.join(runtimeDir, 'session-id.json');

    const logPath = path.join(runtimeDir, 'shift-change-log.json');
    const ackPath = path.join(runtimeDir, 'shift-change-ack.json');

    // FRESH_SPAWN: This window was spawned by a handoff (CLAUDE_FRESH_SPAWN=1 is set
    // in the spawn command). The new window inherits session-id.json from the old
    // session. If it matches the pending handover's source session, clear it so
    // getOrCreateSessionId generates a fresh ID for this session.
    // The old session never has CLAUDE_FRESH_SPAWN set, so it cannot trigger this path.
    // MUST run before the session-id.json existence guard below.
    if (process.env.CLAUDE_FRESH_SPAWN === '1' && fs.existsSync(sessionPath)) {
      try {
        const existingData = safeParseJSON(fs.readFileSync(sessionPath, 'utf8'));
        const logData = fs.existsSync(logPath)
          ? safeParseJSON(fs.readFileSync(logPath, 'utf8'))
          : null;
        if (logData && logData.status === 'READY' && existingData.sessionId === logData.sessionId) {
          fs.unlinkSync(sessionPath);
        }
      } catch (_e) {
        // ignore — fall through to normal flow
      }
    }

    if (fs.existsSync(sessionPath)) {
      console.log(JSON.stringify({ allow: true }));
      return;
    }

    const newSessionId = getOrCreateSessionId(runtimeDir);

    // MT-A: Re-READY timeout recovery (5 mins) for logs stuck in CLAIMED without an ACK
    if (fs.existsSync(logPath)) {
      try {
        const logContent = fs.readFileSync(logPath, 'utf8');
        const existingLog = safeParseJSON(logContent);
        if (existingLog && existingLog.status === 'CLAIMED') {
          if (!fs.existsSync(ackPath)) {
            const stats = fs.statSync(logPath);
            const ageMs = Date.now() - stats.mtimeMs;
            if (ageMs > 5 * 60 * 1000) {
              console.warn(
                `[handover-detector] Found CLAIMED log older than 5 minutes with no ACK. Resetting to READY for recovery.`
              );
              existingLog.status = 'READY';
              // Write recovery status
              fs.writeFileSync(logPath, JSON.stringify(existingLog, null, 2), 'utf8');
            }
          }
        }
      } catch (_e) {
        // ignore parse/stat errors during recovery attempt
      }
    }

    const log = readHandoverLog(runtimeDir);
    if (!log || log.status !== 'READY') {
      console.log(JSON.stringify({ allow: true }));
      return;
    }

    claimHandoverLog(runtimeDir, newSessionId);

    const drainState = getDrainState(runtimeDir);
    if (drainState && drainState.sessionId !== newSessionId) {
      exitDrainMode(runtimeDir);
    }

    if (log.pendingMemoryWrites && log.pendingMemoryWrites.length > 0) {
      const memoryDir = path.join(process.cwd(), '.claude/context/memory');
      if (!fs.existsSync(memoryDir)) fs.mkdirSync(memoryDir, { recursive: true });
      const inboxPath = path.join(memoryDir, 'handoff_inbox.md');

      const header = `\n### Memory items from session ${log.sessionId} (Resumed by ${newSessionId} at ${new Date().toISOString()})\n`;
      const writes = header + log.pendingMemoryWrites.map(w => `- ${w}\n`).join('');
      fs.appendFileSync(inboxPath, writes, 'utf8');
    }

    // Write sentinel ACK for M5.3
    fs.writeFileSync(
      ackPath,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          claimedBy: newSessionId,
          originalSession: log.sessionId,
        },
        null,
        2
      ),
      'utf8'
    );

    const message = formatResumeMessage(log);
    console.log(JSON.stringify({ allow: true, message }));
  } catch (_error) {
    console.log(JSON.stringify({ allow: true }));
  }
}

run();
