#!/usr/bin/env node
/**
 * Task Cleanup Manager
 * ====================
 *
 * Automatically cleans up completed and stale tasks to prevent memory leaks
 * during long-running multi-agent orchestration sessions.
 *
 * Features:
 * - Configurable retention period for completed tasks
 * - Batch cleanup to avoid memory churn
 * - Safe cleanup (never removes in-progress tasks)
 * - Integration with task tracking system
 * - Event emission for cleanup operations
 *
 * Usage:
 *   const TaskCleanupManager = require('./task-cleanup-manager.cjs');
 *   const manager = new TaskCleanupManager({ retentionMs: 30 * 60 * 1000 });
 *
 *   manager.on('cleanup', (data) => console.log('Cleaned up:', data.count));
 *   manager.start();
 *
 * Environment Variables:
 *   TASK_CLEANUP_RETENTION_MS=1800000  - Retention period (default: 30 min)
 *   TASK_CLEANUP_INTERVAL_MS=60000     - Cleanup interval (default: 1 min)
 *   TASK_CLEANUP_BATCH_SIZE=100        - Batch size (default: 100)
 *
 * @module task-cleanup-manager
 */

'use strict';

const { appendJsonl } = require('../utils/jsonl-utils.cjs');
const path = require('path');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');

/**
 * Default configuration values
 */
const DEFAULTS = {
  retentionMs: 30 * 60 * 1000, // 30 minutes
  interval: 60 * 1000, // 1 minute
  batchSize: 100,
  dlqPath: path.join(PROJECT_ROOT, '.claude', 'context', 'data', 'tasks-dlq.jsonl'),
  enableDLQ: true,
};

/**
 * Get configuration from environment with defaults
 * @returns {Object} Configuration object
 */
function getConfigFromEnv() {
  return {
    retentionMs: parseInt(process.env.TASK_CLEANUP_RETENTION_MS || DEFAULTS.retentionMs, 10),
    interval: parseInt(process.env.TASK_CLEANUP_INTERVAL_MS || DEFAULTS.interval, 10),
    batchSize: parseInt(process.env.TASK_CLEANUP_BATCH_SIZE || DEFAULTS.batchSize, 10),
    enableDLQ: process.env.TASK_CLEANUP_DLQ !== 'false',
  };
}

/**
 * Task statuses that are eligible for cleanup
 */
const CLEANABLE_STATUSES = ['completed', 'failed', 'cancelled', 'deleted'];

/**
 * TaskCleanupManager class for automatic task cleanup
 *
 * @class TaskCleanupManager
 * @example
 * const manager = new TaskCleanupManager();
 * manager.on('cleanup', (data) => console.log('Cleaned:', data.count));
 * manager.start();
 */
class TaskCleanupManager {
  /**
   * Create a TaskCleanupManager instance
   *
   * @param {Object} config - Configuration options
   * @param {number} [config.retentionMs=1800000] - Retention period in ms
   * @param {number} [config.interval=60000] - Cleanup interval in ms
   * @param {number} [config.batchSize=100] - Max tasks per cleanup batch
   * @param {Function} [config.getTaskList] - Function to get current task list
   * @param {Function} [config.removeTask] - Function to remove a task
   */
  constructor(config = {}) {
    const envConfig = getConfigFromEnv();

    this.retentionMs = config.retentionMs ?? envConfig.retentionMs;
    this.interval = config.interval ?? envConfig.interval;
    this.batchSize = config.batchSize ?? envConfig.batchSize;
    this.enableDLQ = config.enableDLQ ?? envConfig.enableDLQ;
    this.dlqPath = config.dlqPath || DEFAULTS.dlqPath;

    // Task access functions (can be overridden for testing or integration)
    this.getTaskList = config.getTaskList || this._defaultGetTaskList.bind(this);
    this.removeTask = config.removeTask || this._defaultRemoveTask.bind(this);

    // Internal state
    this.listeners = [];
    this.cleanupTimer = null;
    this.isRunning = false;
    this.stats = {
      totalCleaned: 0,
      lastCleanupTime: null,
      lastCleanupCount: 0,
      cleanupCycles: 0,
    };

    // Internal task storage (for standalone mode)
    this._taskStore = new Map();
  }

