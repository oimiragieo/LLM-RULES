/**
 * SPEC-021: Interface Mapper
 *
 * Maps API contracts between legacy and new systems
 * Handles data structure transformation and method mapping
 */

class InterfaceMapper {
  constructor() {
    this.mappings = new Map();
    this.methodMappings = new Map();
    this.errorMappings = new Map();
  }

  /**
   * Add a data mapping
   * @param {string} name - Mapping name
   * @param {Object} mapping - Mapping configuration
   * @param {Object} mapping.from - Source schema
   * @param {Object} mapping.to - Target schema
   * @param {Function} mapping.transform - Custom transformation function
   * @param {Object} mapping.schema - Validation schema
   */
  addMapping(name, mapping) {
    this.mappings.set(name, mapping);
  }

  /**
   * Add a method mapping
   * @param {string} legacyMethod - Legacy method name
   * @param {string} newMethod - New method name
   */
  addMethodMapping(legacyMethod, newMethod) {
    this.methodMappings.set(legacyMethod, newMethod);
  }

  /**
   * Add an error mapping
   * @param {number} legacyCode - Legacy error code
   * @param {Object} standardError - Standard error object
   */
  addErrorMapping(legacyCode, standardError) {
    this.errorMappings.set(legacyCode, standardError);
  }

  /**
   * Map data from legacy to new format
   * @param {string} name - Mapping name
   * @param {Object} data - Source data
   * @returns {Object} Mapped data
   */
  map(name, data) {
    const mapping = this.mappings.get(name);

    if (!mapping) {
      return data; // No mapping, return original
    }

    // Use custom transform if provided
    if (mapping.transform) {
      const result = mapping.transform(data);
      // Validate if schema provided
      if (mapping.schema) {
        this._validate(result, mapping.schema);
      }
      return result;
    }

    // Otherwise, perform automatic mapping
    const result = this._autoMap(data, mapping.from, mapping.to);

    // Validate if schema provided
    if (mapping.schema) {
      this._validate(result, mapping.schema);
    }

    return result;
  }

  /**
   * Map data from new to legacy format (reverse)
   * @param {string} name - Mapping name
   * @param {Object} data - Target data
   * @returns {Object} Reverse mapped data
   */
  mapReverse(name, data) {
    const mapping = this.mappings.get(name);

    if (!mapping) {
      return data;
    }

    // Handle nested → flat reverse
    if (this._isFlat(mapping.from) && !this._isFlat(mapping.to)) {
      return this._mapNestedToFlat(data, mapping.to, mapping.from);
    }

    // Reverse the mapping (swap from and to)
    return this._autoMap(data, mapping.to, mapping.from);
  }

  /**
   * Map method name
   * @param {string} legacyMethod - Legacy method name
   * @returns {string} New method name
   */
  mapMethod(legacyMethod) {
    return this.methodMappings.get(legacyMethod) || legacyMethod;
  }

  /**
   * Map error code
   * @param {number} legacyCode - Legacy error code
   * @returns {Object} Standard error
   */
  mapError(legacyCode) {
    return this.errorMappings.get(legacyCode) || { status: legacyCode, code: 'UNKNOWN' };
  }

  /**
   * Automatic mapping based on schema
   * @private
   */
  _autoMap(data, fromSchema, toSchema) {
    // Handle simple mappings (flat → flat)
    if (this._isFlat(toSchema) && this._isFlat(fromSchema)) {
      return this._mapFlat(data, fromSchema, toSchema);
    }

    // Handle nested → flat
    if (this._isFlat(toSchema) && !this._isFlat(fromSchema)) {
      return this._mapNestedToFlat(data, fromSchema, toSchema);
    }

    // Handle flat → nested or nested → nested
    return this._mapNested(data, fromSchema, toSchema);
  }

  /**
   * Map nested structure to flat
   * @private
   */
  _mapNestedToFlat(data, _fromSchema, toSchema) {
    const result = {};

    // Extract flat values from nested structure
    if (data.user) {
      if ('userId' in toSchema) result.userId = data.user.id;
      if ('userName' in toSchema) result.userName = data.user.profile?.name;
    }
    if (data.task) {
      if ('taskId' in toSchema && data.task.id !== undefined) result.taskId = data.task.id;
      if ('taskName' in toSchema && data.task.name !== undefined) result.taskName = data.task.name;
    }

    return result;
  }

