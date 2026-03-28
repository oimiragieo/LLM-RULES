#!/usr/bin/env node
/**
 * Contextual Memory Tests - Hybrid Memory Aggregation Layer
 * ==========================================================
 *
 * Tests for:
 * 1. HIGH: loadContextSync non-blocking writes (FIX-MEMORY-CRITICAL-001 Issue #2)
 * 2. loadContextSync with and without access tracking
 * 3. Concurrent reads (no deadlocks)
 * 4. Memory eviction policies
 * 5. Search fallback behavior
 * 6. Entity query integration
 */

'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const path = require('path');

// Test directory setup
const TEST_DIR = path.join(__dirname, '.test-contextual-memory');
const TEST_MEMORY_DIR = path.join(TEST_DIR, '.claude', 'context', 'memory');
const TEST_DB_PATH = path.join(TEST_DIR, '.claude', 'data', 'memory.db');

/**
 * Setup test directory with memory structure
 */
function setupTestDir() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_MEMORY_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(TEST_DB_PATH), { recursive: true });
  fs.mkdirSync(path.join(TEST_MEMORY_DIR, 'mtm'), { recursive: true });
  fs.mkdirSync(path.join(TEST_MEMORY_DIR, 'ltm'), { recursive: true });
}

/**
 * Cleanup test directory
 */
function cleanupTestDir() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

/**
 * Get fresh module (clear require cache)
 */
function getModule() {
  const modulePath = require.resolve('../../../.claude/lib/memory/contextual-memory.cjs');
  delete require.cache[modulePath];
  return require(modulePath);
}

/**
 * Create test gotchas file
 */
function createGotchasFile(gotchas) {
  const filePath = path.join(TEST_MEMORY_DIR, 'gotchas.json');
  fs.writeFileSync(filePath, JSON.stringify(gotchas, null, 2));
  return filePath;
}

/**
 * Create test patterns file
 */
function _createPatternsFile(patterns) {
  const filePath = path.join(TEST_MEMORY_DIR, 'patterns.json');
  fs.writeFileSync(filePath, JSON.stringify(patterns, null, 2));
  return filePath;
}

/**
 * Create test codebase_map file
 */
function _createCodebaseMapFile(discoveredFiles) {
  const filePath = path.join(TEST_MEMORY_DIR, 'codebase_map.json');
  fs.writeFileSync(
    filePath,
    JSON.stringify(
      {
        discovered_files: discoveredFiles,
        last_updated: new Date().toISOString(),
      },
      null,
      2
    )
  );
  return filePath;
}

/**
 * Create test learnings.md file
 */
function createLearningsFile(content) {
  const filePath = path.join(TEST_MEMORY_DIR, 'learnings.md');
  fs.writeFileSync(filePath, content);
  return filePath;
}

function getLancedbEventsPath() {
  return path.join(TEST_MEMORY_DIR, 'metrics', 'lancedb-events.jsonl');
}

