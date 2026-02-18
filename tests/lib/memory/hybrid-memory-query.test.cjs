'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const { ContextualMemory } = require('../../../.claude/lib/memory/contextual-memory.cjs');

const TEST_ROOT = path.join(__dirname, '.test-hybrid-memory-query');
const TEST_MEMORY_DIR = path.join(TEST_ROOT, '.claude', 'context', 'memory');
const TEST_DB_PATH = path.join(TEST_ROOT, '.claude', 'data', 'memory.db');
const MANAGED_ENV_KEYS = [
  'MEMORY_SEMANTIC_SEARCH',
  'MEMORY_HYBRID_RRF_K',
  'MEMORY_HYBRID_KEYWORD_WEIGHT',
  'MEMORY_HYBRID_VECTOR_WEIGHT',
  'MEMORY_HYBRID_VECTOR_BRANCH_LIMIT_MODE',
];
let envSnapshot = null;

function setup() {
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
  fs.mkdirSync(TEST_MEMORY_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(TEST_DB_PATH), { recursive: true });
}

function teardown() {
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
}

function withEnv(vars, fn) {
  const prev = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v == null) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v == null) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

function createMemory() {
  return new ContextualMemory({
    projectRoot: TEST_ROOT,
    memoryDir: TEST_MEMORY_DIR,
    dbPath: TEST_DB_PATH,
  });
}

function assertMemorySearchResultShape(item) {
  assert.equal(typeof item, 'object');
  assert.equal(typeof item.content, 'string');
  assert.equal(typeof item.metadata, 'object');
  assert.ok('source' in item);
  assert.ok('similarity' in item);
}

test.beforeEach(() => {
  envSnapshot = {};
  for (const key of MANAGED_ENV_KEYS) {
    envSnapshot[key] = process.env[key];
  }
});

test.afterEach(() => {
  for (const key of MANAGED_ENV_KEYS) {
    const prev = envSnapshot?.[key];
    if (prev == null) delete process.env[key];
    else process.env[key] = prev;
  }
  envSnapshot = null;
  teardown();
});

test('H1: hybridMemoryQuery fuses keyword+vector results via RRF with result-shape contract', async () => {
  setup();
  const memory = createMemory();

  memory._keywordSearch = async () => [
    { content: 'auth gotcha', metadata: { path: 'gotchas.json', chunkPos: 10 }, similarity: null },
    { content: 'deploy note', metadata: { id: 'k-2' }, similarity: null },
  ];
  memory._getVectorStore = async () => ({
    search: async () => [
      {
        content: 'auth gotcha',
        metadata: { path: 'gotchas.json', chunkPos: 10 },
        similarity: 0.91,
      },
      { content: 'security pattern', metadata: { id: 'v-2' }, similarity: 0.87 },
    ],
  });

  const results = await memory.hybridMemoryQuery('auth', { limit: 5, threshold: 0.2 });

  assert.ok(Array.isArray(results));
  assert.ok(results.length >= 2);
  results.forEach(assertMemorySearchResultShape);
  assert.ok(results.some(r => r.source === 'hybrid'));
  assert.ok(results.some(r => typeof r.rrf_score === 'number'));
});

test('H2: MEMORY_SEMANTIC_SEARCH=off returns keyword-only and skips vector store', async () => {
  setup();
  const memory = createMemory();
  let vectorCalled = 0;
  memory._keywordSearch = async () => [
    { content: 'keyword-only', metadata: { id: 'kw-1' }, similarity: null, source: 'keyword' },
  ];
  memory._getVectorStore = async () => {
    vectorCalled += 1;
    return { search: async () => [] };
  };

  await withEnv({ MEMORY_SEMANTIC_SEARCH: 'off' }, async () => {
    const results = await memory.hybridMemoryQuery('query', { limit: 3 });
    assert.equal(results.length, 1);
    assert.equal(results[0].source, 'keyword');
  });

  assert.equal(vectorCalled, 0);
});