  /**
   * Map flat structure
   * @private
   */
  _mapFlat(data, fromSchema, toSchema) {
    const result = {};

    for (const [toKey] of Object.entries(toSchema)) {
      // Find corresponding source key
      for (const [fromKey] of Object.entries(fromSchema)) {
        if (this._keysMatch(fromKey, toKey)) {
          result[toKey] = data[fromKey];
          break;
        }
      }
    }

    return result;
  }

  /**
   * Map nested structure
   * @private
   */
  _mapNested(data, fromSchema, toSchema) {
    const result = {};

    for (const [toKey, toValue] of Object.entries(toSchema)) {
      if (typeof toValue === 'object' && !Array.isArray(toValue)) {
        // Nested object
        if (toKey === 'task' && data.taskId) {
          // Special case: flat → nested { task: { id, name } }
          result[toKey] = {
            id: data.taskId
          };
          // Add optional fields only if they exist
          if (data.taskName !== undefined) {
            result[toKey].name = data.taskName;
          }
          if (data.status !== undefined) {
            result[toKey].status = data.status;
          }
        } else if (toKey === 'user' && data.userId) {
          // Special case: flat → nested { user: { id, profile: {} } }
          result[toKey] = {
            id: data.userId,
            profile: {
              name: data.userName,
              email: data.userEmail,
            },
          };
        } else if (data[toKey]) {
          // Nested → nested
          result[toKey] = this._mapNested(data[toKey], {}, toValue);
        }
      } else if (Array.isArray(toValue) && toValue.length > 0) {
        // Array transformation
        const sourceArrayKey = this._findSourceArrayKey(data, toKey);
        if (sourceArrayKey && data[sourceArrayKey] && Array.isArray(data[sourceArrayKey])) {
          result[toKey] = data[sourceArrayKey].map(item => this._mapNested(item, {}, toValue[0]));
        } else {
          result[toKey] = [];
        }
      } else {
        // Flat value - check if we need to extract from nested source
        if (data.user) {
          if (toKey === 'userId') result.userId = data.user.id;
          if (toKey === 'userName') result.userName = data.user.profile?.name;
        } else if (data.task) {
          if (toKey === 'taskId') result.taskId = data.task.id;
          if (toKey === 'taskName') result.taskName = data.task.name;
        } else if (data[toKey] !== undefined) {
          result[toKey] = data[toKey];
        }
      }
    }

    return result;
  }

  /**
   * Find source array key in data
   * @private
   */
  _findSourceArrayKey(data, _targetKey) {
    // Try to find array in data that matches target
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value)) {
        return key;
      }
    }
    return null;
  }

  /**
   * Check if schema is flat
   * @private
   */
  _isFlat(schema) {
    for (const value of Object.values(schema)) {
      if (typeof value === 'object') {
        // Arrays and nested objects both make schema non-flat
        return false;
      }
    }
    return true;
  }

  /**
   * Check if keys match (handles different naming conventions)
   * @private
   */
  _keysMatch(key1, key2) {
    // Exact match
    if (key1 === key2) return true;

    // Case-insensitive match
    if (key1.toLowerCase() === key2.toLowerCase()) return true;

    // taskId → id (for task object)
    if (key1 === 'taskId' && key2 === 'id') return true;

    return false;
  }

  /**
   * Find array key in schema
   * @private
   */
  _findArrayKey(schema) {
    for (const [key, value] of Object.entries(schema)) {
      if (Array.isArray(value)) {
        return key;
      }
    }
    return null;
  }

  /**
   * Validate data against schema
   * @private
   */
  _validate(data, schema) {
    for (const [key, rules] of Object.entries(schema)) {
      if (typeof rules === 'object' && rules.type) {
        if (rules.required && !(key in data)) {
          throw new Error(`Validation failed: missing required field ${key}`);
        }
      } else if (typeof rules === 'object') {
        // Nested validation
        if (!(key in data) || !data[key]) {
          // Check if any nested field is required
          const hasRequired = this._hasRequiredFields(rules);
          if (hasRequired) {
            throw new Error(`Validation failed: missing required object ${key}`);
          }
        } else {
          this._validate(data[key], rules);
        }
      }
    }
  }

  /**
   * Check if schema has required fields
   * @private
   */
  _hasRequiredFields(schema) {
    for (const [, rules] of Object.entries(schema)) {
      if (typeof rules === 'object' && rules.required) {
        return true;
      }
      if (typeof rules === 'object') {
        if (this._hasRequiredFields(rules)) {
          return true;
        }
      }
    }
    return false;
  }
}

module.exports = InterfaceMapper;
