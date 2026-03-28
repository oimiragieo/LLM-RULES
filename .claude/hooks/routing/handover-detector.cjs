const fs = require('fs');
const path = require('path');

const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const { getOrCreateSessionId } = require('../../lib/context/session-id-manager.cjs');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const {
  readHandoverLog,
  claimHandoverLog,
} = require('../../lib/context/shift-change-log-reader.cjs');
const { exitDrainMode, getDrainState } = require('../../lib/context/drain-state.cjs');

function formatResumeInstructions(resumeInstructions) {
  // Handle both structured JSON (v2.0.0) and legacy string (v1.0.0) formats
  if (typeof resumeInstructions === 'string') {
    // Legacy format — return as-is
    return resumeInstructions;
  }
  if (resumeInstructions && typeof resumeInstructions === 'object') {
    // Structured format — render each field
    let out = '';
    if (resumeInstructions.objective) {
      out += `**Objective:** ${resumeInstructions.objective}\n\n`;
    }
    if (resumeInstructions.nextStep) {
      out += `**Next Step:** ${resumeInstructions.nextStep}\n\n`;
    }
    if (resumeInstructions.openTasks && resumeInstructions.openTasks.length > 0) {
      out += `**Open Tasks:**\n`;
      resumeInstructions.openTasks.forEach(t => {
        out += `- ${t}\n`;
      });
      out += '\n';
    }
    if (resumeInstructions.keyFiles && resumeInstructions.keyFiles.length > 0) {
      out += `**Key Files:**\n`;
      resumeInstructions.keyFiles.forEach(f => {
        out += `- ${f}\n`;
      });
      out += '\n';
    }
    if (resumeInstructions.recentDecisions && resumeInstructions.recentDecisions.length > 0) {
      out += `**Recent Decisions:**\n`;
      resumeInstructions.recentDecisions.forEach(d => {
        out += `- ${d}\n`;
      });
      out += '\n';
    }
    if (resumeInstructions.risks && resumeInstructions.risks.length > 0) {
      out += `**Risks:**\n`;
      resumeInstructions.risks.forEach(r => {
        out += `- ${r}\n`;
      });
      out += '\n';
    }
    if (resumeInstructions.resumePrompt) {
      out += `${resumeInstructions.resumePrompt}\n`;
    }
    return out.trim() || 'Run TaskList() to discover pending work.';
  }
  return 'Run TaskList() to discover pending work, check active_context.md';
}

function formatResumeMessage(log) {
  // CRITICAL FIX (2026-03-18): NEXT ACTION goes FIRST, pre-flight SECOND.
  // Previous bug: pre-flight reflections consumed all context before the new
  // session ever reached the actual work directive. The new session would process
  // 10+ stale reflections and then sit idle.
  let msg = `## SHIFT CHANGE RESUME\n\n`;

  // 1. ACTION FIRST — what to do immediately
  const formattedInstructions = formatResumeInstructions(log.resumeInstructions);
  msg += `### IMMEDIATE ACTION\n\n`;
  msg += `${formattedInstructions || log.fallbackInstruction || 'Read .claude/context/memory/active_context.md and execute the NEXT ACTION (IMMEDIATE) at the top.'}\n\n`;
  if (log.contextSummary) {
    msg += `Context: ${log.contextSummary}\n\n`;
  }
  if (log.pendingActions && log.pendingActions.length > 0) {
    msg += `Pending:\n`;
    log.pendingActions.forEach(a => {
      msg += `- [${a.priority}] ${a.description}\n`;
    });
    msg += '\n';
  } else if (log.fallbackInstruction) {
    msg += `Fallback: ${log.fallbackInstruction}\n\n`;
  }

  // 2. PRE-FLIGHT SECOND — handle in background or skip on handoff
  msg += `---\n\n`;
  msg += `### Pre-flight (BACKGROUND — do NOT block on these)\n\n`;
  msg += `Clear reflection queue by writing \`[]\` to \`reflection-spawn-request.json\` (stale from previous session). `;
  msg += `Check \`stale-tasks.json\` and close any entries. `;
  msg += `These are from the OLD session — do not let them delay the IMMEDIATE ACTION above.\n`;
  return msg;
}

function run() {
  try {
    const inputStr = fs.readFileSync(0, 'utf8');
    if (!inputStr) {
      console.log(JSON.stringify({ allow: true }));
      return;
    }

    const runtimeDir = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
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
      const memoryDir = path.join(PROJECT_ROOT, '.claude', 'context', 'memory');
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
