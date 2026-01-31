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
  async readState(_taskId) {
    throw new Error('readState() must be implemented by subclass');
  }

  /**
   * Write state to the system
   */
  async writeState(_state) {
    throw new Error('writeState() must be implemented by subclass');
  }

  /**
   * Translate state to system format (standard → system)
   */
  translateToSystem(_state) {
    throw new Error('translateToSystem() must be implemented by subclass');
  }

  /**
   * Translate state from system format (system → standard)
   */
  translateFromSystem(_state) {
    throw new Error('translateFromSystem() must be implemented by subclass');
  }

  // Legacy aliases
  translateToStandard(state) {
    return this.translateFromSystem(state);
  }

  translateFromStandard(state) {
    return this.translateToSystem(state);
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
    if (!state) {
      // Return a default state for testing
      return { taskId, status: 'pending' };
    }

    // Return in standard format (translate from conductor-main)
    return this.translateFromSystem(state);
  }

  /**
   * Write state to conductor-main
   */
  async writeState(state) {
    const taskId = state.taskId || state.task_id;
    // Translate to conductor-main format before storing
    const conductorState = this.translateToSystem(state);
    this.stateStore.set(taskId, conductorState);
    return conductorState;
  }

  /**
   * Translate standard format → conductor-main format
   */
  translateToSystem(state) {
    if (!state) return null;

    return {
      task_id: state.taskId,
      state: this._mapStatusFromStandard(state.status),
      created_at: state.createdAt,
      updated_at: state.updatedAt || state.createdAt,
      metadata: state.metadata || {},
      vectorClock: state.vectorClock, // Preserve vector clock for sync
    };
  }

  /**
   * Translate conductor-main format → standard format
   */
  translateFromSystem(state) {
    if (!state) return null;

    return {
      taskId: state.task_id || state.taskId,
      status: this._mapStatusToStandard(state.state || state.status),
      createdAt: state.created_at || state.createdAt,
      updatedAt: state.updated_at || state.updatedAt || state.created_at,
      metadata: state.metadata || {},
      vectorClock: state.vectorClock, // Preserve vector clock for sync
    };
  }

  // Legacy aliases
  translateToStandard(state) {
    return this.translateFromSystem(state);
  }

  translateFromStandard(state) {
    return this.translateToSystem(state);
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
    const state = this.stateStore.get(taskId);
    if (!state) {
      // Return a default state for testing
      return { taskId, status: 'pending' };
    }
    return state;
  }

  /**
   * Write state to agent-studio
   */
  async writeState(state) {
    const taskId = state.taskId || state.task_id;
    this.stateStore.set(taskId, state);
    return state;
  }

  /**
   * Translate standard format → agent-studio format (no-op, already standard)
   */
  translateToSystem(state) {
    return state; // Already in standard format
  }

  /**
   * Translate agent-studio format → standard format (no-op, already standard)
   */
  translateFromSystem(state) {
    return state; // Already in standard format
  }

  // Legacy aliases
  translateToStandard(state) {
    return state;
  }

  translateFromStandard(state) {
    return state;
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
    // Allow plain objects as adapters for flexibility
    if (adapter.name) {
      this.adapters.set(adapter.name, adapter);
    } else {
      throw new Error('Adapter must have a name property');
    }
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

// Create global registry instance
const globalRegistry = new AdapterRegistry();

// Module exports with static methods
const SystemAdapters = {
  SystemAdapter,
  ConductorMainAdapter,
  AgentStudioAdapter,
  AdapterRegistry,

  // Static methods that operate on global registry
  getAdapter(name) {
    return globalRegistry.get(name);
  },

  registerAdapter(adapter) {
    globalRegistry.register(adapter);
  },

  listAdapters() {
    return globalRegistry.list();
  },

  hasAdapter(name) {
    return globalRegistry.has(name);
  },
};

module.exports = SystemAdapters;
