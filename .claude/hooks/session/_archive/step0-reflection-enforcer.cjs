#!/usr/bin/env node
'use strict';

/**
 * Step 0 Reflection Enforcer — UserPromptSubmit Hook
 *
 * Fires on every user message. When pending reflection requests are detected,
 * injects a mandatory Step 0 block directly into the router's context so that
 * Step 0 processing is impossible to skip.
 *
 * Protocol:
 *   Input : JSON from stdin (UserPromptSubmit hook payload)
 *   Output: { result: "<injection text>" } to stdout when reflections are pending
 *           { result: "" } to stdout when no reflections are pending (pass-through)
 *   Exit  : always 0 (fail-open; never blocks the prompt)
 *
 * Performance: designed to complete in <50ms on typical hardware.
 *
 * Security:
 *   - SE-01: Windows path normalization (backslash → forward slash)
 *   - SE-02: safeParseJSON used for all JSON parsing (prototype pollution protection)
 *   - Never writes to disk; read-only access to runtime files
 *   - Content size limit: MAX_CONTENT_BYTES (10KB) per field to prevent prompt flooding
 */

const fs = require('fs');
const path = require('path');

// Resolve PROJECT_ROOT from this file's location:
// step0-reflection-enforcer.cjs lives at:
//   <PROJECT_ROOT>/.claude/hooks/session/step0-reflection-enforcer.cjs
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

// Maximum bytes per content field injected into the prompt.
// Prevents runaway injection if reminder or spawn request files grow very large.
const MAX_CONTENT_BYTES = 10240; // 10KB

// Lazy-load safeParseJSON only when needed (SE-02 compliance)
function getSafeParseJSON() {
  try {
    // SE-01: normalize path separators for Windows
    const safePath = path
      .join(PROJECT_ROOT, '.claude', 'lib', 'utils', 'safe-json.cjs')
      .replace(/\\/g, '/');
    return require(safePath).safeParseJSON;
  } catch (_err) {
    // Fail-open: return a basic safe parser fallback
    return function fallbackSafeParseJSON(content) {
      try {
        const obj = JSON.parse(content);
        if (obj && typeof obj === 'object') {
          // crude anti-pollution
          delete obj.__proto__;
          delete obj.constructor;
        }
        return obj;
      } catch (_e) {
        return null;
      }
    };
  }
}

/**
 * Write a diagnostic message to stderr (never stdout — stdout is reserved for hook output).
 */
function stderrLog(message) {
  process.stderr.write(`[step0-reflection-enforcer] ${message}\n`);
}

/**
 * Emit the pass-through result (no reflection injection needed).
 * Using { result: "" } signals "allow, no context injection".
 */
function emitPassThrough() {
  process.stdout.write(JSON.stringify({ result: '' }) + '\n');
  process.exit(0);
}

/**
 * Emit the injection result with the assembled Step 0 block.
 */
function emitInjection(injectionText) {
  process.stdout.write(JSON.stringify({ result: injectionText }) + '\n');
  process.exit(0);
}

/**
 * Resolve the runtime directory path (SE-01: forward slashes).
 */
function getRuntimeDir() {
  return path.join(PROJECT_ROOT, '.claude', 'context', 'runtime').replace(/\\/g, '/');
}

/**
 * Read a file safely, returning null on any error.
 */
function safeReadFile(filePath) {
  try {
    // SE-01: normalize for consistent cross-platform behavior
    const normalized = filePath.replace(/\\/g, '/');
    return fs.readFileSync(normalized, 'utf8');
  } catch (_err) {
    return null;
  }
}

/**
 * Truncate a string to at most MAX_CONTENT_BYTES bytes (UTF-8 length).
 * Appends a truncation notice with the original file path if truncated.
 *
 * @param {string} content    - The string to potentially truncate
 * @param {string} filePath   - The path of the file (for the truncation message)
 * @returns {string}          - The (possibly truncated) string
 */
function truncateIfNeeded(content, filePath) {
  if (content.length <= MAX_CONTENT_BYTES) {
    return content;
  }
  const truncated = content.slice(0, MAX_CONTENT_BYTES);
  // SE-01: normalize file path in the message
  const normalizedPath = filePath.replace(/\\/g, '/');
  return `${truncated}\n\n[TRUNCATED — read full file at ${normalizedPath}]`;
}

/**
 * Build the Step 0 injection message block from reflection data.
 *
 * @param {string} reminderContent   - Contents of reflection-reminder.txt
 * @param {string|null} spawnContent - Contents of reflection-spawn-request.json (may be null)
 * @returns {string} Formatted injection block
 */
