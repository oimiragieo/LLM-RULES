'use strict';

/**
 * Autonomous Multi-Phase Execution
 *
 * Manages the discuss → plan → execute → verify loop for autonomous
 * multi-phase task execution. Tracks:
 *   - Phase transitions
 *   - Token budget consumption
 *   - Iteration count
 *   - Approval gates per phase
 *   - Goal achievement state
 *
 * Exit conditions:
 *   - GOAL_ACHIEVED: verification confirms goal met
 *   - BUDGET_EXHAUSTED: token budget consumed
 *   - MAX_ITERATIONS: iteration limit reached
 *   - USER_STOPPED: manual stop
 *   - ERROR: unrecoverable error
 *
 * @module autonomous-executor
 */

const Phase = Object.freeze({
  DISCUSS: 'discuss',
  PLAN: 'plan',
  EXECUTE: 'execute',
  VERIFY: 'verify',
});

const ExitReason = Object.freeze({
  GOAL_ACHIEVED: 'goal_achieved',
  BUDGET_EXHAUSTED: 'budget_exhausted',
  MAX_ITERATIONS: 'max_iterations',
  USER_STOPPED: 'user_stopped',
  ERROR: 'error',
});

const PHASE_ORDER = [Phase.DISCUSS, Phase.PLAN, Phase.EXECUTE, Phase.VERIFY];

const DEFAULT_MAX_ITERATIONS = 10;
const DEFAULT_TOKEN_BUDGET = 200000;

class AutonomousExecutor {
  /**
   * @param {{ goal: string, maxIterations?: number, tokenBudget?: number, approvalGates?: Object }} opts
   */
  constructor(opts) {
    if (!opts || !opts.goal) {
      throw new Error('goal is required for AutonomousExecutor');
    }

    this.goal = opts.goal;
    this.maxIterations =
      typeof opts.maxIterations === 'number' && opts.maxIterations > 0
        ? opts.maxIterations
        : DEFAULT_MAX_ITERATIONS;
    this.tokenBudget =
      typeof opts.tokenBudget === 'number' && opts.tokenBudget > 0
        ? opts.tokenBudget
        : DEFAULT_TOKEN_BUDGET;
    this.approvalGates = opts.approvalGates || {};

    this.currentPhase = Phase.DISCUSS;
    this.iteration = 0;
    this.tokensConsumed = 0;
    this._goalAchieved = false;
    this._goalReason = null;
    this._stopped = false;
    this._phaseHistory = [];
  }

  /**
   * Advance to the next phase in the cycle.
   * After VERIFY, cycles back to DISCUSS and increments iteration.
   */
  advancePhase() {
    const currentIdx = PHASE_ORDER.indexOf(this.currentPhase);
    const fromPhase = this.currentPhase;

    if (currentIdx === PHASE_ORDER.length - 1) {
      // Cycle back to DISCUSS
      this.currentPhase = Phase.DISCUSS;
      this.iteration++;
    } else {
      this.currentPhase = PHASE_ORDER[currentIdx + 1];
    }

    this._phaseHistory.push({
      from: fromPhase,
      to: this.currentPhase,
      timestamp: Date.now(),
      iteration: this.iteration,
    });
  }

  /**
   * @returns {string[]} ordered phase sequence
   */
  getPhaseOrder() {
    return [...PHASE_ORDER];
  }

  /**
   * Record token consumption.
   * @param {number} tokens
   */
  consumeTokens(tokens) {
    this.tokensConsumed += tokens;
  }

  /**
   * @returns {number} tokens remaining in budget
   */
  get tokensRemaining() {
    return Math.max(0, this.tokenBudget - this.tokensConsumed);
  }

  /**
   * @returns {boolean} whether token budget is exhausted
   */
  isBudgetExhausted() {
    return this.tokensConsumed >= this.tokenBudget;
  }

  /**
   * @returns {boolean} whether max iterations reached
   */
  isMaxIterationsReached() {
    return this.iteration >= this.maxIterations;
  }

  /**
   * Check if a phase requires approval before proceeding.
   * @param {string} phase
   * @returns {boolean}
   */
  needsApproval(phase) {
    return Boolean(this.approvalGates[phase]);
  }

  /**
   * Mark the goal as achieved.
   * @param {string} reason
   */
  markGoalAchieved(reason) {
    this._goalAchieved = true;
    this._goalReason = reason;
  }

  /**
   * Stop execution.
   */
  stop() {
    this._stopped = true;
  }

  /**
   * Determine if the loop should continue.
   * @returns {{ continue: boolean, reason?: string }}
   */
  shouldContinue() {
    if (this._goalAchieved) {
      return { continue: false, reason: ExitReason.GOAL_ACHIEVED };
    }
    if (this._stopped) {
      return { continue: false, reason: ExitReason.USER_STOPPED };
    }
    if (this.isBudgetExhausted()) {
      return { continue: false, reason: ExitReason.BUDGET_EXHAUSTED };
    }
    if (this.isMaxIterationsReached()) {
      return { continue: false, reason: ExitReason.MAX_ITERATIONS };
    }
    return { continue: true };
  }

  /**
   * Get complete status snapshot.
   * @returns {Object}
   */
  getStatus() {
    return {
      goal: this.goal,
      currentPhase: this.currentPhase,
      iteration: this.iteration,
      maxIterations: this.maxIterations,
      tokensConsumed: this.tokensConsumed,
      tokensRemaining: this.tokensRemaining,
      tokenBudget: this.tokenBudget,
      goalAchieved: this._goalAchieved,
      goalReason: this._goalReason,
      stopped: this._stopped,
    };
  }

  /**
   * Get phase transition history.
   * @returns {Array<{ from: string, to: string, timestamp: number, iteration: number }>}
   */
  getPhaseHistory() {
    return [...this._phaseHistory];
  }
}

module.exports = {
  AutonomousExecutor,
  Phase,
  ExitReason,
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_TOKEN_BUDGET,
};
