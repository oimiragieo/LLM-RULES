#!/usr/bin/env node
'use strict';

/**
 * A2A Task State Machine
 * ======================
 * Manages A2A task lifecycle with validated state transitions.
 *
 * States: submitted → working → completed | failed | canceled
 *         working → input-required → working
 *
 * Tasks are stored in memory (ephemeral). Persistence handled in P4.
 */

const crypto = require('crypto');

// Valid state transitions: key = from-state, value = set of allowed to-states
const VALID_TRANSITIONS = {
  submitted: new Set(['working', 'canceled']),
  working: new Set(['completed', 'failed', 'input-required', 'canceled']),
  'input-required': new Set(['working', 'canceled']),
  completed: new Set(),
  failed: new Set(),
  canceled: new Set(),
};

const TERMINAL_STATES = new Set(['completed', 'failed', 'canceled']);

class TaskStateMachine {
  constructor() {
    /** @type {Map<string, object>} */
    this._tasks = new Map();
  }

  /**
   * Create a new task in submitted state.
   * @param {object} params - Task parameters (arbitrary caller-provided data)
   * @returns {{ id: string, status: 'submitted', createdAt: string, params: object }}
   */
  createTask(params = {}) {
    const id = crypto.randomUUID();
    const task = {
      id,
      status: 'submitted',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      params,
    };
    this._tasks.set(id, task);
    return { ...task };
  }

  /**
   * Transition a task to a new state.
   * @param {string} id - Task ID
   * @param {string} newStatus - Target state
   * @returns {object} Updated task snapshot
   * @throws {Error} If task not found or transition is invalid
   */
  transition(id, newStatus) {
    const task = this._tasks.get(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }

    const allowed = VALID_TRANSITIONS[task.status];
    if (!allowed || !allowed.has(newStatus)) {
      throw new Error(`Invalid transition from '${task.status}' to '${newStatus}' for task ${id}`);
    }

    task.status = newStatus;
    task.updatedAt = new Date().toISOString();

    // Evict terminal tasks after 5 minutes to prevent unbounded Map growth.
    // .unref() so this timer does not prevent the process from exiting in tests.
    if (TERMINAL_STATES.has(newStatus)) {
      setTimeout(() => this._tasks.delete(id), 5 * 60 * 1000).unref();
    }

    return { ...task };
  }

  /**
   * Get a task by ID.
   * @param {string} id - Task ID
   * @returns {object|null} Task snapshot or null if not found
   */
  getTask(id) {
    const task = this._tasks.get(id);
    return task ? { ...task } : null;
  }

  /**
   * Cancel a task if it is not already in a terminal state.
   * @param {string} id - Task ID
   * @returns {object} Updated task snapshot
   * @throws {Error} If task not found or already terminal
   */
  cancelTask(id) {
    const task = this._tasks.get(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }
    if (TERMINAL_STATES.has(task.status)) {
      throw new Error(`Cannot cancel task ${id}: already in terminal state '${task.status}'`);
    }
    return this.transition(id, 'canceled');
  }

  /**
   * Return whether a task is in a terminal state.
   * @param {string} id - Task ID
   * @returns {boolean}
   */
  isTerminal(id) {
    const task = this._tasks.get(id);
    return task ? TERMINAL_STATES.has(task.status) : false;
  }

  /**
   * Return all tasks (for debugging/inspection).
   * @returns {object[]}
   */
  listTasks() {
    return Array.from(this._tasks.values()).map(t => ({ ...t }));
  }
}

module.exports = { TaskStateMachine, VALID_TRANSITIONS, TERMINAL_STATES };
