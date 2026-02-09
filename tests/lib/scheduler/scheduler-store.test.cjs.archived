const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  addTask,
  listTasks,
  removeTask,
  getDueTasks,
} = require('../../../.claude/lib/scheduler/scheduler-store.cjs');
const { runTick } = require('../../../.claude/lib/scheduler/scheduler-tick.cjs');

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agent-studio-scheduler-'));
}

test('scheduler store add/list/remove', () => {
  const projectRoot = makeTempRoot();
  const id = addTask(
    {
      name: 'Once task',
      type: 'once',
      nextRunAt: new Date(Date.now() + 1000).toISOString(),
      payload: {},
    },
    projectRoot
  );

  const tasks = listTasks(projectRoot);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].id, id);

  const removed = removeTask(id, projectRoot);
  assert.equal(removed, true);
  assert.equal(listTasks(projectRoot).length, 0);
});

test('scheduler due tasks and tick removes once task', () => {
  const projectRoot = makeTempRoot();
  addTask(
    {
      name: 'Due once task',
      type: 'once',
      nextRunAt: new Date(Date.now() - 1000).toISOString(),
      payload: {},
    },
    projectRoot
  );

  const due = getDueTasks(projectRoot, Date.now());
  assert.equal(due.length, 1);

  const result = runTick(projectRoot);
  assert.equal(result.executed, 1);
  assert.equal(getDueTasks(projectRoot, Date.now()).length, 0);
});
