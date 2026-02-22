'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { runValidation } = require('../../../.claude/hooks/validation/taskupdate-contract-validator.cjs');

describe('reflection-agent atomic handshake', () => {
  test('allows TaskUpdate without taskId when processedReflectionIds present', () => {
    const input = {
      tool_name: 'TaskUpdate',
      tool_input: {
        status: 'completed',
        metadata: {
          processedReflectionIds: ['task_completion:2026-02-22T00:00:00.000Z:42']
        }
      }
    };
    const result = runValidation(input);
    assert.equal(result.allow, true, 'Should allow reflection completion without taskId');
  });

  test('blocks TaskUpdate without taskId for non-reflection completions', () => {
    const input = {
      tool_name: 'TaskUpdate',
      tool_input: {
        status: 'completed',
        metadata: {
          summary: 'Done',
          filesModified: ['test.js']
        }
      }
    };
    const result = runValidation(input);
    assert.equal(result.allow, false, 'Should block non-reflection completion without taskId');
  });

  test('allows TaskUpdate with taskId for normal completions', () => {
    const input = {
      tool_name: 'TaskUpdate',
      tool_input: {
        taskId: '42',
        status: 'completed',
        metadata: {
          summary: 'Done',
          filesModified: ['test.js']
        }
      }
    };
    const result = runValidation(input);
    assert.equal(result.allow, true, 'Should allow normal completion with taskId');
  });

  test('allows TaskUpdate with in_progress status without taskId', () => {
    const input = {
      tool_name: 'TaskUpdate',
      tool_input: {
        taskId: '5',
        status: 'in_progress'
      }
    };
    const result = runValidation(input);
    assert.equal(result.allow, true, 'Should allow in_progress update with taskId');
  });
});
