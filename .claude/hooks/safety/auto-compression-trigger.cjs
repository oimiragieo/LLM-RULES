#!/usr/bin/env node
// @ts-check
/**
 * Auto-Compression Trigger Hook
 *
 * PostToolResult hook that checks if compression should be triggered after tool execution.
 * Implements non-blocking, informational behavior (Phase 2).
 *
 * Features:
 * - Monitors token budget status
 * - Tracks large Read/Fetch operations
 * - Detects periodic compression opportunities
 * - Signals agent to invoke context-compressor skill
 * - Logs compression recommendations
 *
 * Phase: 2 (Framework + Test Only - No Hard Enforcement)
 *
 * @module hooks/safety/auto-compression-trigger
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Try to load compression trigger, fall back to no-op if not available
let compressionTrigger;
try {
  compressionTrigger = require('../../lib/utils/compression-trigger.cjs');
} catch (e) {
  // Fallback (no-op)
  compressionTrigger = {
    checkCompressionNeeded: () => ({ needed: false, reason: 'Module not available', urgency: 'low' }),
    resetCompressionCounters: () => {},
  };
}

// Try to load token budget tracker
let tokenBudgetTracker;
try {
  tokenBudgetTracker = require('../../lib/utils/token-budget-tracker.cjs');
} catch (e) {
  // Fallback
  tokenBudgetTracker = {
    checkBudgetStatus: () => ({ percentUsed: 0, status: 'OK' }),
  };
}

// =============================================================================
// State Tracking
// =============================================================================

let operationCount = 0;

/**
 * Get current operation count
 * @returns {number}
 */
function getOperationCount() {
  return operationCount;
}

/**
 * Reset operation count
 */
function resetOperationCount() {
  operationCount = 0;
  compressionTrigger.resetCompressionCounters();
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * PostToolResult hook for auto-compression triggering
 *
 * @param {Object} hookInput - Hook input object
 * @returns {Object|void} Action signal or void
 */
function postToolResult(hookInput) {
  try {
    // Only process PostToolResult hooks
    if (hookInput.hook !== 'PostToolResult') {
      return;
    }

    const { tool, result, taskId, agentId } = hookInput;

    // Skip if no result or disabled
    if (!result || process.env.AUTO_COMPRESSION_ENABLED === 'false') {
      return;
    }

    // Calculate result size
    const resultSize = result ? JSON.stringify(result).length : 0;

    // Increment operation counter
    operationCount++;

    // Determine last operation sizes
    const lastReadSize = tool === 'Read' ? resultSize : 0;
    const lastFetchSize = tool === 'WebFetch' ? resultSize : 0;

    // Get current budget status
    const budgetStatus = agentId
      ? tokenBudgetTracker.checkBudgetStatus(agentId)
      : { percentUsed: 0, status: 'OK' };

    // Check if compression needed
    const compressionCheck = compressionTrigger.checkCompressionNeeded({
      tokenBudgetStatus: budgetStatus,
      lastReadSize,
      lastFetchSize,
      operationCount
    });

    // If compression needed, signal agent
    if (compressionCheck.needed) {
      // Log trigger event
      if (process.env.DEBUG_AUTO_COMPRESSION) {
        console.log('[auto-compression] Compression recommended:', {
          reason: compressionCheck.reason,
          urgency: compressionCheck.urgency,
          taskId,
          agentId
        });
      }

      // Log to file for tracking
      logCompressionTrigger({
        taskId,
        agentId,
        trigger: compressionCheck.reason,
        urgency: compressionCheck.urgency
      });

      // Return signal for agent to invoke compression
      // In Phase 2, this is informational only
      return {
        action: 'invoke_skill',
        skill: 'context-compressor',
        reason: compressionCheck.reason,
        urgency: compressionCheck.urgency,
        phase: 2, // Framework + test only
        blocking: false // Non-blocking
      };
    }
  } catch (error) {
    // Fail-open: never block agent execution
    if (process.env.DEBUG_AUTO_COMPRESSION) {
      console.error('[auto-compression] Internal error:', error.message);
    }
  }

  // No action needed
  return;
}

/**
 * Log compression trigger event
 *
 * @param {{
 *   taskId: string,
 *   agentId: string,
 *   trigger: string,
 *   urgency: string
 * }} event - Trigger event
 */
function logCompressionTrigger(event) {
  try {
    const PROJECT_ROOT = process.cwd();
    const TRIGGER_LOG_PATH = path.join(PROJECT_ROOT, '.claude/context/compression-triggers.jsonl');

    const logEntry = {
      timestamp: new Date().toISOString(),
      taskId: event.taskId,
      agentId: event.agentId,
      trigger: event.trigger,
      urgency: event.urgency,
      phase: 2 // Framework + test only
    };

    // Ensure directory exists
    const logDir = path.dirname(TRIGGER_LOG_PATH);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Append to JSONL file
    fs.appendFileSync(TRIGGER_LOG_PATH, JSON.stringify(logEntry) + '\n', 'utf8');
  } catch (error) {
    // Fail silently - logging is best-effort
    if (process.env.DEBUG_AUTO_COMPRESSION) {
      console.error('[auto-compression] Log write failed:', error.message);
    }
  }
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  postToolResult,
  getOperationCount,
  resetOperationCount,
  // Internal for testing
  logCompressionTrigger
};
