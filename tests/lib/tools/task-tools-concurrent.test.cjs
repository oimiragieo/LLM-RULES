'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const { TaskCreate, TaskList } = require('../../../.claude/lib/tools/task-tools.cjs');
const { PROJECT_ROOT } = require('../../../.claude/lib/utils/project-root.cjs');

const tasksFile = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'tasks.json');

function cleanupTasks() {
  if (fs.existsSync(tasksFile)) {
    fs.unlinkSync(tasksFile);
  }
}

test('concurrent TaskCreate does not lose tasks (no write lost under parallel calls)', async () => {
  cleanupTasks();

  const COUNT = 10;

  // Fire COUNT TaskCreate calls concurrently
  const results = await Promise.all(
    Array.from({ length: COUNT }, (_, i) =>
      TaskCreate({
        subject: `Concurrent task ${i}`,
        description: `Concurrent task description ${i}`,
      })
    )
  );

  // All returned task objects must have unique IDs
  const ids = results.map(t => t.id);
  const uniqueIds = new Set(ids);
  assert.equal(uniqueIds.size, COUNT, `Expected ${COUNT} unique task IDs, got ${uniqueIds.size}`);

  // The persisted file must contain exactly COUNT tasks
  const list = await TaskList();
  assert.equal(
    list.total,
    COUNT,
    `Expected ${COUNT} persisted tasks, got ${list.total} (${COUNT - list.total} writes lost)`
  );

  // Each persisted task ID must appear in the results
  const persistedIds = new Set(list.tasks.map(t => t.id));
  for (const id of ids) {
    assert.ok(persistedIds.has(id), `Task ${id} was not found in persisted store`);
  }

  cleanupTasks();
});

test('task IDs use composite Date.now() and UUID slice format', async () => {
  cleanupTasks();

  const task = await TaskCreate({ subject: 'Composite ID test', description: '-' });

  // Composite format: task-<timestamp>-<8-char-uuid-slice>
  const compositePattern = /^task-\d{13}-[0-9a-f]{8}$/i;
  assert.match(task.id, compositePattern, `Task ID "${task.id}" does not match time-uuid hybrid format`);

  cleanupTasks();
});
