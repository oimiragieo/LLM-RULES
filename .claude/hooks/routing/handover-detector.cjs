#!/usr/bin/env node
// Agent: developer | Task: #10 | Session: 2026-03-10
/**
 * Handover Detector Hook (UserPromptSubmit)
 *
 * Detects fresh sessions that have an existing READY handover log and injects
 * resume context into the session. Mirrors the reflection-reminder.txt pattern.
 *
 * Behavior:
 * 1. If session-id.json already exists → not a fresh session → allow, exit
 * 2. Generate new sessionId
 * 3. Read handover log — if none or not READY → allow, exit
 * 4. Claim the log (READY → CLAIMED)
 * 5. Clear stale drain-state.json from old session
 * 6. Process pendingMemoryWrites (append to decisions.md)
 * 7. Inject resume context message
 *
 * Fail-open on all errors (advisory hook).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const RUNTIME_DIR = process.env.SHIFT_CHANGE_RUNTIME_DIR || path.join(__dirname, '../../context/runtime');
const SESSION_ID_FILE = path.join(RUNTIME_DIR, 'session-id.json');
const MEMORY_DIR = path.join(__dirname, '../../context/memory');

function formatResumeMessage(log) {
  const lines = ['=== SHIFT CHANGE RESUME ==='];
  lines.push(`Objective: ${log.currentObjective}`);
  if (log.contextSummary) {
    lines.push(`Context: ${log.contextSummary}`);
  }
  if (log.resumeInstructions) {
    lines.push(`Instructions: ${log.resumeInstructions}`);
  }
  if (log.pendingActions && log.pendingActions.length > 0) {
    lines.push('Pending actions:');
    for (const action of log.pendingActions) {
      lines.push(`  [${action.priority.toUpperCase()}] ${action.description} (task: ${action.taskId})`);
    }
  }
  if (log.memoryPointers && log.memoryPointers.length > 0) {
    lines.push('Memory pointers:');
    for (const mp of log.memoryPointers) {
      lines.push(`  ${mp.file} → ${mp.key}: ${mp.summary}`);
    }
  }
  lines.push('=== END SHIFT CHANGE RESUME ===');
  return lines.join('\n');
}

function processPendingMemoryWrites(writes) {
  if (!Array.isArray(writes) || writes.length === 0) return;
  const decisionsPath = path.join(MEMORY_DIR, 'decisions.md');
  try {
    const entries = writes.map(w => `\n- [shift-change handover] ${w}`).join('');
    fs.appendFileSync(decisionsPath, entries, 'utf8');
  } catch { /* non-critical */ }
}

function main() {
  process.stdin.resume();
  process.stdin.on('end', () => {
    try {
      // If session-id.json exists, this is NOT a fresh session
      if (fs.existsSync(SESSION_ID_FILE)) {
        process.stdout.write(JSON.stringify({ allow: true }));
        return;
      }

      const { getOrCreateSessionId } = require('../../lib/context/session-id-manager.cjs');
      const { readHandoverLog, claimHandoverLog } = require('../../lib/context/shift-change-log-reader.cjs');
      const { exitDrainMode, getDrainState } = require('../../lib/context/drain-state.cjs');

      const newSessionId = getOrCreateSessionId(RUNTIME_DIR);

      const log = readHandoverLog(RUNTIME_DIR);
      if (!log) {
        process.stdout.write(JSON.stringify({ allow: true }));
        return;
      }

      // Claim the log
      claimHandoverLog(RUNTIME_DIR, newSessionId);

      // Clear stale drain state from old session
      const drainState = getDrainState(RUNTIME_DIR);
      if (drainState && drainState.sessionId !== newSessionId) {
        exitDrainMode(RUNTIME_DIR);
      }

      // Process pending memory writes
      processPendingMemoryWrites(log.pendingMemoryWrites);

      const message = formatResumeMessage(log);

      process.stdout.write(JSON.stringify({
        allow: true,
        message
      }));
    } catch {
      // Fail-open on all errors
      process.stdout.write(JSON.stringify({ allow: true }));
    }
  });
}

main();
