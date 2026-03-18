#!/usr/bin/env node
'use strict';

/**
 * Static Invariant Generation (Feature F3)
 * =========================================
 * Extracts routing rules, tool restrictions, and iron laws from CLAUDE.md
 * policies into a machine-checkable format. Invariants can be verified
 * at runtime to detect policy violations.
 *
 * Usage:
 *   const { INVARIANTS, checkInvariant, checkAll, getInvariantsByCategory } = require('./static-invariants.cjs');
 */

/**
 * @typedef {Object} Invariant
 * @property {string} id - Unique invariant identifier (e.g., 'INV-R01')
 * @property {string} category - Category: 'routing'|'tooling'|'creator'|'security'|'memory'|'task'
 * @property {string} description - Human-readable description
 * @property {string} source - Source reference (e.g., 'CLAUDE.md Section 0')
 * @property {'error'|'warning'} severity - Violation severity
 * @property {function} check - Validation function (context) => { valid: bool, message?: string }
 */

const INVARIANTS = [
  // === ROUTING INVARIANTS ===
  {
    id: 'INV-R01',
    category: 'routing',
    description: 'Router must call TaskList() before spawning agents',
    source: 'CLAUDE.md Section 0.1',
    severity: 'error',
    check: (ctx) => ({
      valid: ctx.taskListCalledBeforeSpawn !== false,
      message: 'TaskList() was not called before Task() spawn',
    }),
  },
  {
    id: 'INV-R02',
    category: 'routing',
    description: 'Specialist agents must be used over developer when available',
    source: 'CLAUDE.md Section 1 — Specialist-First Routing Law',
    severity: 'error',
    check: (ctx) => {
      if (ctx.agentType !== 'developer') return { valid: true };
      const specialistMatch = ctx.specialistAvailable;
      return {
        valid: !specialistMatch,
        message: specialistMatch
          ? `Specialist "${specialistMatch}" should be used instead of developer`
          : undefined,
      };
    },
  },
  {
    id: 'INV-R03',
    category: 'routing',
    description: 'Router must process reflections (Step 0) before routing',
    source: 'CLAUDE.md Section 0.1 — Step 0',
    severity: 'error',
    check: (ctx) => ({
      valid: ctx.reflectionsProcessed !== false,
      message: 'Pending reflections exist but were not processed before routing',
    }),
  },

  // === TOOLING INVARIANTS ===
  {
    id: 'INV-T01',
    category: 'tooling',
    description: 'Router must not use banned tools (Edit, Write, Bash, Glob, Grep, WebSearch, WebFetch)',
    source: 'CLAUDE.md Section 0 — Tool Lockdown',
    severity: 'error',
    check: (ctx) => {
      const banned = ['Edit', 'Write', 'Glob', 'Grep', 'WebSearch', 'WebFetch'];
      const used = ctx.toolName;
      return {
        valid: !banned.includes(used),
        message: `Router used banned tool: ${used}`,
      };
    },
  },
  {
    id: 'INV-T02',
    category: 'tooling',
    description: 'Router Bash usage limited to git status, git log, and gap-log append',
    source: 'CLAUDE.md Section 0 — Bash whitelist',
    severity: 'error',
    check: (ctx) => {
      if (ctx.toolName !== 'Bash') return { valid: true };
      const cmd = ctx.command || '';
      const allowed =
        /^git\s+(status|log)\b/.test(cmd) ||
        /^echo\s.*>>.*session-gap-log/.test(cmd);
      return {
        valid: allowed,
        message: `Router used Bash with non-whitelisted command: ${cmd.substring(0, 80)}`,
      };
    },
  },

  // === CREATOR INVARIANTS ===
  {
    id: 'INV-C01',
    category: 'creator',
    description: 'Never write directly to creator-managed paths (.claude/skills/, .claude/agents/, .claude/hooks/, .claude/workflows/)',
    source: 'CLAUDE.md Section 1.2 — Gate 4',
    severity: 'error',
    check: (ctx) => {
      const creatorPaths = ['.claude/skills/', '.claude/agents/', '.claude/hooks/', '.claude/workflows/', '.claude/templates/', '.claude/schemas/'];
      const targetPath = (ctx.filePath || '').replace(/\\/g, '/');
      const isCreatorPath = creatorPaths.some((p) => targetPath.includes(p));
      const isCreatorSkill = ctx.viaCreatorSkill === true;
      return {
        valid: !isCreatorPath || isCreatorSkill,
        message: `Direct write to creator-managed path: ${targetPath}`,
      };
    },
  },

  // === SECURITY INVARIANTS ===
  {
    id: 'INV-S01',
    category: 'security',
    description: 'shell: false required for all child_process spawning',
    source: 'Security rules — shell: false Standard',
    severity: 'error',
    check: (ctx) => ({
      valid: ctx.shellOption !== true,
      message: 'child_process spawned with shell: true',
    }),
  },
  {
    id: 'INV-S02',
    category: 'security',
    description: 'Use safeParseJSON instead of raw JSON.parse on untrusted input',
    source: 'Security rules — JSON Parsing Safety',
    severity: 'warning',
    check: (ctx) => ({
      valid: ctx.usedSafeParseJSON !== false,
      message: 'Raw JSON.parse used on potentially untrusted input',
    }),
  },

  // === TASK INVARIANTS ===
  {
    id: 'INV-K01',
    category: 'task',
    description: 'Agents must call TaskUpdate(in_progress) before starting work',
    source: 'CLAUDE.md Section 2 — Immediate Status Rule',
    severity: 'error',
    check: (ctx) => ({
      valid: ctx.taskUpdateCalledBeforeWork !== false,
      message: 'Agent started work without calling TaskUpdate(in_progress)',
    }),
  },
  {
    id: 'INV-K02',
    category: 'task',
    description: 'Task() calls must include task_id parameter',
    source: 'CLAUDE.md Section 2 — Task Tool Signature',
    severity: 'error',
    check: (ctx) => ({
      valid: Boolean(ctx.taskId),
      message: 'Task() spawn missing required task_id parameter',
    }),
  },

  // === MEMORY INVARIANTS ===
  {
    id: 'INV-M01',
    category: 'memory',
    description: 'Never write directly to patterns.json, gotchas.json, or open-findings.json',
    source: 'CLAUDE.md Section 8 — Memory Protocol',
    severity: 'error',
    check: (ctx) => {
      const guarded = ['patterns.json', 'gotchas.json', 'open-findings.json', 'access-stats.json'];
      const targetFile = (ctx.filePath || '').replace(/\\/g, '/').split('/').pop();
      return {
        valid: !guarded.includes(targetFile),
        message: `Direct write to guarded memory file: ${targetFile}`,
      };
    },
  },
];

