/**
 * SPEC-021: Strangler Fig Pattern
 *
 * Gradual replacement of legacy system components while maintaining compatibility.
 * Implements feature toggles, traffic splitting, and migration tracking.
 */

class StranglerFig {
  constructor() {
    this.features = new Map();
    this.metrics = new Map();
  }

  /**
   * Register a feature for gradual migration
   * @param {string} featureName - Feature identifier
   * @param {Object} config - Configuration
   * @param {Function} config.legacyFn - Legacy implementation
   * @param {Function} config.newFn - New implementation
   * @param {number} config.percentage - Percentage routed to new (0-100)
   * @param {boolean} config.fallbackOnError - Fallback to legacy on error
   * @param {boolean} config.fallbackToNew - Fallback to new on legacy error
   * @param {string} config.featureFlag - Feature flag name
   * @param {Object} config.retryConfig - Retry configuration
   * @param {Object} config.circuitBreaker - Circuit breaker config
   * @param {number} config.timeout - Execution timeout
   * @param {Function} config.degradedFn - Degraded mode function
   * @param {Function} config.onError - Error callback
   * @param {Object} config.responseSchema - Response validation schema
   */
  register(featureName, config) {
    this.features.set(featureName, {
      legacyFn: config.legacyFn,
      newFn: config.newFn,
      percentage: config.percentage || 0,
      fallbackOnError: config.fallbackOnError || false,
      fallbackToNew: config.fallbackToNew || false,
      featureFlag: config.featureFlag || null,
      retryConfig: config.retryConfig || null,
      circuitBreaker: config.circuitBreaker || null,
      timeout: config.timeout || null,
      degradedFn: config.degradedFn || null,
      onError: config.onError || null,
      responseSchema: config.responseSchema || null,
      circuitState: { failures: 0, open: false },
    });

    this.metrics.set(featureName, {
      legacyCalls: 0,
      newCalls: 0,
      fallbacks: 0,
      errors: 0,
      errorTypes: [],
    });
  }

  /**
   * Execute feature (routes to legacy or new based on configuration)
   */
  async execute(featureName, args) {
    const config = this.features.get(featureName);
    if (!config) {
      throw new Error(`Feature ${featureName} not registered`);
    }

    const metrics = this.metrics.get(featureName);
    const useNew = this._shouldUseNew(config);

    // Check circuit breaker
    if (config.circuitBreaker && config.circuitState.open) {
      // Circuit is open, use fallback
      return this._executeFallback(config, args, metrics, useNew);
    }

    try {
      if (useNew) {
        metrics.newCalls++;
        const result = await this._executeWithTimeout(config.newFn, args, config.timeout);
        this._validateResponse(result, config.responseSchema, config, args, metrics);
        this._resetCircuitBreaker(config);
        return result;
      } else {
        metrics.legacyCalls++;
        const result = await this._executeWithRetry(
          config.legacyFn,
          args,
          config.retryConfig,
          config.timeout
        );
        this._validateResponse(result, config.responseSchema, config, args, metrics);
        this._resetCircuitBreaker(config);
        return result;
      }
    } catch (error) {
      metrics.errors++;
      metrics.errorTypes.push(error.message);

      if (config.onError) {
        config.onError(error);
      }

      // Update circuit breaker
      if (config.circuitBreaker) {
        config.circuitState.failures++;
        if (config.circuitState.failures >= config.circuitBreaker.threshold) {
          config.circuitState.open = true;
          setTimeout(() => {
            config.circuitState.open = false;
            config.circuitState.failures = 0;
          }, config.circuitBreaker.timeout);
        }
      }

      // Try fallback
      if (useNew && config.fallbackOnError) {
        try {
          metrics.fallbacks++;
          return await config.legacyFn(...args);
        } catch (fallbackError) {
          // Fallback also failed, try degraded mode
          if (config.degradedFn) {
            return config.degradedFn(...args);
          }
          throw fallbackError;
        }
      } else if (!useNew && config.fallbackToNew) {
        try {
          metrics.fallbacks++;
          return await config.newFn(...args);
        } catch (fallbackError) {
          // Fallback also failed, try degraded mode
          if (config.degradedFn) {
            return config.degradedFn(...args);
          }
          throw fallbackError;
        }
      }

      // No fallback configured, try degraded mode
      if (config.degradedFn) {
        return config.degradedFn(...args);
      }

      throw error;
    }
  }

