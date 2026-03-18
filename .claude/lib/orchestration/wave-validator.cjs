#!/usr/bin/env node
'use strict';

/**
 * Wave Validator — Execution Hardening (Feature B7)
 * ==================================================
 * Pre-wave dependency validation and cross-plan data contracts.
 * Before each execution wave, validates that required upstream outputs
 * exist and are well-formed.
 *
 * Usage:
 *   const { validateWaveDependencies, validateDataContracts, createDataContract } = require('./wave-validator.cjs');
 *
 *   const depResult = validateWaveDependencies(
 *     [{ id: 'task-3', blockedBy: ['task-1', 'task-2'] }],
 *     ['task-1', 'task-2']
 *   );
 *
 *   const contractResult = validateDataContracts(
 *     [{ id: 'task-3' }],
 *     { 'task-1': { plan_file: '.claude/context/plans/auth.md' } },
 *     [{ producer_task_id: 'task-1', output_keys: [{ key: 'plan_file', type: 'string', required: true }] }]
 *   );
 */

const fs = require('fs');
const path = require('path');

const CONTRACTS_FILE = path.join(
  __dirname,
  '..',
  '..',
  'context',
  'runtime',
  'data-contracts.json'
);

/**
 * @typedef {Object} WaveTask
 * @property {string} id
 * @property {string[]} [blockedBy]
 */

/**
 * @typedef {Object} OutputKeySpec
 * @property {string} key
 * @property {'string'|'number'|'boolean'|'object'|'array'|'file_path'} type
 * @property {boolean} [required=true]
 */

/**
 * @typedef {Object} DataContract
 * @property {string} producer_task_id
 * @property {OutputKeySpec[]} output_keys
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid
 * @property {string[]} missing - Missing dependencies or outputs
 * @property {string[]} errors - Detailed error messages
 */

/**
 * Validate that all tasks in a wave have their blockedBy tasks completed.
 * @param {WaveTask[]} waveTasks - Tasks in the current wave
 * @param {string[]} completedTaskIds - IDs of completed tasks
 * @returns {ValidationResult}
 */
function validateWaveDependencies(waveTasks, completedTaskIds) {
  const completed = new Set(completedTaskIds);
  const missing = [];
  const errors = [];

  for (const task of waveTasks) {
    if (!task.blockedBy || task.blockedBy.length === 0) continue;

    for (const depId of task.blockedBy) {
      if (!completed.has(depId)) {
        missing.push(depId);
        errors.push(`Task ${task.id} requires ${depId} to be completed first`);
      }
    }
  }

  return {
    valid: missing.length === 0,
    missing: [...new Set(missing)],
    errors,
  };
}

/**
 * Validate that required output keys from upstream tasks exist and match expected types.
 * @param {WaveTask[]} waveTasks - Tasks in the current wave
 * @param {Record<string, Record<string, unknown>>} taskOutputs - Actual task outputs
 * @param {DataContract[]} contracts - Data contracts specifying expected outputs
 * @returns {ValidationResult}
 */
function validateDataContracts(waveTasks, taskOutputs, contracts) {
  const missing = [];
  const errors = [];

  // Build a set of producer tasks that wave tasks depend on
  const requiredProducers = new Set();
  for (const task of waveTasks) {
    if (task.blockedBy) {
      for (const dep of task.blockedBy) {
        requiredProducers.add(dep);
      }
    }
  }

  // Check contracts for required producers
  for (const contract of contracts) {
    if (!requiredProducers.has(contract.producer_task_id)) continue;

    const outputs = taskOutputs[contract.producer_task_id] || {};

    for (const spec of contract.output_keys) {
      const isRequired = spec.required !== false;
      const value = outputs[spec.key];

      if (value === undefined) {
        if (isRequired) {
          missing.push(`${contract.producer_task_id}.${spec.key}`);
          errors.push(
            `Required output key "${spec.key}" missing from task ${contract.producer_task_id}`
          );
        }
        continue;
      }

      // Type validation
      const typeError = validateType(value, spec.type, spec.key, contract.producer_task_id);
      if (typeError) {
        errors.push(typeError);
      }
    }
  }

  return {
    valid: missing.length === 0 && errors.length === 0,
    missing,
    errors,
  };
}

/**
 * Validate that a value matches the expected type.
 * @param {unknown} value
 * @param {string} expectedType
 * @param {string} key
 * @param {string} taskId
 * @returns {string|null} Error message or null if valid
 */
function validateType(value, expectedType, key, taskId) {
  switch (expectedType) {
    case 'string':
      if (typeof value !== 'string')
        return `${taskId}.${key}: expected string, got ${typeof value}`;
      break;
    case 'number':
      if (typeof value !== 'number')
        return `${taskId}.${key}: expected number, got ${typeof value}`;
      break;
    case 'boolean':
      if (typeof value !== 'boolean')
        return `${taskId}.${key}: expected boolean, got ${typeof value}`;
      break;
    case 'object':
      if (typeof value !== 'object' || value === null || Array.isArray(value))
        return `${taskId}.${key}: expected object, got ${Array.isArray(value) ? 'array' : typeof value}`;
      break;
    case 'array':
      if (!Array.isArray(value)) return `${taskId}.${key}: expected array, got ${typeof value}`;
      break;
    case 'file_path':
      if (typeof value !== 'string')
        return `${taskId}.${key}: expected file_path (string), got ${typeof value}`;
      if (!fs.existsSync(value)) return `${taskId}.${key}: file not found at ${value}`;
      break;
    default:
      return `${taskId}.${key}: unknown type "${expectedType}"`;
  }
  return null;
}

/**
 * Register a data contract for a producer task.
 * @param {string} producerTaskId
 * @param {OutputKeySpec[]} outputKeys
 */
function createDataContract(producerTaskId, outputKeys) {
  const contracts = loadContracts();
  // Replace any existing contract for this producer
  const idx = contracts.findIndex(c => c.producer_task_id === producerTaskId);
  const contract = { producer_task_id: producerTaskId, output_keys: outputKeys };

  if (idx >= 0) {
    contracts[idx] = contract;
  } else {
    contracts.push(contract);
  }

  saveContracts(contracts);
  return contract;
}

/**
 * Get all registered data contracts.
 * @returns {DataContract[]}
 */
function getContracts() {
  return loadContracts();
}

/**
 * Clear all stored contracts.
 */
function clearContracts() {
  saveContracts([]);
}

function loadContracts() {
  try {
    const raw = fs.readFileSync(CONTRACTS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveContracts(contracts) {
  const dir = path.dirname(CONTRACTS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CONTRACTS_FILE, JSON.stringify(contracts, null, 2), 'utf8');
}

module.exports = {
  validateWaveDependencies,
  validateDataContracts,
  createDataContract,
  getContracts,
  clearContracts,
  CONTRACTS_FILE,
};