test('H3: LanceDB unavailable falls back to keyword-only without throw', async () => {
  setup();
  const memory = createMemory();
  memory._keywordSearch = async () => [
    { content: 'fallback-keyword', metadata: { id: 'k-fallback' }, similarity: null },
  ];
  memory._getVectorStore = async () => {
    throw new Error('LanceDB failed');
  };

  const results = await memory.hybridMemoryQuery('query', { limit: 3 });
  assert.equal(results.length, 1);
  assert.equal(results[0].source, 'keyword');
});

test('H4: deduplicates using id fallback ordering (metadata.id, path+chunkPos, content hash)', async () => {
  setup();
  const memory = createMemory();
  memory._keywordSearch = async () => [
    { content: 'same text', metadata: { id: 'stable-1' }, similarity: null },
    {
      content: 'same path snippet A',
      metadata: { path: 'file.md', chunkPos: 10 },
      similarity: null,
    },
    { content: 'hash only', metadata: {}, similarity: null },
  ];
  memory._getVectorStore = async () => ({
    search: async () => [
      { content: 'same text', metadata: { id: 'stable-1' }, similarity: 0.8 },
      {
        content: 'same path snippet A',
        metadata: { path: 'file.md', chunkPos: 10 },
        similarity: 0.82,
      },
      { content: 'hash only', metadata: {}, similarity: 0.77 },
    ],
  });

  const results = await memory.hybridMemoryQuery('query', { limit: 10, threshold: 0.1 });
  const contents = results.map(r => r.content);
  assert.equal(contents.filter(c => c === 'same text').length, 1);
  assert.equal(contents.filter(c => c === 'same path snippet A').length, 1);
  assert.equal(contents.filter(c => c === 'hash only').length, 1);
});

test('H5: respects limit and threshold (threshold applies to vector only)', async () => {
  setup();
  const memory = createMemory();
  memory._keywordSearch = async () => [
    { content: 'keyword 1', metadata: { id: 'k1' }, similarity: null },
    { content: 'keyword 2', metadata: { id: 'k2' }, similarity: null },
    { content: 'keyword 3', metadata: { id: 'k3' }, similarity: null },
  ];
  memory._getVectorStore = async () => ({
    search: async () => [
      { content: 'vector low', metadata: { id: 'v1' }, similarity: 0.3 },
      { content: 'vector high', metadata: { id: 'v2' }, similarity: 0.95 },
    ],
  });

  const results = await memory.hybridMemoryQuery('query', { limit: 2, threshold: 0.8 });
  assert.ok(results.length <= 2);
  assert.ok(results.some(r => r.source === 'keyword' || r.source === 'hybrid'));
  const vectorOnly = results.filter(r => r.source === 'lancedb');
  assert.ok(vectorOnly.every(r => r.similarity >= 0.8));
});

test('H6: search() routes through hybridMemoryQuery when semantic mode is enabled', async () => {
  setup();
  const memory = createMemory();
  let called = 0;
  memory.hybridMemoryQuery = async () => {
    called += 1;
    return [{ content: 'hybrid path', metadata: {}, similarity: null, source: 'keyword' }];
  };

  await withEnv({ MEMORY_SEMANTIC_SEARCH: null }, async () => {
    const results = await memory.search('query', { limit: 3 });
    assert.equal(results.length, 1);
  });
  assert.equal(called, 1);
});

test('H7: search() preserves options/result shape contract for callers', async () => {
  setup();
  const memory = createMemory();
  let capturedOptions = null;
  memory.hybridMemoryQuery = async (_q, options) => {
    capturedOptions = options;
    return [{ content: 'x', metadata: { area: 'hooks' }, similarity: 0.9, source: 'lancedb' }];
  };

  const results = await memory.search('query', {
    limit: 4,
    threshold: 0.7,
    area: 'hooks',
    category: 'profile',
    contextType: 'memory',
  });

  assert.ok(capturedOptions);
  assert.equal(capturedOptions.limit, 4);
  assert.equal(capturedOptions.threshold, 0.7);
  assert.ok(capturedOptions.filters);
  assertMemorySearchResultShape(results[0]);
});

