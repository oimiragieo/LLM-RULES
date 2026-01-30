/**
 * SPEC-019: System Adapters
 *
 * Provides adapters for conductor-main and agent-studio systems,
 * enabling uniform access to state and format translation.
 */

/**
 * Base Adapter Interface
 */
class SystemAdapter {
  constructor(name) {
    this.name = name;
  }

  /**
   * Read state from the system
   */
  async readState(taskId) {
    throw new Error('readState() must be implemented by subclass');
  }

  /**
   * Write state to the system
   */
  async writeState(taskId, state) {
    throw new Error('writeState() must be implemented by subclass');
  }

  /**
   * Translate state from system format to standard format
   */
  translateToStandard(state) {
    throw new Error('translateToStandard() must be implemented by subclass');
  }

  /**
   * Translate state from standard format to system format
   */
  translateFromStandard(state) {
    throw new Error('translateFromStandard() must be implemented by subclass');
  }
}

/**
 * conductor-main Adapter (legacy system)
 */
class ConductorMainAdapter extends SystemAdapter {
  constructor() {
    super('conductor-main');
    this.stateStore = new Map(); // In-memory store for testing
  }

  /**
   * Read state from conductor-main
   */
  async readState(taskId) {
    const state = this.stateStore.get(taskId);
    if (!state) return null;

    // Return in conductor-main format (snake_case)
    return state;
  }

  /**
   * Write state to conductor-main
   */
  async writeState(taskId, state) {
    // Store in conductor-main format
    this.stateStore.set(taskId, state);
    return state;
  }

  /**
   * Translate conductor-main format → standard format
   */
  translateToStandard(state) {
    if (!state) return null;

    return {
      taskId: state.task_id,
      status: this._mapStatusToStandard(state.state),
      createdAt: state.created_at,
      updatedAt: state.updated_at || state.created_at,
      metadata: state.metadata || {},
    };
  }

  /**
   * Translate standard format → conductor-main format
   */
  translateFromStandard(state) {
    if (!state) return null;

    return {
      task_id: state.taskId,
      state: this._mapStatusFromStandard(state.status),
      created_at: state.createdAt,
      updated_at: state.updatedAt || state.createdAt,
      metadata: state.metadata || {},
    };
  }

  /**
   * Map conductor-main status → agent-studio status
   */
  _mapStatusToStandard(legacyStatus) {
    const mapping = {
      running: 'in_progress',
      success: 'completed',
      failed: 'failed',
      pending: 'pending',
    };
    return mapping[legacyStatus] || legacyStatus;
  }

  /**
   * Map agent-studio status → conductor-main status
   */
  _mapStatusFromStandard(standardStatus) {
    const mapping = {
      in_progress: 'running',
      completed: 'success',
      failed: 'failed',
      pending: 'pending',
    };
    return mapping[standardStatus] || standardStatus;
  }
}

/**
 * Agent-Studio Adapter (native system)
 */
class AgentStudioAdapter extends SystemAdapter {
  constructor() {
    super('agent-studio');
    this.stateStore = new Map(); // In-memory store for testing
  }

  /**
   * Read state from agent-studio
   */
  async readState(taskId) {
    return this.stateStore.get(taskId) || null;
  }

  /**
   * Write state to agent-studio
   */
  async writeState(taskId, state) {
    this.stateStore.set(taskId, state);
    return state;
  }

  /**
   * Translate agent-studio format → standard format (no-op, already standard)
   */
  translateToStandard(state) {
    return state; // Already in standard format
  }

  /**
   * Translate standard format → agent-studio format (no-op, already standard)
   */
  translateFromStandard(state) {
    return state; // Already in standard format
  }
}

/**
 * Adapter Registry
 */
class AdapterRegistry {
  constructor() {
    this.adapters = new Map();

    // Register built-in adapters
    this.register(new ConductorMainAdapter());
    this.register(new AgentStudioAdapter());
  }

  /**
   * Register a custom adapter
   */
  register(adapter) {
    if (!(adapter instanceof SystemAdapter)) {
      throw new Error('Adapter must extend SystemAdapter');
    }
    this.adapters.set(adapter.name, adapter);
  }

  /**
   * Get adapter by name
   */
  get(name) {
    const adapter = this.adapters.get(name);
    if (!adapter) {
      throw new Error(`Adapter not found: ${name}`);
    }
    return adapter;
  }

  /**
   * List all registered adapters
   */
  list() {
    return Array.from(this.adapters.keys());
  }

  /**
   * Check if adapter exists
   */
  has(name) {
    return this.adapters.has(name);
  }
}

module.exports = {
  SystemAdapter,
  ConductorMainAdapter,
  AgentStudioAdapter,
  AdapterRegistry,
};
