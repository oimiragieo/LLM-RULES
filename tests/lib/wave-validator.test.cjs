#!/usr/bin/env node
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const {
  validateWaveDependencies,
  validateDataContracts,
  createDataContract,
  getContracts,
  clearContracts,
  CONTRACTS_FILE,
} = require('../../.claude/lib/orchestration/wave-validator.cjs');

describe('wave-validator', () => {
  beforeEach(() => {
    clearContracts();
  });

  afterEach(() => {
    try {
      fs.unlinkSync(CONTRACTS_FILE);
    } catch {
      // ignore
    }
  });

  describe('validateWaveDependencies', () => {
    it('passes when all dependencies completed', () => {
      const result = validateWaveDependencies(
        [{ id: 'task-3', blockedBy: ['task-1', 'task-2'] }],
        ['task-1', 'task-2']
      );
      assert.equal(result.valid, true);
      assert.equal(result.missing.length, 0);
    });

    it('fails when dependency not completed', () => {
      const result = validateWaveDependencies(
        [{ id: 'task-3', blockedBy: ['task-1', 'task-2'] }],
        ['task-1']
      );
      assert.equal(result.valid, false);
      assert.deepEqual(result.missing, ['task-2']);
      assert.ok(result.errors[0].includes('task-2'));
    });

    it('passes for tasks with no blockers', () => {
      const result = validateWaveDependencies([{ id: 'task-1' }], []);
      assert.equal(result.valid, true);
    });

    it('deduplicates missing dependencies', () => {
      const result = validateWaveDependencies(
        [
          { id: 'task-3', blockedBy: ['task-1'] },
          { id: 'task-4', blockedBy: ['task-1'] },
        ],
        []
      );
      assert.equal(result.missing.length, 1);
      assert.deepEqual(result.missing, ['task-1']);
    });
  });

  describe('validateDataContracts', () => {
    it('passes when all required outputs present and typed correctly', () => {
      const result = validateDataContracts(
        [{ id: 'task-2', blockedBy: ['task-1'] }],
        { 'task-1': { plan_file: '/path/to/plan.md', count: 5 } },
        [
          {
            producer_task_id: 'task-1',
            output_keys: [
              { key: 'plan_file', type: 'string', required: true },
              { key: 'count', type: 'number', required: true },
            ],
          },
        ]
      );
      assert.equal(result.valid, true);
      assert.equal(result.errors.length, 0);
    });

    it('fails when required output missing', () => {
      const result = validateDataContracts(
        [{ id: 'task-2', blockedBy: ['task-1'] }],
        { 'task-1': {} },
        [
          {
            producer_task_id: 'task-1',
            output_keys: [{ key: 'plan_file', type: 'string', required: true }],
          },
        ]
      );
      assert.equal(result.valid, false);
      assert.ok(result.missing.includes('task-1.plan_file'));
    });

    it('passes when optional output missing', () => {
      const result = validateDataContracts(
        [{ id: 'task-2', blockedBy: ['task-1'] }],
        { 'task-1': {} },
        [
          {
            producer_task_id: 'task-1',
            output_keys: [{ key: 'notes', type: 'string', required: false }],
          },
        ]
      );
      assert.equal(result.valid, true);
    });

    it('fails on type mismatch', () => {
      const result = validateDataContracts(
        [{ id: 'task-2', blockedBy: ['task-1'] }],
        { 'task-1': { count: 'not-a-number' } },
        [
          {
            producer_task_id: 'task-1',
            output_keys: [{ key: 'count', type: 'number', required: true }],
          },
        ]
      );
      assert.equal(result.valid, false);
      assert.ok(result.errors[0].includes('expected number'));
    });

    it('validates array type', () => {
      const result = validateDataContracts(
        [{ id: 'task-2', blockedBy: ['task-1'] }],
        { 'task-1': { items: [1, 2, 3] } },
        [
          {
            producer_task_id: 'task-1',
            output_keys: [{ key: 'items', type: 'array' }],
          },
        ]
      );
      assert.equal(result.valid, true);
    });

    it('validates object type rejects arrays', () => {
      const result = validateDataContracts(
        [{ id: 'task-2', blockedBy: ['task-1'] }],
        { 'task-1': { data: [1, 2] } },
        [
          {
            producer_task_id: 'task-1',
            output_keys: [{ key: 'data', type: 'object' }],
          },
        ]
      );
      assert.equal(result.valid, false);
      assert.ok(result.errors[0].includes('expected object'));
    });

    it('skips contracts for non-dependent producers', () => {
      const result = validateDataContracts([{ id: 'task-2', blockedBy: ['task-1'] }], {}, [
        {
          producer_task_id: 'task-99',
          output_keys: [{ key: 'x', type: 'string', required: true }],
        },
      ]);
      assert.equal(result.valid, true);
    });
  });

  describe('createDataContract / getContracts', () => {
    it('creates and retrieves a contract', () => {
      createDataContract('task-1', [{ key: 'plan', type: 'string', required: true }]);
      const contracts = getContracts();
      assert.equal(contracts.length, 1);
      assert.equal(contracts[0].producer_task_id, 'task-1');
    });

    it('replaces existing contract for same producer', () => {
      createDataContract('task-1', [{ key: 'a', type: 'string' }]);
      createDataContract('task-1', [{ key: 'b', type: 'number' }]);
      const contracts = getContracts();
      assert.equal(contracts.length, 1);
      assert.equal(contracts[0].output_keys[0].key, 'b');
    });

    it('clearContracts removes all', () => {
      createDataContract('task-1', [{ key: 'a', type: 'string' }]);
      clearContracts();
      assert.equal(getContracts().length, 0);
    });
  });
});
