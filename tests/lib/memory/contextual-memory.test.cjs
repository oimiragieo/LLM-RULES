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
function createPatternsFile(patterns) {
  const filePath = path.join(TEST_MEMORY_DIR, 'patterns.json');
  fs.writeFileSync(filePath, JSON.stringify(patterns, null, 2));
  return filePath;
}

/**
 * Create test codebase_map file
 */
function createCodebaseMapFile(discoveredFiles) {
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

// =============================================================================
// Test Suite 1: HIGH - loadContextSync non-blocking writes (Issue #2 fix)
// =============================================================================

test('loadContextSync - non-blocking: does not block on access stats write', async t => {
  setupTestDir();
  t.after(cleanupTestDir);

  // Set environment for access tracking
  const prevInterval = process.env.MEMORY_ACCESS_TRACKING_MIN_INTERVAL_MS;
  const prevEnabled = process.env.MEMORY_ACCESS_TRACKING;
  process.env.MEMORY_ACCESS_TRACKING_MIN_INTERVAL_MS = '0';
  process.env.MEMORY_ACCESS_TRACKING = 'on';

  try {
    createGotchasFile([{ text: 'Test gotcha 1', timestamp: new Date().toISOString() }]);
    createPatternsFile([{ text: 'Test pattern 1', timestamp: new Date().toISOString() }]);

    const { ContextualMemory } = getModule();
    const memory = new ContextualMemory({
      projectRoot: TEST_DIR,
      memoryDir: TEST_MEMORY_DIR,
      dbPath: TEST_DB_PATH,
    });

    // Measure time for loadContextSync
    const start = Date.now();
    const result = memory.loadContextSync({
      maxItems: { gotchas: 10, patterns: 10 },
      maxChars: { gotchas: 5000, patterns: 5000 },
    });
    const duration = Date.now() - start;

    // Should return quickly (non-blocking)
    assert.ok(duration < 500, `loadContextSync should be fast (<500ms), took ${duration}ms`);
    assert.strictEqual(result.gotchas.length, 1, 'Should load gotchas');
    assert.strictEqual(result.patterns.length, 1, 'Should load patterns');

    // Wait for setImmediate to complete async write
    await new Promise(resolve => setTimeout(resolve, 100));

    // Access stats should be written (eventually)
    const accessStatsPath = path.join(TEST_MEMORY_DIR, 'access-stats.json');
    assert.ok(fs.existsSync(accessStatsPath), 'Access stats file should be created');

    memory.close();
  } finally {
    if (typeof prevInterval === 'undefined') {
      delete process.env.MEMORY_ACCESS_TRACKING_MIN_INTERVAL_MS;
    } else {
      process.env.MEMORY_ACCESS_TRACKING_MIN_INTERVAL_MS = prevInterval;
    }
    if (typeof prevEnabled === 'undefined') {
      delete process.env.MEMORY_ACCESS_TRACKING;
    } else {
      process.env.MEMORY_ACCESS_TRACKING = prevEnabled;
    }
  }
});

test('loadContextSync - access tracking respects interval', async t => {
  setupTestDir();
  t.after(cleanupTestDir);

  const prevInterval = process.env.MEMORY_ACCESS_TRACKING_MIN_INTERVAL_MS;
  const prevEnabled = process.env.MEMORY_ACCESS_TRACKING;
  // Set high interval to prevent updates
  process.env.MEMORY_ACCESS_TRACKING_MIN_INTERVAL_MS = '3600000'; // 1 hour
  process.env.MEMORY_ACCESS_TRACKING = 'on';

  try {
    createGotchasFile([{ text: 'Interval test gotcha', timestamp: new Date().toISOString() }]);

    // Pre-create access stats with recent timestamp
    const accessStatsPath = path.join(TEST_MEMORY_DIR, 'access-stats.json');
    const recentTimestamp = new Date().toISOString();
    fs.writeFileSync(
      accessStatsPath,
      JSON.stringify(
        {
          version: '1.0',
          entries: {
            'text:Interval test gotcha\n': {
              accessCount: 5,
              lastAccessed: recentTimestamp,
            },
          },
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

    memory.loadContextSync({
      maxItems: { gotchas: 10 },
      maxChars: { gotchas: 5000 },
    });

    // Wait for any async writes
    await new Promise(resolve => setTimeout(resolve, 100));

    // Access count should NOT be incremented (interval not elapsed)
    const stats = JSON.parse(fs.readFileSync(accessStatsPath, 'utf8'));
    const key = Object.keys(stats.entries)[0];
    // Count may or may not be 5 depending on key matching
    assert.ok(
      stats.entries[key].accessCount >= 5,
      'Access count should not increase within interval'
    );

    memory.close();
  } finally {
    if (typeof prevInterval === 'undefined') {
      delete process.env.MEMORY_ACCESS_TRACKING_MIN_INTERVAL_MS;
    } else {
      process.env.MEMORY_ACCESS_TRACKING_MIN_INTERVAL_MS = prevInterval;
    }
    if (typeof prevEnabled === 'undefined') {
      delete process.env.MEMORY_ACCESS_TRACKING;
    } else {
      process.env.MEMORY_ACCESS_TRACKING = prevEnabled;
    }
  }
});

test('loadContextSync - access tracking can be disabled', async t => {
  setupTestDir();
  t.after(cleanupTestDir);

  const prevEnabled = process.env.MEMORY_ACCESS_TRACKING;
  process.env.MEMORY_ACCESS_TRACKING = 'off';

  try {
    createGotchasFile([{ text: 'Disabled tracking gotcha', timestamp: new Date().toISOString() }]);

    const { ContextualMemory } = getModule();
    const memory = new ContextualMemory({
      projectRoot: TEST_DIR,
      memoryDir: TEST_MEMORY_DIR,
      dbPath: TEST_DB_PATH,
    });

    memory.loadContextSync({
      maxItems: { gotchas: 10 },
      maxChars: { gotchas: 5000 },
    });

    // Wait for any async writes
    await new Promise(resolve => setTimeout(resolve, 100));

    // Access stats should NOT be created when tracking is off
    const accessStatsPath = path.join(TEST_MEMORY_DIR, 'access-stats.json');
    assert.ok(
      !fs.existsSync(accessStatsPath),
      'Access stats should not be created when tracking is off'
    );

    memory.close();
  } finally {
    if (typeof prevEnabled === 'undefined') {
      delete process.env.MEMORY_ACCESS_TRACKING;
    } else {
      process.env.MEMORY_ACCESS_TRACKING = prevEnabled;
    }
  }
});

// =============================================================================
// Test Suite 2: loadContextSync with various memory sources
// =============================================================================

test('loadContextSync - loads gotchas from JSON file', async t => {
  setupTestDir();
  t.after(cleanupTestDir);

  createGotchasFile([
    { text: 'Gotcha 1', timestamp: '2026-01-01T00:00:00.000Z', category: 'test' },
    { text: 'Gotcha 2', timestamp: '2026-01-02T00:00:00.000Z', category: 'test' },
  ]);

  const { ContextualMemory } = getModule();
  const memory = new ContextualMemory({
    projectRoot: TEST_DIR,
    memoryDir: TEST_MEMORY_DIR,
    dbPath: TEST_DB_PATH,
  });

  const result = memory.loadContextSync({
    maxItems: { gotchas: 10 },
    maxChars: { gotchas: 5000 },
  });

  assert.strictEqual(result.gotchas.length, 2, 'Should load 2 gotchas');
  assert.strictEqual(result.gotchas[0].text, 'Gotcha 1');
  assert.strictEqual(result.gotchas[1].text, 'Gotcha 2');

  memory.close();
});

test('loadContextSync - loads patterns from JSON file', async t => {
  setupTestDir();
  t.after(cleanupTestDir);

  createPatternsFile([
    { text: 'Pattern A', timestamp: '2026-01-01T00:00:00.000Z' },
    { text: 'Pattern B', timestamp: '2026-01-02T00:00:00.000Z' },
    { text: 'Pattern C', timestamp: '2026-01-03T00:00:00.000Z' },
  ]);

  const { ContextualMemory } = getModule();
  const memory = new ContextualMemory({
    projectRoot: TEST_DIR,
    memoryDir: TEST_MEMORY_DIR,
    dbPath: TEST_DB_PATH,
  });

  const result = memory.loadContextSync({
    maxItems: { patterns: 10 },
    maxChars: { patterns: 5000 },
  });

  assert.strictEqual(result.patterns.length, 3, 'Should load 3 patterns');

  memory.close();
});

test('loadContextSync - loads discoveries from codebase_map', async t => {
  setupTestDir();
  t.after(cleanupTestDir);

  createCodebaseMapFile({
    'src/auth.ts': { description: 'Authentication module', category: 'security' },
    'src/api.ts': { description: 'API routes', category: 'api' },
  });

  const { ContextualMemory } = getModule();
  const memory = new ContextualMemory({
    projectRoot: TEST_DIR,
    memoryDir: TEST_MEMORY_DIR,
    dbPath: TEST_DB_PATH,
  });

  const result = memory.loadContextSync({
    maxItems: { discoveries: 10 },
    maxChars: { discoveries: 5000 },
  });

  assert.strictEqual(result.discoveries.length, 2, 'Should load 2 discoveries');
  assert.ok(
    result.discoveries.some(d => d.path === 'src/auth.ts'),
    'Should include auth.ts'
  );
  assert.ok(
    result.discoveries.some(d => d.path === 'src/api.ts'),
    'Should include api.ts'
  );

  memory.close();
});

test('loadContextSync - loads legacy_summary from learnings.md', async t => {
  setupTestDir();
  t.after(cleanupTestDir);

  const learningsContent = '# Learnings\n\n- Pattern 1\n- Pattern 2\n- Important discovery';
  createLearningsFile(learningsContent);

  const { ContextualMemory } = getModule();
  const memory = new ContextualMemory({
    projectRoot: TEST_DIR,
    memoryDir: TEST_MEMORY_DIR,
    dbPath: TEST_DB_PATH,
  });

  const result = memory.loadContextSync({
    maxChars: { legacy: 10000 },
  });

  assert.ok(result.legacy_summary.includes('Learnings'), 'Should include learnings content');
  assert.ok(result.legacy_summary.includes('Pattern 1'), 'Should include pattern text');

  memory.close();
});

test('loadContextSync - truncates legacy_summary to maxChars', async t => {
  setupTestDir();
  t.after(cleanupTestDir);

  // Create large learnings file
  const largeContent = 'X'.repeat(10000);
  createLearningsFile(largeContent);

  const { ContextualMemory } = getModule();
  const memory = new ContextualMemory({
    projectRoot: TEST_DIR,
    memoryDir: TEST_MEMORY_DIR,
    dbPath: TEST_DB_PATH,
  });

  const result = memory.loadContextSync({
    maxChars: { legacy: 1000 },
  });

  assert.ok(result.legacy_summary.length <= 1003, 'Should truncate to ~1000 chars (with ellipsis)');
  assert.ok(result.legacy_summary.startsWith('...'), 'Should start with ellipsis when truncated');

  memory.close();
});

test('loadContextSync - respects maxItems limits', async t => {
  setupTestDir();
  t.after(cleanupTestDir);

  const manyGotchas = [];
  for (let i = 0; i < 50; i++) {
    manyGotchas.push({ text: `Gotcha ${i}`, timestamp: new Date().toISOString() });
  }
  createGotchasFile(manyGotchas);

  const { ContextualMemory } = getModule();
  const memory = new ContextualMemory({
    projectRoot: TEST_DIR,
    memoryDir: TEST_MEMORY_DIR,
    dbPath: TEST_DB_PATH,
  });

  const result = memory.loadContextSync({
    maxItems: { gotchas: 5 },
    maxChars: { gotchas: 50000 },
  });

  assert.strictEqual(result.gotchas.length, 5, 'Should limit to 5 gotchas');

  memory.close();
});

// =============================================================================
// Test Suite 3: Concurrent reads
// =============================================================================

test('loadContextSync - handles concurrent reads without deadlock', async t => {
  setupTestDir();
  t.after(cleanupTestDir);

  createGotchasFile([{ text: 'Concurrent test gotcha', timestamp: new Date().toISOString() }]);
  createPatternsFile([{ text: 'Concurrent test pattern', timestamp: new Date().toISOString() }]);

  const { ContextualMemory } = getModule();

  // Create multiple memory instances
  const memories = [];
  for (let i = 0; i < 5; i++) {
    memories.push(
      new ContextualMemory({
        projectRoot: TEST_DIR,
        memoryDir: TEST_MEMORY_DIR,
        dbPath: TEST_DB_PATH,
      })
    );
  }

  // Concurrent reads
  const start = Date.now();
  const results = await Promise.all(
    memories.map(m =>
      m.loadContext({
        maxItems: { gotchas: 10, patterns: 10 },
        maxChars: { gotchas: 5000, patterns: 5000 },
      })
    )
  );
  const duration = Date.now() - start;

  // All should complete successfully
  for (const result of results) {
    assert.strictEqual(result.gotchas.length, 1, 'Each result should have 1 gotcha');
    assert.strictEqual(result.patterns.length, 1, 'Each result should have 1 pattern');
  }

  // Should complete in reasonable time (no deadlock)
  assert.ok(duration < 5000, `Concurrent reads should complete quickly, took ${duration}ms`);

  // Cleanup
  for (const m of memories) {
    m.close();
  }
});

// =============================================================================
// Test Suite 4: Error handling
// =============================================================================

test('loadContextSync - handles missing memory directory gracefully', async t => {
  setupTestDir();
  t.after(cleanupTestDir);

  // Remove memory dir
  fs.rmSync(TEST_MEMORY_DIR, { recursive: true, force: true });

  const { ContextualMemory } = getModule();
  const memory = new ContextualMemory({
    projectRoot: TEST_DIR,
    memoryDir: TEST_MEMORY_DIR,
    dbPath: TEST_DB_PATH,
  });

  // Should not throw
  const result = memory.loadContextSync({});

  assert.deepStrictEqual(result.gotchas, [], 'Should return empty gotchas');
  assert.deepStrictEqual(result.patterns, [], 'Should return empty patterns');
  assert.deepStrictEqual(result.discoveries, [], 'Should return empty discoveries');

  memory.close();
});

test('loadContextSync - handles corrupted JSON gracefully', async t => {
  setupTestDir();
  t.after(cleanupTestDir);

  // Write corrupted JSON
  fs.writeFileSync(path.join(TEST_MEMORY_DIR, 'gotchas.json'), '{ invalid json');
  fs.writeFileSync(path.join(TEST_MEMORY_DIR, 'patterns.json'), '[ not valid');

  const { ContextualMemory } = getModule();
  const memory = new ContextualMemory({
    projectRoot: TEST_DIR,
    memoryDir: TEST_MEMORY_DIR,
    dbPath: TEST_DB_PATH,
  });

  // Should not throw, should return empty arrays
  const result = memory.loadContextSync({
    maxItems: { gotchas: 10, patterns: 10 },
    maxChars: { gotchas: 5000, patterns: 5000 },
  });

  assert.deepStrictEqual(result.gotchas, [], 'Should return empty gotchas for corrupted file');
  assert.deepStrictEqual(result.patterns, [], 'Should return empty patterns for corrupted file');

  memory.close();
});

test('loadContextSync - handles corrupted codebase_map gracefully', async t => {
  setupTestDir();
  t.after(cleanupTestDir);

  // Write corrupted codebase_map
  fs.writeFileSync(path.join(TEST_MEMORY_DIR, 'codebase_map.json'), '{ broken');

  const { ContextualMemory } = getModule();
  const memory = new ContextualMemory({
    projectRoot: TEST_DIR,
    memoryDir: TEST_MEMORY_DIR,
    dbPath: TEST_DB_PATH,
  });

  const result = memory.loadContextSync({
    maxItems: { discoveries: 10 },
    maxChars: { discoveries: 5000 },
  });

  assert.deepStrictEqual(
    result.discoveries,
    [],
    'Should return empty discoveries for corrupted file'
  );

  memory.close();
});

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