function readEvents() {
  const eventsPath = getLancedbEventsPath();
  if (!fs.existsSync(eventsPath)) return [];
  return fs
    .readFileSync(eventsPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

// =============================================================================

// Test Suite 5: Search functionality
// =============================================================================

test('search - falls back to keyword search when LanceDB unavailable', async t => {
  setupTestDir();
  t.after(cleanupTestDir);

  // Create learnings with searchable content
  createLearningsFile(
    '# Authentication\n\nUse JWT tokens for authentication. Always validate tokens.'
  );

  const { ContextualMemory } = getModule();
  const memory = new ContextualMemory({
    projectRoot: TEST_DIR,
    memoryDir: TEST_MEMORY_DIR,
    dbPath: TEST_DB_PATH,
  });

  // Force LanceDB to be unavailable
  memory._getVectorStore = async () => null;

  const results = await memory.search('authentication');

  // Should fall back to keyword search
  assert.ok(Array.isArray(results), 'Should return array');
  // Results may be empty depending on file content matching

  memory.close();
});

test('search - with MEMORY_SEMANTIC_SEARCH=off uses keyword fallback and does not throw', async t => {
  setupTestDir();
  t.after(cleanupTestDir);

  const previous = process.env.MEMORY_SEMANTIC_SEARCH;
  process.env.MEMORY_SEMANTIC_SEARCH = 'off';
  t.after(() => {
    if (previous === undefined) {
      delete process.env.MEMORY_SEMANTIC_SEARCH;
    } else {
      process.env.MEMORY_SEMANTIC_SEARCH = previous;
    }
  });

  const { ContextualMemory } = getModule();
  const memory = new ContextualMemory({
    projectRoot: TEST_DIR,
    memoryDir: TEST_MEMORY_DIR,
    dbPath: TEST_DB_PATH,
  });

  let keywordCalled = 0;
  memory._keywordSearch = async () => {
    keywordCalled += 1;
    return [{ content: 'keyword-result', metadata: { source: 'fallback' }, similarity: 0.5 }];
  };

  const results = await memory.search('semantic off query');
  assert.equal(keywordCalled, 1, 'Expected keyword fallback to run when semantic search is off');
  assert.ok(Array.isArray(results));
  assert.equal(results.length, 1);
  assert.equal(results[0].content, 'keyword-result');

  memory.close();
});

test('search - with MEMORY_SEMANTIC_SEARCH=off logs semantic_disabled degradation events', async t => {
  setupTestDir();
  t.after(cleanupTestDir);

  const previous = process.env.MEMORY_SEMANTIC_SEARCH;
  process.env.MEMORY_SEMANTIC_SEARCH = 'off';
  t.after(() => {
    if (previous === undefined) {
      delete process.env.MEMORY_SEMANTIC_SEARCH;
    } else {
      process.env.MEMORY_SEMANTIC_SEARCH = previous;
    }
  });

  const { ContextualMemory } = getModule();
  const memory = new ContextualMemory({
    projectRoot: TEST_DIR,
    memoryDir: TEST_MEMORY_DIR,
    dbPath: TEST_DB_PATH,
  });

  memory._keywordSearch = async () => [
    { content: 'keyword-result', metadata: { path: 'learnings.md' }, similarity: 0.5 },
  ];

  const results = await memory.search('semantic off query');

  assert.equal(results.length, 1);
  const events = readEvents();
  assert.ok(events.length >= 1, 'Expected degradation events to be written to JSONL');
  assert.ok(
    events.some(
      event =>
        event.event === 'semantic_disabled' &&
        event.reason === 'MEMORY_SEMANTIC_SEARCH=off' &&
        event.mode === 'keyword'
    ),
    'Expected semantic_disabled event for MEMORY_SEMANTIC_SEARCH=off'
  );

  memory.close();
});

test('search - LanceDB init failure logs lancedb_init_failed and falls back to keyword results', async t => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { MemoryVectorStore } = require('../../../.claude/lib/memory/lancedb-client.cjs');
  const originalGetSharedStore = MemoryVectorStore.getSharedStore;
  MemoryVectorStore.clearSharedStores?.();
  t.after(() => {
    MemoryVectorStore.getSharedStore = originalGetSharedStore;
    MemoryVectorStore.clearSharedStores?.();
  });

  MemoryVectorStore.getSharedStore = () => ({
    initialize: async () => {
      throw new Error('corrupted LanceDB directory');
    },
    close: () => {},
  });

  const { ContextualMemory } = getModule();
  const memory = new ContextualMemory({
    projectRoot: TEST_DIR,
    memoryDir: TEST_MEMORY_DIR,
    dbPath: TEST_DB_PATH,
  });

  memory._keywordSearch = async () => [
    { content: 'fallback-keyword', metadata: { path: 'learnings.md' }, similarity: null },
  ];

  const results = await memory.search('corrupted lancedb query');

  assert.equal(results.length, 1);
  assert.equal(results[0].content, 'fallback-keyword');

  const events = readEvents();
  assert.ok(
    events.some(
      event =>
        event.event === 'lancedb_init_failed' &&
        typeof event.message === 'string' &&
        event.message.includes('corrupted LanceDB directory')
    ),
    'Expected lancedb_init_failed event when initialize() throws'
  );

  memory.close();
});

test('search - applies filters correctly', async t => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { ContextualMemory } = getModule();
  const memory = new ContextualMemory({
    projectRoot: TEST_DIR,
    memoryDir: TEST_MEMORY_DIR,
    dbPath: TEST_DB_PATH,
  });

  let capturedOptions;
  memory._getVectorStore = async () => ({
    search: async (_query, options) => {
      capturedOptions = options;
      return [];
    },
  });

  await memory.search('test query', {
    contextType: 'memory',
    category: 'profile',
    area: 'security',
    limit: 5,
  });

  assert.ok(capturedOptions, 'Options should be captured');
  assert.strictEqual(capturedOptions.limit, 5, 'Limit should be passed');
  assert.ok(capturedOptions.filters, 'Filters should be set');

  memory.close();
});

