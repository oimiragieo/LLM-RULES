#!/usr/bin/env node
'use strict';

// Analysis Paralysis Guard — PostToolUse:Read hook
// Warns (and optionally blocks) when agents read excessively without writing.
// Advisory hook — always exits 0 (fail-open). Never blocks workflow.

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

// Per-tier warn/block thresholds (consecutive reads without a write action)
const THRESHOLDS = {
  executor: { warn: 5, block: 8 }, // developer, devops — should write quickly
  analyst: { warn: 15, block: 25 }, // researcher, architect — reads more
  orchestrator: { warn: 20, block: 30 }, // planner, router — coordination reads
  hunter: { warn: 25, block: 40 }, // deep code review / investigation
};

// Tier membership lists — used by getAgentTier()
const AGENT_TIERS = {
  executor: [
    'developer',
    'devops',
    'nodejs-pro',
    'typescript-pro',
    'python-pro',
    'frontend-pro',
    'code-simplifier',
  ],
  analyst: [
    'researcher',
    'architect',
    'code-reviewer',
    'security-architect',
    'database-architect',
    'advanced-debugging',
    'technical-writer',
    'qa',
  ],
  orchestrator: [
    'router',
    'planner',
    'master-orchestrator',
    'heartbeat-orchestrator',
    'evolution-orchestrator',
    'task-manager',
    'artifact-integrator',
  ],
};

/**
 * Determine agent tier from agent type and active skill.
 * Skill override: if activeSkill is 'edge-case-hunter', return 'hunter'.
 * Falls back to 'executor' for unknown agent types.
 *
 * @param {string} agentType
 * @param {string} activeSkill
 * @returns {'executor'|'analyst'|'orchestrator'|'hunter'}
 */
function getAgentTier(agentType, activeSkill) {
  if (activeSkill === 'edge-case-hunter') {
    return 'hunter';
  }

  for (const [tier, agents] of Object.entries(AGENT_TIERS)) {
    if (agents.includes(agentType)) {
      return tier;
    }
  }

  // Default: executor (should write soon)
  return 'executor';
}

/**
 * Returns true if the given tool name should reset the read counter.
 * Write/Edit/Bash are "action" tools that indicate progress.
 *
 * @param {string} toolName
 * @returns {boolean}
 */
function shouldReset(toolName) {
  return toolName === 'Write' || toolName === 'Edit' || toolName === 'Bash';
}

// ─── Main Hook Logic ──────────────────────────────────────────────────────────

function run() {
  let inputData = '';
  process.stdin.on('data', chunk => {
    inputData += chunk;
  });
  process.stdin.on('end', () => {
    try {
      // DR-1: Bug fix — safeParseJSON returns parsed object directly (not { success, data }).
      // Previous code destructured { success, data } which always yielded undefined, causing
      // early exit and making the hook a no-op.
      const data = safeParseJSON(inputData, null);
      if (!data || typeof data !== 'object') {
        process.exit(0);
      }

      const projectRoot = process.cwd();
      const stateFile = path.join(
        projectRoot,
        '.claude',
        'context',
        'runtime',
        'paralysis-state.json'
      );

      // Load current state
      let state = { readCount: 0, lastTool: '' };
      try {
        const raw = fs.readFileSync(stateFile, 'utf8');
        const parsed = safeParseJSON(raw, {});
        if (parsed && typeof parsed.readCount === 'number') {
          state = parsed;
        }
      } catch (_e) {
        // File doesn't exist yet — use defaults
      }

      // Determine the tool name from the hook payload
      const toolName = data?.tool_name || data?.tool || '';

      if (shouldReset(toolName)) {
        state.readCount = 0;
      } else if (toolName === 'Read' || toolName === 'Grep' || toolName === 'Glob') {
        state.readCount = (state.readCount || 0) + 1;
      }

      state.lastTool = toolName;

      // Determine agent tier
      // INVESTIGATIVE MODE: If ANALYSIS_PARALYSIS_INVESTIGATIVE=true|1, override all
      // agent tier thresholds to hunter-tier values regardless of actual agent type.
      // This allows deep code review agents to read extensively without false positives.
      const investigativeMode =
        process.env.ANALYSIS_PARALYSIS_INVESTIGATIVE === 'true' ||
        process.env.ANALYSIS_PARALYSIS_INVESTIGATIVE === '1';

      let tier;
      if (investigativeMode) {
        tier = 'hunter';
      } else {
        const agentType = process.env.AGENT_TYPE || '';
        const activeSkill = process.env.ACTIVE_SKILL || '';
        tier = getAgentTier(agentType, activeSkill);
      }
      const thresholds = THRESHOLDS[tier] || THRESHOLDS.executor;

      // Emit warnings to stderr (advisory only — never block)
      if (state.readCount >= thresholds.block) {
        process.stderr.write(
          `[analysis-paralysis-guard] BLOCK-LEVEL: ${state.readCount} consecutive reads without writing ` +
            `(block threshold: ${thresholds.block} for ${tier}). Strong recommendation: take action now.\n`
        );
      } else if (state.readCount >= thresholds.warn) {
        process.stderr.write(
          `[analysis-paralysis-guard] WARNING: ${state.readCount} consecutive reads without writing ` +
            `(warn threshold: ${thresholds.warn} for ${tier}). Consider taking action soon.\n`
        );
      }

      // Persist updated state
      try {
        const dir = path.dirname(stateFile);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(stateFile, JSON.stringify(state));
      } catch (_e) {
        // Non-fatal — state persistence failure should not block workflow
      }

      process.exit(0); // Advisory hook — always allow
    } catch (err) {
      process.stderr.write(`[analysis-paralysis-guard] Error: ${err.message}\n`);
      process.exit(0); // Fail-open
    }
  });
}

// Only run when executed directly (not when required for testing)
if (require.main === module) {
  run();
}

// Export testable internals for unit tests
module.exports = {
  THRESHOLDS,
  AGENT_TIERS,
  getAgentTier,
  shouldReset,
};
