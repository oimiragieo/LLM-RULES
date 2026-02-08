/**
 * SPEC-019: Result Normalizer
 *
 * Converts between legacy (conductor-main) and standard (agent-studio) result formats.
 * Handles metadata mapping, error normalization, and partial results.
 */

class ResultNormalizer {
  constructor(config = {}) {
    this.preserveOriginal = config.preserveOriginal || false;
    this.metadataMapping = config.metadataMapping || {
      // Legacy (snake_case) → Standard (camelCase)
      task_id: 'taskId',
      created_at: 'createdAt',
      updated_at: 'updatedAt',
      error_message: 'errorMessage',
      error_code: 'errorCode',
      error_stack: 'errorStack',
      nested_data: 'nestedData',
      user_id: 'userId',
      created_by: 'createdBy',
    };

    // Status mapping from legacy to standard
    this.statusMapping = {
      success: 'completed',
      running: 'in_progress',
      failed: 'failed',
      pending: 'pending',
    };

    // Error code categories
    this.errorCategories = {
      TIMEOUT: 'timeout',
      EXEC_ERROR: 'execution',
      VALIDATION_ERROR: 'validation',
      AUTH_ERROR: 'authentication',
      NETWORK_ERROR: 'network',
    };
  }

  /**
   * Normalize legacy result to standard format
   * @param {Object} legacyResult - Result in legacy format
   * @param {string} [source] - Source system ('conductor-main' or 'agent-studio')
   * @returns {Object} Result in standard format
   */
  normalize(legacyResult, _source = 'conductor-main') {
    if (!legacyResult) return null;

    const normalized = {};

    // Store original if configured
    if (this.preserveOriginal) {
      normalized._original = { ...legacyResult };
    }

    // Map standard fields
    if (legacyResult.task_id) normalized.taskId = legacyResult.task_id;
    if (legacyResult.created_at) normalized.createdAt = legacyResult.created_at;

    // Map status/state
    if (legacyResult.state) {
      normalized.status = this.statusMapping[legacyResult.state] || legacyResult.state;
    }
    if (legacyResult.status) {
      normalized.status = legacyResult.status;
    }

    // Map output to result
    if (legacyResult.output !== undefined) {
      normalized.result = legacyResult.output;
    }

    // Handle nested result structures (preserve snake_case in nested data)
    if (normalized.result && typeof normalized.result === 'object') {
      // Keep nested data as-is (don't transform nested keys)
      normalized.result = this._preserveNestedStructure(normalized.result);
    }

    // Normalize error structure
    if (legacyResult.error_message || legacyResult.error_code || legacyResult.state === 'failed') {
      normalized.error = {
        message: legacyResult.error_message,
        code: legacyResult.error_code,
      };

      // Add stack trace if present
      if (legacyResult.error_stack) {
        normalized.error.stack = legacyResult.error_stack;
      }

      // Categorize error
      if (legacyResult.error_code) {
        normalized.error.category = this.errorCategories[legacyResult.error_code] || 'unknown';
      }
    }

    // Handle partial results (task failed but has output)
    if (legacyResult.state === 'failed' && legacyResult.output) {
      normalized.partialResult = legacyResult.output;
    }

    // Normalize metadata (meta field in legacy, metadata in output)
    if (legacyResult.meta) {
      normalized.metadata = this._normalizeMetadata(legacyResult.meta);
    } else {
      normalized.metadata = {};
    }

    // Preserve any additional metadata
    if (legacyResult.metadata) {
      normalized.metadata = { ...normalized.metadata, ...legacyResult.metadata };
    }

    return normalized;
  }

  /**
   * Normalize metadata object (convert known snake_case keys to camelCase, preserve unknown keys)
   */
  _normalizeMetadata(meta) {
    if (!meta || typeof meta !== 'object') return {};

    // Known metadata field mappings
    const knownMappings = {
      user_id: 'userId',
      created_by: 'createdBy',
      updated_by: 'updatedBy',
      created_at: 'createdAt',
      updated_at: 'updatedAt',
    };

    const normalized = {};
    for (const [key, value] of Object.entries(meta)) {
      // Map known fields, preserve unknown fields as-is
      const mappedKey = knownMappings[key] || key;
      normalized[mappedKey] = value;
    }
    return normalized;
  }

  /**
   * Preserve nested structure without transformation
   */
  _preserveNestedStructure(data) {
    if (Array.isArray(data)) {
      return data.map(item => this._preserveNestedStructure(item));
    }
    if (data !== null && typeof data === 'object') {
      const result = {};
      for (const [key, value] of Object.entries(data)) {
        result[key] = this._preserveNestedStructure(value);
      }
      return result;
    }
    return data;
  }

  /**
   * Normalize nested data structures recursively
   */
  _normalizeNested(data) {
    if (Array.isArray(data)) {
      return data.map(item => this._normalizeNested(item));
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
   * Aggregate results from multiple tasks (returns array of normalized results)
   */
  aggregate(results) {
    if (!results || results.length === 0) return null;

    // Get task ID from first result
    const taskId = results[0].task_id || results[0].taskId;

    return {
      taskId,
      status: 'completed',
      result: results.map(r => this.normalize(r, 'conductor-main').result || r.output),
    };
  }

  /**
   * Aggregate results from multiple tasks (legacy API)
   */
  aggregateResults(results) {
    if (!results || results.length === 0) return null;

    const aggregated = {
      taskCount: results.length,
      results: results.map(r => this.normalize(r)),
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
      return data.map(item => this._denormalizeNested(item));
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
