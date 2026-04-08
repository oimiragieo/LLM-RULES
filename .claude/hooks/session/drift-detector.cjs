#!/usr/bin/env node
/**
 * drift-detector.cjs
 *
 * UserPromptSubmit hook that tracks session intent drift.
 * Non-blocking - always exits 0.
 *
 * WHEN IT RUNS:
 * - On every UserPromptSubmit (before other processing)
 *
 * WHAT IT DOES:
 * - Tracks original user intent from first prompt
 * - Extracts keywords from prompts (filters stop words)
 * - Detects intent drift after 6+ edits
 * - Warns via stderr when drift detected (<20% keyword overlap)
 * - Resets intent on "new task" patterns
 *
 * Part of session management / user experience workflow.
 * @see .claude/context/plans/drift-detection-plan.md
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Use shared utility for project root
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

// Paths
const RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
const STATE_FILE = path.join(RUNTIME_DIR, 'drift-state.json');

// Stop words to filter from keyword extraction
const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'shall',
  'can',
  'to',
  'of',
  'in',
  'for',
  'on',
  'with',
  'at',
  'by',
  'from',
  'it',
  'its',
  'this',
  'that',
  'and',
  'or',
  'but',
  'not',
  'no',
  'if',
  'then',
  'else',
  'when',
  'up',
  'out',
  'so',
  'as',
  'i',
  'me',
  'my',
  'we',
]);

// New-intent patterns that reset tracking
const NEW_INTENT_PATTERNS = [
  /\bnow\s+let'?s\b/i,
  /\bswitch\s+to\b/i,
  /\bforget\s+(about\s+)?that\b/i,
  /\bnew\s+task\b/i,
  /\bstart\s+over\b/i,
  /\bsomething\s+(else|different)\b/i,
];

/**
 * Extract keywords from text (stop words filtered, min length 3)
 */
function extractKeywords(text) {
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 3 && !STOP_WORDS.has(w))
    ),
  ];
}

/**
 * Calculate keyword overlap (Jaccard similarity)
 */
function calculateOverlap(keywords1, keywords2) {
  if (keywords1.length === 0 || keywords2.length === 0) {
    return 0;
  }

  const set1 = new Set(keywords1);
  const set2 = new Set(keywords2);

  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}

/**
 * Sanitize session ID (strip path traversal and null bytes)
 */
function sanitizeSessionId(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') {
    return 'default';
  }

  return sessionId.replace(/[.\\/\0]/g, '_');
}

/**
 * Atomic write for state file
 */
function atomicWriteState(state) {
  // Ensure directory exists
  if (!fs.existsSync(RUNTIME_DIR)) {
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  }

  const tmpFile = STATE_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf-8');
  fs.renameSync(tmpFile, STATE_FILE);
}

/**
 * Read or create state file
 */
function getState() {
  if (!fs.existsSync(STATE_FILE)) {
    return null;
  }

  try {
    const parsed = safeParseJSON(fs.readFileSync(STATE_FILE, 'utf-8'), null);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed;
  } catch (_err) {
    return null;
  }
}

/**
 * Check if prompt matches new-intent pattern
 */
function matchesNewIntentPattern(prompt) {
  return NEW_INTENT_PATTERNS.some(pattern => pattern.test(prompt));
}

/**
 * Check if prompt is an internal task notification
 */
function isInternalPayload(prompt) {
  if (!prompt) return false;
  return (
    prompt.includes('<task-notification>') ||
    prompt.includes('<task-output>') ||
    prompt.includes('Your Task ID: task-')
  );
}

/**
 * Process user prompt for drift detection
 */
function processPrompt(userPrompt, sessionId) {
  // Ignore internal payloads
  if (isInternalPayload(userPrompt)) {
    return;
  }

  // Sanitize session ID
  const safeSid = sanitizeSessionId(sessionId);

  // Read current state
  let state = getState();

  // Check for new-intent pattern
  const isNewIntent = matchesNewIntentPattern(userPrompt);

  // If new intent or no state, initialize
  if (!state || state.sessionId !== safeSid || isNewIntent) {
    // Extract intent (first 200 chars of first sentence)
    const firstSentence = userPrompt.split(/[.!?]/)[0] || userPrompt;
    const originalIntent = firstSentence.substring(0, 200);
    const originalKeywords = extractKeywords(originalIntent);

    state = {
      sessionId: safeSid,
      originalIntent,
      originalKeywords,
      editCount: 1,
      lastUpdated: new Date().toISOString(),
    };

    atomicWriteState(state);
    return;
  }

  // Increment edit count
  state.editCount += 1;
  state.lastUpdated = new Date().toISOString();

  // After 6+ edits, check for drift
  if (state.editCount >= 6) {
    const currentKeywords = extractKeywords(userPrompt);
    const overlap = calculateOverlap(state.originalKeywords, currentKeywords);

    if (overlap < 0.2) {
      // 20% threshold
      process.stderr.write(
        `[drift-detector] WARNING: Session intent drift detected\n` +
          `Original intent: "${state.originalIntent}"\n` +
          `Current prompt seems unrelated (${Math.round(overlap * 100)}% overlap)\n` +
          `Consider starting a new session or resetting intent with "now let's..." pattern\n`
      );
    }
  }

  // Update state
  atomicWriteState(state);
}

/**
 * Main execution
 */
function main() {
  try {
    // Read stdin JSON
    // stdin might be immediately available or need reading
    let data = '';
    try {
      data = fs.readFileSync(0, 'utf-8'); // Read from stdin (fd 0)
    } catch (_err) {
      // Fail-open if stdin unavailable
      process.exit(0);
    }

    // Parse input
    let input;
    try {
      input = safeParseJSON(data, null);
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        process.exit(0);
      }
    } catch (_err) {
      // Malformed JSON - fail-open without passthrough output
      process.exit(0);
    }

    // Extract user prompt
    const userPrompt = input.message || input.prompt || '';
    if (!userPrompt || typeof userPrompt !== 'string') {
      // No prompt to analyze - noop
      process.exit(0);
    }

    // Get session ID
    const sessionId = process.env.CLAUDE_SESSION_ID || 'default';

    // Process prompt for drift detection
    processPrompt(userPrompt, sessionId);

    // Side-effect-only hook: no stdout on allow path
    process.exit(0);
  } catch (err) {
    // Fail-open on any error
    process.stderr.write(`[drift-detector] ERROR: ${err.message}\n`);
    process.exit(0);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// Export for testing
module.exports = {
  extractKeywords,
  calculateOverlap,
  sanitizeSessionId,
  processPrompt,
};
