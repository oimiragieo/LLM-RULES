/**
 * SPEC-019: Result Normalizer
 *
 * Converts between legacy (conductor-main) and standard (agent-studio) result formats.
 * Handles metadata mapping, error normalization, and partial results.
 */

class ResultNormalizer {
  constructor(config = {}) {
    this.metadataMapping = config.metadataMapping || {
      // Legacy (snake_case) → Standard (camelCase)
      task_id: 'taskId',
      created_at: 'createdAt',
      updated_at: 'updatedAt',
      error_message: 'errorMessage',
      error_code: 'errorCode',
      nested_data: 'nestedData',
    };
  }

  /**
   * Normalize legacy result to standard format
   * @param {Object} legacyResult - Result in legacy format
   * @returns {Object} Result in standard format
   */
  normalize(legacyResult) {
    if (!legacyResult) return null;

    const normalized = {};

    // Map metadata fields
    for (const [legacyKey, standardKey] of Object.entries(this.metadataMapping)) {
      if (legacyResult[legacyKey] !== undefined) {
        normalized[standardKey] = legacyResult[legacyKey];
        continue;
      }
    }

    // Copy unmapped fields directly
    for (const [key, value] of Object.entries(legacyResult)) {
      if (!Object.keys(this.metadataMapping).includes(key)) {
        normalized[key] = value;
      }
    }

    // Normalize error structure
    if (legacyResult.error_message || legacyResult.error_code) {
      normalized.error = {
        message: legacyResult.error_message,
        code: legacyResult.error_code,
      };
    }

    // Handle nested structures
    if (legacyResult.nested_data) {
      normalized.nestedData = this._normalizeNested(legacyResult.nested_data);
    }

    // Preserve metadata
    if (legacyResult.metadata) {
      normalized.metadata = { ...legacyResult.metadata };
    }

    return normalized;
  }

  /**
   * Normalize nested data structures recursively
   */
  _normalizeNested(data) {
    if (Array.isArray(data)) {
      return data.map((item) => this._normalizeNested(item));
    }

    if (typeof data === 'object' && data !== null) {
      const normalized = {};
      for (const [key, value] of Object.entries(data)) {
        const standardKey = this.metadataMapping[key] || key;
        normalized[standardKey] = this._normalizeNested(value);
      }
      return normalized;
    }

    return data;
  }

  /**
   * Normalize partial result (task failed but has partial data)
   */
  normalizePartial(legacyResult) {
    const normalized = this.normalize(legacyResult);

    // Mark as partial
    normalized.partial = true;
    normalized.completionPercentage = legacyResult.completion_percentage || 0;

    return normalized;
  }

  /**
   * Aggregate results from multiple tasks
   */
  aggregateResults(results) {
    if (!results || results.length === 0) return null;

    const aggregated = {
      taskCount: results.length,
      results: results.map((r) => this.normalize(r)),
      summary: {
        successful: 0,
        failed: 0,
        partial: 0,
      },
    };

    for (const result of aggregated.results) {
      if (result.error) {
        aggregated.summary.failed++;
      } else if (result.partial) {
        aggregated.summary.partial++;
      } else {
        aggregated.summary.successful++;
      }
    }

    return aggregated;
  }

  /**
   * Convert standard result back to legacy format
   */
  denormalize(standardResult) {
    if (!standardResult) return null;

    const legacy = {};

    // Reverse metadata mapping (camelCase → snake_case)
    const reverseMapping = {};
    for (const [legacyKey, standardKey] of Object.entries(this.metadataMapping)) {
      reverseMapping[standardKey] = legacyKey;
    }

    // Map fields back to legacy format
    for (const [key, value] of Object.entries(standardResult)) {
      const legacyKey = reverseMapping[key] || key;
      legacy[legacyKey] = value;
    }

    // Denormalize error structure
    if (standardResult.error) {
      legacy.error_message = standardResult.error.message;
      legacy.error_code = standardResult.error.code;
      delete legacy.error;
    }

    // Handle nested data
    if (standardResult.nestedData) {
      legacy.nested_data = this._denormalizeNested(standardResult.nestedData);
      delete legacy.nestedData;
    }

    return legacy;
  }

  /**
   * Denormalize nested structures recursively
   */
  _denormalizeNested(data) {
    if (Array.isArray(data)) {
      return data.map((item) => this._denormalizeNested(item));
    }

    if (typeof data === 'object' && data !== null) {
      const denormalized = {};
      const reverseMapping = {};
      for (const [legacyKey, standardKey] of Object.entries(this.metadataMapping)) {
        reverseMapping[standardKey] = legacyKey;
      }

      for (const [key, value] of Object.entries(data)) {
        const legacyKey = reverseMapping[key] || key;
        denormalized[legacyKey] = this._denormalizeNested(value);
      }
      return denormalized;
    }

    return data;
  }

  /**
   * Get normalization statistics
   */
  getStats() {
    return {
      mappingCount: Object.keys(this.metadataMapping).length,
    };
  }
}

module.exports = ResultNormalizer;
