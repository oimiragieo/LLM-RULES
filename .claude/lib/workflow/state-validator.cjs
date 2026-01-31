#!/usr/bin/env node
/**
 * SPEC-011: State Validator
 * ==========================
 *
 * Validates state data against schemas.
 */

'use strict';

/**
 * StateValidator
 *
 * Validates state data against schemas.
 */
class StateValidator {
  constructor(options = {}) {
    this.schemas = options.schemas || {};
  }

  async validate(state, data) {
    const schema = this.schemas[state];
    if (!schema) return true;

    // Handle custom validator
    if (schema.custom) {
      const result = await schema.custom(data);
      if (!result) {
        throw new Error('Custom validator failed');
      }
      return true;
    }

    // Handle required fields
    if (schema.required) {
      for (const field of schema.required) {
        if (!data.metadata || !(field in data.metadata)) {
          throw new Error(`Validation failed: missing required field ${field}`);
        }
      }
    }

    // Handle property validation
    if (schema.properties && data.metadata) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in data.metadata) {
          const value = data.metadata[key];

          // Type check
          if (propSchema.type && typeof value !== propSchema.type) {
            throw new Error(`Validation failed: ${key} must be ${propSchema.type}`);
          }

          // Minimum check
          if (propSchema.minimum !== undefined && value < propSchema.minimum) {
            throw new Error(`Validation failed: ${key} must be >= ${propSchema.minimum}`);
          }
        }
      }
    }

    return true;
  }
}

module.exports = {
  StateValidator,
};