/**
 * Check a single invariant against a context.
 * @param {string} invariantId
 * @param {Object} context
 * @returns {{ id: string, valid: boolean, message?: string, severity: string }}
 */
function checkInvariant(invariantId, context) {
  const inv = INVARIANTS.find((i) => i.id === invariantId);
  if (!inv) {
    return { id: invariantId, valid: false, message: `Unknown invariant: ${invariantId}`, severity: 'error' };
  }
  const result = inv.check(context);
  return { id: inv.id, ...result, severity: inv.severity };
}

/**
 * Check all invariants against a context.
 * @param {Object} context
 * @returns {{ passed: string[], failed: Array<{id: string, message: string, severity: string}>, total: number }}
 */
function checkAll(context) {
  const passed = [];
  const failed = [];

  for (const inv of INVARIANTS) {
    const result = inv.check(context);
    if (result.valid) {
      passed.push(inv.id);
    } else {
      failed.push({ id: inv.id, message: result.message, severity: inv.severity });
    }
  }

  return { passed, failed, total: INVARIANTS.length };
}

/**
 * Get invariants by category.
 * @param {string} category
 * @returns {Invariant[]}
 */
function getInvariantsByCategory(category) {
  return INVARIANTS.filter((i) => i.category === category);
}

/**
 * Get all invariant IDs.
 * @returns {string[]}
 */
function getInvariantIds() {
  return INVARIANTS.map((i) => i.id);
}

module.exports = {
  INVARIANTS,
  checkInvariant,
  checkAll,
  getInvariantsByCategory,
  getInvariantIds,
};
