'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const { TaskCreate, TaskList, TaskUpdate, TaskGet } = require('../../../.claude/lib/tools/task-tools.cjs');
const { PROJECT_ROOT } = require('../../../.claude/lib/utils/project-root.cjs');

const tasksFile = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'tasks.json');

function cleanupTasks() {
    if (fs.existsSync(tasksFile)) {
        fs.unlinkSync(tasksFile);
    }
}

test('TaskCreate writes to persistent tasks.json', async () => {
    cleanupTasks();

    const task = await TaskCreate({
        subject: 'Implement TDD tests',
        description: 'Write tests for persistent storage',
        priority: 'high'
    });

    assert.ok(task.id);
    assert.equal(task.subject, 'Implement TDD tests');
    assert.equal(task.status, 'created');

    assert.ok(fs.existsSync(tasksFile), 'tasks.json should be created');
    const fileContent = JSON.parse(fs.readFileSync(tasksFile, 'utf8'));

    assert.equal(fileContent.tasks.length, 1);
    assert.equal(fileContent.tasks[0].id, task.id);
    assert.equal(fileContent.tasks[0].subject, 'Implement TDD tests');

    cleanupTasks();
});

test('TaskList reads from persistent tasks.json', async () => {
    cleanupTasks();

    await TaskCreate({ subject: 'Task A', description: 'Desc A' });
    await TaskCreate({ subject: 'Task B', description: 'Desc B' });

    const list = await TaskList();
    assert.equal(list.total, 2);
    assert.equal(list.tasks.length, 2);
    assert.equal(list.tasks[0].subject, 'Task A');
    assert.equal(list.tasks[1].subject, 'Task B');

    cleanupTasks();
});

test('TaskUpdate updates status in persistent tasks.json', async () => {
    cleanupTasks();

    const task = await TaskCreate({ subject: 'Update me', description: '-' });

    await TaskUpdate({ taskId: task.id, status: 'in_progress' });

    const list = await TaskList();
    assert.equal(list.tasks[0].status, 'in_progress');

    const fileContent = JSON.parse(fs.readFileSync(tasksFile, 'utf8'));
    assert.equal(fileContent.tasks[0].status, 'in_progress');

    cleanupTasks();
});

test('TaskGet retrieves correct task from tasks.json', async () => {
    cleanupTasks();

    const task1 = await TaskCreate({ subject: 'Task 1', description: '-' });
    await TaskCreate({ subject: 'Task 2', description: '-' });

    const fetched1 = await TaskGet({ taskId: task1.id });
    assert.equal(fetched1.id, task1.id);
    assert.equal(fetched1.subject, 'Task 1');

    cleanupTasks();
});