test('H8: fusion does not demote shared high-signal item out of top-N', async () => {
  setup();
  const memory = createMemory();
  memory._keywordSearch = async () => [
    { content: 'shared', metadata: { id: 'shared-id' }, similarity: null },
    { content: 'kw-2', metadata: { id: 'kw-2' }, similarity: null },
    { content: 'kw-3', metadata: { id: 'kw-3' }, similarity: null },
  ];
  memory._getVectorStore = async () => ({
    search: async () => [
      { content: 'shared', metadata: { id: 'shared-id' }, similarity: 0.99 },
      { content: 'vec-2', metadata: { id: 'vec-2' }, similarity: 0.88 },
    ],
  });

  const fused = await memory.hybridMemoryQuery('query', { limit: 2, threshold: 0.1 });
  assert.ok(fused.some(r => r.content === 'shared'));
});

test('contract: malformed branch items are normalized to result-shape', async () => {
  setup();
  const memory = createMemory();
  memory._keywordSearch = async () => [{ metadata: null }];
  memory._getVectorStore = async () => ({
    search: async () => [{ content: 123, similarity: 0.9 }],
  });

  const fused = await memory.hybridMemoryQuery('query', { limit: 3, threshold: 0.1 });
  assert.ok(fused.length >= 1);
  fused.forEach(assertMemorySearchResultShape);
});

test('P0: legacy default keeps vector branch limit equal to options.limit', async () => {
  setup();
  const memory = createMemory();
  let vectorLimit = null;

  memory._keywordSearch = async () => [{ content: 'k', metadata: { id: 'k1' }, similarity: null }];
  memory._getVectorStore = async () => ({
    search: async (_query, opts) => {
      vectorLimit = opts?.limit;
      return [{ content: 'v', metadata: { id: 'v1' }, similarity: 0.92 }];
    },
  });

  const results = await memory.hybridMemoryQuery('query', { limit: 5, threshold: 0.1 });
  assert.ok(results.length >= 1);
  assert.equal(vectorLimit, 5);
});

test('P1: expanded mode sets vector branch limit to branchLimit', async () => {
  setup();
  const memory = createMemory();
  let vectorLimit = null;

  memory._keywordSearch = async () => [{ content: 'k', metadata: { id: 'k1' }, similarity: null }];
  memory._getVectorStore = async () => ({
    search: async (_query, opts) => {
      vectorLimit = opts?.limit;
      return [{ content: 'v', metadata: { id: 'v1' }, similarity: 0.92 }];
    },
  });

  await withEnv({ MEMORY_HYBRID_VECTOR_BRANCH_LIMIT_MODE: 'expanded' }, async () => {
    const results = await memory.hybridMemoryQuery('query', { limit: 5, threshold: 0.1 });
    assert.ok(results.length >= 1);
  });

  assert.equal(vectorLimit, 10);
});

test('P2: expanded mode still returns at most options.limit items', async () => {
  setup();
  const memory = createMemory();

  memory._keywordSearch = async () =>
    Array.from({ length: 12 }, (_, i) => ({
      content: `keyword-${i}`,
      metadata: { id: `k${i}` },
      similarity: null,
    }));
  memory._getVectorStore = async () => ({
    search: async () =>
      Array.from({ length: 12 }, (_, i) => ({
        content: `vector-${i}`,
        metadata: { id: `v${i}` },
        similarity: 0.9 - i * 0.01,
      })),
  });

  await withEnv({ MEMORY_HYBRID_VECTOR_BRANCH_LIMIT_MODE: 'expanded' }, async () => {
    const results = await memory.hybridMemoryQuery('query', { limit: 3, threshold: 0.1 });
    assert.ok(results.length <= 3);
  });
});

test('P3: env restore keeps default behavior between tests (effective legacy default)', async () => {
  setup();
  const memory = createMemory();
  let vectorLimit = null;

  assert.equal(process.env.MEMORY_HYBRID_VECTOR_BRANCH_LIMIT_MODE, undefined);

  memory._keywordSearch = async () => [{ content: 'k', metadata: { id: 'k1' }, similarity: null }];
  memory._getVectorStore = async () => ({
    search: async (_query, opts) => {
      vectorLimit = opts?.limit;
      return [{ content: 'v', metadata: { id: 'v1' }, similarity: 0.8 }];
    },
  });

  await memory.hybridMemoryQuery('query', { limit: 4, threshold: 0.1 });
  assert.equal(vectorLimit, 4);
});
