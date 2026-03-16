'use strict';
/**
 * heartbeat-step05-check.cjs — PreToolUse(TaskList) advisory hook
 *
 * Type: PreToolUse
 * Purpose: Warn when the heartbeat session ping is expired or missing so the
 *          router knows to spawn heartbeat-orchestrator (Step 0.5).
 * Trigger: Fires on every TaskList() call.
 *
 * Behavior:
 *   - Reads .claude/context/runtime/heartbeat-session-ping.json
 *   - If the file is missing or expires_at is in the past, writes a warning to stderr
 *   - ALWAYS exits 0 (advisory, never blocking)
 *
 * Exit codes:
 *   0 — allow (always)
 *
 * Note: This hook NEVER blocks. Blocking TaskList would break the router entirely.
 */

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

// Resolve project root by walking up from __dirname looking for .claude
function findProjectRoot() {
  let dir = __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.claude'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const PING_FILE = path.join(PROJECT_ROOT, '.claude/context/runtime/heartbeat-session-ping.json');

const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
  try {
    const input = safeParseJSON(Buffer.concat(chunks).toString());
    const toolName = input?.tool_name || '';

    // Only act on TaskList calls (belt-and-suspenders — settings.json also filters)
    if (toolName && toolName !== 'TaskList') {
      process.stdout.write(JSON.stringify({ allow: true }));
      process.exit(0);
    }

    checkHeartbeat();
  } catch (_e) {
    // Advisory hook — fail open on any unexpected error
    process.stdout.write(JSON.stringify({ allow: true }));
    process.exit(0);
  }
});

/**
 * Check heartbeat session ping and warn on stderr if expired/missing.
 * Always exits 0.
 */
function checkHeartbeat() {
  try {
    if (!fs.existsSync(PING_FILE)) {
      process.stderr.write(
        '[Step 0.5] Heartbeat session ping expired or missing. Router should spawn heartbeat-orchestrator.\n'
      );
      process.stdout.write(JSON.stringify({ allow: true }));
      process.exit(0);
    }

    let content;
    try {
      content = fs.readFileSync(PING_FILE, 'utf8');
    } catch (_readErr) {
      // Cannot read file — warn and allow
      process.stderr.write(
        '[Step 0.5] Heartbeat session ping expired or missing. Router should spawn heartbeat-orchestrator.\n'
      );
      process.stdout.write(JSON.stringify({ allow: true }));
      process.exit(0);
    }

    const ping = safeParseJSON(content);
    const expiresAt = ping?.expires_at;

    if (!expiresAt) {
      // No expiry field — treat as expired
      process.stderr.write(
        '[Step 0.5] Heartbeat session ping expired or missing. Router should spawn heartbeat-orchestrator.\n'
      );
      process.stdout.write(JSON.stringify({ allow: true }));
      process.exit(0);
    }

    const expiresMs = new Date(expiresAt).getTime();
    if (isNaN(expiresMs) || Date.now() > expiresMs) {
      process.stderr.write(
        '[Step 0.5] Heartbeat session ping expired or missing. Router should spawn heartbeat-orchestrator.\n'
      );
      process.stdout.write(JSON.stringify({ allow: true }));
      process.exit(0);
    }

    // Ping is valid and not expired — silent pass
    process.stdout.write(JSON.stringify({ allow: true }));
    process.exit(0);
  } catch (_e) {
    // Advisory hook — fail open on any unexpected error
    process.stdout.write(JSON.stringify({ allow: true }));
    process.exit(0);
  }
}
