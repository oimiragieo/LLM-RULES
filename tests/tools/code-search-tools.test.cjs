'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  runSemanticSearch,
} = require('../../.claude/tools/code-semantic-search/code-semantic-search.cjs');
const {
  runStructuralSearch,
} = require('../../.claude/tools/code-structural-search/code-structural-search.cjs');

test('runSemanticSearch requires query', async () => {
  const result = await runSemanticSearch({});
  assert.equal(result.ok, false);
  assert.match(result.error, /query is required/);
});

test('runSemanticSearch uses indexer search result', async () => {
  const result = await runSemanticSearch(
    { query: 'auth bug', limit: 2 },
    {
      createIndexer: () => ({
        search: async () => [{ file: 'a.js' }],
      }),
    }
  );
  assert.equal(result.ok, true);
  assert.equal(result.count, 1);
  assert.equal(result.query, 'auth bug');
});

test('runStructuralSearch returns file mode when filePath provided', async () => {
  const result = await runStructuralSearch(
    { filePath: 'src/index.js', start: 0, end: 2 },
    {
      createIndexer: () => ({
        getFileContent: async () => 'line 1\nline 2',
      }),
    }
  );
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'file');
  assert.match(result.content, /line 1/);
});

test('runStructuralSearch returns structure mode by default', async () => {
  const result = await runStructuralSearch(
    {},
    {
      createIndexer: () => ({
        analyzeStructure: async () => ({ files: 10 }),
      }),
    }
  );
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'structure');
  assert.deepEqual(result.structure, { files: 10 });
});
