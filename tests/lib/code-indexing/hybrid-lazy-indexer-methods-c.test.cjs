'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  HybridLazyIndexerMethodsC,
} = require('../../../.claude/lib/code-indexing/hybrid-lazy-indexer-methods-c.cjs');

class Harness extends HybridLazyIndexerMethodsC {}

test('storeEmbeddings deletes existing file vectors before adding new chunks', async () => {
  const calls = [];
  const instance = new Harness();
  instance.table = {
    delete: async where => {
      calls.push({ op: 'delete', where });
    },
    add: async rows => {
      calls.push({ op: 'add', rows });
    },
  };

  const filePath = 'src/sample.js';
  const chunks = [
    { content: 'const a = 1;', filePath, lineStart: 0, lineEnd: 1 },
    { content: 'const b = 2;', filePath, lineStart: 2, lineEnd: 3 },
  ];
  const embeddings = [
    [0.1, 0.2],
    [0.3, 0.4],
  ];

  await instance.storeEmbeddings(filePath, chunks, embeddings);

  assert.equal(calls.length, 2);
  assert.equal(calls[0].op, 'delete');
  assert.equal(calls[1].op, 'add');
  assert.ok(String(calls[0].where).includes('src/sample.js'));
  assert.equal(calls[1].rows.length, 2);
});
