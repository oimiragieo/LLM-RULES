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

test('task IDs use UUID format (no Date.now() prefix)', async () => {
  cleanupTasks();

  const task = await TaskCreate({ subject: 'UUID test', description: '-' });

  // UUID v4 format: task-xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  const uuidPattern = /^task-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  assert.match(task.id, uuidPattern, `Task ID "${task.id}" does not match UUID v4 format`);

  cleanupTasks();
});
