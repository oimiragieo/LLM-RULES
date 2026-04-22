'use strict';

/**
 * trace-recorder — PostToolUse hook
 *
 * Type: PostToolUse (async, fail-open)
 * Purpose: Emit one JSONL trace line per tool call following OpenTelemetry
 *          GenAI semantic conventions.
 * Output: .claude/context/runtime/traces/<session-id>.jsonl
 *
 * OpenTelemetry GenAI attributes emitted:
 *   gen_ai.tool.name        — tool name (string)
 *   gen_ai.tool.args_hash   — SHA-256(args) truncated to 16 hex chars
 *   gen_ai.tool.result_hash — SHA-256(result) truncated to 16 hex chars
 *   gen_ai.usage.total_tokens  — total tokens (when payload provides usage data)
 *   gen_ai.usage.input_tokens  — prompt tokens (when payload provides input_tokens)
 *   gen_ai.usage.output_tokens — completion tokens (when payload provides output_tokens)
 *
 * Token usage availability:
 *   Claude Code PostToolUse hooks in the current harness do NOT reliably populate
 *   usage fields in all tool contexts. Fields are emitted only when present in the
 *   hook payload — never fabricated. If absent, token-governor.cjs will count 0
 *   for that trace entry.
 *   TODO: Reassess once Claude Code SDK guarantees usage in PostToolUse events.
 *
 * Additional attributes:
 *   timestamp   — ISO 8601
 *   duration_ms — elapsed time (null when not measurable from hook context)
 *   agent_id    — AGENT_TYPE env or hook payload agent_type
 *   task_id     — TASK_ID env or hook payload task_id
 *   session_id  — CLAUDE_SESSION_ID env or hook payload session_id
 *
 * Exit codes:
 *   0 — Always (fail-open — never blocks the tool pipeline)
 *
 * Environment:
 *   TRACE_RECORDER=off   — disables emission entirely (default: on)
 *
 * Performance budget: <20ms (append-only file write, no network I/O)
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

// ---------------------------------------------------------------------------
// Project root resolution
// ---------------------------------------------------------------------------

function findProjectRoot(startDir) {
  let dir = startDir || __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.claude'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();

// ---------------------------------------------------------------------------
// Env-based feature flag — evaluated at module load so tests can cache-bust
// ---------------------------------------------------------------------------

function isEnabled() {
  return (process.env.TRACE_RECORDER || 'on').toLowerCase() !== 'off';
}

// ---------------------------------------------------------------------------
// Hashing helper
// ---------------------------------------------------------------------------

/**
 * SHA-256 hash of a value, truncated to 16 hex characters.
 * @param {*} value - Any value (objects JSON-serialised first)
 * @returns {string} 16-character lowercase hex string
 */
