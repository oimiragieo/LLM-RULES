'use strict';

/**
 * Validation state constants — state enums, transition table, default assertion shape.
 * Extracted from validation-state-gatekeeper.cjs as part of H-09 split.
 */

// Valid assertion states
const VALID_STATES = ['pending', 'passed', 'failed', 'blocked'];

// Valid state transitions (from -> [allowed to states])
// passed is a terminal state - no outgoing transitions
const VALID_TRANSITIONS = {
  pending: ['passed', 'failed', 'blocked'],
  failed: ['passed', 'blocked', 'pending'],
  blocked: ['pending'],
  passed: [], // Terminal state
};

// Default assertion structure
const DEFAULT_ASSERTION = {
  status: 'pending',
  updatedAt: null,
  validatedAtMilestone: null,
};

module.exports = {
  VALID_STATES,
  VALID_TRANSITIONS,
  DEFAULT_ASSERTION,
};
