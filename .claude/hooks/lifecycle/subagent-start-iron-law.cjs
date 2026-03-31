#!/usr/bin/env node
/**
 * Subagent Start Iron Law Compliance Hook (SubagentStart)
 * ========================================================
 * Advisory-only hook that fires when a subagent is spawned.
 *
 * When the spawning context is a ROUTER session and the subagent's prompt
 * references tools that are banned for the router (Bash, Edit, Write, Glob,
 * Grep, WebSearch, etc.), emits a stderr warning.
 *
 * NEVER blocks — always exits 0 and returns {allow:true}.
 * Handles malformed / missing / empty input gracefully.
 *
 * Security compliance:
 *   SE-01: 'use strict' at top
 *   SE-02: safeParseJSON via parseHookInputAsync — no raw JSON.parse
 *   SE-03: Always exits 0 (fail-open advisory hook)
 *   SE-04: project-root.cjs used for path resolution (never process.cwd())
 *
 * Registration: settings.json SubagentStart matcher ""
 * Fulfills: VAL-NE-001, VAL-NE-002
 *
 * @module subagent-start-iron-law
 */

'use strict';

const path = require('path');

const { parseHookInputAsync, formatResult } = require(
  path.join(__dirname, '..', '..', 'lib', 'utils', 'hook-input.cjs')
);

// Import the banned-tool list from the canonical source so we stay in sync.
// router-tool-lockdown.cjs guards itself with `if (require.main === module)`,
// so requiring it here never triggers its main() side-effect.
const { ROUTER_BANNED_TOOLS } = require(
  path.join(__dirname, '..', 'routing', 'router-tool-lockdown.cjs')
);

const HOOK_NAME = 'subagent-start-iron-law';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Determine whether the SPAWNING context is the router session (not a worker).
 *
 * Priority order (definitive first):
 *   1. CLAUDE_AGENT_ID env var — definitive when set
 *   2. task_id in hookInput — presence means we are inside a worker
 *   3. Default: treat as router context
 *
 * Note: For SubagentStart, hookInput.agent_id is the NEW subagent's ID, not
 * a signal about the current session's identity, so we do NOT use it here.
 *
 * @param {Object|null} hookInput - Parsed SubagentStart hook input
 * @returns {boolean} true if spawning context is the router
 */
function isRouterContext(hookInput) {
  // 1. CLAUDE_AGENT_ID env var — definitive
  const agentId = String(process.env.CLAUDE_AGENT_ID || '')
    .trim()
    .toLowerCase();

  if (agentId === 'router') {
    return true; // Explicitly identified as router
  }
  if (agentId && agentId !== 'router') {
    return false; // Definitively a worker/sub-agent
  }

  // 2. task_id in hookInput — subagents (workers) always have task context
  if (hookInput && typeof hookInput === 'object') {
    const taskId = String(hookInput.task_id || hookInput.taskId || '').trim();
    if (taskId) {
      return false; // Has a task context → this is a worker spawning, not the router
    }
  }

  // 3. Default: assume router context when no signals indicate otherwise
  return true;
}

/**
 * Extract the prompt text from SubagentStart hook input.
 *
 * Claude Code provides the subagent prompt under the `prompt` key for
 * SubagentStart events.
 *
 * @param {Object|null} hookInput - Parsed SubagentStart hook input
 * @returns {string} Prompt text or empty string
 */
function extractPrompt(hookInput) {
  if (!hookInput || typeof hookInput !== 'object') {
    return '';
  }
  return String(hookInput.prompt || hookInput.userPrompt || '');
}

/**
 * Scan a prompt string for references to banned router tools.
 * Uses word-boundary matching to avoid false positives on substrings.
 *
 * @param {string} prompt - The subagent prompt to scan
 * @param {string[]} bannedTools - List of banned tool names
 * @returns {string[]} Names of banned tools found in the prompt
 */
function findBannedToolsInPrompt(prompt, bannedTools) {
  if (!prompt || typeof prompt !== 'string') {
    return [];
  }
  const found = [];
  for (const tool of bannedTools) {
    // Word-boundary regex: matches "Edit" but not "NotebookEdit" or "co-edit"
    const regex = new RegExp(`\\b${tool}\\b`);
    if (regex.test(prompt)) {
      found.push(tool);
    }
  }
  return found;
}

/**
 * Core Iron Law compliance check.
 * Exported for unit testing without process.exit side-effects.
 *
 * @param {Object|null} hookInput - Parsed SubagentStart hook input
 * @returns {{ allow: boolean, warning?: string }}
 */
function checkIronLaw(hookInput) {
  if (!hookInput) {
    return { allow: true };
  }

  if (!isRouterContext(hookInput)) {
    // Worker agents are permitted to instruct subagents to use any tools —
    // the Iron Law only restricts the ROUTER from direct tool use.
    return { allow: true };
  }

  const prompt = extractPrompt(hookInput);
  const violations = findBannedToolsInPrompt(prompt, ROUTER_BANNED_TOOLS);

  if (violations.length > 0) {
    const warning =
      `[${HOOK_NAME}] Iron Law Warning: Subagent prompt references tools ` +
      `banned for the router (${violations.join(', ')}). ` +
      `The router must NOT instruct subagents to directly call these tools — ` +
      `spawn the right specialist agent type instead ` +
      `(e.g. Task({ subagent_type: 'developer', prompt: '...' })). ` +
      `CLAUDE.md Section 0 TOOL LOCKDOWN.`;
    return { allow: true, warning };
  }

  return { allow: true };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

/**
 * Hook entrypoint — reads stdin, runs check, outputs result.
 * Always exits 0 (advisory only).
 */
async function main() {
  try {
    const hookInput = await parseHookInputAsync();

    const result = checkIronLaw(hookInput);

    if (result.warning) {
      process.stderr.write(result.warning + '\n');
    }

    // Always allow — never block on SubagentStart
    console.log(formatResult('allow', ''));
    process.exit(0);
  } catch (err) {
    // SE-03: Advisory hooks are fail-open — log and exit 0
    process.stderr.write(`[${HOOK_NAME}] Error (ignored, fail-open): ${err.message}\n`);
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  checkIronLaw,
  isRouterContext,
  extractPrompt,
  findBannedToolsInPrompt,
  HOOK_NAME,
};
