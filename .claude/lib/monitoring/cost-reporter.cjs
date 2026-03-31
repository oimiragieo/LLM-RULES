'use strict';

/**
 * CostReporter
 *
 * Provides cost reporting views over a TokenAccountant instance:
 *   - getSessionCosts(sessionId)   — per-session cost breakdown
 *   - getDailyCosts(date?)         — daily aggregated costs (default: today)
 *   - getModelBreakdown(timeRange?) — per-model cost distribution sorted by cost
 *   - getTrend(days?)              — cost trend over the last N days (default: 7)
 *
 * Session convention: task IDs that belong to a session follow the pattern
 *   "<sessionId>:<taskSubId>"  (colon separator)
 * Tasks without a colon are treated as single-task sessions whose session ID
 * equals the task ID itself.
 *
 * All methods degrade gracefully and return zero-value objects / empty arrays
 * when the TokenAccountant has no data or throws unexpectedly.
 *
 * @module cost-reporter
 */

const { MODEL_PRICING, DEFAULT_MODEL } = require('../metrics/token-accountant.cjs');

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Safely call tokenAccountant.toJSON() and return the records map.
 * Returns an empty object on any failure.
 *
 * @param {object} accountant
 * @returns {Object.<string, Array>} records map { taskId: [UsageRecord, ...] }
 */
function safeGetRecords(accountant) {
  try {
    const json = accountant.toJSON();
    if (!json || typeof json !== 'object') return {};
    return json.records || {};
  } catch (_err) {
    return {};
  }
}

/**
 * Calculate the USD cost for a given token count and model.
 *
 * @param {number} inputTokens
 * @param {number} outputTokens
 * @param {string} model
 * @returns {number}
 */
