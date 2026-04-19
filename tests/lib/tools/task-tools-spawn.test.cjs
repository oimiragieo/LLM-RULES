'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { Task } = require('../../../.claude/lib/tools/task-tools.cjs');
const { MemoryVectorStore } = require('../../../.claude/lib/memory/lancedb-client-impl.cjs');

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

test('Task uses real process spawn by default', async () => {
  const previous = process.env.TASK_TOOL_REAL_SPAWN;
  const previousSink = process.env.EVENT_BUS_SINK;
  delete process.env.TASK_TOOL_REAL_SPAWN;
  delete process.env.EVENT_BUS_SINK;

  try {
    const result = await Task({
      subagent_type: 'developer',
      description: 'spawn test',
      prompt: 'reply READY',
      allowed_tools: ['Read', 'TaskUpdate'],
      task_id: 'task-spawn-test-1',
    });

    assert.equal(result.status, 'completed');
    assert.equal(result.task_id, 'task-spawn-test-1');
    assert.ok(result.spawn);
    assert.equal(result.spawn.mode, 'process');
    assert.equal(typeof result.spawn.pid, 'number');
    assert.equal(result.spawn.exitCode, 0);
    assert.ok(
      result.spawn.script.endsWith(
        path.join('.claude', 'lib', 'tools', 'task-subagent-telemetry.cjs')
      ),
      'Task should run framework subagent telemetry script'
    );
    assert.equal(result.spawn.output?.frameworkLoaded, true);
  } finally {
    MemoryVectorStore.clearSharedStores();
    restoreEnv('TASK_TOOL_REAL_SPAWN', previous);
    restoreEnv('EVENT_BUS_SINK', previousSink);
  }
});

test('Task supports simulate mode when TASK_TOOL_REAL_SPAWN=off', async () => {
  const previous = process.env.TASK_TOOL_REAL_SPAWN;
  process.env.TASK_TOOL_REAL_SPAWN = 'off';

  try {
    const result = await Task({
      subagent_type: 'developer',
      description: 'simulate test',
      prompt: 'reply READY',
      allowed_tools: ['Read'],
      task_id: 'task-spawn-test-2',
    });

    assert.equal(result.status, 'completed');
    assert.ok(result.spawn);
    assert.equal(result.spawn.mode, 'simulated');
  } finally {
    MemoryVectorStore.clearSharedStores();
    restoreEnv('TASK_TOOL_REAL_SPAWN', previous);
  }
});