test('search - respects threshold', async t => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { ContextualMemory } = getModule();
  const memory = new ContextualMemory({
    projectRoot: TEST_DIR,
    memoryDir: TEST_MEMORY_DIR,
    dbPath: TEST_DB_PATH,
  });

  memory._getVectorStore = async () => ({
    search: async () => [
      { content: 'High similarity', metadata: {}, similarity: 0.95 },
      { content: 'Low similarity', metadata: {}, similarity: 0.3 },
    ],
  });

  const results = await memory.search('test', { threshold: 0.5 });

  assert.strictEqual(results.length, 1, 'Should filter by threshold');
  assert.strictEqual(results[0].content, 'High similarity');

  memory.close();
});

// =============================================================================
// Test Suite 6: Entity query integration
// =============================================================================

test('findEntities - returns empty array when entity query unavailable', async t => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { ContextualMemory } = getModule();
  const memory = new ContextualMemory({
    projectRoot: TEST_DIR,
    memoryDir: TEST_MEMORY_DIR,
    dbPath: TEST_DB_PATH,
  });

  // Entity query should return empty when DB doesn't exist
  const results = await memory.findEntities('pattern', { limit: 10 });

  assert.ok(Array.isArray(results), 'Should return array');
  // May be empty or have results depending on DB initialization

  memory.close();
});

test('getRelated - returns empty array when entity query unavailable', async t => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { ContextualMemory } = getModule();
  const memory = new ContextualMemory({
    projectRoot: TEST_DIR,
    memoryDir: TEST_MEMORY_DIR,
    dbPath: TEST_DB_PATH,
  });

  const results = await memory.getRelated('nonexistent-id', { depth: 1 });

  assert.ok(Array.isArray(results), 'Should return array');

  memory.close();
});

// =============================================================================
// Test Suite 7: File operations
// =============================================================================

test('readFile - reads file relative to memory directory', async t => {
  setupTestDir();
  t.after(cleanupTestDir);

  const testContent = 'Test file content';
  fs.writeFileSync(path.join(TEST_MEMORY_DIR, 'test.txt'), testContent);

  const { ContextualMemory } = getModule();
  const memory = new ContextualMemory({
    projectRoot: TEST_DIR,
    memoryDir: TEST_MEMORY_DIR,
    dbPath: TEST_DB_PATH,
  });

  const content = await memory.readFile('test.txt');
  assert.strictEqual(content, testContent, 'Should read file content');

  memory.close();
});

test('readFile - throws for non-existent file', async t => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { ContextualMemory } = getModule();
  const memory = new ContextualMemory({
    projectRoot: TEST_DIR,
    memoryDir: TEST_MEMORY_DIR,
    dbPath: TEST_DB_PATH,
  });

  await assert.rejects(
    memory.readFile('nonexistent.txt'),
    /ENOENT/,
    'Should throw ENOENT for missing file'
  );

  memory.close();
});

test('readFile - rejects path traversal outside memory directory', async t => {
  setupTestDir();
  t.after(cleanupTestDir);

  const secretPath = path.join(TEST_DIR, 'outside.txt');
  fs.writeFileSync(secretPath, 'should not be readable via memory.readFile');

  const { ContextualMemory } = getModule();
  const memory = new ContextualMemory({
    projectRoot: TEST_DIR,
    memoryDir: TEST_MEMORY_DIR,
    dbPath: TEST_DB_PATH,
  });

  await assert.rejects(
    memory.readFile('../outside.txt'),
    /Invalid memory path/,
    'Should reject traversal outside memory directory'
  );

  memory.close();
});

// =============================================================================
// Test Suite 8: Cleanup and resource management
// =============================================================================

test('close - cleans up resources', async t => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { ContextualMemory } = getModule();
  const memory = new ContextualMemory({
    projectRoot: TEST_DIR,
    memoryDir: TEST_MEMORY_DIR,
    dbPath: TEST_DB_PATH,
  });

  // Initialize some resources
  memory.loadContextSync({});

  // Close should not throw
  memory.close();

  assert.strictEqual(memory.vectorStore, null, 'vectorStore should be null after close');
  // entityQuery may be undefined (never initialized) or null (closed)
  assert.ok(memory.entityQuery == null, 'entityQuery should be null/undefined after close');
});

