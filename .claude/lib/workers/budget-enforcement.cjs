#!/usr/bin/env node
'use strict';

/**
 * BudgetEnforcementService
 * ========================
 * Token-per-minute and concurrency limiter for the async worker pool.
 *
 * Tracks:
 *  - maxConcurrentWorkers: hard cap on simultaneous active workers
 *  - maxTokensPerMinute (TPM): rolling 60-second token budget
 *
 * Usage:
 *   const { BudgetEnforcementService } = require('.claude/lib/workers/budget-enforcement.cjs');
 *   const budget = new BudgetEnforcementService({ maxTokensPerMinute: 400000, maxConcurrentWorkers: 3 });
 *   const slot = budget.acquireWorkerSlot(1000);
 *   if (slot.allowed) {
 *     // ... do work ...
 *     slot.release();
 *   }
 */

// MEv1 B1 (CWE-400) — caller-supplied estimatedTokens must be clamped to a
// safe range so a malicious feature can neither bypass TPM with 0 nor lock
// out the pool by claiming a huge value. See:
//   .claude/context/reports/security/mev1-phase0-threat-model-2026-04-19.md (B1)
const ESTIMATED_TOKENS_MIN = 100;
const ESTIMATED_TOKENS_MAX = 50_000;

function clampEstimatedTokens(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < ESTIMATED_TOKENS_MIN) return ESTIMATED_TOKENS_MIN;
  if (n > ESTIMATED_TOKENS_MAX) return ESTIMATED_TOKENS_MAX;
  return Math.floor(n);
}

class BudgetEnforcementService {
  /**
   * @param {object} [opts]
   * @param {number} [opts.maxTokensPerMinute=400000]
   * @param {number} [opts.maxConcurrentWorkers=3]
   */
  constructor({ maxTokensPerMinute = 400000, maxConcurrentWorkers = 3 } = {}) {
    this.maxTokensPerMinute = maxTokensPerMinute;
    this.currentMinuteUsage = 0;
    this.windowStart = Date.now();
    this._concurrentCount = 0;
    this.maxConcurrentWorkers = maxConcurrentWorkers;
  }

  /**
   * Resets the token window if more than 60 seconds have elapsed since windowStart.
   */
  _resetWindowIfExpired() {
    const now = Date.now();
    if (now - this.windowStart >= 60000) {
      this.currentMinuteUsage = 0;
      this.windowStart = now;
    }
  }

  /**
   * Milliseconds until the current token window resets.
   * @returns {number}
   */
  msUntilReset() {
    return Math.max(0, 60000 - (Date.now() - this.windowStart));
  }

  /**
   * Try to acquire a worker slot.
   *
   * @param {number} [estimatedTokens=1000] - Expected token usage for this job
   * @returns {{ allowed: true, release: () => void } | { allowed: false, reason: string, retryAfterMs: number }}
   */
  acquireWorkerSlot(estimatedTokens = 1000) {
    this._resetWindowIfExpired();

    // MEv1 B1: clamp to safe range before any check so neither 0 nor huge
    // values can subvert TPM accounting.
    const clamped = clampEstimatedTokens(estimatedTokens);

    if (this._concurrentCount >= this.maxConcurrentWorkers) {
      return { allowed: false, reason: 'MAX_CONCURRENT', retryAfterMs: 0 };
    }

    if (this.currentMinuteUsage + clamped > this.maxTokensPerMinute) {
      return { allowed: false, reason: 'TPM_EXCEEDED', retryAfterMs: this.msUntilReset() };
    }

    this._concurrentCount++;
    this.currentMinuteUsage += clamped;

    return {
      allowed: true,
      release: () => {
        this._concurrentCount = Math.max(0, this._concurrentCount - 1);
      },
    };
  }

  /**
   * Returns a snapshot of the current budget state.
   * @returns {{ currentMinuteUsage: number, maxTokensPerMinute: number, concurrentCount: number, maxConcurrentWorkers: number, msUntilReset: number }}
   */
  getStats() {
    this._resetWindowIfExpired();
    return {
      currentMinuteUsage: this.currentMinuteUsage,
      maxTokensPerMinute: this.maxTokensPerMinute,
      concurrentCount: this._concurrentCount,
      maxConcurrentWorkers: this.maxConcurrentWorkers,
      msUntilReset: this.msUntilReset(),
    };
  }
}

module.exports = {
  BudgetEnforcementService,
  ESTIMATED_TOKENS_MIN,
  ESTIMATED_TOKENS_MAX,
  clampEstimatedTokens,
};
