#!/usr/bin/env node
/**
 * Router Tool Lockdown Enforcer (PreToolUse)
 *
 * Enforces CLAUDE.md Section 0 ROUTER TOOL LOCKDOWN.
 * Detects when the router session calls banned tools and blocks/warns.
 *
 * Sub-agents (identified by CLAUDE_AGENT_ID or task_id in hookInput)
 * are always allowed through.
 *
 * Env: ROUTER_TOOL_LOCKDOWN_ENFORCEMENT=block|warn|off (default: block)
 *
 * @module router-tool-lockdown
 */

'use strict';

const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
  formatResult,
  getEnforcementMode,
} = require('../../lib/utils/hook-input.cjs');

const { isInWorktree } = require('../../lib/utils/worktree-context.cjs');

/**
 * Tools the router is ALLOWED to use.
 * Everything else is banned when in router mode.
 */
const ROUTER_WHITELISTED_TOOLS = [
  'Task',
  'TaskList',
  'TaskCreate',
  'TaskUpdate',
  'TaskGet',
  'TaskOutput',
  'TaskStop',
  'Read',
  'AskUserQuestion',
  'Skill',
  'AvailableAgents',
  'EnterPlanMode',
  'ExitPlanMode',
  'MemoryRecord',
];

/**
 * Tools the router is explicitly BANNED from using.
 * This is the enforcement list — if a tool is here AND not whitelisted,
 * the hook will block/warn.
 */
const ROUTER_BANNED_TOOLS = [
  'Edit',
  'Write',
  'NotebookEdit',
  'Bash',
  'Glob',
  'Grep',
  'WebSearch',
  'WebFetch',
];

/**
 * Whitelisted Bash commands the router may use (read-only git discovery).
 * Matches CLAUDE.md Section 0 allowlist.
 */
const ROUTER_BASH_WHITELIST = [
  /^git\s+status(\s+(-s|--short))?$/,
  /^git\s+log\s+--oneline\s+-\d{1,2}$/,
  /^git\s+diff\s+--name-only(\s+HEAD)?$/,
  /^git\s+branch$/,
  /^echo\s+'[^']*'\s*>>\s*\.claude\/context\/runtime\/session-gap-log\.jsonl$/,
];

/**
 * Determine if this invocation is from the router (not a sub-agent).
 * Returns true if we believe the caller is the router session.
 *
 * Heuristic priority (definitive signals first, weak signals last):
 *   1. hookInput.agent_id — Claude Code injects this for subagent hooks (definitive)
 *   2. CLAUDE_AGENT_ID env var — definitive when set
 *   3. task_id in hookInput — subagents always have task context
 *   4. allowed_tools — negative signal (no Task tool = subagent)
 *   5. Worktree CWD — weak tertiary signal (last resort)
 *
 * @param {Object} hookInput - Hook input context
 * @param {string} [cwd] - Current working directory (defaults to process.cwd()).
 *   Injected for testability; production uses the real CWD.
 * @returns {boolean}
 */
function isRouterSession(hookInput, cwd = process.cwd()) {
  // 1. hookInput.agent_id — Claude Code provides this field ONLY inside subagent
  // hook calls. Its presence is the most reliable signal (per official docs:
  // "Present only when the hook fires inside a subagent call. Use this to
  // distinguish subagent hook calls from main-thread calls.")
  if (hookInput && typeof hookInput === 'object') {
    const hostAgentId = String(hookInput.agent_id || '').trim();
    if (hostAgentId) {
      return false; // Definitively inside a subagent
    }
  }

  // 2. CLAUDE_AGENT_ID env var — definitive when set
  const agentId = String(process.env.CLAUDE_AGENT_ID || '')
    .trim()
    .toLowerCase();
  if (agentId === 'router') {
    return true; // Explicitly identified as router
  }
  if (agentId && agentId !== 'router') {
    return false; // Definitively a sub-agent
  }

  // 3. task_id in hookInput — subagents always have task context
  if (hookInput && typeof hookInput === 'object') {
    const taskId = String(hookInput.task_id || hookInput.taskId || '').trim();
    if (taskId) {
      return false; // Has a task context — it's a sub-agent
    }
  }

  // 4. allowed_tools — sub-agents typically don't have Task in their allowed list
  // Unreliable, so we use it only as a negative signal
  const allowedTools = Array.isArray(hookInput?.allowed_tools) ? hookInput.allowed_tools : null;
  if (allowedTools && allowedTools.length > 0 && !allowedTools.includes('Task')) {
    return false; // Sub-agent without Task tool access
  }

  // 5. Worktree CWD — weak tertiary signal (subagents often run in worktrees,
  // but the router process may also have worktree CWD in edge cases)
  if (isInWorktree(cwd)) {
    return false; // Likely a subagent in a worktree
  }

  return true; // Default: assume router
}

