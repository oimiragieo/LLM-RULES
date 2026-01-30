/**
 * SPEC-021: Legacy Adapter Pattern
 *
 * Provides interface abstraction for legacy systems (conductor-main)
 * Transforms requests/responses between legacy and new formats
 */

class LegacyAdapter {
  constructor(system, version) {
    this.system = system;
    this.version = version;
  }

  /**
   * Get system name
   */
  getSystem() {
    return this.system;
  }

  /**
   * Get system version
   */
  getVersion() {
    return this.version;
  }

  /**
   * Transform request data (new → legacy format)
   * @param {Object} data - Request data in new format
   * @returns {Object} Request data in legacy format
   */
  request(data) {
    if (!data) {
      throw new Error('Invalid request');
    }

    // conductor-main specific transformation
    if (this.system === 'conductor-main') {
      return this._transformToConductorMain(data);
    }

    // intermediate system transformation
    if (this.system === 'intermediate') {
      return this._transformToIntermediate(data);
    }

    // agent-studio (passthrough)
    return data;
  }

  /**
   * Transform response data (legacy → new format)
   * @param {Object} data - Response data in legacy format
   * @returns {Object} Response data in new format
   */
  response(data) {
    if (!data) {
      return null;
    }

    // conductor-main specific transformation
    if (this.system === 'conductor-main') {
      return this._transformFromConductorMain(data);
    }

    // agent-studio (passthrough)
    return data;
  }

  /**
   * Transform error (legacy → standard format)
   * @param {Object} error - Error in legacy format
   * @returns {Object} Error in standard format
   */
  error(error) {
    return {
      status: error.code || 500,
      message: error.message || 'Unknown error',
    };
  }

  /**
   * Transform to conductor-main format
   * new: { task: { id: '123', name: 'task1' } }
   * legacy: { taskId: '123', taskName: 'task1' }
   */
  _transformToConductorMain(data) {
    if (data.task) {
      return {
        taskId: data.task.id,
        taskName: data.task.name,
      };
    }
    return data;
  }

  /**
   * Transform from conductor-main format
   * legacy: { taskId: '123', status: 'completed' }
   * new: { task: { id: '123', status: 'completed' } }
   */
  _transformFromConductorMain(data) {
    if (data.taskId) {
      return {
        task: {
          id: data.taskId,
          status: data.status,
        },
      };
    }
    return data;
  }

  /**
   * Transform to intermediate format
   * input: { taskId: '123' }
   * output: { id: '123' }
   */
  _transformToIntermediate(data) {
    if (data.taskId) {
      return { id: data.taskId };
    }
    return data;
  }
}

module.exports = LegacyAdapter;
