'use strict';

/**
 * Friction Loop Engine
 *
 * EventEmitter-based engine that handles validation failures and worker revival.
 * When 'validation-failed' event fires, re-enqueues the task with incremented
 * attempt_count.
 *
 * Re-enqueued payload includes:
 * - originalContext: The original feature context
 * - stderrDump: Captured stderr from failed attempt
 * - iteration number
 *
 * Escalation ladder:
 * - iteration 1 → strategy:'retry' (same prompt + stderr)
 * - iteration 2 → strategy:'replan' (directive to reconsider approach)
 * - iteration 3 → emits 'human-intervention-required' event with full context dump
 *
 * After cap (3): subsequent failures emit 'friction-capped', not re-enqueued.
 *
 * Transient errors (error.transient === true) always use retry strategy
 * without advancing escalation counter.
 */

const { EventEmitter } = require('node:events');

// Configuration constants
const MAX_ITERATIONS = 3;

/**
 * Determine the strategy based on iteration count
 * @param {number} iteration - Current iteration number
 * @returns {'retry'|'replan'|'human'|'capped'}
 */
function determineStrategy(iteration) {
  if (iteration >= MAX_ITERATIONS + 1) {
    return 'capped';
  }
  if (iteration === 3) {
    return 'human';
  }
  if (iteration === 2) {
    return 'replan';
  }
  return 'retry';
}

/**
 * Get the replan directive message
 * @returns {string}
 */
function getReplanDirective() {
  return 'Your previous approach did not succeed. Please reconsider your strategy and try a different approach. Review the stderr output for clues about what went wrong.';
}

/**
 * Get the suggested action for human intervention
 * @param {string} featureId - Feature ID
 * @param {number} iterationCount - Total iteration count
 * @returns {string}
 */
function getSuggestedAction(featureId, iterationCount) {
  return `Feature "${featureId}" has failed validation ${iterationCount} times despite automated retry strategies. Manual review and intervention may be required to resolve blocking issues.`;
}

/**
 * FrictionLoopEngine class
 *
 * Manages the friction loop for validation failures.
 */
class FrictionLoopEngine extends EventEmitter {
  /**
   * @param {object} options - Configuration options
   * @param {import('better-sqlite3').Database} options.db - SQLite database
   * @param {Function} options.enqueueFn - Function to enqueue messages (db, payload) => { id }
   * @param {number} [options.maxIterations] - Maximum iterations before cap (default: 3)
   */
  constructor(options = {}) {
    super();

    this.db = options.db;
    this.enqueueFn = options.enqueueFn;
    this.maxIterations = options.maxIterations ?? MAX_ITERATIONS;

    // State tracking
    this.isRunning = false;

    // Per-feature iteration tracking
    // Map<featureId, { iteration: number, stderrHistory: string[] }>
    this.featureIterations = new Map();
  }

  /**
   * Start the friction loop engine
   */
  start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.featureIterations.clear();

