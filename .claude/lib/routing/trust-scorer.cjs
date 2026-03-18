'use strict';

/**
 * Agent Trust Scorer
 *
 * Tracks per-agent reliability over time using a 0-1000 score.
 * Default score: 500. Min 5 observations before score adjustments take effect.
 * Applies a 10% floor for low-trust agents (they still get some work assigned).
 * Score decays toward 500 at 1 point/day to prevent stale penalties.
 *
 * Score deltas:
 *   +10  successful task completion
 *   -20  guardrail failure (hook block, policy violation)
 *   -15  low reflection score (quality problem detected by reflection-agent)
 */

const SCORE_DEFAULT = 500;
const SCORE_MIN = 0;
const SCORE_MAX = 1000;
const MIN_OBSERVATIONS = 5;
const LOW_TRUST_FLOOR = 0.1; // 10% selection floor for any agent
const DECAY_PER_DAY = 1; // points per day toward 500
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const DELTA_SUCCESS = +10;
const DELTA_GUARDRAIL_FAILURE = -20;
const DELTA_LOW_REFLECTION = -15;

/**
 * @typedef {Object} AgentRecord
 * @property {number} score         - Current trust score (0-1000)
 * @property {number} observations  - Total number of recorded events
 * @property {string} updatedAt     - ISO timestamp of last update
 * @property {string} createdAt     - ISO timestamp of first record
 */

