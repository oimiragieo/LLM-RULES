'use strict';

const { MAX_HANDLERS } = require('./workflow-engine-constants.cjs');

module.exports = {
  /**
   * Register an event handler
   *
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
  },

  /**
   * Register an event handler with deduplication
   * SEC-IMPL-003: Prevents memory exhaustion from duplicate handlers
   *
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   * @param {string} id - Unique handler ID for deduplication
   * @returns {boolean} - true if handler was registered, false if duplicate or limit reached
   */
  onWithId(event, handler, id) {
    // Initialize registry for this event type if needed
    if (!this.handlerRegistry.has(event)) {
      this.handlerRegistry.set(event, new Set());
    }
    const registry = this.handlerRegistry.get(event);

    // Check for handler limit (SEC-IMPL-003)
    if (registry.size >= MAX_HANDLERS) {
      console.warn(
        `[workflow-engine] Handler limit (${MAX_HANDLERS}) reached for event "${event}". ` +
          `Handler "${id}" not registered.`
      );
      return false;
    }

    // Check for duplicate
    if (registry.has(id)) {
      return false; // Silently reject duplicate
    }

    // Register the handler
    registry.add(id);
    this.on(event, handler);

    // Store reverse mapping for off() cleanup
    this.handlerIdMap.set(handler, { event, id });

    return true;
  },

  /**
   * Remove an event handler
   *
   * @param {string} event - Event name
   * @param {Function} handler - Event handler to remove
   * @param {string} [id] - Optional handler ID to also remove from registry
   */
  off(event, handler, id) {
    if (this.eventHandlers.has(event)) {
      const handlers = this.eventHandlers.get(event);
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }

    // Look up ID from reverse mapping if not provided
    let handlerId = id;
    if (!handlerId && this.handlerIdMap.has(handler)) {
      const mapping = this.handlerIdMap.get(handler);
      if (mapping.event === event) {
        handlerId = mapping.id;
      }
    }

    // Remove from handlerRegistry if ID found
    if (handlerId && this.handlerRegistry.has(event)) {
      this.handlerRegistry.get(event).delete(handlerId);
    }

    // Clean up reverse mapping
    this.handlerIdMap.delete(handler);
  },

  /**
   * Clear all handlers for an event type, or all handlers if no event specified
   * SEC-IMPL-003: Essential for preventing memory leaks on workflow completion
   *
   * @param {string} [event] - Optional event type to clear (clears all if not provided)
   */
  clearHandlers(event) {
    if (event) {
      // Clear specific event type
      this.eventHandlers.delete(event);
      this.handlerRegistry.delete(event);
      // Clean up reverse mappings for this event
      for (const [handler, mapping] of this.handlerIdMap.entries()) {
        if (mapping.event === event) {
          this.handlerIdMap.delete(handler);
        }
      }
    } else {
      // Clear all handlers
      this.eventHandlers.clear();
      this.handlerRegistry.clear();
      this.handlerIdMap.clear();
    }
  },

  /**
   * Get the number of registered handlers for an event type
   *
   * @param {string} event - Event name
   * @returns {number} - Number of handlers registered for this event
   */
  getHandlerCount(event) {
    if (!this.handlerRegistry.has(event)) {
      return 0;
    }
    return this.handlerRegistry.get(event).size;
  },

  /**
   * Emit an event
   *
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data) {
    if (this.eventHandlers.has(event)) {
      for (const handler of this.eventHandlers.get(event)) {
        try {
          handler(data);
        } catch (e) {
          console.error(`[workflow-engine] Event handler error for ${event}:`, e.message);
        }
      }
    }
  },

  /**
   * Register a step handler
   *
   * @param {string} name - Handler name
   * @param {Function} handler - Async handler function
   */
  registerHandler(name, handler) {
    this.handlers.set(name, handler);
  },

  /**
   * Check if handler exists
   *
   * @param {string} name - Handler name
   * @returns {boolean}
   */
  hasHandler(name) {
    return this.handlers.has(name);
  },

  /**
   * Get a handler by name
   *
   * @param {string} name - Handler name
   * @returns {Function}
   * @throws {Error} If handler not found
   */
  getHandler(name) {
    if (!this.handlers.has(name)) {
      throw new Error(`Handler not found: ${name}`);
    }
    return this.handlers.get(name);
  },

  /**
   * Get current state (immutable copy)
   *
   * @returns {Object} Current state
   */
  getState() {
    return {
      ...this.state,
      completedPhases: [...(this.state.completedPhases || [])],
      completedSteps: [...(this.state.completedSteps || [])],
      stepResults: { ...(this.state.stepResults || {}) },
      errors: [...(this.state.errors || [])],
    };
  },

  /**
   * Generate a unique run ID
   *
   * @returns {string}
   */
  generateRunId() {
    return `run-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  },

  /**
   * Find a step by ID across all phases
   *
   * @param {string} stepId - Step ID
   * @returns {{ step: Object, phase: string } | null}
   */
  findStep(stepId) {
    for (const [phaseName, phaseConfig] of Object.entries(this.workflow.phases)) {
      if (phaseConfig && phaseConfig.steps) {
        const step = phaseConfig.steps.find(s => s.id === stepId);
        if (step) {
          return { step, phase: phaseName };
        }
      }
    }
    return null;
  },
};