  /**
   * Archive a task to the Dead Letter Queue
   * @param {Object} task
   * @param {string} reason
   */
  _archiveToDLQ(task, reason) {
    if (!this.enableDLQ || !this.dlqPath) return;

    const entry = {
      ...task,
      archivedAt: new Date().toISOString(),
      reason,
    };

    appendJsonl(this.dlqPath, entry);
  }

  /**
   * Default task list getter (uses internal store)
   * Override this for integration with external task systems
   * @private
   * @returns {Promise<Array>} Array of tasks
   */
  async _defaultGetTaskList() {
    return Array.from(this._taskStore.values());
  }

  /**
   * Default task removal (uses internal store)
   * Override this for integration with external task systems
   * @private
   * @param {string} taskId - Task ID to remove
   * @returns {Promise<boolean>} True if removed
   */
  async _defaultRemoveTask(taskId) {
    return this._taskStore.delete(taskId);
  }

  /**
   * Add a task to the internal store (for standalone mode)
   *
   * @param {Object} task - Task object with id, status, completedAt
   * @returns {TaskCleanupManager} this (for chaining)
   */
  addTask(task) {
    if (!task.id) {
      throw new Error('Task must have an id');
    }
    this._taskStore.set(task.id, {
      ...task,
      createdAt: task.createdAt || Date.now(),
    });
    return this;
  }

  /**
   * Update a task in the internal store
   *
   * @param {string} taskId - Task ID
   * @param {Object} updates - Updates to apply
   * @returns {TaskCleanupManager} this (for chaining)
   */
  updateTask(taskId, updates) {
    const task = this._taskStore.get(taskId);
    if (task) {
      this._taskStore.set(taskId, { ...task, ...updates });
    }
    return this;
  }

  /**
   * Start the cleanup timer
   * @returns {TaskCleanupManager} this (for chaining)
   */
  start() {
    if (this.isRunning) {
      return this;
    }

    this.isRunning = true;
    this.cleanupTimer = setInterval(() => this.runCleanup(), this.interval);

    // Run an immediate cleanup
    this.runCleanup();

    return this;
  }

