#!/usr/bin/env node
'use strict';

/**
 * Checkpoint Protocol (Feature B4)
 * =================================
 * Formal checkpoint types for pipeline execution control:
 * - human-verify (90%): confirm work looks correct before proceeding
 * - decision (9%): choose between alternatives
 * - human-action (1%): manual auth/action gates that can't be automated
 *
 * Usage:
 *   const { createCheckpoint, isAutoBypassable, CHECKPOINT_TYPES } = require('./checkpoint-protocol.cjs');
 */

const CHECKPOINT_TYPES = {
  'human-verify': {
    type: 'human-verify',
    description: 'Confirm completed work before proceeding',
    autoBypassable: true,
    frequency: '90% of checkpoints',
    prompt: 'Verify: Does the completed work meet requirements?',
  },
  decision: {
    type: 'decision',
    description: 'Choose between alternative approaches',
    autoBypassable: true,
    frequency: '9% of checkpoints',
    prompt: 'Decision needed: Which approach should we take?',
  },
  'human-action': {
    type: 'human-action',
    description: 'Manual action required (auth, deployment, external system)',
    autoBypassable: false,
    frequency: '1% of checkpoints',
    prompt: 'Human action required: This step cannot be automated.',
  },
};

/**
 * @typedef {Object} Checkpoint
 * @property {string} id
 * @property {'human-verify'|'decision'|'human-action'} type
 * @property {string} description
 * @property {string} task_id - Associated task ID
 * @property {'pending'|'passed'|'failed'|'skipped'} status
 * @property {string[]} [options] - For decision type
 * @property {string} [selected_option] - For decision type
 * @property {string} [verified_by] - Who verified ('auto'|'user')
 * @property {string} [timestamp]
 */

/**
 * Create a new checkpoint.
 * @param {Object} params
 * @param {string} params.id
 * @param {'human-verify'|'decision'|'human-action'} params.type
 * @param {string} params.description
 * @param {string} params.task_id
 * @param {string[]} [params.options] - For decision type
 * @returns {Checkpoint}
 */
function createCheckpoint({ id, type, description, task_id, options }) {
  if (!CHECKPOINT_TYPES[type]) {
    throw new Error(`Invalid checkpoint type: ${type}. Valid: ${Object.keys(CHECKPOINT_TYPES).join(', ')}`);
  }
  return {
    id,
    type,
    description,
    task_id,
    status: 'pending',
    options: type === 'decision' ? (options || []) : undefined,
    selected_option: undefined,
    verified_by: undefined,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Check if a checkpoint can be auto-bypassed in autonomous mode.
 * @param {Checkpoint} checkpoint
 * @returns {boolean}
 */
function isAutoBypassable(checkpoint) {
  const typeDef = CHECKPOINT_TYPES[checkpoint.type];
  return typeDef ? typeDef.autoBypassable : false;
}

/**
 * Resolve a checkpoint (mark as passed/failed/skipped).
 * @param {Checkpoint} checkpoint
 * @param {'passed'|'failed'|'skipped'} status
 * @param {Object} [resolution]
 * @param {string} [resolution.verified_by]
 * @param {string} [resolution.selected_option]
 * @returns {Checkpoint}
 */
function resolveCheckpoint(checkpoint, status, resolution = {}) {
  return {
    ...checkpoint,
    status,
    verified_by: resolution.verified_by || 'auto',
    selected_option: resolution.selected_option,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Auto-bypass all bypassable checkpoints in a list.
 * Returns the first non-bypassable checkpoint that blocks, or null if all passed.
 * @param {Checkpoint[]} checkpoints
 * @returns {{ resolved: Checkpoint[], blocker: Checkpoint|null }}
 */
function autoBypassCheckpoints(checkpoints) {
  const resolved = [];
  let blocker = null;

  for (const cp of checkpoints) {
    if (cp.status !== 'pending') {
      resolved.push(cp);
      continue;
    }
    if (isAutoBypassable(cp)) {
      resolved.push(resolveCheckpoint(cp, 'passed', { verified_by: 'auto' }));
    } else {
      blocker = cp;
      resolved.push(cp);
      break;
    }
  }

  return { resolved, blocker };
}

module.exports = {
  CHECKPOINT_TYPES,
  createCheckpoint,
  isAutoBypassable,
  resolveCheckpoint,
  autoBypassCheckpoints,
};
