#!/usr/bin/env node
'use strict';

/**
 * send-event — Centralized Skill Observability Emitter (Iron Law III)
 *
 * Appends a structured JSON line to .claude/context/runtime/tool-events.jsonl
 * for every skill execution. Enables post-hoc debugging of multi-agent swarms.
 *
 * Required fields: tool_name, agent_id, session_id, outcome, timestamp
 *
 * Usage (from hooks/post-execute.cjs):
 *   const { sendEvent } = require('.claude/tools/observability/send-event.cjs');
 *   sendEvent({ tool_name, agent_id, session_id, outcome: 'success' | 'failure' | 'blocked' });
 *
 * Usage (CLI):
 *   node .claude/tools/observability/send-event.cjs \
 *     --tool my-skill --agent developer --session sess-123 --outcome success
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Path resolution — walk up until we find .claude/
// ---------------------------------------------------------------------------
function findProjectRoot(start) {
  let dir = start || __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.claude'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const EVENTS_FILE = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'tool-events.jsonl');

// ---------------------------------------------------------------------------
// Core emitter
// ---------------------------------------------------------------------------

/**
 * Emit one structured event to tool-events.jsonl (JSONL append — atomic line write).
 *
 * @param {object} payload
 * @param {string} payload.tool_name      - Skill or tool being called
 * @param {string} payload.agent_id       - Spawning agent type (e.g. "developer")
 * @param {string} payload.session_id     - Session ID from hook input or process.env
 * @param {string} payload.outcome        - "success" | "failure" | "blocked" | "skipped"
 * @param {string} [payload.timestamp]    - ISO-8601; defaults to now
 * @param {object} [payload.meta]         - Optional extra fields (error message, duration_ms, etc.)
 */
function sendEvent(payload) {
  const event = {
    tool_name: String(payload.tool_name || 'unknown'),
    agent_id: String(payload.agent_id || process.env.AGENT_ID || 'unknown'),
    session_id: String(
      payload.session_id || process.env.SESSION_ID || process.env.CLAUDE_SESSION_ID || 'unknown'
    ),
    outcome: String(payload.outcome || 'unknown'),
    timestamp: payload.timestamp || new Date().toISOString(),
    ...(payload.meta ? { meta: payload.meta } : {}),
  };

  try {
    // Ensure runtime directory exists
    const dir = path.dirname(EVENTS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.appendFileSync(EVENTS_FILE, JSON.stringify(event) + '\n', 'utf8');
  } catch (err) {
    // Never crash on observability failure — fail open
    if (process.env.DEBUG_HOOKS) {
      process.stderr.write(`[send-event] Failed to write event: ${err.message}\n`);
    }
  }

  return event;
}

// ---------------------------------------------------------------------------
// CLI interface
// ---------------------------------------------------------------------------
function printHelp() {
  process.stdout.write(`send-event — Skill observability emitter (Iron Law III)

Usage:
  node send-event.cjs --tool <name> --agent <id> --session <id> --outcome <result>
  node send-event.cjs --tail [N]     # Print last N events (default 20)
  node send-event.cjs --help

Options:
  --tool <name>      Skill/tool name
  --agent <id>       Agent ID (e.g. "developer", "qa")
  --session <id>     Session ID
  --outcome <result> success | failure | blocked | skipped
  --meta <json>      Optional JSON object with extra context
  --tail [N]         Print last N events from tool-events.jsonl
  --file <path>      Override events file path
  --help             Show this help

Output file: .claude/context/runtime/tool-events.jsonl
`);
}

function tailEvents(n, file) {
  const eventsFile = file || EVENTS_FILE;
  if (!fs.existsSync(eventsFile)) {
    process.stdout.write('No events recorded yet.\n');
    return;
  }
  const lines = fs.readFileSync(eventsFile, 'utf8').trim().split('\n').filter(Boolean);
  const last = lines.slice(-n);
  for (const line of last) {
    try {
      const e = JSON.parse(line);
      process.stdout.write(
        `[${e.timestamp}] ${e.outcome.padEnd(8)} ${e.tool_name.padEnd(30)} agent=${e.agent_id} session=${e.session_id}\n`
      );
    } catch {
      process.stdout.write(line + '\n');
    }
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.length === 0) {
    printHelp();
    process.exit(0);
  }

  if (args.includes('--tail')) {
    const idx = args.indexOf('--tail');
    const n = parseInt(args[idx + 1], 10) || 20;
    const fileIdx = args.indexOf('--file');
    const file = fileIdx !== -1 ? args[fileIdx + 1] : undefined;
    tailEvents(n, file);
    process.exit(0);
  }

  const get = flag => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };

  const tool_name = get('--tool');
  const agent_id = get('--agent');
  const session_id = get('--session');
  const outcome = get('--outcome');
  const metaStr = get('--meta');

  if (!tool_name || !outcome) {
    process.stderr.write('Error: --tool and --outcome are required.\n');
    printHelp();
    process.exit(1);
  }

  let meta;
  if (metaStr) {
    try {
      meta = JSON.parse(metaStr);
    } catch {
      meta = { raw: metaStr };
    }
  }

  const event = sendEvent({ tool_name, agent_id, session_id, outcome, meta });
  process.stdout.write(JSON.stringify(event) + '\n');
}

module.exports = { sendEvent };
