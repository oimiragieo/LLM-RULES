#!/usr/bin/env node
'use strict';

/**
 * Task Output Chaining (Feature B2)
 * ==================================
 * Standardizes output_key pattern in TaskUpdate metadata so downstream
 * tasks can reference outputs from upstream tasks by key name.
 *
 * Usage:
 *   const { setTaskOutput, getTaskOutput, resolveOutputRef, clearOutputs } = require('./task-output-chain.cjs');
 *
 *   setTaskOutput('task-1', 'plan_file', '.claude/context/plans/auth.md');
 *   const ref = resolveOutputRef('$task-1.plan_file');
 *   // => '.claude/context/plans/auth.md'
 */

const fs = require('fs');
const path = require('path');

const OUTPUTS_FILE = path.join(__dirname, '..', '..', 'context', 'runtime', 'task-outputs.json');

/**
 * Load outputs from disk.
 * @returns {Record<string, Record<string, unknown>>}
 */
function loadOutputs() {
  try {
    const raw = fs.readFileSync(OUTPUTS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Save outputs to disk.
 * @param {Record<string, Record<string, unknown>>} outputs
 */
function saveOutputs(outputs) {
  const dir = path.dirname(OUTPUTS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(OUTPUTS_FILE, JSON.stringify(outputs, null, 2), 'utf8');
}

/**
 * Store a key-value output for a task.
 * @param {string} taskId - Task identifier (e.g., 'task-1' or '1')
 * @param {string} key - Output key name
 * @param {unknown} value - Output value (must be JSON-serializable)
 */
function setTaskOutput(taskId, key, value) {
  if (!taskId || typeof taskId !== 'string') {
    throw new Error('taskId must be a non-empty string');
  }
  if (!key || typeof key !== 'string') {
    throw new Error('key must be a non-empty string');
  }
  const outputs = loadOutputs();
  if (!outputs[taskId]) {
    outputs[taskId] = {};
  }
  outputs[taskId][key] = value;
  saveOutputs(outputs);
}

/**
 * Retrieve an output by task ID and key.
 * @param {string} taskId
 * @param {string} key
 * @returns {unknown} The stored value, or undefined if not found
 */
function getTaskOutput(taskId, key) {
  const outputs = loadOutputs();
  if (!outputs[taskId]) return undefined;
  return outputs[taskId][key];
}

/**
 * Get all outputs for a given task.
 * @param {string} taskId
 * @returns {Record<string, unknown>} All key-value pairs for the task
 */
function getTaskOutputs(taskId) {
  const outputs = loadOutputs();
  return outputs[taskId] || {};
}

/**
 * Resolve a $task-N.key reference to its actual value.
 * Format: $task-N.key or $N.key (both supported)
 * @param {string} ref - Reference string like '$task-1.plan_file' or '$1.plan_file'
 * @returns {unknown} The resolved value, or undefined if not found
 */
function resolveOutputRef(ref) {
  if (!ref || typeof ref !== 'string' || !ref.startsWith('$')) {
    return undefined;
  }

  // Match $task-N.key or $N.key
  const match = ref.match(/^\$(?:task-)?(\S+?)\.(\S+)$/);
  if (!match) return undefined;

  const taskId = match[1];
  const key = match[2];

  // Try both 'task-N' and 'N' formats
  const outputs = loadOutputs();
  const fullId = `task-${taskId}`;

  if (outputs[fullId] && outputs[fullId][key] !== undefined) {
    return outputs[fullId][key];
  }
  if (outputs[taskId] && outputs[taskId][key] !== undefined) {
    return outputs[taskId][key];
  }

  return undefined;
}

/**
 * Resolve all $task-N.key references in a string, replacing them with actual values.
 * @param {string} template - String containing $task-N.key references
 * @returns {string} String with all references resolved
 */
function resolveAllRefs(template) {
  if (!template || typeof template !== 'string') return template;

  return template.replace(/\$(?:task-)?[\w-]+\.[\w-]+/g, match => {
    const resolved = resolveOutputRef(match);
    return resolved !== undefined ? String(resolved) : match;
  });
}

/**
 * Clear all stored outputs (useful for session cleanup).
 */
function clearOutputs() {
  saveOutputs({});
}

module.exports = {
  setTaskOutput,
  getTaskOutput,
  getTaskOutputs,
  resolveOutputRef,
  resolveAllRefs,
  clearOutputs,
  OUTPUTS_FILE,
};
