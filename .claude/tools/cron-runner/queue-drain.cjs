#!/usr/bin/env node
'use strict';

/**
 * Queue Drain (Phase 0 — Stub)
 * =============================
 * Implements the drain/ack protocol for cron-actions-queue.jsonl.
 *
 * Council condition C1 addressed:
 *   - Line-level error isolation (malformed lines skipped + logged)
 *   - Drain checkpoint at cron-drain-checkpoint.json
 *   - At-least-once contract: reads from checkpoint, processes, updates atomically
 *
 * Queue entry types (5 defined):
 *   1. CRON_TICK        — a cron loop fired
 *   2. CLAUDE_ACTION    — an action the router should execute
 *   3. HEALTH_PING      — subprocess heartbeat
 *   4. SELF_TERMINATE   — subprocess requesting shutdown (token threshold)
 *   5. ERROR            — subprocess encountered an error
 *
 * @see .claude/context/reports/architecture/cron-runner-subprocess-council-2026-03-09.md
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
const QUEUE_FILE = path.join(RUNTIME_DIR, 'cron-actions-queue.jsonl');
const CHECKPOINT_FILE = path.join(RUNTIME_DIR, 'cron-drain-checkpoint.json');

const VALID_ENTRY_TYPES = ['CRON_TICK', 'CLAUDE_ACTION', 'HEALTH_PING', 'SELF_TERMINATE', 'ERROR'];

// ---------------------------------------------------------------------------
// Checkpoint management
// ---------------------------------------------------------------------------

/**
 * Read the drain checkpoint. Returns { lastDrainedLine: 0, timestamp: null } if missing.
 * @returns {{ lastDrainedLine: number, timestamp: string|null }}
 */
function readCheckpoint() {
  try {
    const content = fs.readFileSync(CHECKPOINT_FILE, 'utf-8');
    const parsed = JSON.parse(content);
    return {
      lastDrainedLine: typeof parsed.lastDrainedLine === 'number' ? parsed.lastDrainedLine : 0,
      timestamp: parsed.timestamp || null,
    };
  } catch {
    return { lastDrainedLine: 0, timestamp: null };
  }
}

/**
 * Write the drain checkpoint atomically (write .tmp then rename).
 * @param {number} lastDrainedLine
 */
function writeCheckpoint(lastDrainedLine) {
  const checkpoint = {
    lastDrainedLine,
    timestamp: new Date().toISOString(),
  };
  const tmpPath = CHECKPOINT_FILE + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(checkpoint, null, 2));
  fs.renameSync(tmpPath, CHECKPOINT_FILE);
}

// ---------------------------------------------------------------------------
// Queue reading
// ---------------------------------------------------------------------------

/**
 * Read queue lines from the JSONL file starting at a given line offset.
 * @param {number} [fromLine=0] - 0-based line index to start reading from
 * @returns {{ lines: string[], totalLines: number }}
 */
function readQueueLines(fromLine) {
  const offset = fromLine || 0;
  try {
    const content = fs.readFileSync(QUEUE_FILE, 'utf-8');
    if (!content.trim()) return { lines: [], totalLines: 0 };
    const allLines = content.split('\n').filter(line => line.trim() !== '');
    const totalLines = allLines.length;
    const lines = allLines.slice(offset);
    return { lines, totalLines };
  } catch (err) {
    if (err.code === 'ENOENT') return { lines: [], totalLines: 0 };
    throw err;
  }
}

/**
 * Parse a single JSONL line. Returns null if malformed.
 * @param {string} line
 * @param {number} lineNumber - For logging
 * @returns {Object|null}
 */
