'use strict';

/**
 * Validation state gatekeeper — facade.
 * Re-exports the full public surface from sub-modules.
 *
 * Split performed as H-09 phase 1 of 3.
 * Original 598-line file split into:
 *   constants.cjs    (~30 lines)  — state enums + transition table
 *   state-io.cjs     (~140 lines) — atomic write + corruption recovery
 *   gatekeeper-class.cjs (~360 lines) — class + convenience wrappers
 */

const {
  VALID_STATES,
  VALID_TRANSITIONS,
  DEFAULT_ASSERTION,
} = require('./validation-state-gatekeeper/constants.cjs');
const {
  atomicWriteJSON,
  initializeState,
  loadState,
} = require('./validation-state-gatekeeper/state-io.cjs');
const {
  ValidationStateGatekeeper,
  createGatekeeper,
  canComplete,
  transitionAssertion,
} = require('./validation-state-gatekeeper/gatekeeper-class.cjs');

module.exports = {
  ValidationStateGatekeeper,
  createGatekeeper,
  canComplete,
  transitionAssertion,
  initializeState,
  loadState,
  atomicWriteJSON,
  VALID_STATES,
  VALID_TRANSITIONS,
  DEFAULT_ASSERTION,
};
