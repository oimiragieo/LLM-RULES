/**
 * EventBus Singleton (P1-5.1)
 *
 * Centralized pub/sub for agent events with priority support.
 * Pattern: Singleton (single global instance)
 *
 * Key Features:
 * - Async emission with awaitable handler completion
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
const { AsyncLocalStorage } = require('async_hooks');
const { validateEvent } = require('./event-types.cjs');
const { createLogger } = require('../utils/logger.cjs');

const crypto = require('crypto');
const logger = createLogger('event-bus');
const storage = new AsyncLocalStorage();
const MAX_DEPTH = 10;

class EventBus {
  constructor() {
    this.emitter = new EventEmitter();
    this.subscriptions = [];
    this.maxTotalSubscriptions = Number(process.env.EVENT_BUS_MAX_SUBSCRIPTIONS || 10000);

    // Increase max listeners to avoid warnings (default is 10)
    this.emitter.setMaxListeners(100);
  }

  /**
   * Emit event and await handler completion in priority order.
   * @param {string} eventType - Event type (e.g., 'AGENT_STARTED')
   * @param {object} payload - Event payload
   * @param {object} [options] - Emission options
   * @param {string} [options.mode='sequential'] - 'sequential' or 'parallel'
   * @returns {Promise<void>}
   */
  async emit(eventType, payload, options = {}) {
    const parentContext = storage.getStore() || { depth: 0, traceId: null };
    const { depth } = parentContext;

    if (depth >= MAX_DEPTH) {
      throw new Error(
        `Max emission depth exceeded (${depth}). Circular event emission detected for ${eventType}.`
      );
    }

    const traceId = payload.traceId || parentContext.traceId || crypto.randomUUID();

    return storage.run({ depth: depth + 1, traceId }, async () => {
      // Add timestamp and traceId to payload if not present
      const enrichedPayload = {
        ...payload,
        traceId,
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

      const mode = options.mode || 'sequential';
      const TIMEOUT_MS = Number(process.env.EVENT_BUS_HANDLER_TIMEOUT || 5000);

      if (mode === 'parallel') {
        const promises = subs.map(async sub => {
          try {
            const handlerPromise = sub.handler(enrichedPayload);
            if (handlerPromise && typeof handlerPromise.then === 'function') {
              await Promise.race([
                handlerPromise,
                new Promise((_, reject) =>
                  setTimeout(
                    () => reject(new Error(`Handler timeout after ${TIMEOUT_MS}ms`)),
                    TIMEOUT_MS
                  )
                ),
              ]);
            }
          } catch (error) {
            logger.error(`Handler error for ${eventType} (parallel)`, { error: error.message });
          }
        });
        await Promise.allSettled(promises);
      } else {
        // Execute handlers in priority order.
        // emit() resolves only after handlers complete, preserving async contract.
        for (const sub of subs) {
          try {
            // Handler can be sync or async
            const handlerPromise = sub.handler(enrichedPayload);

            // If it's a promise, race it against timeout
            if (handlerPromise && typeof handlerPromise.then === 'function') {
              await Promise.race([
                handlerPromise,
                new Promise((_, reject) =>
                  setTimeout(
                    () => reject(new Error(`Handler timeout after ${TIMEOUT_MS}ms`)),
                    TIMEOUT_MS
                  )
                ),
              ]);
            }
          } catch (error) {
            // Log error but don't crash the event bus
            logger.error(`Handler error for ${eventType}`, { error: error.message });
          }
        }
      }
    });
  }

  /**
   * Get current execution context (traceId, depth)
   * @returns {{ traceId: string|null, depth: number }}
   */
  getContext() {
    return storage.getStore() || { traceId: null, depth: 0 };
  }

  /**
   * Subscribe to event type
   * @param {string} eventType - Event type to listen for
   * @param {function} handler - Event handler
   * @param {number} priority - Priority (0-100, higher executes first, default 50)
   * @returns {Subscription} Subscription object
   */
  on(eventType, handler, priority = 50) {
    const existing = this.subscriptions.find(
      sub => sub.eventType === eventType && sub.handler === handler
    );
    if (existing) {
      return existing;
    }
    if (
      Number.isFinite(this.maxTotalSubscriptions) &&
      this.maxTotalSubscriptions > 0 &&
      this.subscriptions.length >= this.maxTotalSubscriptions
    ) {
      throw new Error(
        `EventBus subscription limit exceeded (${this.maxTotalSubscriptions}). Refusing new subscription for ${eventType}.`
      );
    }

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