    // Register event handler for validation failures
    this._onValidationFailed = this._handleValidationFailed.bind(this);
    this.on('validation-failed', this._onValidationFailed);
  }

  /**
   * Stop the friction loop engine
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // Remove event handler
    if (this._onValidationFailed) {
      this.off('validation-failed', this._onValidationFailed);
      this._onValidationFailed = null;
    }

    // Clear state
    this.featureIterations.clear();
  }

  /**
   * Handle validation-failed event
   * Uses setImmediate to defer event emissions, allowing listeners to register.
   * @param {object} data - Event data
   * @param {object} data.originalContext - Original feature context
   * @param {Error} data.error - Error that caused the failure
   * @param {string} [data.stderr] - Captured stderr from failed attempt
   * @private
   */
  _handleValidationFailed(data) {
    const { originalContext, error, stderr } = data;

    // Validate required fields
    if (!originalContext) {
      setImmediate(() => {
        this.emit('error', {
          code: 'MISSING_CONTEXT',
          message: 'validation-failed event missing originalContext',
        });
      });
      return;
    }

    const featureId = originalContext.featureId;
    if (!featureId) {
      setImmediate(() => {
        this.emit('error', {
          code: 'MISSING_FEATURE_ID',
          message: 'originalContext missing featureId',
        });
      });
      return;
    }

    // Get or create iteration tracking for this feature
    let featureState = this.featureIterations.get(featureId);
    if (!featureState) {
      featureState = { iteration: 0, stderrHistory: [] };
      this.featureIterations.set(featureId, featureState);
    }

    // Check if this is a transient error
    const isTransient = error && error.transient === true;

    // Determine the incoming iteration from context (if provided)
    const incomingIteration = originalContext.iteration ?? 0;

    // For non-transient errors, increment iteration
    // For transient errors, use the existing iteration without incrementing
    let currentIteration;
    if (isTransient) {
      // Transient errors don't advance the counter
      // Use the current stored iteration, or start at 1 if this is the first failure
      if (featureState.iteration === 0) {
        // First failure for this feature - start at 1
        featureState.iteration = 1;
      }
      // Use the stored iteration (don't increment for transient)
      currentIteration = featureState.iteration;
    } else {
      // Non-transient: increment the stored iteration
      featureState.iteration = Math.max(featureState.iteration, incomingIteration) + 1;
      currentIteration = featureState.iteration;
    }

    // Add stderr to history
    const stderrEntry = stderr ?? '';
    featureState.stderrHistory.push(stderrEntry);

    // Determine strategy
    const strategy = determineStrategy(currentIteration);

    // Handle based on strategy
    switch (strategy) {
      case 'retry':
        this._handleRetry(originalContext, stderrEntry, currentIteration, isTransient);
        break;

      case 'replan':
        this._handleReplan(originalContext, stderrEntry, currentIteration);
        break;

      case 'human':
        this._handleHumanIntervention(
          originalContext,
          featureState.stderrHistory,
          currentIteration
        );
        break;

      case 'capped':
        this._handleCapped(originalContext, featureState.stderrHistory, currentIteration);
        break;

      default:
        setImmediate(() => {
          this.emit('error', {
            code: 'UNKNOWN_STRATEGY',
            message: `Unknown strategy: ${strategy}`,
          });
        });
    }
  }

  /**
   * Handle retry strategy
   * Uses setImmediate to defer event emissions.
   * @param {object} originalContext - Original context
   * @param {string} stderrDump - Stderr from failed attempt
   * @param {number} iteration - Current iteration
   * @param {boolean} isTransient - Whether the error was transient
   * @private
   */
  _handleRetry(originalContext, stderrDump, iteration, isTransient) {
    const payload = {
      ...originalContext,
      originalContext,
      stderrDump,
      iteration,
      strategy: 'retry',
      isTransient: isTransient || undefined,
    };

    // Re-enqueue the task
    if (this.enqueueFn && this.db) {
      try {
        this.enqueueFn(this.db, {
          featureId: originalContext.featureId,
          skillName: originalContext.skillName,
          ...payload,
        });
      } catch (enqueueError) {
        setImmediate(() => {
          this.emit('error', {
            code: 'ENQUEUE_FAILED',
            message: enqueueError.message,
            featureId: originalContext.featureId,
          });
        });
        return;
      }
    }

    // Emit re-enqueued event asynchronously
    setImmediate(() => {
      this.emit('re-enqueued', payload);
    });
  }

  /**
   * Handle replan strategy
   * Uses setImmediate to defer event emissions.
   * @param {object} originalContext - Original context
   * @param {string} stderrDump - Stderr from failed attempt
   * @param {number} iteration - Current iteration
   * @private
   */
  _handleReplan(originalContext, stderrDump, iteration) {
    const directive = getReplanDirective();

    const payload = {
      ...originalContext,
      originalContext,
      stderrDump,
      iteration,
      strategy: 'replan',
      directive,
    };

    // Re-enqueue the task with replan directive
    if (this.enqueueFn && this.db) {
      try {
        this.enqueueFn(this.db, {
          featureId: originalContext.featureId,
          skillName: originalContext.skillName,
          ...payload,
        });
      } catch (enqueueError) {
        setImmediate(() => {
          this.emit('error', {
            code: 'ENQUEUE_FAILED',
            message: enqueueError.message,
            featureId: originalContext.featureId,
          });
        });
        return;
      }
    }

    // Emit re-enqueued event asynchronously
    setImmediate(() => {
      this.emit('re-enqueued', payload);
    });
  }

  /**
   * Handle human intervention required
   * Uses setImmediate to defer event emissions.
   * @param {object} originalContext - Original context
   * @param {string[]} stderrHistory - History of stderr outputs
   * @param {number} iterationCount - Total iteration count
   * @private
   */
  _handleHumanIntervention(originalContext, stderrHistory, iterationCount) {
    const featureId = originalContext.featureId;
    const featureTitle = originalContext.featureTitle || originalContext.featureId;

    // Build the context dump
    const contextDump = {
      featureId,
      featureTitle,
      originalPrompt: this._buildOriginalPrompt(originalContext),
      stderrHistory: [...stderrHistory],
      iterationCount,
      suggestedAction: getSuggestedAction(featureId, iterationCount),
    };

    // Emit human-intervention-required event (NO re-enqueue) asynchronously
    setImmediate(() => {
      this.emit('human-intervention-required', contextDump);
    });
  }

  /**
   * Handle capped failures
   * Uses setImmediate to defer event emissions.
   * @param {object} originalContext - Original context
   * @param {string[]} stderrHistory - History of stderr outputs
   * @param {number} iterationCount - Total iteration count
   * @private
   */
  _handleCapped(originalContext, stderrHistory, iterationCount) {
    const featureId = originalContext.featureId;

    // Emit friction-capped event (NO re-enqueue) asynchronously
    setImmediate(() => {
      this.emit('friction-capped', {
        featureId,
        iterationCount,
        stderrHistory: [...stderrHistory],
        message: `Feature ${featureId} has exceeded maximum retry attempts (${this.maxIterations})`,
      });
    });
  }

  /**
   * Build the original prompt/mission context string
   * @param {object} originalContext - Original context
   * @returns {string}
   * @private
   */
  _buildOriginalPrompt(originalContext) {
    const parts = [];

    if (originalContext.personaContext) {
      const pc = originalContext.personaContext;
      if (pc.missionObjectives && pc.missionObjectives.length > 0) {
        parts.push('Mission Objectives:');
        pc.missionObjectives.forEach(obj => parts.push(`- ${obj}`));
      }
      if (pc.featureDescription) {
        parts.push(`\nFeature Description: ${pc.featureDescription}`);
      }
      if (pc.expectedBehavior && pc.expectedBehavior.length > 0) {
        parts.push('\nExpected Behavior:');
        pc.expectedBehavior.forEach(beh => parts.push(`- ${beh}`));
      }
    }

    if (originalContext.description) {
      parts.push(`\nDescription: ${originalContext.description}`);
    }

    return parts.join('\n');
  }

  /**
   * Get the current iteration for a feature
   * @param {string} featureId - Feature ID
   * @returns {number} - Current iteration (0 if not tracked)
   */
  getIteration(featureId) {
    const state = this.featureIterations.get(featureId);
    return state ? state.iteration : 0;
  }

  /**
   * Get the stderr history for a feature
   * @param {string} featureId - Feature ID
   * @returns {string[]} - Stderr history (empty array if not tracked)
   */
  getStderrHistory(featureId) {
    const state = this.featureIterations.get(featureId);
    return state ? [...state.stderrHistory] : [];
  }

  /**
   * Reset the iteration tracking for a feature
   * @param {string} featureId - Feature ID
   */
  resetFeature(featureId) {
    this.featureIterations.delete(featureId);
  }

  /**
   * Reset all iteration tracking
   */
  resetAll() {
    this.featureIterations.clear();
  }
}

/**
 * Create a new FrictionLoopEngine instance
 * @param {object} options - Configuration options
 * @returns {FrictionLoopEngine}
 */
function createFrictionLoopEngine(options = {}) {
  return new FrictionLoopEngine(options);
}

module.exports = {
  FrictionLoopEngine,
  createFrictionLoopEngine,
  determineStrategy,
  getReplanDirective,
  getSuggestedAction,
  MAX_ITERATIONS,
};
