'use strict';

const eventBus = require('../events/event-bus.cjs');

/**
 * Task Heartbeat Utility
 * Emits periodic TASK_HEARTBEAT events to keep the Orchestrator updated
 * during long-running background operations.
 */

function startHeartbeat(taskId, options = {}) {
  const interval = options.interval || 5000;
  
  const timer = setInterval(() => {
    eventBus.emit('TASK_HEARTBEAT', {
      type: 'TASK_HEARTBEAT',
      taskId,
      timestamp: new Date().toISOString(),
      ...options.metadata
    });
  }, interval);

  if (timer.unref) timer.unref();
  
  return timer;
}

function stopHeartbeat(timer) {
  if (timer) {
    clearInterval(timer);
  }
}

module.exports = {
  startHeartbeat,
  stopHeartbeat
};
