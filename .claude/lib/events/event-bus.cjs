/**
 * EventBus Singleton (P1-5.1)
 *
 * Centralized pub/sub for agent events with priority support.
 * Pattern: Singleton (single global instance)
 *
 * Key Features:
 * - Async, non-blocking emission
 * - Priority queue support (0-100, higher executes first)
 * - Promise-based waitFor() for coordination
 * - Automatic timestamping
 * - Error-resilient (handler errors don't crash bus)
 *
 * Usage:
 *   const eventBus = require('.claude/lib/events/event-bus.cjs');
 *   eventBus.on('AGENT_STARTED', (payload) => console.log(payload));
 *   await eventBus.emit('AGENT_STARTED', { agentId: 'dev-123' });
 */

'use strict';

const EventEmitter = require('events');
const { validateEvent } = require('./event-types.cjs');
const { createLogger } = require('../utils/logger.cjs');

const logger = createLogger('event-bus');

class EventBus {
  constructor() {
    this.emitter = new EventEmitter();
    this.subscriptions = [];

    // Increase max listeners to avoid warnings (default is 10)
    this.emitter.setMaxListeners(100);
  }

  /**
   * Emit event (async, non-blocking)
   * @param {string} eventType - Event type (e.g., 'AGENT_STARTED')
   * @param {object} payload - Event payload
   * @returns {Promise<void>}
   */
  async emit(eventType, payload) {
    // Add timestamp to payload if not present
    const enrichedPayload = {
      ...payload,
      timestamp: payload.timestamp || new Date().toISOString(),
    };

    // Validate event before emitting
    const validation = validateEvent(eventType, enrichedPayload);
    if (!validation.valid) {
      const errorMessage = `Invalid event ${eventType}: ${validation.errors.map(e => e.message).join(', ')}`;
      logger.error(errorMessage, { errors: validation.errors });
      // Don't emit invalid events
      return;
    }

    // Get subscriptions for this event type, sorted by priority (descending)
    const subs = this.subscriptions
      .filter(sub => sub.eventType === eventType)
      .sort((a, b) => b.priority - a.priority);

    // Execute handlers in priority order
    // Use setImmediate for async, non-blocking execution
    setImmediate(async () => {
      for (const sub of subs) {
        try {
          // Handler can be sync or async
          await sub.handler(enrichedPayload);
        } catch (error) {
          // Log error but don't crash the event bus
          logger.error(`Handler error for ${eventType}`, { error: error.message });
        }
      }
    });
  }

  /**
   * Subscribe to event type
   * @param {string} eventType - Event type to listen for
   * @param {function} handler - Event handler
   * @param {number} priority - Priority (0-100, higher executes first, default 50)
   * @returns {Subscription} Subscription object
   */
  on(eventType, handler, priority = 50) {
    const subscription = {
      eventType,
      handler,
      priority,
    };
    this.subscriptions.push(subscription);
    return subscription;
  }

  /**
   * Subscribe once (auto-unsubscribe after first event)
   * @param {string} eventType - Event type
   * @param {function} handler - Event handler
   * @returns {Subscription}
   */
  once(eventType, handler) {
    const subscription = this.on(eventType, payload => {
      handler(payload);
      this.off(subscription);
    });
    return subscription;
  }

  /**
   * Unsubscribe from event
   * @param {Subscription} subscription - Subscription to remove
   */
  off(subscription) {
    const index = this.subscriptions.indexOf(subscription);
    if (index > -1) {
      this.subscriptions.splice(index, 1);
    }
  }

  /**
   * Wait for event (Promise-based)
   * @param {string} eventType - Event type
   * @param {number} timeout - Timeout in ms (default: 30000)
   * @returns {Promise<object>} Resolves with event payload
   */
  async waitFor(eventType, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off(subscription);
        reject(new Error(`Timeout waiting for ${eventType}`));
      }, timeout);

      const subscription = this.once(eventType, payload => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }
}

const bus = new EventBus();
try {
  const { registerDefaultSinks } = require('./event-bus-sink.cjs');
  registerDefaultSinks(bus);
} catch (_err) {
  // Best-effort; event bus should still function without sinks.
}

// Export singleton instance
module.exports = bus;
