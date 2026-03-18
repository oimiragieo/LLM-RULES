#!/usr/bin/env node
'use strict';

/**
 * Session Handoff Builder (Feature E7)
 * ======================================
 * Creates structured session handoff documents with standardized
 * continue-here fields for seamless session transitions.
 *
 * Usage:
 *   const { buildHandoff, writeHandoff, formatHandoffMarkdown } = require('./session-handoff-builder.cjs');
 */

const fs = require('fs');
const path = require('path');

const HANDOFF_DIR = path.join(__dirname, '..', '..', 'context', 'memory');

/**
 * Build a structured handoff object.
 * @param {Object} params
 * @param {Object} params.nextAction - { description, command?, task_id?, agent_type? }
 * @param {Object} [params.context] - { completed_tasks, pending_tasks, blocked_tasks, key_decisions, dirty_files, active_branch }
 * @param {Object} [params.continueHere] - { plan_file, batch_progress, critical_notes, max_features_per_agent, token_budget_notes }
 * @param {Array} [params.alternatives] - [{ description, command }]
 * @param {string} [params.fromSession]
 * @returns {Object} Handoff object conforming to session-handoff.schema.json
 */
function buildHandoff(params) {
  return {
    handoff_id: `handoff-${Date.now()}`,
    from_session: params.fromSession || 'unknown',
    to_session: null,
    timestamp: new Date().toISOString(),
    next_action: {
      description: params.nextAction.description,
      command: params.nextAction.command || null,
      task_id: params.nextAction.task_id || null,
      agent_type: params.nextAction.agent_type || null,
    },
    context: {
      completed_tasks: params.context?.completed_tasks || [],
      pending_tasks: params.context?.pending_tasks || [],
      blocked_tasks: params.context?.blocked_tasks || [],
      key_decisions: params.context?.key_decisions || [],
      dirty_files: params.context?.dirty_files || [],
      active_branch: params.context?.active_branch || null,
    },
    continue_here: params.continueHere || {},
    alternatives: params.alternatives || [],
  };
}

/**
 * Format a handoff object as markdown for active_context.md.
 * @param {Object} handoff
 * @returns {string}
 */
function formatHandoffMarkdown(handoff) {
  const lines = [
    `## Session Handoff — ${handoff.timestamp}`,
    '',
    `**NEXT ACTION (IMMEDIATE):** ${handoff.next_action.description}`,
    '',
  ];

  if (handoff.next_action.command) {
    lines.push(`**Command:** \`${handoff.next_action.command}\``);
    lines.push('');
  }

  // Continue-here section
  if (handoff.continue_here) {
    const ch = handoff.continue_here;
    if (ch.batch_progress) {
      lines.push(`### Progress: ${ch.batch_progress}`);
      lines.push('');
    }
    if (ch.plan_file) {
      lines.push(`**Plan file:** ${ch.plan_file}`);
    }
    if (ch.critical_notes && ch.critical_notes.length > 0) {
      lines.push('### Critical Notes:');
      for (const note of ch.critical_notes) {
        lines.push(`- ${note}`);
      }
      lines.push('');
    }
    if (ch.max_features_per_agent) {
      lines.push(`- MAX ${ch.max_features_per_agent} features per agent spawn`);
    }
    if (ch.token_budget_notes) {
      lines.push(`- Token notes: ${ch.token_budget_notes}`);
    }
    lines.push('');
  }

  // Context section
  const ctx = handoff.context;
  if (ctx.completed_tasks.length > 0) {
    lines.push(`### Completed: ${ctx.completed_tasks.join(', ')}`);
  }
  if (ctx.pending_tasks.length > 0) {
    lines.push(`### Pending: ${ctx.pending_tasks.join(', ')}`);
  }
  if (ctx.key_decisions.length > 0) {
    lines.push('### Key Decisions:');
    for (const d of ctx.key_decisions) {
      lines.push(`- ${d}`);
    }
  }
  if (ctx.dirty_files.length > 0) {
    lines.push(`### Dirty Files: ${ctx.dirty_files.join(', ')}`);
  }
  lines.push('');

  // Alternatives
  if (handoff.alternatives.length > 0) {
    lines.push('### Alternatives:');
    for (const alt of handoff.alternatives) {
      lines.push(`- ${alt.description}${alt.command ? ` (\`${alt.command}\`)` : ''}`);
    }
  }

  return lines.join('\n');
}

/**
 * Write a handoff to active_context.md.
 * @param {Object} handoff
 */
function writeHandoff(handoff) {
  const filePath = path.join(HANDOFF_DIR, 'active_context.md');
  const markdown = formatHandoffMarkdown(handoff);
  fs.writeFileSync(filePath, markdown, 'utf8');
}

module.exports = {
  buildHandoff,
  formatHandoffMarkdown,
  writeHandoff,
  HANDOFF_DIR,
};
