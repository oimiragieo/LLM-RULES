const fs = require('fs');
const path = require('path');
const { getOrCreateSessionId } = require('../../lib/context/session-id-manager.cjs');
const {
  readHandoverLog,
  claimHandoverLog,
} = require('../../lib/context/shift-change-log-reader.cjs');
const { exitDrainMode, getDrainState } = require('../../lib/context/drain-state.cjs');

function formatResumeMessage(log) {
  let msg = `SHIFT CHANGE RESUME: ${log.resumeInstructions || 'No specific resume instructions provided.'}\n\n`;
  if (log.contextSummary) {
    msg += `Context: ${log.contextSummary}\n\n`;
  }
  if (log.pendingActions && log.pendingActions.length > 0) {
    msg += `Pending:\n`;
    log.pendingActions.forEach(a => {
      msg += `- [${a.priority}] ${a.description}\n`;
    });
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
    if (fs.existsSync(sessionPath)) {
      console.log(JSON.stringify({ allow: true }));
      return;
    }

    const newSessionId = getOrCreateSessionId(runtimeDir);

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
    const ackPath = path.join(runtimeDir, 'shift-change-ack.json');
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
