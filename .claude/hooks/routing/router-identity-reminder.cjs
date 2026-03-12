#!/usr/bin/env node
'use strict';

/**
 * router-identity-reminder.cjs
 *
 * Type: UserPromptSubmit (runs via user-prompt-orchestrator HOOK_ORDER)
 * Category: routing
 * Purpose: Appends a concise router identity reminder to every user prompt
 *          in the main router session. Skips silently for subagent sessions.
 *
 * Subagent detection: task spawn prompts reliably start with 'task_id: task-N'
 * or an agent identity header. User prompts from a human never match these.
 *
 * Output: reminder written to stderr (forwarded by orchestrator as system-reminder).
 *
 * Enforcement: advisory only — always exits 0. Never blocks.
 *
 * Environment:
 *   ROUTER_IDENTITY_REMINDER=on|off  (default: on)
 */

const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

const SUBAGENT_PATTERNS = [
  /^task_id:\s*task-\d+/i,
  /^You are (?:a |an )?\w[\w-]+ agent[.:\n]/i,
  /^Call TaskUpdate\(/i,
  /^\[Task #\d+\]/i,
  /^<!-- Agent:/i,
];

const REMINDER = `
╔══════════════════════════════════════════════════════════╗
║  ROUTER IDENTITY REMINDER                                ║
╠══════════════════════════════════════════════════════════╣
║  You are the ROUTER — never execute work directly.       ║
║                                                          ║
║  Pre-flight (every response):                            ║
║  • Step 0:   reflection-reminder.txt → spawn reflection  ║
║  • Step 0.5: heartbeat-session-ping.json (15-min TTL)    ║
║                                                          ║
║  Output contract:                                        ║
║  1. TaskList()  ← FIRST tool call, always                ║
║  2. Task({ task_id, subagent_type, prompt })             ║
║  3. TaskUpdate({ taskId, status:"in_progress" })         ║
║                                                          ║
║  BANNED tools (spawn an agent instead):                  ║
║  Edit · Write · Bash · Glob · Grep · WebSearch · mcp__*  ║
║                                                          ║
║  Specialist-first (developer is LAST resort):            ║
║  technical-writer · qa · devops · code-reviewer          ║
║  code-simplifier · researcher · database-architect       ║
╚══════════════════════════════════════════════════════════╝`;

/**
 * Returns true if the prompt looks like a subagent task injection.
 * @param {string} prompt
 * @returns {boolean}
 */
function isSubagentPrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') return false;
  const trimmed = prompt.trimStart();
  return SUBAGENT_PATTERNS.some(p => p.test(trimmed));
}

function main() {
  // Check kill-switch
  if (process.env.ROUTER_IDENTITY_REMINDER === 'off') {
    process.exit(0);
  }

  let raw = '';
  process.stdin.on('data', chunk => {
    raw += chunk;
  });

  process.stdin.on('end', () => {
    try {
      const input = safeParseJSON(raw || '{}');
      const prompt = input.prompt || '';

      if (isSubagentPrompt(prompt)) {
        // Subagent session — skip silently
        process.exit(0);
      }

      // Router session — write reminder to stderr
      // Orchestrator forwards this as a system-reminder visible to Claude
      process.stderr.write(REMINDER + '\n');
    } catch (_e) {
      // Fail-open: never block on parse error
    }
    process.exit(0);
  });

  // Safety timeout — never hang
  setTimeout(() => process.exit(0), 3000).unref();
}

if (require.main === module) {
  main();
}

module.exports = { isSubagentPrompt };
