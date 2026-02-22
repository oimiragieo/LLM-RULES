'use strict';
/**
 * Context Pressure Detector (Track 1.1)
 *
 * Provides a pure-function interface for detecting context pressure levels
 * based on token budget usage, operation counts, and large-read patterns.
 *
 * This module is the logic layer; compression-trigger.cjs handles the action layer.
 * The checkContextPressure export is wired into compression-trigger.cjs.
 *
 * @returns {{ needed: boolean, pressure: 'low'|'medium'|'high', reason: string }}
 */

const HIGH_BUDGET_THRESHOLD = 90; // %
const MEDIUM_BUDGET_THRESHOLD = 70; // %
const HIGH_LARGE_READ_COUNT = 3;
const MEDIUM_OPERATION_COUNT = 10;

/**
 * Evaluate whether context is under pressure and at what level.
 *
 * @param {object} context
 * @param {number} [context.tokenBudgetPercent=0]  - % of token budget consumed
 * @param {number} [context.operationCount=0]      - total operations in session
 * @param {number} [context.largeReadCount=0]      - number of reads > 10 KB
 * @returns {{ needed: boolean, pressure: 'low'|'medium'|'high', reason: string }}
 */
function checkContextPressure(context = {}) {
  const tokenBudgetPercent = Number(context.tokenBudgetPercent) || 0;
  const operationCount = Number(context.operationCount) || 0;
  const largeReadCount = Number(context.largeReadCount) || 0;

  // Trigger 1: Budget > 90% → HIGH
  if (tokenBudgetPercent >= HIGH_BUDGET_THRESHOLD) {
    return {
      needed: true,
      pressure: 'high',
      reason: `Token budget at ${tokenBudgetPercent.toFixed(1)}% (>= ${HIGH_BUDGET_THRESHOLD}%)`,
    };
  }

  // Trigger 2: Many large reads → HIGH
  if (largeReadCount >= HIGH_LARGE_READ_COUNT) {
    return {
      needed: true,
      pressure: 'high',
      reason: `${largeReadCount} large reads detected (>= ${HIGH_LARGE_READ_COUNT})`,
    };
  }

  // Trigger 3: Budget 70–89% → MEDIUM
  if (tokenBudgetPercent >= MEDIUM_BUDGET_THRESHOLD) {
    return {
      needed: true,
      pressure: 'medium',
      reason: `Token budget at ${tokenBudgetPercent.toFixed(1)}% (>= ${MEDIUM_BUDGET_THRESHOLD}%)`,
    };
  }

  // Trigger 4: Many operations → MEDIUM
  if (operationCount >= MEDIUM_OPERATION_COUNT) {
    return {
      needed: true,
      pressure: 'medium',
      reason: `${operationCount} operations in session (>= ${MEDIUM_OPERATION_COUNT})`,
    };
  }

  return {
    needed: false,
    pressure: 'low',
    reason: 'No context pressure triggers active',
  };
}

module.exports = {
  checkContextPressure,
  // Export thresholds for testability
  HIGH_BUDGET_THRESHOLD,
  MEDIUM_BUDGET_THRESHOLD,
  HIGH_LARGE_READ_COUNT,
  MEDIUM_OPERATION_COUNT,
};