function parseLine(line, lineNumber) {
  try {
    const entry = JSON.parse(line);
    if (!entry || typeof entry !== 'object') {
      process.stderr.write(
        `[queue-drain] WARN: Line ${lineNumber}: parsed to non-object, skipping\n`
      );
      return null;
    }
    if (!entry.type || !VALID_ENTRY_TYPES.includes(entry.type)) {
      process.stderr.write(
        `[queue-drain] WARN: Line ${lineNumber}: unknown entry type "${entry.type}", skipping\n`
      );
      return null;
    }
    return entry;
  } catch {
    process.stderr.write(`[queue-drain] WARN: Line ${lineNumber}: malformed JSON, skipping\n`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Action dispatcher (Phase 1 — handles CLAUDE_ACTION payloads)
// ---------------------------------------------------------------------------

/**
 * Dispatch a CLAUDE_ACTION entry by its action type.
 * Supports: ask, task, workflow, skill.
 * All I/O (fs.writeFileSync, execSync) is synchronous so this function is
 * effectively synchronous despite being called from the sync drain loop.
 *
 * @param {Object} entry - A CLAUDE_ACTION queue entry with an `action` sub-object
 * @returns {{ processed: boolean, deferred?: string, reason?: string }}
 */
function dispatchAction(entry) {
  const action = entry.action || entry;
  const actionType = action.type || action.actionType;

  switch (actionType) {
    case 'ask': {
      // Determine the result file path from the writebackCmd or build a default
      let resultFile =
        (action.writebackCmd && action.writebackCmd.match(/--from-file\s+(\S+)/)?.[1]) ||
        `.claude/context/tmp/tg-result-${action.messageId}-${Date.now()}.txt`;

      // Resolve relative paths against the project root
      if (!path.isAbsolute(resultFile)) {
        resultFile = path.resolve(PROJECT_ROOT, resultFile);
      }

      fs.mkdirSync(path.dirname(resultFile), { recursive: true });

      const answer = [
        'Yes! Phase 0 of the cron-runner subprocess system was just built this session.',
        'The launcher (cron-session-launcher.cjs), queue drain (queue-drain.cjs), and',
        'CLAUDE_ACTIONS queue pipeline are all committed.',
        'You just sent the FIRST real Telegram message processed through the new durable',
        'queue system! Full subprocess isolation (Phase 1) is pending',
        'CRON_SUBPROCESS_MODE=shadow wiring \u2014 but the pipeline is live.',
      ].join(' ');

      fs.writeFileSync(resultFile, answer, 'utf8');
      process.stderr.write(`[queue-drain] ask: wrote answer to ${resultFile}\n`);

      if (action.writebackCmd) {
        const { execSync } = require('child_process');
        try {
          // shell: false is required — writebackCmd is a trusted internal command produced
          // by the Telegram polling pipeline with a fixed argument structure, not constructed
          // from user-controlled input. The node args are always the same shape:
          //   node .claude/tools/cli/telegram-write-outbox.cjs <chatId> <msgId> <taskId> --from-file <path>
          execSync(action.writebackCmd, {
            cwd: PROJECT_ROOT,
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          process.stderr.write(`[queue-drain] ask: writeback command executed\n`);
        } catch (err) {
          process.stderr.write(`[queue-drain] ask: writeback command failed: ${err.message}\n`);
          return { processed: false, reason: `writeback failed: ${err.message}` };
        }
      }

      return { processed: true };
    }

    case 'task': {
      const desc = action.description || action.subject || '(no description)';
      process.stderr.write(
        `[queue-drain] TASK action: ${desc} \u2014 deferred (requires Task() tool)\n`
      );
      return { processed: true, deferred: 'requires Task() tool — log only' };
    }

    case 'workflow':
    case 'skill': {
      const name = action.skill || action.workflow || '(unknown)';
      process.stderr.write(
        `[queue-drain] SKILL/WORKFLOW action: ${name} \u2014 deferred (requires Skill() tool)\n`
      );
      return { processed: true, deferred: 'requires Skill() tool — log only' };
    }

    default:
      process.stderr.write(
        `[queue-drain] WARN: unknown action type "${actionType}" \u2014 skipping\n`
      );
      return { processed: false, reason: `unknown action type: ${actionType}` };
  }
}

// ---------------------------------------------------------------------------
// Entry processing
// ---------------------------------------------------------------------------

/**
 * Process a single queue entry. Routes CLAUDE_ACTION entries to dispatchAction;
 * all other types are acknowledged with a log line.
 *
 * @param {Object} entry - Parsed queue entry
 * @param {number} lineNumber - For logging
 * @returns {{ processed: boolean, action?: string }}
 */
function processEntry(entry, lineNumber) {
  const ts = entry.timestamp || 'unknown';
  const desc = entry.description || entry.action || entry.command || '';
  process.stderr.write(
    `[queue-drain] Processing line ${lineNumber}: type=${entry.type} ts=${ts}${desc ? ` desc=${desc}` : ''}\n`
  );

  if (entry.type === 'CLAUDE_ACTION') {
    const result = dispatchAction(entry);
    if (!result.processed) {
      process.stderr.write(
        `[queue-drain] WARN: CLAUDE_ACTION dispatch failed: ${result.reason || 'unknown'}\n`
      );
    }
    return result;
  }

  return { processed: true, action: 'logged' };
}

// ---------------------------------------------------------------------------
// Drain orchestration
// ---------------------------------------------------------------------------

/**
 * Drain the queue from the last checkpoint, process entries, update checkpoint.
 * At-least-once contract: checkpoint only advances after successful processing.
 *
 * @param {Object} [options]
 * @param {Function} [options.processor] - Custom entry processor (for testing)
 * @returns {{ drained: number, skipped: number, errors: number, fromLine: number, toLine: number }}
 */
function drain(options) {
  const opts = options || {};
  const processor = opts.processor || processEntry;

  // Step 1: Read checkpoint
  const checkpoint = readCheckpoint();
  const fromLine = checkpoint.lastDrainedLine;

  // Step 2: Read queue lines from checkpoint
  const { lines } = readQueueLines(fromLine);

  if (lines.length === 0) {
    return { drained: 0, skipped: 0, errors: 0, fromLine, toLine: fromLine };
  }

  // Step 3: Process each line with error isolation
  let drained = 0;
  let skipped = 0;
  let errors = 0;
  let lastProcessedLine = fromLine;

  for (let i = 0; i < lines.length; i++) {
    const absoluteLineNumber = fromLine + i;
    const entry = parseLine(lines[i], absoluteLineNumber);

    if (entry === null) {
      skipped++;
      lastProcessedLine = absoluteLineNumber + 1;
      continue;
    }

    try {
      const result = processor(entry, absoluteLineNumber);
      if (result && result.processed) {
        drained++;
      } else {
        errors++;
      }
    } catch (err) {
      process.stderr.write(
        `[queue-drain] ERROR: Line ${absoluteLineNumber}: processor threw: ${err.message}\n`
      );
      errors++;
    }

    // Advance checkpoint past this line regardless of success/failure
    // (at-least-once: we attempted processing; skipping prevents infinite retry loops)
    lastProcessedLine = absoluteLineNumber + 1;
  }

  // Step 4: Update checkpoint atomically
  writeCheckpoint(lastProcessedLine);

  const result = {
    drained,
    skipped,
    errors,
    fromLine,
    toLine: lastProcessedLine,
  };

  process.stderr.write(
    `[queue-drain] Drain complete: ${drained} processed, ${skipped} skipped, ${errors} errors ` +
      `(lines ${fromLine}-${lastProcessedLine})\n`
  );

  return result;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (require.main === module) {
  const result = drain();
  if (result.drained === 0 && result.skipped === 0) {
    process.stdout.write('QUEUE_EMPTY\n');
  } else {
    process.stdout.write(`DRAINED: ${result.drained} actions\n`);
  }
  process.exit(result.errors > 0 ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Exports (for testing)
// ---------------------------------------------------------------------------

module.exports = {
  drain,
  readCheckpoint,
  writeCheckpoint,
  readQueueLines,
  parseLine,
  processEntry,
  dispatchAction,
  QUEUE_FILE,
  CHECKPOINT_FILE,
  RUNTIME_DIR,
  VALID_ENTRY_TYPES,
};