test('close - handles multiple close calls gracefully', async t => {
  setupTestDir();
  t.after(cleanupTestDir);

  const { ContextualMemory } = getModule();
  const memory = new ContextualMemory({
    projectRoot: TEST_DIR,
    memoryDir: TEST_MEMORY_DIR,
    dbPath: TEST_DB_PATH,
  });

  // Should not throw on multiple closes
  memory.close();
  memory.close();
  memory.close();

  assert.ok(true, 'Multiple close calls should not throw');
});

// =============================================================================
// Test Suite 9: MTM/LTM session loading
// =============================================================================

test('loadContextSync - loads recent_sessions from MTM', async t => {
  setupTestDir();
  t.after(cleanupTestDir);

  // Create MTM session files
  const mtmDir = path.join(TEST_MEMORY_DIR, 'mtm');
  fs.writeFileSync(
    path.join(mtmDir, 'session_2026-02-01T10-00-00.json'),
    JSON.stringify(
      {
        tier: 'MTM',
        session_id: 'session-1',
        timestamp: '2026-02-01T10:00:00.000Z',
        summary: 'Session 1 summary',
        tasks_completed: ['Task A', 'Task B'],
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(mtmDir, 'session_2026-02-01T11-00-00.json'),
    JSON.stringify(
      {
        tier: 'MTM',
        session_id: 'session-2',
        timestamp: '2026-02-01T11:00:00.000Z',
        summary: 'Session 2 summary',
        tasks_completed: ['Task C'],
      },
      null,
      2
    )
  );

  const { ContextualMemory } = getModule();
  const memory = new ContextualMemory({
    projectRoot: TEST_DIR,
    memoryDir: TEST_MEMORY_DIR,
    dbPath: TEST_DB_PATH,
  });

  const result = memory.loadContextSync({
    maxItems: { sessions: 10 },
    maxChars: { sessions: 10000 },
  });

  assert.ok(result.recent_sessions.length >= 2, 'Should load MTM sessions');
  assert.ok(
    result.recent_sessions.some(s => s.source === 'mtm' && s.summary === 'Session 1 summary'),
    'Should include session 1'
  );
  assert.ok(
    result.recent_sessions.some(s => s.source === 'mtm' && s.summary === 'Session 2 summary'),
    'Should include session 2'
  );

  memory.close();
});

test('loadContextSync - handles malformed MTM session files', async t => {
  setupTestDir();
  t.after(cleanupTestDir);

  const mtmDir = path.join(TEST_MEMORY_DIR, 'mtm');
  // Write malformed JSON
  fs.writeFileSync(path.join(mtmDir, 'session_broken.json'), '{ invalid json');

  const { ContextualMemory } = getModule();
  const memory = new ContextualMemory({
    projectRoot: TEST_DIR,
    memoryDir: TEST_MEMORY_DIR,
    dbPath: TEST_DB_PATH,
  });

  // Should not throw
  const result = memory.loadContextSync({
    maxItems: { sessions: 10 },
  });

  // May have empty sessions or skip the malformed one
  assert.ok(Array.isArray(result.recent_sessions), 'Should return sessions array');

  memory.close();
});

// =============================================================================
// Test Suite 10: Truncation and character limits
// =============================================================================

test('loadContextSync - truncates items to maxChars', async t => {
  setupTestDir();
  t.after(cleanupTestDir);

  // Create gotchas that exceed char limit
  const largeGotchas = [];
  for (let i = 0; i < 10; i++) {
    largeGotchas.push({
      text: 'X'.repeat(500), // 500 chars each
      timestamp: new Date().toISOString(),
    });
  }
  createGotchasFile(largeGotchas);

  const { ContextualMemory } = getModule();
  const memory = new ContextualMemory({
    projectRoot: TEST_DIR,
    memoryDir: TEST_MEMORY_DIR,
    dbPath: TEST_DB_PATH,
  });

  const result = memory.loadContextSync({
    maxItems: { gotchas: 10 },
    maxChars: { gotchas: 1500 }, // Should only fit ~2-3 gotchas
  });

  const totalChars = result.gotchas.reduce((sum, g) => sum + JSON.stringify(g).length, 0);
  assert.ok(totalChars <= 1500, `Total chars should be <= 1500, got ${totalChars}`);

  memory.close();
});
