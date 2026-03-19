'use strict';

/**
 * Pause/Resume Controller for Pipeline Execution
 *
 * State machine:
 *   RUNNING → PAUSED → RUNNING (cycle)
 *   RUNNING → STOPPED (terminal)
 *   RUNNING → COMPLETED (terminal)
 *   PAUSED → STOPPED (terminal)
 *
 * Tracks pause count, reasons, and state history.
 *
 * @module pause-resume
 */

const PipelineState = Object.freeze({
  RUNNING: 'running',
  PAUSED: 'paused',
  STOPPED: 'stopped',
  COMPLETED: 'completed',
});

const TERMINAL_STATES = new Set([PipelineState.STOPPED, PipelineState.COMPLETED]);

class PauseResumeController {
  /**
   * @param {string} pipelineId
   */
  constructor(pipelineId) {
    this.pipelineId = pipelineId;
    this._state = PipelineState.RUNNING;
    this._pauseReason = null;
    this._stopReason = null;
    this._pauseCount = 0;
    this._history = [];
    this._createdAt = Date.now();
    this._lastTransitionAt = this._createdAt;
  }

  /** @returns {string} current state */
  getState() {
    return this._state;
  }

  /** @returns {boolean} */
  isPaused() {
    return this._state === PipelineState.PAUSED;
  }

  /** @returns {boolean} */
  isActive() {
    return this._state === PipelineState.RUNNING;
  }

  /**
   * Pause the pipeline.
   * @param {string} [reason]
   */
  pause(reason) {
    if (TERMINAL_STATES.has(this._state)) return;
    if (this._state === PipelineState.PAUSED) return;
    this._transition(PipelineState.PAUSED);
    this._pauseReason = reason || null;
    this._pauseCount++;
  }

  /**
   * Resume the pipeline.
   */
  resume() {
    if (this._state !== PipelineState.PAUSED) return;
    this._transition(PipelineState.RUNNING);
    this._pauseReason = null;
  }

  /**
   * Stop the pipeline (terminal).
   * @param {string} [reason]
   */
  stop(reason) {
    if (TERMINAL_STATES.has(this._state)) return;
    this._transition(PipelineState.STOPPED);
    this._stopReason = reason || null;
  }

  /**
   * Mark pipeline as completed (terminal).
   */
  complete() {
    if (TERMINAL_STATES.has(this._state)) return;
    this._transition(PipelineState.COMPLETED);
  }

  /**
   * Get full status snapshot.
   */
  getStatus() {
    return {
      pipelineId: this.pipelineId,
      state: this._state,
      pauseReason: this._pauseReason,
      stopReason: this._stopReason,
      pauseCount: this._pauseCount,
      createdAt: this._createdAt,
      lastTransitionAt: this._lastTransitionAt,
    };
  }

  /**
   * Get state transition history.
   * @returns {Array<{ from: string, to: string, timestamp: number }>}
   */
  getHistory() {
    return [...this._history];
  }

  /** @private */
  _transition(newState) {
    const from = this._state;
    this._state = newState;
    this._lastTransitionAt = Date.now();
    this._history.push({ from, to: newState, timestamp: this._lastTransitionAt });
  }
}

module.exports = {
  PauseResumeController,
  PipelineState,
};