function calculateCost(inputTokens, outputTokens, model) {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING[DEFAULT_MODEL];
  return (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;
}

/**
 * Round a cost value to 6 decimal places to avoid floating-point noise.
 *
 * @param {number} value
 * @returns {number}
 */
function roundCost(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * Extract the session ID from a task ID.
 * Convention: "<sessionId>:<taskSubId>" → sessionId
 * No colon present → the taskId itself is the session.
 *
 * @param {string} taskId
 * @returns {string}
 */
function sessionIdFromTaskId(taskId) {
  const colonIdx = taskId.indexOf(':');
  return colonIdx >= 0 ? taskId.slice(0, colonIdx) : taskId;
}

/**
 * Determine whether a task ID belongs to the given session.
 * Matches "sessionId:anything" or an exact "sessionId" match.
 *
 * @param {string} taskId
 * @param {string} sessionId
 * @returns {boolean}
 */
function taskBelongsToSession(taskId, sessionId) {
  return taskId === sessionId || taskId.startsWith(sessionId + ':');
}

/**
 * Return today's date as a YYYY-MM-DD string.
 *
 * @returns {string}
 */
function todayString() {
  return new Date().toISOString().slice(0, 10);
}

// ============================================================================
// CostReporter class
// ============================================================================

class CostReporter {
  /**
   * @param {object} tokenAccountant - A TokenAccountant instance (or compatible mock).
   */
  constructor(tokenAccountant) {
    this._accountant = tokenAccountant;
  }

  // --------------------------------------------------------------------------
  // getSessionCosts
  // --------------------------------------------------------------------------

  /**
   * Return cost breakdown for all tasks belonging to a session.
   *
   * The `model` field reflects the model that contributed the most cost in
   * the session.
   *
   * @param {string} sessionId
   * @returns {{ sessionId: string, totalCost: number, inputCost: number,
   *             outputCost: number, taskCount: number, model: string }}
   */
  getSessionCosts(sessionId) {
    const zero = {
      sessionId,
      totalCost: 0,
      inputCost: 0,
      outputCost: 0,
      taskCount: 0,
      model: '',
    };

    if (!sessionId || typeof sessionId !== 'string') return zero;

    const records = safeGetRecords(this._accountant);
    const matchingTaskIds = Object.keys(records).filter(id => taskBelongsToSession(id, sessionId));

    if (matchingTaskIds.length === 0) return zero;

    let totalCost = 0;
    let inputCost = 0;
    let outputCost = 0;

    /** @type {Object.<string, number>} model → cumulative cost */
    const modelCosts = {};

    for (const taskId of matchingTaskIds) {
      for (const record of records[taskId] || []) {
        const ic = calculateCost(record.inputTokens, 0, record.model);
        const oc = calculateCost(0, record.outputTokens, record.model);
        const tc = ic + oc;
        inputCost += ic;
        outputCost += oc;
        totalCost += tc;
        modelCosts[record.model] = (modelCosts[record.model] || 0) + tc;
      }
    }

    // Dominant model: highest cumulative cost
    const dominantModel =
      Object.keys(modelCosts).sort((a, b) => modelCosts[b] - modelCosts[a])[0] || '';

    return {
      sessionId,
      totalCost: roundCost(totalCost),
      inputCost: roundCost(inputCost),
      outputCost: roundCost(outputCost),
      taskCount: matchingTaskIds.length,
      model: dominantModel,
    };
  }

  // --------------------------------------------------------------------------
  // getDailyCosts
  // --------------------------------------------------------------------------

  /**
   * Return aggregated costs for a specific calendar day.
   *
   * @param {string} [date] - YYYY-MM-DD string. Defaults to today.
   * @returns {{ date: string, totalCost: number, sessionCount: number, taskCount: number }}
   */
  getDailyCosts(date) {
    const targetDate = typeof date === 'string' && date ? date : todayString();

    const zero = { date: targetDate, totalCost: 0, sessionCount: 0, taskCount: 0 };

    const records = safeGetRecords(this._accountant);

    let totalCost = 0;
    let taskCount = 0;
    /** @type {Set<string>} */
    const sessions = new Set();

    for (const [taskId, taskRecords] of Object.entries(records)) {
      let taskContributed = false;

      for (const record of taskRecords || []) {
        if (!record.timestamp || typeof record.timestamp !== 'string') continue;
        if (record.timestamp.slice(0, 10) !== targetDate) continue;

        totalCost += calculateCost(record.inputTokens, record.outputTokens, record.model);
        taskContributed = true;
      }

      if (taskContributed) {
        taskCount += 1;
        sessions.add(sessionIdFromTaskId(taskId));
      }
    }

    if (taskCount === 0) return zero;

    return {
      date: targetDate,
      totalCost: roundCost(totalCost),
      sessionCount: sessions.size,
      taskCount,
    };
  }

  // --------------------------------------------------------------------------
  // getModelBreakdown
  // --------------------------------------------------------------------------

  /**
   * Return per-model cost distribution, sorted by cost descending.
   *
   * @param {{ start?: string, end?: string }} [timeRange] - Optional ISO timestamp bounds.
   * @returns {Array<{ model: string, cost: number, percentage: number, taskCount: number }>}
   */
  getModelBreakdown(timeRange) {
    const records = safeGetRecords(this._accountant);

    const startMs =
      timeRange && timeRange.start != null ? new Date(timeRange.start).getTime() : -Infinity;
    const endMs = timeRange && timeRange.end != null ? new Date(timeRange.end).getTime() : Infinity;

    /** @type {Object.<string, { cost: number, taskCount: number }>} */
    const modelData = {};

    for (const [, taskRecords] of Object.entries(records)) {
      // Aggregate per-model cost for this task (count task once per model used)
      /** @type {Object.<string, number>} model → cost within this task */
      const taskModelCost = {};

      for (const record of taskRecords || []) {
        // Apply time range filter if provided
        if (timeRange) {
          if (!record.timestamp || typeof record.timestamp !== 'string') continue;
          const ts = new Date(record.timestamp).getTime();
          if (ts < startMs || ts > endMs) continue;
        }

        const cost = calculateCost(record.inputTokens, record.outputTokens, record.model);
        taskModelCost[record.model] = (taskModelCost[record.model] || 0) + cost;
      }

      // Accumulate into global model data, counting one task per model
      for (const [model, cost] of Object.entries(taskModelCost)) {
        if (!modelData[model]) modelData[model] = { cost: 0, taskCount: 0 };
        modelData[model].cost += cost;
        modelData[model].taskCount += 1;
      }
    }

    const totalCost = Object.values(modelData).reduce((sum, d) => sum + d.cost, 0);
    if (totalCost === 0) return [];

    return Object.entries(modelData)
      .map(([model, data]) => ({
        model,
        cost: roundCost(data.cost),
        percentage: Math.round((data.cost / totalCost) * 10_000) / 100,
        taskCount: data.taskCount,
      }))
      .sort((a, b) => b.cost - a.cost);
  }

  // --------------------------------------------------------------------------
  // getTrend
  // --------------------------------------------------------------------------

  /**
   * Return daily cost totals for the last N days (inclusive of today), ordered
   * from oldest to newest — suitable for time-series charting.
   *
   * @param {number} [days=7]
   * @returns {Array<{ date: string, cost: number }>}
   */
  getTrend(days = 7) {
    const numDays = typeof days === 'number' && days > 0 ? Math.floor(days) : 7;

    // Build the ordered list of YYYY-MM-DD strings (oldest first)
    const today = new Date();
    const dateList = [];
    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      dateList.push(d.toISOString().slice(0, 10));
    }

    // Initialise cost accumulator for each date
    /** @type {Object.<string, number>} */
    const costByDate = {};
    for (const date of dateList) {
      costByDate[date] = 0;
    }

    const records = safeGetRecords(this._accountant);

    for (const [, taskRecords] of Object.entries(records)) {
      for (const record of taskRecords || []) {
        if (!record.timestamp || typeof record.timestamp !== 'string') continue;
        const date = record.timestamp.slice(0, 10);
        if (date in costByDate) {
          costByDate[date] += calculateCost(record.inputTokens, record.outputTokens, record.model);
        }
      }
    }

    return dateList.map(date => ({
      date,
      cost: roundCost(costByDate[date]),
    }));
  }
}

// ============================================================================
// Exports
// ============================================================================

module.exports = { CostReporter };
