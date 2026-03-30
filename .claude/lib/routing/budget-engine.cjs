'use strict';

/**
 * Budget Engine
 *
 * Session and project-level budget enforcement with phase allocation.
 * Supports auto model downgrade chain (opus → sonnet → haiku) and throws
 * BudgetExhaustedError when fully consumed at the minimum model.
 *
 * Multiple sessions are tracked independently.
 *
 * @module budget-engine
 */

/**
 * Default configuration values.
 * @type {BudgetEngineConfig}
 */
const DEFAULT_CONFIG = {
  defaultSessionBudget: 5.0,
  warningThreshold: 0.8,
  criticalThreshold: 0.9,
  autoDowngrade: true,
  downgradeChain: ['opus', 'sonnet', 'haiku'],
};

/**
 * @typedef {Object} BudgetEngineConfig
 * @property {number}   [defaultSessionBudget=5.00]          - Total budget per session in USD
 * @property {number}   [warningThreshold=0.8]               - Fraction spent that triggers 'warning'
 * @property {number}   [criticalThreshold=0.9]              - Fraction spent that triggers 'critical'
 * @property {boolean}  [autoDowngrade=true]                 - Whether to downgrade model automatically
 * @property {string[]} [downgradeChain=['opus','sonnet','haiku']] - Model shorthands ordered from
 *                                                              highest to lowest quality
 */

/**
 * @typedef {Object} PhaseAllocation
 * @property {number} fraction        - Fraction of total budget assigned to this phase
 * @property {number} allocatedBudget - Dollar amount allocated (totalBudget * fraction)
 * @property {number} spent           - Amount spent so far in this phase
 */

/**
 * @typedef {Object} SessionData
 * @property {number}                         totalBudget            - Total session budget in USD
 * @property {number}                         totalSpent             - Amount spent so far in USD
 * @property {string}                         currentModelShorthand  - Current model shorthand
 * @property {boolean}                        autoDowngradeTriggered - True after at least one downgrade
 * @property {Object.<string, PhaseAllocation>} phases               - Per-phase tracking
 */

/**
 * @typedef {Object} BudgetStatus
 * @property {number}  totalBudget            - Total budget allocated for this session
 * @property {number}  totalSpent             - Total amount spent in this session
 * @property {number}  remaining              - Remaining budget (clamped to 0)
 * @property {number}  burnRate               - Fraction of budget consumed (0–1+)
 * @property {'ok'|'warning'|'critical'|'exhausted'} status - Budget health status
 * @property {boolean} autoDowngradeTriggered - Whether a model downgrade has occurred
 * @property {string}  currentModel           - Full model ID currently in use
 * @property {Object}  phases                 - Per-phase status snapshot
 */

/**
 * @typedef {Object} EnforceLimitResult
 * @property {string}  model      - Full model ID to use
 * @property {boolean} downgraded - Whether the model was downgraded relative to the previous call
 */

// ---------------------------------------------------------------------------
// BudgetExhaustedError
// ---------------------------------------------------------------------------

/**
 * Thrown by BudgetEngine.enforceLimit when the session budget is fully
 * consumed and the model is already at the minimum in the downgrade chain.
 */
class BudgetExhaustedError extends Error {
  /**
   * @param {string} sessionId   - Session that ran out of budget
   * @param {number} totalBudget - Total budget for the session
   * @param {number} totalSpent  - Total amount spent
   */
  constructor(sessionId, totalBudget, totalSpent) {
    super(
      `Budget exhausted for session "${sessionId}": spent $${totalSpent.toFixed(4)} of $${totalBudget.toFixed(4)}`
    );
    this.name = 'BudgetExhaustedError';
    this.sessionId = sessionId;
    this.totalBudget = totalBudget;
    this.totalSpent = totalSpent;
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, BudgetExhaustedError.prototype);
  }
}

// ---------------------------------------------------------------------------
// BudgetEngine
// ---------------------------------------------------------------------------