function buildInjectionBlock(reminderContent, spawnContent) {
  const safeParseJSON = getSafeParseJSON();

  // Count pending requests from spawn JSON
  let requestCount = 0;
  let spawnRequestText = '(spawn request file not available)';

  if (spawnContent !== null) {
    const parsed = safeParseJSON(spawnContent, null);
    if (Array.isArray(parsed)) {
      requestCount = parsed.length;
      spawnRequestText = truncateIfNeeded(
        spawnContent.trim(),
        '.claude/context/runtime/reflection-spawn-request.json'
      );
    } else if (parsed && typeof parsed === 'object') {
      // Single-object format (non-array)
      requestCount = 1;
      spawnRequestText = truncateIfNeeded(
        spawnContent.trim(),
        '.claude/context/runtime/reflection-spawn-request.json'
      );
    } else {
      spawnRequestText =
        truncateIfNeeded(
          spawnContent.trim(),
          '.claude/context/runtime/reflection-spawn-request.json'
        ) || '(empty spawn request file)';
    }
  }

  const countLabel =
    requestCount > 0 ? `${requestCount} pending reflection spawn request(s) detected.` : '';

  // Truncate reminder content to prevent prompt flooding
  const truncatedReminder = truncateIfNeeded(
    reminderContent.trim(),
    '.claude/context/runtime/reflection-reminder.txt'
  );

  const lines = [
    '',
    '\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557',
    '\u2551  STEP 0: MANDATORY REFLECTION PROCESSING (AUTO-INJECTED BY HOOK) \u2551',
    '\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d',
    '',
    countLabel || 'Pending reflection requests detected.',
    'You MUST process these BEFORE calling TaskList() or Task().',
    '',
    '## Reflection Reminder:',
    truncatedReminder,
    '',
    '## Spawn Requests (pre-loaded):',
    '```json',
    spawnRequestText,
    '```',
    '',
    '## Required Actions (NON-NEGOTIABLE):',
    '1. For each request above, spawn reflection-agent via Task()',
    '   - Use foreground (NOT run_in_background: true)',
    '   - Include processedReflectionIds in TaskUpdate metadata on completion',
    '2. After ALL reflection-agents complete, call TaskList() to continue',
    '3. Do NOT call TaskList() before spawning reflection-agent(s)',
    '',
    '## Why this matters:',
    '- Reflections capture cross-agent pipeline observations',
    '- Skipping Step 0 permanently loses learnings from the last session',
    '- The reflection-cleanup.cjs hook requires TaskUpdate with processedReflectionIds',
    '  to atomically clear processed requests',
    '',
    '\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550',
  ];

  return lines.join('\n');
}

function main() {
  // Read stdin (required for UserPromptSubmit hook protocol)
  // We don't need to parse it — we only check filesystem state
  try {
    fs.readFileSync(0, 'utf8'); // drain stdin so the protocol is respected
  } catch (_err) {
    // stdin not available in some test scenarios; that's acceptable
  }

  const runtimeDir = getRuntimeDir();

  // SE-01: normalize paths to forward slashes before constructing
  const reminderPath = path.join(runtimeDir, 'reflection-reminder.txt').replace(/\\/g, '/');

  // Fast path: if reminder file does not exist, no reflections pending
  if (!fs.existsSync(reminderPath)) {
    emitPassThrough();
    return;
  }

  // Reminder file exists — read its contents
  const reminderContent = safeReadFile(reminderPath);
  if (reminderContent === null || reminderContent.trim() === '') {
    // File exists but is empty — treat as no pending reflections
    emitPassThrough();
    return;
  }

  // Attempt to read spawn request JSON (optional; fail-open if missing)
  const spawnRequestPath = path
    .join(runtimeDir, 'reflection-spawn-request.json')
    .replace(/\\/g, '/');
  const spawnContent = safeReadFile(spawnRequestPath);

  // Build and emit the injection block
  try {
    const injectionText = buildInjectionBlock(reminderContent, spawnContent);
    emitInjection(injectionText);
  } catch (err) {
    stderrLog(`Failed to build injection block: ${err.message}`);
    // Fail-open: let the prompt through without injection
    emitPassThrough();
  }
}

// Entry point guard
if (require.main === module) {
  try {
    main();
  } catch (err) {
    stderrLog(`Unhandled error: ${err.message}`);
    // Fail-open on any unhandled error
    emitPassThrough();
  }
}

module.exports = { buildInjectionBlock, getRuntimeDir, MAX_CONTENT_BYTES };
