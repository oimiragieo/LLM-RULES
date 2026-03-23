#!/usr/bin/env node
// behavioral-loop-detection/scripts/main.cjs
// CLI entry point for behavioral loop detection utilities
'use strict';

const { safeParseJSON } = require('../../../../lib/utils/safe-json.cjs');

// ─── Normalization ───────────────────────────────────────────────────────────

/**
 * Normalize tool arguments for similarity comparison.
 * @param {string} toolName
 * @param {object|string} rawArgs
 * @returns {string}
 */
function normalizeArgs(toolName, rawArgs) {
  let str = typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs || {});
  str = str.toLowerCase();
  // Strip file paths to basename
  str = str.replace(/[a-z]:[/\\][^\s"',]+/gi, m => m.split(/[/\\]/).pop());
  str = str.replace(/\/[^\s"',]+/g, m => m.split('/').pop());
  // Remove UUIDs
  str = str.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, 'UUID');
  // Remove pure numeric IDs
  str = str.replace(/\b\d{6,}\b/g, 'NUM');
  // Truncate
  return str.slice(0, 200);
}

/**
 * Jaccard similarity over whitespace-split tokens.
 * @param {string} a
 * @param {string} b
 * @returns {number} 0..1
 */
function jaccardSimilarity(a, b) {
  const setA = new Set(a.split(/\s+/).filter(Boolean));
  const setB = new Set(b.split(/\s+/).filter(Boolean));
  if (setA.size === 0 && setB.size === 0) return 1;
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

// ─── Buffer Management ───────────────────────────────────────────────────────

/**
 * Create a fresh action buffer.
 * @returns {object}
 */
function createBuffer() {
  return {
    window: [],
    maxSize: 20,
    similarRunLength: 0,
    lastNormalized: null,
  };
}

/**
 * Record a new action into the buffer.
 * @param {object} buffer
 * @param {string} toolName
 * @param {*} rawArgs
 * @returns {object} entry
 */
function recordAction(buffer, toolName, rawArgs) {
  const normalized = normalizeArgs(toolName, rawArgs);
  const entry = {
    toolName,
    normalizedArgs: normalized,
    timestamp: Date.now(),
    stepIndex: buffer.window.length,
  };
  if (buffer.window.length >= buffer.maxSize) {
    buffer.window.shift();
  }
  buffer.window.push(entry);
  return entry;
}

/**
 * Check similarity of current action against the last; update run-length.
 * @param {object} buffer
 * @param {object} currentEntry
 * @returns {{ similar: boolean, runLength: number, score: number }}
 */
function checkSimilarity(buffer, currentEntry) {
  if (!buffer.lastNormalized) {
    buffer.lastNormalized = currentEntry.normalizedArgs;
    buffer.similarRunLength = 1;
    return { similar: false, runLength: 1, score: 0 };
  }
  const score = jaccardSimilarity(buffer.lastNormalized, currentEntry.normalizedArgs);
  if (score >= 0.75) {
    buffer.similarRunLength += 1;
  } else {
    buffer.similarRunLength = 1;
    buffer.lastNormalized = currentEntry.normalizedArgs;
  }
  return { similar: score >= 0.75, runLength: buffer.similarRunLength, score };
}

/**
 * Apply escalation logic based on run-length.
 * @param {number} runLength
 * @param {string} taskId
 * @returns {{ level: number, action: string, message: string|null }}
 */
function applyEscalation(runLength, taskId) {
  if (runLength >= 8) {
    process.stderr.write(
      `[loop-detection] FORCE-DONE: ${runLength} similar actions. Task ${taskId}\n`
    );
    return {
      level: 3,
      action: 'force-done',
      message:
        'Loop limit reached (8 repetitions). Mark this task complete with partial results and explain what was not accomplished.',
    };
  }
  if (runLength >= 5) {
    process.stderr.write(
      `[loop-detection] EXPLORE: ${runLength} similar actions. Task ${taskId}\n`
    );
    return {
      level: 2,
      action: 'explore',
      message:
        'You have repeated a similar action 5 times. The current approach is failing. Try a completely different tool or method.',
    };
  }
  if (runLength >= 3) {
    process.stderr.write(`[loop-detection] REPLAN: ${runLength} similar actions. Task ${taskId}\n`);
    return {
      level: 1,
      action: 'replan',
      message:
        'You have repeated a similar action 3 times. Stop and produce a revised plan before continuing.',
    };
  }
  return { level: 0, action: 'continue', message: null };
}

// ─── CLI Entry ───────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (cmd === '--check') {
    // Reads JSON from stdin: { taskId, actions: [{toolName, args}] }
    let raw = '';
    process.stdin.on('data', chunk => {
      raw += chunk;
    });
    process.stdin.on('end', () => {
      const { success, data } = safeParseJSON(raw, {});
      if (!success || !data.actions) {
        process.stderr.write('[loop-detection] Invalid input JSON\n');
        process.exit(1);
      }
      const buffer = createBuffer();
      let result = { level: 0, action: 'continue', message: null };
      for (const action of data.actions) {
        const entry = recordAction(buffer, action.toolName || 'unknown', action.args || {});
        const sim = checkSimilarity(buffer, entry);
        result = applyEscalation(sim.runLength, data.taskId || 'unknown');
      }
      process.stdout.write(JSON.stringify(result) + '\n');
    });
  } else {
    process.stdout.write(
      'Usage: echo \'{"taskId":"t1","actions":[...]}\' | node main.cjs --check\n'
    );
    process.exit(0);
  }
}

module.exports = {
  createBuffer,
  recordAction,
  checkSimilarity,
  applyEscalation,
  normalizeArgs,
  jaccardSimilarity,
};
