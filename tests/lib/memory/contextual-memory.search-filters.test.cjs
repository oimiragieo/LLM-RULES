'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { ContextualMemory } = require('../../../.claude/lib/memory/contextual-memory.cjs');

test('ContextualMemory.search passes contextType/category filters', async () => {
  const cm = new ContextualMemory();
  let capturedOptions;
  cm._getVectorStore = async () => ({
    search: async (_query, options) => {
      capturedOptions = options;
      return [
        {
          content: 'result',
          metadata: {},
          similarity: 1,
        },
      ];
    },
  });

  const results = await cm.search('test query', {
    contextType: 'memory',
    category: 'profile',
  });

  assert.equal(results.length, 1);
  assert.ok(capturedOptions);
  assert.deepEqual(capturedOptions.filters, {
    type: 'memory',
    category: 'profile',
  });
});

test('ContextualMemory.search merges contextType/category into string filters', async () => {
  const cm = new ContextualMemory();
  let capturedOptions;
  cm._getVectorStore = async () => ({
    search: async (_query, options) => {
      capturedOptions = options;
      return [
        {
          content: 'result',
          metadata: {},
          similarity: 1,
        },
      ];
    },
  });

  await cm.search('test query', {
    filters: `metadata NOT LIKE '%"source":"ltm_archive"%'`,
    contextType: 'memory',
    category: 'events',
  });

  assert.ok(capturedOptions);
  assert.equal(typeof capturedOptions.filters, 'string');
  assert.ok(capturedOptions.filters.includes('metadata NOT LIKE'));
  assert.ok(capturedOptions.filters.includes('"type":"memory"'));
  assert.ok(capturedOptions.filters.includes('"category":"events"'));
});