  /**
   * Stop the cleanup timer
   * @returns {TaskCleanupManager} this (for chaining)
   */
  stop() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.isRunning = false;
    return this;
  }

  /**
   * Run a cleanup cycle
   *
   * @returns {Promise<Object>} Cleanup result
   */
  async runCleanup() {
    const startTime = Date.now();
    const cutoffTime = startTime - this.retentionMs;
    let cleanedCount = 0;
    const cleanedTasks = [];
    const errors = [];

    try {
      const tasks = await this.getTaskList();

      // Find tasks eligible for cleanup
      const eligibleTasks = tasks.filter(task => {
        // Must be in a cleanable status
        if (!CLEANABLE_STATUSES.includes(task.status)) {
          return false;
        }

        // Must be older than retention period
        const completedTime = task.completedAt || task.updatedAt || task.createdAt;
        return completedTime && completedTime < cutoffTime;
      });

      // Clean up in batches
      const tasksToClean = eligibleTasks.slice(0, this.batchSize);

      for (const task of tasksToClean) {
        try {
          // Archive failed/cancelled tasks to DLQ before removal
          if (task.status === 'failed' || task.status === 'cancelled') {
            this._archiveToDLQ(task, 'cleanup_failed_task');
          }

          const removed = await this.removeTask(task.id);
          if (removed) {
            cleanedCount++;
            cleanedTasks.push({
              id: task.id,
              status: task.status,
              age: startTime - (task.completedAt || task.createdAt),
            });
          }
        } catch (err) {
          errors.push({ taskId: task.id, error: err.message });
        }
      }

      // Update stats
      this.stats.totalCleaned += cleanedCount;
      this.stats.lastCleanupTime = startTime;
      this.stats.lastCleanupCount = cleanedCount;
      this.stats.cleanupCycles++;

      const result = {
        count: cleanedCount,
        tasks: cleanedTasks,
        eligible: eligibleTasks.length,
        errors: errors.length > 0 ? errors : undefined,
        duration: Date.now() - startTime,
        timestamp: new Date(startTime).toISOString(),
      };

      // Emit cleanup event
      this.emit('cleanup', result);

      return result;
    } catch (err) {
      const errorResult = {
        count: 0,
        error: err.message,
        duration: Date.now() - startTime,
        timestamp: new Date(startTime).toISOString(),
      };

      this.emit('error', errorResult);
      return errorResult;
    }
  }

  /**
   * Force cleanup of a specific task (bypass retention check)
   *
   * @param {string} taskId - Task ID to clean up
   * @returns {Promise<boolean>} True if cleaned
   */
  async forceCleanup(taskId) {
    try {
      const removed = await this.removeTask(taskId);
      if (removed) {
        this.stats.totalCleaned++;
        this.emit('forceCleanup', { taskId, timestamp: new Date().toISOString() });
      }
      return removed;
    } catch (err) {
      this.emit('error', { taskId, error: err.message });
      return false;
    }
  }

  /**
   * Register an event listener
   *
   * @param {string} event - Event name ('cleanup', 'error', 'forceCleanup')
   * @param {Function} callback - Callback function
   * @returns {TaskCleanupManager} this (for chaining)
   */
  on(event, callback) {
    this.listeners.push({ event, callback });
    return this;
  }

  /**
   * Remove an event listener
   *
   * @param {string} event - Event name
   * @param {Function} callback - Callback function to remove
   * @returns {TaskCleanupManager} this (for chaining)
   */
  off(event, callback) {
    this.listeners = this.listeners.filter(l => !(l.event === event && l.callback === callback));
    return this;
  }

  /**
   * Emit an event to all registered listeners
   *
   * @param {string} event - Event name
   * @param {any} data - Event data
   */
  emit(event, data) {
    this.listeners
      .filter(l => l.event === event)
      .forEach(l => {
        try {
          l.callback(data);
        } catch (err) {
          console.error(`[TaskCleanupManager] Error in ${event} listener:`, err.message);
        }
      });
  }

  /**
   * Get cleanup statistics
   *
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      retentionMs: this.retentionMs,
      interval: this.interval,
      batchSize: this.batchSize,
      taskStoreSize: this._taskStore.size,
    };
  }

  /**
   * Get status string
   *
   * @returns {string} Status string
   */
  getStatusString() {
    const stats = this.getStats();
    const lastCleanup = stats.lastCleanupTime
      ? new Date(stats.lastCleanupTime).toISOString()
      : 'never';

    return [
      `Status: ${stats.isRunning ? 'Running' : 'Stopped'}`,
      `Total cleaned: ${stats.totalCleaned}`,
      `Last cleanup: ${lastCleanup}`,
      `Cycles: ${stats.cleanupCycles}`,
      `Tasks in store: ${stats.taskStoreSize}`,
    ].join(' | ');
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalCleaned: 0,
      lastCleanupTime: null,
      lastCleanupCount: 0,
      cleanupCycles: 0,
    };
  }

  /**
   * Clear all tasks from internal store
   */
  clearTaskStore() {
    this._taskStore.clear();
  }
}

// Singleton instance for global cleanup management
let globalManager = null;

/**
 * Get the global TaskCleanupManager instance
 * Creates one if it doesn't exist
 *
 * @param {Object} [config] - Configuration (only used on first call)
 * @returns {TaskCleanupManager} Global manager instance
 */
function getGlobalManager(config = {}) {
  if (!globalManager) {
    globalManager = new TaskCleanupManager(config);
  }
  return globalManager;
}

/**
 * Reset the global manager (for testing)
 */
function resetGlobalManager() {
  if (globalManager) {
    globalManager.stop();
    globalManager.clearTaskStore();
    globalManager = null;
  }
}

module.exports = TaskCleanupManager;
module.exports.TaskCleanupManager = TaskCleanupManager;
module.exports.getGlobalManager = getGlobalManager;
module.exports.resetGlobalManager = resetGlobalManager;
module.exports.DEFAULTS = DEFAULTS;
module.exports.CLEANABLE_STATUSES = CLEANABLE_STATUSES;
