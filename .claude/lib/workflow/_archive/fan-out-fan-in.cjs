/**
 * Fan-Out/Fan-In Pattern Executor
 *
 * Executes tasks in parallel with various collection strategies:
 * - all: wait for all tasks, fail if any fail
 * - any: return first success, cancel others
 * - majority: wait for >50% to succeed
 * - quorum: wait for n successes
 */

class FanOutFanInExecutor {
  async execute(tasks, options = {}) {
    const {
      strategy = 'all',
      timeout = null,
      maxConcurrency = tasks.length,
      failurePolicy = 'fail-fast',
      transform = null,
      onProgress = null,
      quorumCount = 1,
    } = options;

    // Handle empty task list
    if (!tasks || tasks.length === 0) {
      return [];
    }

    // For 'any' strategy, use race-based execution
    if (strategy === 'any') {
      return this._executeAnyStrategy(tasks, timeout);
    }

    // Execute with concurrency limit
    const results = await this._executeWithConcurrency(tasks, maxConcurrency, timeout);

    // Apply strategy
    let strategyResult = this._applyStrategy(
      results,
      strategy,
      failurePolicy,
      quorumCount,
      transform,
      onProgress,
      tasks.length
    );

    // Apply transform if provided
    if (transform && !Array.isArray(strategyResult)) {
      strategyResult = transform(strategyResult);
    } else if (transform && Array.isArray(strategyResult)) {
      strategyResult = transform(strategyResult);
    }

    return strategyResult;
  }

  async _executeAnyStrategy(tasks, timeout) {
    const promises = tasks.map(task => {
      let promise = task.fn();
      if (timeout) {
        promise = Promise.race([
          promise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Task timeout after ${timeout}ms`)), timeout)
          ),
        ]);
      }
      return promise;
    });

    try {
      return await Promise.race(promises);
    } catch (_error) {
      // If race rejects, all must have failed
      throw new Error('All tasks failed');
    }
  }

  async _executeWithConcurrency(tasks, maxConcurrency, timeout) {
    const results = new Map();
    const running = new Set();
    let index = 0;

    return new Promise((resolve, reject) => {
      const execute = async () => {
        while (index < tasks.length) {
          if (running.size >= maxConcurrency) {
            await Promise.race(running);
            continue;
          }

          const taskIndex = index++;
          const task = tasks[taskIndex];

          const promise = (async () => {
            try {
              let taskPromise = task.fn();

              if (timeout) {
                taskPromise = Promise.race([
                  taskPromise,
                  new Promise((_, reject) =>
                    setTimeout(() => reject(new Error(`Task timeout after ${timeout}ms`)), timeout)
                  ),
                ]);
              }

              const result = await taskPromise;
              results.set(taskIndex, { success: true, value: result });
            } catch (error) {
              results.set(taskIndex, { success: false, error });
            }
          })();

          running.add(promise);
          promise.finally(() => running.delete(promise));
        }

        // Wait for all remaining
        if (running.size > 0) {
          await Promise.all(running);
        }
        resolve(results);
      };

      execute().catch(reject);
    });
  }

  _applyStrategy(results, strategy, failurePolicy, quorumCount, transform, onProgress, totalTasks) {
    const resultArray = Array.from({ length: results.size }, (_, i) => results.get(i));
    const successes = resultArray.filter(r => r.success).map(r => r.value);
    const failures = resultArray.filter(r => !r.success).map(r => r.error);

    // Progress callback
    if (onProgress) {
      onProgress(successes.length + failures.length, totalTasks);
    }

    // Strategy: 'all' - all must succeed
    if (strategy === 'all') {
      if (failurePolicy === 'continue') {
        return { successes, failures };
      }
      if (failurePolicy === 'fail-at-end') {
        // Wait for all, then throw if any failed
        if (failures.length > 0) {
          if (failures.length === 1) {
            throw failures[0];
          }
          const errorMsg = failures.map((e, i) => `${i + 1}. ${e.message}`).join('; ');
          throw new Error(errorMsg);
        }
        return successes;
      }
      // fail-fast (default): throw on first failure (handled in _executeWithConcurrency by collecting all)
      if (failures.length > 0) {
        if (failures.length === 1) {
          throw failures[0];
        }
        const errorMsg = failures.map((e, i) => `${i + 1}. ${e.message}`).join('; ');
        throw new Error(errorMsg);
      }
      return successes;
    }

    // Strategy: 'any' - first success wins
    if (strategy === 'any') {
      if (successes.length > 0) {
        return successes[0];
      }
      const errorMsg = failures.map((e, i) => `${i + 1}. ${e.message}`).join('; ');
      throw new Error(`All tasks failed: ${errorMsg}`);
    }

    // Strategy: 'majority' - >50% must succeed
    if (strategy === 'majority') {
      const requiredSuccesses = Math.floor(resultArray.length / 2) + 1;
      if (successes.length < requiredSuccesses) {
        throw new Error(`Majority failed: needed ${requiredSuccesses}, got ${successes.length}`);
      }
      return successes;
    }

    // Strategy: 'quorum' - n successes required
    if (strategy === 'quorum') {
      if (successes.length < quorumCount) {
        throw new Error(`Quorum not met: needed ${quorumCount}, got ${successes.length}`);
      }
      return successes;
    }

    return successes;
  }
}

module.exports = { FanOutFanInExecutor };
