/**
 * Loop Pattern Executor
 *
 * Implements loop patterns:
 * - forEach: sequential or parallel iteration
 * - doWhile: repeat until condition false
 * - retryUntil: retry until condition met
 * - forEachBatch: process items in batches
 */

class LoopExecutor {
  async forEach(items, task, options = {}) {
    const {
      parallel = false,
      maxConcurrency = items.length,
      continueOnError = false,
      supportBreak = false,
      supportContinue = false,
      context = null,
      onProgress = null,
      measureTime = false,
    } = options;

    const results = [];
    const errors = [];
    const timings = [];

    if (parallel) {
      return this._forEachParallel(items, task, maxConcurrency, continueOnError, onProgress);
    }

    // Sequential
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemContext = context ? { ...context, item, index: i } : { item, index: i };

      try {
        const startTime = Date.now();
        const result = await task(itemContext);
        const duration = Date.now() - startTime;

        // Preserve context mutations
        if (context) {
          Object.assign(context, itemContext);
        }

        if (supportBreak && result && result.break) {
          break;
        }
        if (supportContinue && result && result.continue) {
          continue;
        }

        results.push(result);
        if (measureTime) timings.push(duration);
      } catch (error) {
        if (!continueOnError) {
          throw error;
        }
        errors.push(error);
      }

      if (onProgress) {
        onProgress(i + 1, items.length);
      }
    }

    if (measureTime) {
      return { results, timings };
    }

    if (continueOnError) {
      return { successes: results, errors };
    }

    return results;
  }

  async _forEachParallel(items, task, maxConcurrency, continueOnError, onProgress) {
    const results = [];
    const errors = [];
    const running = new Set();
    let index = 0;

    return new Promise(resolve => {
      const execute = async () => {
        while (index < items.length) {
          if (running.size >= maxConcurrency) {
            await Promise.race(running);
            continue;
          }

          const i = index++;
          const item = items[i];
          const itemContext = { item, index: i };

          const promise = (async () => {
            try {
              const result = await task(itemContext);
              results[i] = result;
            } catch (error) {
              if (continueOnError) {
                errors[i] = error;
              } else {
                throw error;
              }
            }

            if (onProgress) {
              onProgress(i + 1, items.length);
            }
          })();

          running.add(promise);
          promise.finally(() => running.delete(promise));
        }

        if (running.size > 0) {
          await Promise.all(running);
        }

        if (continueOnError) {
          resolve({
            successes: results.filter(r => r !== undefined),
            errors: errors.filter(e => e !== undefined),
          });
        } else {
          resolve(results);
        }
      };

      execute().catch(err => {
        throw err;
      });
    });
  }

  async doWhile(condition, task, options = {}) {
    const { maxIterations = null, onCheckpoint = null } = options;

    if (maxIterations === null || maxIterations === undefined) {
      throw new Error('maxIterations is required to prevent infinite loops');
    }

    let state = { iteration: 0, iterations: 0 };
    let conditionMet = true;

    for (let i = 0; i < maxIterations && conditionMet; i++) {
      state.iteration = i;
      state.iterations = i + 1;

      const result = await task(state);
      state = { ...state, ...result };

      if (onCheckpoint) {
        onCheckpoint(state);
      }

      conditionMet = condition(state);
    }

    return state;
  }

  async retryUntil(successCondition, task, options = {}) {
    const { maxRetries = 3, backoff = 'linear', initialDelay = 100 } = options;

    let attempts = 0;
    let lastResult = null;

    for (let i = 0; i < maxRetries; i++) {
      attempts++;
      lastResult = await task();

      if (successCondition(lastResult)) {
        return { success: true, result: lastResult, attempts };
      }

      if (i < maxRetries - 1) {
        const delay = this._calculateBackoff(backoff, i, initialDelay);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return { success: false, result: lastResult, attempts };
  }

  _calculateBackoff(backoff, attempt, initialDelay) {
    if (backoff === 'exponential') {
      return initialDelay * Math.pow(2, attempt);
    } else if (backoff === 'linear') {
      return initialDelay * (attempt + 1);
    }
    return initialDelay;
  }

  async forEachBatch(items, task, options = {}) {
    const { batchSize = 10 } = options;
    const results = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const result = await task(batch);
      results.push(result);
    }

    return results;
  }
}

module.exports = { LoopExecutor };
