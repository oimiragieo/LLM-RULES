'use strict';

/**
 * spawn-prompt-assembler.worktree.cjs
 *
 * Worktree isolation override logic for spawn-prompt-assembler.
 * Extracted from task-tools.cjs so it can be consumed at the basePrompt
 * assembly level (spawn-prompt-assembler.core.cjs) before task-specific
 * enrichment runs.
 *
 * Backward compatibility: task-tools.cjs re-exports this module's exports.
 * Any caller that imports from task-tools.cjs continues to work unchanged.
 */

/**
 * Agent types that have worktree isolation enabled in their frontmatter.
 * When these agents work on framework paths (.claude/), the isolation must
 * be overridden to 'none' to prevent silent data loss during worktree cleanup.
 */
const WORKTREE_ISOLATED_AGENTS = new Set([
  'developer',
  'qa',
  'code-reviewer',
  'frontend-pro',
  'nextjs-pro',
  'medical-research-triage',
]);

const FRAMEWORK_PATHS = [
  '.claude/hooks/',
  '.claude/skills/',
  '.claude/agents/',
  '.claude/tools/',
  '.claude/workflows/',
  '.claude/templates/',
  '.claude/schemas/',
  '.claude/lib/',
  '.claude/commands/',
  '.claude/config/',
  '.claude/docs/',
  '.claude/rules/',
  '.claude/scripts/',
];

const TASK_ID_EXTRACT_REGEX =
  /Task ID:\s{0,10}[<"']?([a-zA-Z0-9_-]{1,64})|taskId:\s{0,10}[<"']?([a-zA-Z0-9_-]{1,64})/i;

/**
 * Determines if worktree isolation should be overridden for an agent task.
 * Framework paths (.claude/) should NOT use worktree isolation because changes
 * are silently discarded when the worktree is cleaned up.
 *
 * Applies to all agents that have `isolation: worktree` in their frontmatter:
 * developer, qa, code-reviewer, frontend-pro, nextjs-pro, medical-research-triage.
 *
 * @param {string} prompt - The task prompt text
 * @param {string} agentType - The agent type being spawned
 * @returns {boolean} true if isolation should be overridden to 'none'
 */
function shouldOverrideWorktreeIsolation(prompt, agentType) {
  if (!prompt || typeof prompt !== 'string') return false;
  if (!agentType || typeof agentType !== 'string') return false;

  const normalizedType = agentType.trim().toLowerCase();
  if (!WORKTREE_ISOLATED_AGENTS.has(normalizedType)) return false;

  // Normalize Windows backslashes to forward slashes for consistent matching (SE-01)
  const normalizedPrompt = prompt.replace(/\\/g, '/');

  const detectedPath = FRAMEWORK_PATHS.find(fp => normalizedPrompt.includes(fp));
  if (!detectedPath) return false;

  // Telemetry: emit to stderr when override fires (hooks use stderr per convention)
  const taskIdMatch = prompt.match(TASK_ID_EXTRACT_REGEX);
  const taskId = taskIdMatch ? taskIdMatch[1] || taskIdMatch[2] || 'unknown' : 'unknown';
  const allDetected = FRAMEWORK_PATHS.filter(fp => normalizedPrompt.includes(fp)).join(', ');

  console.error(
    `[spawn-prompt-assembler] worktree-override: agentType=${normalizedType} taskId=${taskId} ` +
      `frameworkPaths=[${allDetected}] timestamp=${new Date().toISOString()}`
  );

  return true;
}

module.exports = {
  WORKTREE_ISOLATED_AGENTS,
  FRAMEWORK_PATHS,
  shouldOverrideWorktreeIsolation,
};
