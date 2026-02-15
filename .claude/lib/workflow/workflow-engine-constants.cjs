'use strict';

/**
 * Maximum handlers allowed per event type to prevent memory exhaustion
 * SEC-IMPL-003: Memory Exhaustion Risk (CWE-770)
 */
const MAX_HANDLERS = 100;

/**
 * EVOLVE workflow phases
 * E -> V -> O -> L -> V -> E
 */
const PHASES = {
  EVALUATE: 'evaluate',
  VALIDATE: 'validate',
  OBTAIN: 'obtain',
  LOCK: 'lock',
  VERIFY: 'verify',
  ENABLE: 'enable',
};

/**
 * Valid phase transitions
 */
const TRANSITIONS = {
  evaluate: ['validate'],
  validate: ['obtain'],
  obtain: ['lock'],
  lock: ['verify'],
  verify: ['enable', 'lock'], // Can retry lock if verify fails
  enable: ['complete'],
};

/**
 * Phase execution order
 */
const PHASE_ORDER = ['evaluate', 'validate', 'obtain', 'lock', 'verify', 'enable'];

module.exports = {
  MAX_HANDLERS,
  PHASES,
  TRANSITIONS,
  PHASE_ORDER,
};