class BudgetEngine {
  /**
   * @param {object} opts
   * @param {object}                                             opts.tokenAccountant - TokenAccountant instance
   * @param {import('./model-registry.cjs').ModelRegistry}       opts.modelRegistry   - ModelRegistry instance
   * @param {Partial<BudgetEngineConfig>}                        [opts.config]        - Optional config overrides
   */
  constructor({ tokenAccountant, modelRegistry, config = {} }) {
    this._tokenAccountant = tokenAccountant;
    this._modelRegistry = modelRegistry;

    /** @type {BudgetEngineConfig} */
    this._config = Object.assign({}, DEFAULT_CONFIG, config);
    // Ensure downgradeChain is a copy so it can't be mutated externally
    this._config.downgradeChain = Array.isArray(this._config.downgradeChain)
      ? [...this._config.downgradeChain]
      : [...DEFAULT_CONFIG.downgradeChain];

    /** @type {Map<string, SessionData>} */
    this._sessions = new Map();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Allocate a session budget split across named phases.
   *
   * The phases array must describe allocations whose fractions sum to <= 1.0.
   * Fractions summing > 1.0 throw a RangeError.
   *
   * If the session already exists, it is reset (re-allocated).
   *
   * @param {string}   sessionId
   * @param {Array<{phase: string, fraction: number}>} phases
   * @throws {RangeError} When fractions sum exceeds 1.0
   */
  allocateBudget(sessionId, phases) {
    // Validate fractions
    if (phases.length > 0) {
      const total = phases.reduce((sum, p) => sum + p.fraction, 0);
      // Use a small epsilon to guard against floating-point rounding
      if (total > 1.0 + 1e-9) {
        throw new RangeError(
          `Phase fractions sum to ${total.toFixed(6)}, which exceeds 1.0. ` +
            `Each session's phase fractions must sum to <= 1.0.`
        );
      }
    }

    const totalBudget = this._config.defaultSessionBudget;

    // Build phase allocations
    /** @type {Object.<string, PhaseAllocation>} */
    const phaseMap = {};
    for (const { phase, fraction } of phases) {
      phaseMap[phase] = {
        fraction,
        allocatedBudget: totalBudget * fraction,
        spent: 0,
      };
    }

    // Initialize (or reset) the session
    /** @type {SessionData} */
    const sessionData = {
      totalBudget,
      totalSpent: 0,
      currentModelShorthand: this._config.downgradeChain[0],
      autoDowngradeTriggered: false,
      phases: phaseMap,
    };

    this._sessions.set(sessionId, sessionData);
  }

  /**
   * Check the current budget status for a session.
   *
   * If the session has not been initialized via allocateBudget, an implicit
   * default session is created on demand.
   *
   * @param {string} sessionId
   * @returns {BudgetStatus}
   */
  checkBudget(sessionId) {
    const session = this._getOrCreateSession(sessionId);
    const { totalBudget, totalSpent, autoDowngradeTriggered, phases } = session;

    const remaining = Math.max(0, totalBudget - totalSpent);
    const fraction = totalBudget > 0 ? totalSpent / totalBudget : 0;
    const burnRate = fraction; // fraction of budget consumed (0–1+)

    // Determine status
    let status;
    if (fraction >= 1.0) {
      status = 'exhausted';
    } else if (fraction >= this._config.criticalThreshold) {
      status = 'critical';
    } else if (fraction >= this._config.warningThreshold) {
      status = 'warning';
    } else {
      status = 'ok';
    }

    // Resolve full model ID for currentModelShorthand
    const modelEntry = this._resolveShorthand(session.currentModelShorthand);
    const currentModel = modelEntry ? modelEntry.id : session.currentModelShorthand;

    // Build phase snapshot
    const phasesSnapshot = {};
    for (const [name, alloc] of Object.entries(phases)) {
      phasesSnapshot[name] = {
        fraction: alloc.fraction,
        allocatedBudget: alloc.allocatedBudget,
        spent: alloc.spent,
        remaining: Math.max(0, alloc.allocatedBudget - alloc.spent),
      };
    }

    return {
      totalBudget,
      totalSpent,
      remaining,
      burnRate,
      status,
      autoDowngradeTriggered,
      currentModel,
      phases: phasesSnapshot,
    };
  }

  /**
   * Enforce the budget limit for a session.
   *
   * Behavior:
   * - 'ok': returns current model unchanged (downgraded: false)
   * - 'warning'/'critical' + autoDowngrade enabled: downgrades one step, returns new model
   * - 'warning'/'critical' + autoDowngrade disabled: returns current model (downgraded: false)
   * - 'exhausted' + autoDowngrade + not at minimum: downgrades one step, returns new model
   * - 'exhausted' + at minimum model: throws BudgetExhaustedError
   * - 'exhausted' + autoDowngrade disabled: throws BudgetExhaustedError
   *
   * @param {string} sessionId
   * @returns {EnforceLimitResult}
   * @throws {BudgetExhaustedError}
   */
  enforceLimit(sessionId) {
    const session = this._getOrCreateSession(sessionId);
    const budgetStatus = this.checkBudget(sessionId);

    if (budgetStatus.status === 'ok') {
      const modelEntry = this._resolveShorthand(session.currentModelShorthand);
      return {
        model: modelEntry ? modelEntry.id : session.currentModelShorthand,
        downgraded: false,
      };
    }

    if (budgetStatus.status === 'exhausted') {
      // Either throw or downgrade (but only if autoDowngrade and not at minimum)
      if (!this._config.autoDowngrade || this._isAtMinimumModel(session.currentModelShorthand)) {
        throw new BudgetExhaustedError(sessionId, session.totalBudget, session.totalSpent);
      }
      // Downgrade even under exhaustion if not at minimum
      return this._performDowngrade(session, sessionId);
    }

    // warning or critical
    if (!this._config.autoDowngrade) {
      const modelEntry = this._resolveShorthand(session.currentModelShorthand);
      return {
        model: modelEntry ? modelEntry.id : session.currentModelShorthand,
        downgraded: false,
      };
    }

    if (this._isAtMinimumModel(session.currentModelShorthand)) {
      // Already at minimum — cannot downgrade further, return current
      const modelEntry = this._resolveShorthand(session.currentModelShorthand);
      return {
        model: modelEntry ? modelEntry.id : session.currentModelShorthand,
        downgraded: false,
      };
    }

    return this._performDowngrade(session, sessionId);
  }

  /**
   * Record a spend amount for a session, optionally attributed to a phase.
   *
   * If the session does not yet exist, an implicit default session is created.
   * If a phase name is provided but not allocated for this session, the spend
   * is still added to the session total (phase total is skipped).
   *
   * @param {string} sessionId
   * @param {number} costUSD   - Amount spent in USD
   * @param {string} [phase]   - Optional phase name to attribute the spend to
   */
  recordSpend(sessionId, costUSD, phase) {
    const session = this._getOrCreateSession(sessionId);
    session.totalSpent += costUSD;

    if (phase && phase in session.phases) {
      session.phases[phase].spent += costUSD;
    }
  }

  /**
   * Return the current status of a named phase within a session.
   *
   * Returns null if the session does not exist or the phase is not allocated.
   *
   * @param {string} sessionId
   * @param {string} phase
   * @returns {{fraction: number, allocatedBudget: number, spent: number, remaining: number}|null}
   */
  getPhaseStatus(sessionId, phase) {
    if (!this._sessions.has(sessionId)) {
      return null;
    }
    const session = this._sessions.get(sessionId);
    const alloc = session.phases[phase];
    if (!alloc) {
      return null;
    }
    return {
      fraction: alloc.fraction,
      allocatedBudget: alloc.allocatedBudget,
      spent: alloc.spent,
      remaining: Math.max(0, alloc.allocatedBudget - alloc.spent),
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Get an existing session or create a new default one.
   * @private
   * @param {string} sessionId
   * @returns {SessionData}
   */
  _getOrCreateSession(sessionId) {
    if (!this._sessions.has(sessionId)) {
      /** @type {SessionData} */
      const defaultSession = {
        totalBudget: this._config.defaultSessionBudget,
        totalSpent: 0,
        currentModelShorthand: this._config.downgradeChain[0],
        autoDowngradeTriggered: false,
        phases: {},
      };
      this._sessions.set(sessionId, defaultSession);
    }
    return this._sessions.get(sessionId);
  }

  /**
   * Resolve a model shorthand (e.g. 'opus') to its ModelRegistry entry.
   * Returns null if not found.
   * @private
   * @param {string} shorthand
   * @returns {import('./model-registry.cjs').ModelEntry|null}
   */
  _resolveShorthand(shorthand) {
    return this._modelRegistry.getModel(shorthand);
  }

  /**
   * Check whether the session's current model is at the end of the downgrade chain.
   * @private
   * @param {string} shorthand
   * @returns {boolean}
   */
  _isAtMinimumModel(shorthand) {
    const chain = this._config.downgradeChain;
    const idx = chain.indexOf(shorthand);
    return idx === -1 || idx === chain.length - 1;
  }

  /**
   * Downgrade the current model one step in the chain, update session state,
   * and return the new model info.
   * @private
   * @param {SessionData} session
   * @param {string}      sessionId
   * @returns {EnforceLimitResult}
   */
  _performDowngrade(session, _sessionId) {
    const chain = this._config.downgradeChain;
    const currentIdx = chain.indexOf(session.currentModelShorthand);

    let nextShorthand;
    if (currentIdx === -1) {
      // Unknown shorthand — fall back to last in chain (minimum)
      nextShorthand = chain[chain.length - 1];
    } else {
      nextShorthand = chain[currentIdx + 1];
    }

    session.currentModelShorthand = nextShorthand;
    session.autoDowngradeTriggered = true;

    const modelEntry = this._resolveShorthand(nextShorthand);
    return {
      model: modelEntry ? modelEntry.id : nextShorthand,
      downgraded: true,
    };
  }
}

module.exports = { BudgetEngine, BudgetExhaustedError, DEFAULT_CONFIG };