function sha256trunc16(value) {
  const str = typeof value === 'string' ? value : JSON.stringify(value ?? null);
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------------------
// Core: build + append a single trace line
// ---------------------------------------------------------------------------

/**
 * Build the trace record from a PostToolUse hook payload.
 * @param {Object} hookInput — parsed hook payload from Claude Code stdin
 * @returns {Object} Flat trace record conforming to OTel GenAI conventions
 */
function buildTraceRecord(hookInput) {
  const toolName = hookInput.tool_name || hookInput.tool || 'unknown';
  const toolInput = hookInput.tool_input ?? hookInput.input ?? {};
  const toolOutput = hookInput.tool_output ?? hookInput.output ?? {};

  const sessionId =
    process.env.CLAUDE_SESSION_ID || process.env.SESSION_ID || hookInput.session_id || 'unknown';

  const agentId = process.env.AGENT_TYPE || hookInput.agent_type || hookInput.agent_id || '';

  const taskId = process.env.TASK_ID || hookInput.task_id || '';

  const record = {
    timestamp: new Date().toISOString(),
    'gen_ai.tool.name': toolName,
    'gen_ai.tool.args_hash': sha256trunc16(toolInput),
    'gen_ai.tool.result_hash': sha256trunc16(toolOutput),
    duration_ms: hookInput.duration_ms ?? null,
    agent_id: agentId,
    task_id: taskId,
    session_id: sessionId,
  };

  // ---------------------------------------------------------------------------
  // Token usage extraction (OTel GenAI semantic conventions)
  // Source: hookInput.usage.* (Claude Code PostToolUse payload)
  // LIMITATION: Claude Code PostToolUse hook in this harness version does NOT
  // reliably populate usage fields in all tool contexts. When present, we emit
  // them. When absent, we omit the fields entirely — we do NOT fabricate or
  // heuristic-estimate values.
  // TODO: Re-evaluate when Claude Code SDK emits usage in PostToolUse events.
  // ---------------------------------------------------------------------------
  const usage = hookInput.usage ?? {};
  const hasTotal = typeof usage.total_tokens === 'number' && !isNaN(usage.total_tokens);
  const hasInput = typeof usage.input_tokens === 'number' && !isNaN(usage.input_tokens);
  const hasOutput = typeof usage.output_tokens === 'number' && !isNaN(usage.output_tokens);

  if (hasTotal) {
    record['gen_ai.usage.total_tokens'] = usage.total_tokens;
  } else if (hasInput && hasOutput) {
    record['gen_ai.usage.input_tokens'] = usage.input_tokens;
    record['gen_ai.usage.output_tokens'] = usage.output_tokens;
    record['gen_ai.usage.total_tokens'] = usage.input_tokens + usage.output_tokens;
  }
  // If neither total nor input+output are present, omit usage fields entirely.
  // Never emit null, 0, or fabricated values.

  return record;
}

/**
 * Resolve the trace file path for a given session ID.
 * @param {string} sessionId
 * @param {string} [projectRoot]
 * @returns {string} Absolute path to the .jsonl trace file
 */
function getTracePath(sessionId, projectRoot) {
  const root = projectRoot || PROJECT_ROOT;
  return path.join(root, '.claude', 'context', 'runtime', 'traces', `${sessionId}.jsonl`);
}

/**
 * Append one trace line to .claude/context/runtime/traces/<session-id>.jsonl
 *
 * This is the exported API used by tests AND by main().
 *
 * @param {Object} hookInput   — PostToolUse payload (or compatible object)
 * @param {string} [projectRoot] — Override project root (used by tests)
 */
function appendTraceLine(hookInput, projectRoot) {
  if (!isEnabled()) return;

  const record = buildTraceRecord(hookInput);
  const tracePath = getTracePath(record.session_id, projectRoot);

  // mkdir -p
  const dir = path.dirname(tracePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.appendFileSync(tracePath, JSON.stringify(record) + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// Main — reads PostToolUse payload from stdin (Claude Code hook protocol)
// ---------------------------------------------------------------------------

function main() {
  try {
    let hookInput = null;

    // Try stdin first (Claude Code PostToolUse passes JSON via stdin)
    try {
      const stdinData = fs.readFileSync(0, 'utf8');
      if (stdinData && stdinData.trim()) {
        hookInput = safeParseJSON(stdinData.trim(), 'trace-recorder', undefined, null);
        if (!hookInput || Object.keys(hookInput).length === 0) hookInput = null;
      }
    } catch (_e) {
      // No stdin or not readable
    }

    // Fallback: argv[2] (some hooks receive input this way)
    if (!hookInput && process.argv[2]) {
      hookInput = safeParseJSON(process.argv[2], 'trace-recorder', undefined, null);
      if (!hookInput || Object.keys(hookInput).length === 0) hookInput = null;
    }

    if (!hookInput) {
      process.exit(0);
    }

    appendTraceLine(hookInput);
  } catch (_err) {
    // Fail-open: never block the tool pipeline on telemetry errors
  }

  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = {
  appendTraceLine,
  buildTraceRecord,
  getTracePath,
  sha256trunc16,
  findProjectRoot,
  PROJECT_ROOT,
};