  /**
   * Execute with timeout
   */
  async _executeWithTimeout(fn, args, timeout) {
    if (!timeout) {
      return fn(...args);
    }

    return Promise.race([
      fn(...args),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout)),
    ]);
  }

  /**
   * Execute with retry
   */
  async _executeWithRetry(fn, args, retryConfig, timeout) {
    if (!retryConfig) {
      return this._executeWithTimeout(fn, args, timeout);
    }

    const { maxRetries, backoff } = retryConfig;
    let lastError;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this._executeWithTimeout(fn, args, timeout);
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries - 1) {
          const delay = backoff === 'exponential' ? Math.pow(2, attempt) * 100 : 100;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * Validate response against schema
   */
  _validateResponse(result, schema, _config, _args, _metrics) {
    if (!schema) return;

    const validate = (data, schemaToValidate) => {
      for (const [key, rules] of Object.entries(schemaToValidate)) {
        if (rules.required && !(key in data)) {
          throw new Error(`Validation failed: missing required field ${key}`);
        }
      }
    };

    validate(result, schema);
  }

  /**
   * Execute fallback when circuit is open
   */
  async _executeFallback(config, args, metrics, useNew) {
    if (useNew) {
      // Circuit open for new, use legacy
      metrics.legacyCalls++;
      return config.legacyFn(...args);
    } else {
      // Circuit open for legacy, use new
      metrics.newCalls++;
      return config.newFn(...args);
    }
  }

  /**
   * Reset circuit breaker on success
   */
  _resetCircuitBreaker(config) {
    if (config.circuitBreaker) {
      config.circuitState.failures = 0;
    }
  }

  /**
   * Determine if new system should be used
   */
  _shouldUseNew(config) {
    if (config.featureFlag) {
      // Use feature flag (mock implementation)
      return false;
    }

    if (config.percentage >= 100) return true;
    if (config.percentage <= 0) return false;

    return Math.random() * 100 < config.percentage;
  }

  /**
   * Set migration percentage for a feature
   */
  async setPercentage(featureName, percentage) {
    const config = this.features.get(featureName);
    if (!config) {
      throw new Error(`Feature ${featureName} not registered`);
    }
    config.percentage = percentage;
  }

  /**
   * Get migration progress (0-100)
   */
  getMigrationProgress(featureName) {
    const config = this.features.get(featureName);
    if (!config) return 0;
    return config.percentage;
  }

  /**
   * Get feature owner ('legacy' or 'new')
   */
  getOwner(featureName) {
    const progress = this.getMigrationProgress(featureName);
    return progress >= 100 ? 'new' : 'legacy';
  }

  /**
   * Gradually ramp up percentage over duration
   */
  async rampUp(featureName, targetPercentage, duration) {
    const config = this.features.get(featureName);
    if (!config) {
      throw new Error(`Feature ${featureName} not registered`);
    }

    const startPercentage = config.percentage;
    const steps = 5;
    const increment = (targetPercentage - startPercentage) / steps;
    const interval = duration / steps;

    for (let i = 0; i < steps; i++) {
      await new Promise(resolve => setTimeout(resolve, interval));
      config.percentage = Math.min(targetPercentage, startPercentage + increment * (i + 1));
    }
  }

  /**
   * Get feature flag for a feature
   */
  getFeatureFlag(featureName) {
    const config = this.features.get(featureName);
    return config ? config.featureFlag : null;
  }

  /**
   * List all registered features
   */
  listFeatures() {
    return Array.from(this.features.keys());
  }

  /**
   * Deregister a feature
   */
  deregister(featureName) {
    this.features.delete(featureName);
    this.metrics.delete(featureName);
  }

  /**
   * Get metrics for a feature
   */
  getMetrics(featureName) {
    return (
      this.metrics.get(featureName) || {
        legacyCalls: 0,
        newCalls: 0,
        fallbacks: 0,
        errors: 0,
        errorTypes: [],
      }
    );
  }
}

module.exports = StranglerFig;