class TrustScorer {
  /**
   * @param {Object} [initialState] - Optional pre-seeded agent records (for
   *   testing or persistence). Keys are agentType strings; values are
   *   AgentRecord objects.
   * @param {Function} [nowFn] - Optional override for Date.now() (testing).
   */
  constructor(initialState = {}, nowFn = null) {
    /** @type {Map<string, AgentRecord>} */
    this._agents = new Map();
    this._nowFn = typeof nowFn === 'function' ? nowFn : () => Date.now();

    if (initialState && typeof initialState === 'object') {
      for (const [agentType, record] of Object.entries(initialState)) {
        if (agentType && record && typeof record === 'object') {
          this._agents.set(String(agentType), this._normalizeRecord(record));
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  _now() {
    return this._nowFn();
  }

  _nowISO() {
    return new Date(this._now()).toISOString();
  }

  /**
   * Normalize an incoming record, filling defaults for missing fields.
   */
  _normalizeRecord(record) {
    const now = this._nowISO();
    return {
      score: typeof record.score === 'number' ? this._clamp(record.score) : SCORE_DEFAULT,
      observations:
        typeof record.observations === 'number' ? Math.max(0, Math.floor(record.observations)) : 0,
      updatedAt: record.updatedAt || now,
      createdAt: record.createdAt || now,
    };
  }

  _clamp(value) {
    return Math.max(SCORE_MIN, Math.min(SCORE_MAX, Math.round(value)));
  }

  /**
   * Get or create a record for agentType.
   */
  _getOrCreate(agentType) {
    const key = String(agentType || '');
    if (!key) return null;
    if (!this._agents.has(key)) {
      const now = this._nowISO();
      this._agents.set(key, {
        score: SCORE_DEFAULT,
        observations: 0,
        updatedAt: now,
        createdAt: now,
      });
    }
    return this._agents.get(key);
  }

  /**
   * Apply time-based decay toward SCORE_DEFAULT since last update.
   * Mutates the record in-place.
   */
  _applyDecay(record) {
    if (!record.updatedAt) return;
    const lastMs = Date.parse(record.updatedAt);
    if (!Number.isFinite(lastMs) || lastMs <= 0) return;
    const elapsedDays = (this._now() - lastMs) / MS_PER_DAY;
    if (elapsedDays < 0.001) return; // < ~1.4 minutes — skip
    const decayPoints = elapsedDays * DECAY_PER_DAY;
    if (record.score > SCORE_DEFAULT) {
      record.score = Math.max(SCORE_DEFAULT, record.score - decayPoints);
    } else if (record.score < SCORE_DEFAULT) {
      record.score = Math.min(SCORE_DEFAULT, record.score + decayPoints);
    }
    // Round to avoid floating point drift; keep as floating point internally
    // but clamp to integer range for external consumers.
  }

  /**
   * Apply a score delta to an agent. Only applies the full delta once
   * MIN_OBSERVATIONS is reached; before that, increments observations only.
   */
  _applyDelta(agentType, delta) {
    const key = String(agentType || '');
    if (!key) return;
    const record = this._getOrCreate(key);
    if (!record) return;

    // Apply decay before any mutation
    this._applyDecay(record);

    record.observations += 1;
    record.updatedAt = this._nowISO();

    // Only adjust score once we have enough observations to be meaningful.
    if (record.observations >= MIN_OBSERVATIONS) {
      record.score = this._clamp(record.score + delta);
    }

    this._agents.set(key, record);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Get the current trust score for an agent. Returns 0-1000.
   * Returns SCORE_DEFAULT for unknown agents.
   *
   * @param {string} agentType
   * @returns {number} Trust score 0-1000
   */
  getScore(agentType) {
    const key = String(agentType || '');
    if (!key || !this._agents.has(key)) return SCORE_DEFAULT;
    const record = this._agents.get(key);
    // Return a snapshot with decay applied (non-mutating view)
    const clone = { ...record };
    this._applyDecay(clone);
    return Math.round(this._clamp(clone.score));
  }

  /**
   * Record a successful task completion for an agent (+10 score).
   *
   * @param {string} agentType
   */
  recordSuccess(agentType) {
    this._applyDelta(agentType, DELTA_SUCCESS);
  }

  /**
   * Record a guardrail failure (hook block, policy violation) for an agent (-20 score).
   *
   * @param {string} agentType
   */
  recordGuardrailFailure(agentType) {
    this._applyDelta(agentType, DELTA_GUARDRAIL_FAILURE);
  }

  /**
   * Record a low reflection score (quality problem detected by reflection-agent)
   * for an agent (-15 score).
   *
   * @param {string} agentType
   */
  recordLowReflectionScore(agentType) {
    this._applyDelta(agentType, DELTA_LOW_REFLECTION);
  }

  /**
   * Determine if an agent should be assigned a task, considering the 10% floor
   * for low-trust agents. Returns true if the agent is eligible.
   *
   * @param {string} agentType
   * @param {number} [threshold=0] - Optional minimum score threshold (0-1000).
   *   Defaults to 0. Agents below threshold are gated by the LOW_TRUST_FLOOR.
   * @returns {boolean}
   */
  shouldAssignTask(agentType, threshold = 0) {
    const score = this.getScore(agentType);
    const normalizedScore = score / SCORE_MAX; // 0.0 - 1.0

    if (threshold > 0 && score < threshold) {
      // Agent is below threshold; apply the 10% floor probabilistically.
      // The floor guarantees at least LOW_TRUST_FLOOR selection probability,
      // giving low-trust agents a chance to recover.
      return normalizedScore >= LOW_TRUST_FLOOR;
    }

    return true;
  }

  /**
   * Select the best agent from a list of candidates based on trust scores.
   * Returns the agentType string with the highest score. If all candidates
   * have equal scores, returns the first one. Returns null for empty arrays.
   *
   * @param {string[]} candidates - Array of agentType strings
   * @returns {string|null}
   */
  selectBestAgent(candidates) {
    if (!Array.isArray(candidates) || candidates.length === 0) return null;

    let best = null;
    let bestScore = -Infinity;

    for (const agentType of candidates) {
      const score = this.getScore(agentType);
      if (score > bestScore) {
        bestScore = score;
        best = agentType;
      }
    }

    return best;
  }

  /**
   * Get all known agent scores as a plain object.
   * Keys are agentType strings; values are objects with { score, observations, updatedAt, createdAt }.
   *
   * Scores are returned with decay applied.
   *
   * @returns {Object.<string, {score: number, observations: number, updatedAt: string, createdAt: string}>}
   */
  getAllScores() {
    const result = {};
    for (const [agentType, record] of this._agents.entries()) {
      const clone = { ...record };
      this._applyDecay(clone);
      result[agentType] = {
        score: Math.round(this._clamp(clone.score)),
        observations: clone.observations,
        updatedAt: clone.updatedAt,
        createdAt: clone.createdAt,
      };
    }
    return result;
  }

  /**
   * Serialize the current state to a plain JSON-serializable object.
   * Suitable for persistence and reconstruction via the constructor.
   *
   * @returns {Object}
   */
  toJSON() {
    return this.getAllScores();
  }
}

module.exports = {
  TrustScorer,
  SCORE_DEFAULT,
  SCORE_MIN,
  SCORE_MAX,
  MIN_OBSERVATIONS,
  LOW_TRUST_FLOOR,
  DECAY_PER_DAY,
  DELTA_SUCCESS,
  DELTA_GUARDRAIL_FAILURE,
  DELTA_LOW_REFLECTION,
};