/**
 * Check if a Bash command is whitelisted for router use.
 *
 * @param {string} command - The bash command string
 * @returns {boolean}
 */
function isWhitelistedBashCommand(command) {
  if (!command || typeof command !== 'string') return false;
  const trimmed = command.trim();
  return ROUTER_BASH_WHITELIST.some(pattern => pattern.test(trimmed));
}

/**
 * Suggest the correct agent type for a given banned tool.
 *
 * @param {string} toolName - The banned tool name
 * @returns {string}
 */
function suggestAgent(toolName) {
  const suggestions = {
    Bash: 'developer',
    Edit: 'developer',
    Write: 'technical-writer',
    NotebookEdit: 'developer',
    Glob: 'developer',
    Grep: 'developer',
    WebSearch: 'researcher',
    WebFetch: 'researcher',
  };
  return suggestions[toolName] || 'developer';
}

/**
 * Core check function — can be called programmatically from tests.
 *
 * @param {string} toolName - Tool being invoked
 * @param {Object} toolInput - Tool input parameters
 * @param {Object} hookInput - Full hook input context
 * @param {string} [cwd] - Current working directory override for testing.
 *   Defaults to process.cwd() in production.
 * @returns {{ pass: boolean, result?: string, message?: string }}
 */
function checkRouterToolLockdown(toolName, toolInput, hookInput, cwd = process.cwd()) {
  // No inner try/catch — errors propagate to main()'s fail-closed outer catch (exit 2).
  // SEC-FIX F-001: inner catch was swallowing errors and returning pass:true,
  // bypassing the outer fail-closed handler. Security hooks must fail-closed on ALL errors.

  const enforcement = getEnforcementMode('ROUTER_TOOL_LOCKDOWN_ENFORCEMENT', 'block');

  // If enforcement is off, always allow
  if (enforcement === 'off') {
    return { pass: true };
  }

  // If tool is whitelisted for router, always allow
  if (ROUTER_WHITELISTED_TOOLS.includes(toolName)) {
    return { pass: true };
  }

  // If tool is not in the banned list, allow (unknown tools pass through)
  if (!ROUTER_BANNED_TOOLS.includes(toolName)) {
    return { pass: true };
  }

  // If this is a sub-agent (not the router), always allow
  if (!isRouterSession(hookInput, cwd)) {
    return { pass: true };
  }

  // Special case: Bash with whitelisted command (git status, git log, etc.)
  if (toolName === 'Bash' && toolInput) {
    const command = toolInput.command || '';
    if (isWhitelistedBashCommand(command)) {
      return { pass: true };
    }
  }

  // Build the block/warn message
  const agent = suggestAgent(toolName);
  const message =
    `[ROUTER-LOCKDOWN] Router is FORBIDDEN from using ${toolName}. ` +
    `Spawn an agent instead: Task({ task_id: 'task-N', subagent_type: '${agent}', prompt: '...' }). ` +
    'Section 0 CLAUDE.md Tool Lockdown.';

  if (enforcement === 'block') {
    return { pass: false, result: 'block', message };
  }

  // warn mode — pass but emit warning
  return { pass: true, result: 'warn', message };
}

/**
 * Main entrypoint — reads stdin, runs check, outputs result.
 */
async function main() {
  try {
    const hookInput = await parseHookInputAsync();
    if (!hookInput) {
      process.exit(0);
      return;
    }

    const toolName = getToolName(hookInput);
    const toolInput = getToolInput(hookInput);

    if (!toolName) {
      process.exit(0);
      return;
    }

    const result = checkRouterToolLockdown(toolName, toolInput, hookInput);

    if (!result.pass) {
      console.log(formatResult(result.result, result.message));
      process.exit(0);
      return;
    }

    if (result.result === 'warn' && result.message) {
      // Emit warning to stderr so it's visible
      process.stderr.write(`${result.message}\n`);
    }

    process.exit(0);
  } catch (err) {
    console.error(
      `[ROUTER-TOOL-LOCKDOWN] Unexpected error — blocking (fail-closed): ${err.message}`
    );
    process.exit(2);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  checkRouterToolLockdown,
  isRouterSession,
  isWhitelistedBashCommand,
  ROUTER_WHITELISTED_TOOLS,
  ROUTER_BANNED_TOOLS,
  main,
};
