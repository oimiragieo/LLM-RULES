#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const TEST_ROOT = path.join(__dirname, '.test-memory-observability');

function setupTestRoot() {
  if (fs.existsSync(TEST_ROOT)) {
    fs.rmSync(TEST_ROOT, { recursive: true, force: true });
  }
  fs.mkdirSync(path.join(TEST_ROOT, '.claude', 'context', 'memory'), { recursive: true });
}

function cleanupTestRoot() {
  if (fs.existsSync(TEST_ROOT)) {
    fs.rmSync(TEST_ROOT, { recursive: true, force: true });
  }
}

function loadMemoryManagerWithMocks({ eventBusMock, contextualMemoryMockClass }) {
  const managerPath = require.resolve('../../../.claude/lib/memory/memory-manager.cjs');
  const eventBusPath = require.resolve('../../../.claude/lib/events/event-bus.cjs');
  const contextualMemoryPath = require.resolve('../../../.claude/lib/memory/contextual-memory.cjs');

  const previousEventBus = require.cache[eventBusPath];
  const previousContextualMemory = require.cache[contextualMemoryPath];

  require.cache[eventBusPath] = {
    id: eventBusPath,
    filename: eventBusPath,
    loaded: true,
    exports: eventBusMock,
  };

  if (contextualMemoryMockClass) {
    require.cache[contextualMemoryPath] = {
      id: contextualMemoryPath,
      filename: contextualMemoryPath,
      loaded: true,
      exports: { ContextualMemory: contextualMemoryMockClass },
    };
  }

  delete require.cache[managerPath];
  const memoryManager = require(managerPath);

  function restore() {
    delete require.cache[managerPath];
    if (previousEventBus) {
      require.cache[eventBusPath] = previousEventBus;
    } else {
      delete require.cache[eventBusPath];
    }

    if (contextualMemoryMockClass) {
      if (previousContextualMemory) {
        require.cache[contextualMemoryPath] = previousContextualMemory;
      } else {
        delete require.cache[contextualMemoryPath];
      }
    }
  }

  return { memoryManager, restore };
}

test('recordGotcha emits MEMORY_SAVED once for unique entry', { concurrency: false }, t => {
  setupTestRoot();
  t.after(cleanupTestRoot);

  const events = [];
  const { memoryManager, restore } = loadMemoryManagerWithMocks({
    eventBusMock: {
      emit: (type, payload) => {
        events.push({ type, payload });
        return Promise.resolve();
      },
    },
  });
  t.after(restore);

  const firstWrite = memoryManager.recordGotcha('observability gotcha', TEST_ROOT);
  const secondWrite = memoryManager.recordGotcha('observability gotcha', TEST_ROOT);

  assert.equal(firstWrite, true);
  assert.equal(secondWrite, false);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'MEMORY_SAVED');
  assert.equal(events[0].payload.source, 'memory-manager.recordGotcha');
  assert.match(events[0].payload.key, /^gotchas:/);
  assert.equal(events[0].payload.value.area, 'main');
});

test('recordPatternAsync emits MEMORY_SAVED for async writes', { concurrency: false }, async t => {
  setupTestRoot();
  t.after(cleanupTestRoot);

  const events = [];
  const { memoryManager, restore } = loadMemoryManagerWithMocks({
    eventBusMock: {
      emit: (type, payload) => {
        events.push({ type, payload });
        return Promise.resolve();
      },
    },
  });
  t.after(restore);

  const wrote = await memoryManager.recordPatternAsync('observability pattern', TEST_ROOT);
  assert.equal(wrote, true);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'MEMORY_SAVED');
  assert.equal(events[0].payload.source, 'memory-manager.recordPattern');
  assert.match(events[0].payload.key, /^patterns:/);
});

test(
  'loadMemoryForContext and loadMemoryForContextAsync emit MEMORY_QUERIED with aggregated results',
  { concurrency: false },
  async t => {
    setupTestRoot();
    t.after(cleanupTestRoot);

    const events = [];
    class MockContextualMemory {
      loadContextSync() {
        return {
          gotchas: [{ text: 'g1' }],
          patterns: [{ text: 'p1' }, { text: 'p2' }],
          decisions: [],
          discoveries: [{ path: 'src/a.cjs' }],
          recent_sessions: [{ id: 1 }],
        };
      }

      async loadContext() {
        return {
          gotchas: [{ text: 'g1' }],
          patterns: [{ text: 'p1' }, { text: 'p2' }],
          decisions: [],
          discoveries: [{ path: 'src/a.cjs' }],
          recent_sessions: [{ id: 1 }],
        };
      }
    }

    const { memoryManager, restore } = loadMemoryManagerWithMocks({
      eventBusMock: {
        emit: (type, payload) => {
          events.push({ type, payload });
          return Promise.resolve();
        },
      },
      contextualMemoryMockClass: MockContextualMemory,
    });
    t.after(restore);

    const syncResult = memoryManager.loadMemoryForContext(TEST_ROOT);
    assert.equal(syncResult.patterns.length, 2);

    const asyncResult = await memoryManager.loadMemoryForContextAsync(TEST_ROOT);
    assert.equal(asyncResult.discoveries.length, 1);

    assert.equal(events.length, 2);
    assert.equal(events[0].type, 'MEMORY_QUERIED');
    assert.equal(events[0].payload.query, 'context:loadMemoryForContext');
    assert.equal(events[0].payload.results, 5);
    assert.equal(typeof events[0].payload.latency, 'number');
    assert.ok(events[0].payload.latency >= 0);

    assert.equal(events[1].type, 'MEMORY_QUERIED');
    assert.equal(events[1].payload.query, 'context:loadMemoryForContextAsync');
    assert.equal(events[1].payload.results, 5);
    assert.equal(typeof events[1].payload.latency, 'number');
    assert.ok(events[1].payload.latency >= 0);
  }
);
