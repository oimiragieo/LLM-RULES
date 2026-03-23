#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  processHookInput,
} = require('../../.claude/hooks/reflection/reflection-data-aggregator.cjs');

function mkProjectRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reflection-data-aggregator-'));
  fs.mkdirSync(path.join(root, '.claude', 'context', 'metrics'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(root, '.claude', 'context', 'runtime'), {
    recursive: true,
  });
  return root;
}

function writeJsonl(filePath, entries) {
  fs.writeFileSync(filePath, entries.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf8');
}

test('skips non-TaskUpdate tool calls', () => {
  const root = mkProjectRoot();
  const result = processHookInput({ tool_name: 'Edit', tool_input: {} }, root);
  assert.equal(result.written, false);
  assert.equal(result.reason, 'not_taskupdate');
});

test('skips non-completed TaskUpdate', () => {
  const root = mkProjectRoot();
  const result = processHookInput(
    { tool_name: 'TaskUpdate', tool_input: { status: 'in_progress', taskId: 'task-1' } },
    root
  );
  assert.equal(result.written, false);
  assert.equal(result.reason, 'not_completed');
});

test('writes reflection data on completed TaskUpdate', () => {
  const root = mkProjectRoot();
  const metricsDir = path.join(root, '.claude', 'context', 'metrics');

  // Write some hook metrics for task-42
  writeJsonl(path.join(metricsDir, 'hook-metrics.jsonl'), [
    { taskId: 'task-42', tool: 'Read', timestamp: '2026-01-01T00:00:00Z' },
    { taskId: 'task-42', tool: 'Edit', timestamp: '2026-01-01T00:01:00Z' },
    { taskId: 'task-42', tool: 'Read', timestamp: '2026-01-01T00:02:00Z' },
    { taskId: 'task-99', tool: 'Bash', timestamp: '2026-01-01T00:03:00Z' },
  ]);

  // Write some error metrics
  writeJsonl(path.join(metricsDir, 'error-metrics.jsonl'), [
    {
      taskId: 'task-42',
      tool: 'Edit',
      errorType: 'file_not_found',
      message: 'File not found: foo.js',
      timestamp: '2026-01-01T00:01:30Z',
    },
    {
      taskId: 'task-99',
      tool: 'Bash',
      errorType: 'timeout',
      message: 'Timeout',
    },
  ]);

  const hookInput = {
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId: 'task-42',
      status: 'completed',
      owner: 'developer',
      metadata: {
        summary: 'Implemented feature X',
        filesModified: ['src/x.js', 'src/y.js'],
      },
    },
  };

  const result = processHookInput(hookInput, root);
  assert.equal(result.written, true);
  assert.equal(result.reason, 'ok');
  assert.ok(result.outputPath);
  assert.ok(fs.existsSync(result.outputPath));

  const data = JSON.parse(fs.readFileSync(result.outputPath, 'utf8'));
  assert.equal(data.taskId, 'task-42');
  assert.equal(data.agentType, 'developer');
  assert.equal(data.toolCalls.total, 3);
  assert.equal(data.toolCalls.breakdown.Read, 2);
  assert.equal(data.toolCalls.breakdown.Edit, 1);
  assert.equal(data.errors.count, 1);
  assert.equal(data.errors.details[0].tool, 'Edit');
  assert.equal(data.errors.details[0].errorType, 'file_not_found');
  assert.equal(data.completionMetadata.hasSummary, true);
  assert.equal(data.completionMetadata.hasFilesModified, true);
});

test('handles missing metrics files gracefully', () => {
  const root = mkProjectRoot();
  // No metrics files exist

  const hookInput = {
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId: 'task-1',
      status: 'completed',
      metadata: {},
    },
  };

  const result = processHookInput(hookInput, root);
  assert.equal(result.written, true);
  assert.ok(result.outputPath);

  const data = JSON.parse(fs.readFileSync(result.outputPath, 'utf8'));
  assert.equal(data.toolCalls.total, 0);
  assert.equal(data.errors.count, 0);
  assert.equal(data.completionMetadata.hasSummary, false);
  assert.equal(data.completionMetadata.hasFilesModified, false);
});

test('handles toolUse nested input format', () => {
  const root = mkProjectRoot();

  const hookInput = {
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        taskId: 'task-7',
        status: 'completed',
        metadata: { summary: 'Done' },
      },
    },
  };

  const result = processHookInput(hookInput, root);
  assert.equal(result.written, true);

  const data = JSON.parse(fs.readFileSync(result.outputPath, 'utf8'));
  assert.equal(data.taskId, 'task-7');
});

test('sanitizes taskId in output filename', () => {
  const root = mkProjectRoot();

  const hookInput = {
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId: 'task/../evil',
      status: 'completed',
      metadata: {},
    },
  };

  const result = processHookInput(hookInput, root);
  assert.equal(result.written, true);
  // The path should not contain ../
  assert.ok(!result.outputPath.includes('..'));
  assert.ok(result.outputPath.includes('task____evil'));
});
