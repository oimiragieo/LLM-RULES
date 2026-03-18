'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert');

const INJECTOR_PATH = '../../../.claude/lib/spawn/previous-task-injector.cjs';

function loadInjector() {
  delete require.cache[require.resolve(INJECTOR_PATH)];
  return require(INJECTOR_PATH);
}

describe('previous-task-injector', () => {
  test('exports expected functions', () => {
    const injector = loadInjector();
    assert.strictEqual(typeof injector.getPreviousTaskContext, 'function');
    assert.strictEqual(typeof injector.recordTaskCompletion, 'function');
  });

  test('returns empty context when no previous task exists', () => {
    const injector = loadInjector();
    injector._reset();
    const ctx = injector.getPreviousTaskContext();
    assert.strictEqual(ctx, '');
  });

  test('injects last completed task metadata', () => {
    const injector = loadInjector();
    injector._reset();
    injector.recordTaskCompletion({
      taskId: 'task-5',
      agentType: 'developer',
      summary: 'Added JWT auth',
      filesModified: ['src/auth.js'],
      keyDecisions: ['JWT over sessions'],
    });
    const ctx = injector.getPreviousTaskContext();
    assert.ok(ctx.includes('JWT auth'), 'Should include summary');
    assert.ok(ctx.includes('src/auth.js'), 'Should include files');
    assert.ok(ctx.includes('JWT over sessions'), 'Should include decisions');
  });

  test('injection capped at 500 tokens (~2000 chars)', () => {
    const injector = loadInjector();
    injector._reset();
    injector.recordTaskCompletion({
      taskId: 'task-99',
      agentType: 'developer',
      summary: 'A'.repeat(3000),
      filesModified: Array.from({ length: 100 }, (_, i) => `file-${i}.js`),
      keyDecisions: ['decision'],
    });
    const ctx = injector.getPreviousTaskContext();
    assert.ok(ctx.length <= 2000, `Context should be <=2000 chars, got ${ctx.length}`);
  });

  test('disabled via env var PREVIOUS_TASK_INJECTION=off', () => {
    const origVal = process.env.PREVIOUS_TASK_INJECTION;
    process.env.PREVIOUS_TASK_INJECTION = 'off';
    try {
      const injector = loadInjector();
      injector._reset();
      injector.recordTaskCompletion({
        taskId: 'task-1',
        agentType: 'qa',
        summary: 'Test',
        filesModified: [],
      });
      const ctx = injector.getPreviousTaskContext();
      assert.strictEqual(ctx, '', 'Should return empty when disabled');
    } finally {
      if (origVal === undefined) {
        delete process.env.PREVIOUS_TASK_INJECTION;
      } else {
        process.env.PREVIOUS_TASK_INJECTION = origVal;
      }
    }
  });

  test('overwrites previous task when new one completes', () => {
    const injector = loadInjector();
    injector._reset();
    injector.recordTaskCompletion({
      taskId: 'task-1',
      agentType: 'qa',
      summary: 'First task',
      filesModified: [],
    });
    injector.recordTaskCompletion({
      taskId: 'task-2',
      agentType: 'developer',
      summary: 'Second task',
      filesModified: ['b.js'],
    });
    const ctx = injector.getPreviousTaskContext();
    assert.ok(ctx.includes('Second task'), 'Should show latest task');
    assert.ok(!ctx.includes('First task'), 'Should not show older task');
  });
});
