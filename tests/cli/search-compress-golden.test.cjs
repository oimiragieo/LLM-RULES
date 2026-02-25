#!/usr/bin/env node
'use strict';

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// ---------------------------------------------------------------------------
// Resolve project root the same way the module under test does, so the
// require() for main.cjs can resolve its own relative dependency on
// project-root.cjs without hitting a missing-module error.
// ---------------------------------------------------------------------------
const PROJECT_ROOT = path.resolve(__dirname, '../..');

const { main, computeAdaptiveRatio, deduplicateAgainstMemory, classifyMemoryTarget } = require(
  path.join(PROJECT_ROOT, '.claude/skills/token-saver-context-compression/scripts/main.cjs')
);

// ---------------------------------------------------------------------------
// Helpers — temp directory management
// ---------------------------------------------------------------------------
let tmpDir;

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'search-compress-golden-'));
}

function writeJson(dir, filename, data) {
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(data, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// 1. Schema validation — output shape of main()
// ---------------------------------------------------------------------------
describe('search:compress golden — schema validation', () => {
  let memDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    memDir = path.join(tmpDir, 'memory');
    fs.mkdirSync(memDir, { recursive: true });
    writeJson(memDir, 'patterns.json', []);
    writeJson(memDir, 'gotchas.json', []);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('main() output has exactly the expected top-level keys', () => {
    // Build a minimal corpus file for the workflow to consume
    const corpusFile = path.join(tmpDir, 'corpus.txt');
    fs.writeFileSync(corpusFile, 'This is sample corpus content about authentication.\n', 'utf8');

    // Mock runCommand to return canned search output
    const mockRunCommand = (_cmd, _args) => ({
      status: 0,
      stdout: [
        '1. src/auth/login.ts (95%)',
        '  - Handles user login with JWT tokens',
        '2. src/auth/middleware.ts (88%)',
        '  - Express middleware for auth validation',
      ].join('\n'),
      stderr: '',
    });

    // Mock runTokenSaverWorkflow to return canned compression
    const mockRunWorkflow = _opts => ({
      ok: true,
      data: {
        evidence_sufficient: true,
        compressed: {
          compressed_text: 'Auth uses JWT tokens with refresh capabilities',
          segments: [
            { text: 'Auth login handles JWT token generation', selected: true },
            { text: 'Middleware validates auth headers on every request', selected: true },
          ],
        },
      },
    });

    const result = main(
      { query: 'authentication', persistFiles: false },
      { runCommand: mockRunCommand, runTokenSaverWorkflow: mockRunWorkflow }
    );

    assert.equal(result.ok, true, 'Expected ok to be true');

    const expectedKeys = [
      'ok',
      'search',
      'evidence',
      'compression',
      'memoryRecords',
      'dedupStats',
      'persistMode',
      'memoryRecordHint',
      'telemetry',
    ];

    const actualKeys = Object.keys(result).sort();
    assert.deepStrictEqual(
      actualKeys,
      [...expectedKeys].sort(),
      `Expected keys ${expectedKeys.join(', ')} but got ${actualKeys.join(', ')}`
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Dedup golden path — 3 matching, 2 new
// ---------------------------------------------------------------------------
describe('search:compress golden — dedup golden path', () => {
  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('filters out matching records and keeps new ones', () => {
    // Seed patterns.json with 3 known patterns
    writeJson(tmpDir, 'patterns.json', [
      { text: 'Use BM25 for text search', timestamp: '2026-01-01T00:00:00.000Z' },
      { text: 'Prefer fastembed over transformers', timestamp: '2026-01-02T00:00:00.000Z' },
      { text: 'Always normalize Windows paths', timestamp: '2026-01-03T00:00:00.000Z' },
    ]);
    writeJson(tmpDir, 'gotchas.json', []);

    // 5 incoming records: 3 match existing patterns (case-insensitive), 2 are new
    const records = {
      patterns: [
        { text: 'Use BM25 for text search', timestamp: '2026-02-01T00:00:00.000Z' },
        { text: 'prefer fastembed over transformers', timestamp: '2026-02-01T00:00:00.000Z' },
        { text: 'Brand new pattern about caching', timestamp: '2026-02-01T00:00:00.000Z' },
      ],
      gotchas: [
        { text: 'always normalize windows paths', timestamp: '2026-02-01T00:00:00.000Z' },
        { text: 'New gotcha about race conditions', timestamp: '2026-02-01T00:00:00.000Z' },
      ],
      issues: [],
      decisions: [],
    };

    const { dedupedRecords, stats } = deduplicateAgainstMemory(records, tmpDir);

    assert.equal(stats.total, 5, 'Expected total to be 5');
    assert.equal(stats.kept, 2, 'Expected kept to be 2');
    assert.equal(stats.filtered, 3, 'Expected filtered to be 3');

    // Verify the kept records are the new ones
    assert.equal(dedupedRecords.patterns.length, 1);
    assert.equal(dedupedRecords.patterns[0].text, 'Brand new pattern about caching');
    assert.equal(dedupedRecords.gotchas.length, 1);
    assert.equal(dedupedRecords.gotchas[0].text, 'New gotcha about race conditions');
  });
});

// ---------------------------------------------------------------------------
// 3. Adaptive ratio golden path — all 4 thresholds
// ---------------------------------------------------------------------------
describe('search:compress golden — adaptive ratio', () => {
  test('4000 tokens -> 0.8 (small corpus)', () => {
    assert.equal(computeAdaptiveRatio(4000), 0.8);
  });

  test('20000 tokens -> 0.5 (medium corpus)', () => {
    assert.equal(computeAdaptiveRatio(20000), 0.5);
  });

  test('50000 tokens -> 0.2 (large corpus)', () => {
    assert.equal(computeAdaptiveRatio(50000), 0.2);
  });

  test('200000 tokens -> 0.1 (very large corpus)', () => {
    assert.equal(computeAdaptiveRatio(200000), 0.1);
  });

  // Boundary tests
  test('7999 tokens -> 0.8 (just below first boundary)', () => {
    assert.equal(computeAdaptiveRatio(7999), 0.8);
  });

  test('8000 tokens -> 0.5 (exactly at first boundary)', () => {
    assert.equal(computeAdaptiveRatio(8000), 0.5);
  });

  test('31999 tokens -> 0.5 (just below second boundary)', () => {
    assert.equal(computeAdaptiveRatio(31999), 0.5);
  });

  test('32000 tokens -> 0.2 (exactly at second boundary)', () => {
    assert.equal(computeAdaptiveRatio(32000), 0.2);
  });

  test('99999 tokens -> 0.2 (just below third boundary)', () => {
    assert.equal(computeAdaptiveRatio(99999), 0.2);
  });

  test('100000 tokens -> 0.1 (exactly at third boundary)', () => {
    assert.equal(computeAdaptiveRatio(100000), 0.1);
  });
});

// ---------------------------------------------------------------------------
// 4. Memory classification golden path
// ---------------------------------------------------------------------------
describe('search:compress golden — memory classification', () => {
  test('"gotcha about Windows paths" -> gotchas', () => {
    assert.equal(classifyMemoryTarget('This is a gotcha about Windows paths'), 'gotchas');
  });

  test('"Found a bug in the parser" -> issues', () => {
    assert.equal(classifyMemoryTarget('Found a bug in the parser'), 'issues');
  });

  test('"Decision: use fastembed over transformers" -> decisions', () => {
    assert.equal(classifyMemoryTarget('Decision: use fastembed over transformers'), 'decisions');
  });

  test('"Use BM25 for text search" -> patterns (default)', () => {
    assert.equal(classifyMemoryTarget('Use BM25 for text search'), 'patterns');
  });

  // Additional classification coverage
  test('"This is a warning about encoding" -> gotchas', () => {
    assert.equal(classifyMemoryTarget('This is a warning about encoding'), 'gotchas');
  });

  test('"Error in the build pipeline" -> issues', () => {
    assert.equal(classifyMemoryTarget('Error in the build pipeline'), 'issues');
  });

  test('"Selected Redis over Memcached" -> decisions', () => {
    assert.equal(classifyMemoryTarget('Selected Redis over Memcached'), 'decisions');
  });

  test('empty string -> patterns (default fallback)', () => {
    assert.equal(classifyMemoryTarget(''), 'patterns');
  });

  test('null -> patterns (default fallback)', () => {
    assert.equal(classifyMemoryTarget(null), 'patterns');
  });
});

// ---------------------------------------------------------------------------
// 5. Dedup with empty memory — all records kept
// ---------------------------------------------------------------------------
describe('search:compress golden — dedup with empty memory', () => {
  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('empty patterns.json and gotchas.json -> all records kept', () => {
    writeJson(tmpDir, 'patterns.json', []);
    writeJson(tmpDir, 'gotchas.json', []);

    const records = {
      patterns: [
        { text: 'Pattern A', timestamp: '2026-02-01T00:00:00.000Z' },
        { text: 'Pattern B', timestamp: '2026-02-01T00:00:00.000Z' },
      ],
      gotchas: [{ text: 'Gotcha A', timestamp: '2026-02-01T00:00:00.000Z' }],
      issues: [{ text: 'Issue A', timestamp: '2026-02-01T00:00:00.000Z' }],
      decisions: [{ text: 'Decision A', timestamp: '2026-02-01T00:00:00.000Z' }],
    };

    const { dedupedRecords, stats } = deduplicateAgainstMemory(records, tmpDir);

    assert.equal(stats.total, 5, 'Expected total to be 5');
    assert.equal(stats.kept, 5, 'Expected all records kept');
    assert.equal(stats.filtered, 0, 'Expected none filtered');
    assert.equal(dedupedRecords.patterns.length, 2);
    assert.equal(dedupedRecords.gotchas.length, 1);
    assert.equal(dedupedRecords.issues.length, 1);
    assert.equal(dedupedRecords.decisions.length, 1);
  });

  test('missing memory files -> all records kept', () => {
    // Do not write any files at all — the memory dir exists but has no JSON
    const records = {
      patterns: [{ text: 'Pattern X', timestamp: '2026-02-01T00:00:00.000Z' }],
      gotchas: [],
      issues: [],
      decisions: [],
    };

    const { stats } = deduplicateAgainstMemory(records, tmpDir);

    assert.equal(stats.total, 1);
    assert.equal(stats.kept, 1);
    assert.equal(stats.filtered, 0);
  });
});

// ---------------------------------------------------------------------------
// 6. Full round-trip with mocked dependencies
// ---------------------------------------------------------------------------
describe('search:compress golden — full round-trip with mocked deps', () => {
  let memDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    memDir = path.join(tmpDir, 'memory');
    fs.mkdirSync(memDir, { recursive: true });
    writeJson(memDir, 'patterns.json', [
      { text: 'Existing pattern about caching', timestamp: '2026-01-01T00:00:00.000Z' },
    ]);
    writeJson(memDir, 'gotchas.json', []);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('round-trip returns correct output shape including dedupStats', () => {
    const cannedSearchOutput = [
      '1. src/search/bm25.ts (92%)',
      '  - BM25 indexer with lazy IDF computation',
      '  - Supports incremental updates',
      '2. src/search/hybrid.ts (87%)',
      '  - Combines BM25 with semantic embedding scores',
      '3. src/search/config.ts (74%)',
      '  - Search configuration and defaults',
    ].join('\n');

    const cannedCompressionOutput = {
      evidence_sufficient: true,
      compressed: {
        compressed_text: 'BM25 search with lazy IDF and hybrid scoring',
        segments: [
          { text: 'BM25 indexer uses lazy IDF computation for efficiency', selected: true },
          { text: 'Hybrid search combines BM25 with semantic embeddings', selected: true },
          { text: 'Existing pattern about caching', selected: true },
        ],
      },
    };

    const mockRunCommand = (_cmd, _args) => ({
      status: 0,
      stdout: cannedSearchOutput,
      stderr: '',
    });

    const mockRunWorkflow = _opts => ({
      ok: true,
      data: cannedCompressionOutput,
    });

    const result = main(
      { query: 'search indexing', persistFiles: false },
      { runCommand: mockRunCommand, runTokenSaverWorkflow: mockRunWorkflow }
    );

    // Verify top-level shape
    assert.equal(result.ok, true);
    assert.equal(result.search.query, 'search indexing');
    assert.equal(result.search.hits, 3);
    assert.equal(result.evidence.sufficient, true);
    assert.equal(result.compression.mode, 'evidence_aware');
    assert.equal(typeof result.compression.skeletonRatio, 'number');
    assert.equal(result.persistMode, 'memoryrecord_payload_only');
    assert.equal(typeof result.memoryRecordHint, 'string');

    // Verify memoryRecords has required categories
    assert.ok('patterns' in result.memoryRecords);
    assert.ok('gotchas' in result.memoryRecords);
    assert.ok('issues' in result.memoryRecords);
    assert.ok('decisions' in result.memoryRecords);

    // Verify dedupStats
    assert.equal(typeof result.dedupStats.total, 'number');
    assert.equal(typeof result.dedupStats.kept, 'number');
    assert.equal(typeof result.dedupStats.filtered, 'number');
    assert.ok(result.dedupStats.total >= 0, 'total should be non-negative');
    assert.ok(result.dedupStats.kept >= 0, 'kept should be non-negative');
    assert.ok(result.dedupStats.filtered >= 0, 'filtered should be non-negative');
    assert.equal(
      result.dedupStats.total,
      result.dedupStats.kept + result.dedupStats.filtered,
      'total should equal kept + filtered'
    );
  });

  test('main() returns error for empty query', () => {
    const result = main({ query: '' });

    assert.equal(result.ok, false);
    assert.equal(result.error, 'query is required');
  });

  test('main() returns error when search command fails', () => {
    const mockRunCommand = () => ({
      status: 1,
      stdout: '',
      stderr: 'search index not found',
    });

    const result = main({ query: 'something' }, { runCommand: mockRunCommand });

    assert.equal(result.ok, false);
    assert.equal(result.stage, 'search');
  });

  test('main() returns error when workflow fails', () => {
    const mockRunCommand = () => ({
      status: 0,
      stdout: '1. src/foo.ts (90%)\n  - some content',
      stderr: '',
    });

    const mockRunWorkflow = () => ({
      ok: false,
      stderr: 'python not found',
      stdout: '',
    });

    const result = main(
      { query: 'something' },
      { runCommand: mockRunCommand, runTokenSaverWorkflow: mockRunWorkflow }
    );

    assert.equal(result.ok, false);
    assert.equal(result.stage, 'compression');
  });

  test('main() returns insufficient evidence when flagged', () => {
    const mockRunCommand = () => ({
      status: 0,
      stdout: '1. src/foo.ts (90%)\n  - some content',
      stderr: '',
    });

    const mockRunWorkflow = () => ({
      ok: true,
      data: { evidence_sufficient: false },
    });

    const result = main(
      { query: 'something', failOnInsufficientEvidence: true },
      { runCommand: mockRunCommand, runTokenSaverWorkflow: mockRunWorkflow }
    );

    assert.equal(result.ok, false);
    assert.equal(result.stage, 'evidence_gate');
    assert.equal(result.evidenceSufficient, false);
  });
});
