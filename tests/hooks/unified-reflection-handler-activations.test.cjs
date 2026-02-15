#!/usr/bin/env node
/**
 * Tests for unified-reflection-handler.cjs
 *
 * PERF-003: Hook consolidation for reflection/memory hooks
 *
 * TDD: Write failing tests first, then implement to pass
 *
 * Consolidates:
 * - task-completion-reflection.cjs (archived)
 * - error-recovery-reflection.cjs (archived)
 * - session-end-reflection.cjs (archived)
 * - session-memory-extractor.cjs
 * - session-end-recorder.cjs
 */

'use strict';

const path = require('path');
const fs = require('fs');

// Test framework
let passed = 0;
let failed = 0;
const pending = [];

function describe(name, fn) {
  console.log(`\n${name}`);
  fn();
}

function it(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      pending.push(
        result.then(
          () => {
            console.log(`  [PASS] ${name}`);
            passed++;
          },
          err => {
            console.log(`  [FAIL] ${name}`);
            console.log(`         ${err.message}`);
            failed++;
          }
        )
      );
      return;
    }

    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.log(`  [FAIL] ${name}`);
    console.log(`         ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(message || `Expected ${expectedStr}, got ${actualStr}`);
  }
}

// Test setup/teardown helpers
const TEST_QUEUE_FILE = path.join(__dirname, '../../context/test-unified-reflection-queue.jsonl');

function cleanupTestQueue() {
  if (fs.existsSync(TEST_QUEUE_FILE)) {
    fs.unlinkSync(TEST_QUEUE_FILE);
  }
}

function _readTestQueue() {
  if (!fs.existsSync(TEST_QUEUE_FILE)) return [];
  const content = fs.readFileSync(TEST_QUEUE_FILE, 'utf8').trim();
  if (!content) return [];
  return content.split('\n').map(line => JSON.parse(line));
}

// Import the module under test
let hook;
try {
  hook = require('../../.claude/hooks/reflection/unified-reflection-handler.cjs');
} catch (e) {
  console.log('WARNING: Module not implemented yet. Tests will fail.\n');
  console.log('Error:', e.message);
  hook = {
    isEnabled: () => false,
    detectEventType: () => null,
    shouldHandle: () => false,
    handleTaskCompletion: () => null,
    handleErrorRecovery: () => null,
    handleSessionEnd: () => null,
    handleMemoryExtraction: () => null,
    queueReflection: () => {},
    main: async () => {},
    QUEUE_FILE: TEST_QUEUE_FILE,
  };
}

// Override queue file for testing
let originalQueueFile;
try {
  originalQueueFile = hook.QUEUE_FILE;
  hook.QUEUE_FILE = TEST_QUEUE_FILE;
} catch (_e) {
  // Ignore if not settable
}

// ============================================================
// TESTS
// ============================================================

// Save original env vars at module level for cleanup
const origReflectionEnabled = process.env.REFLECTION_ENABLED;
const origReflectionMode = process.env.REFLECTION_HOOK_MODE;

describe('unified-reflection-handler.cjs', () => {
  describe('SessionEnd activations', () => {
    it('should export SessionEnd activation helpers', () => {
      assertEqual(typeof hook.triggerEmbeddingGeneration, 'function');
      assertEqual(typeof hook.triggerMaintenance, 'function');
      assertEqual(typeof hook.triggerObservationCompaction, 'function');
    });

    it('triggerEmbeddingGeneration should enqueue vector writes for modified memory files (stubbed)', async () => {
      const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
      const memoryFileRel = '.claude/context/memory/test-embeddings.md';
      const memoryFileAbs = path.resolve(PROJECT_ROOT, memoryFileRel);

      const lancedbClientPath = path.resolve(PROJECT_ROOT, '.claude/lib/memory/lancedb-client.cjs');
      const embeddingsModulePath = path.resolve(
        PROJECT_ROOT,
        '.claude/tools/cli/generate-embeddings.cjs'
      );

      const lancedbKey = require.resolve(lancedbClientPath);
      const embeddingsKey = require.resolve(embeddingsModulePath);
      const originalLancedb = require.cache[lancedbKey];
      const originalEmbeddings = require.cache[embeddingsKey];

      const upserts = [];

      try {
        fs.mkdirSync(path.dirname(memoryFileAbs), { recursive: true });
        fs.writeFileSync(memoryFileAbs, '## Section A\n\nHello\n\n## Section B\n\nWorld\n', 'utf8');

        require.cache[lancedbKey] = {
          id: lancedbKey,
          filename: lancedbKey,
          loaded: true,
          exports: {
            MemoryVectorStore: class MemoryVectorStoreStub {
              async isAvailable() {
                return true;
              }
              async upsertDocuments(payload) {
                upserts.push(payload);
              }
            },
          },
        };

        require.cache[embeddingsKey] = {
          id: embeddingsKey,
          filename: embeddingsKey,
          loaded: true,
          exports: {
            chunkByHeaders: () => [
              { section: 'Section A', content: 'Hello', line: 1 },
              { section: 'Section B', content: 'World', line: 5 },
            ],
            extractMetadata: (_filePath, section, line) => ({
              filePath: 'test-embeddings.md',
              section,
              line,
              type: 'unknown',
              timestamp: '2026-02-01',
            }),
          },
        };

        await hook.triggerEmbeddingGeneration({ files_modified: [memoryFileRel] });

        assertEqual(upserts.length, 1, 'Should upsert once per file');
        assertEqual(upserts[0].length, 2, 'Should upsert two chunks');
        assertEqual(upserts[0][0].metadata.section, 'Section A');
        assertEqual(upserts[0][1].metadata.section, 'Section B');
      } finally {
        if (originalLancedb) require.cache[lancedbKey] = originalLancedb;
        else delete require.cache[lancedbKey];
        if (originalEmbeddings) require.cache[embeddingsKey] = originalEmbeddings;
        else delete require.cache[embeddingsKey];

        if (fs.existsSync(memoryFileAbs)) fs.unlinkSync(memoryFileAbs);
      }
    });

    it('triggerMaintenance should run daily and weekly maintenance when due (stubbed)', () => {
      const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
      const schedulerModulePath = path.resolve(
        PROJECT_ROOT,
        '.claude/lib/memory/memory-scheduler.cjs'
      );
      const schedulerKey = require.resolve(schedulerModulePath);
      const originalScheduler = require.cache[schedulerKey];

      const calls = { daily: 0, weekly: 0 };

      try {
        require.cache[schedulerKey] = {
          id: schedulerKey,
          filename: schedulerKey,
          loaded: true,
          exports: {
            runDailyMaintenance: () => {
              calls.daily++;
            },
            runWeeklyMaintenance: () => {
              calls.weekly++;
            },
            getMaintenanceStatus: () => ({
              lastWeekly: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
            }),
          },
        };

        hook.triggerMaintenance();

        assertEqual(calls.daily, 1, 'Should run daily maintenance');
        assertEqual(calls.weekly, 1, 'Should run weekly maintenance when due');
      } finally {
        if (originalScheduler) require.cache[schedulerKey] = originalScheduler;
        else delete require.cache[schedulerKey];
      }
    });

    it('triggerObservationCompaction should compact observations on SessionEnd by default', () => {
      const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
      const observationsModulePath = path.resolve(
        PROJECT_ROOT,
        '.claude/lib/memory/observations.cjs'
      );
      const observationsKey = require.resolve(observationsModulePath);
      const originalObservations = require.cache[observationsKey];
      const originalCompactOnEnd = process.env.OBSERVATIONS_COMPACT_ON_SESSION_END;
      const originalCompactMax = process.env.OBSERVATIONS_COMPACT_MAX;

      const calls = [];

      try {
        delete process.env.OBSERVATIONS_COMPACT_ON_SESSION_END;
        process.env.OBSERVATIONS_COMPACT_MAX = '25';

        require.cache[observationsKey] = {
          id: observationsKey,
          filename: observationsKey,
          loaded: true,
          exports: {
            compactObservationsToSummary: (root, options) => {
              calls.push({ root, options });
              return { summary: 'ok', count: 1 };
            },
          },
        };

        hook.triggerObservationCompaction();

        assertEqual(calls.length, 1, 'Should compact once by default');
        assertEqual(calls[0].root, PROJECT_ROOT);
        assertEqual(calls[0].options.maxObservations, 25);
      } finally {
        if (originalObservations) require.cache[observationsKey] = originalObservations;
        else delete require.cache[observationsKey];

        if (originalCompactOnEnd !== undefined) {
          process.env.OBSERVATIONS_COMPACT_ON_SESSION_END = originalCompactOnEnd;
        } else {
          delete process.env.OBSERVATIONS_COMPACT_ON_SESSION_END;
        }
        if (originalCompactMax !== undefined) {
          process.env.OBSERVATIONS_COMPACT_MAX = originalCompactMax;
        } else {
          delete process.env.OBSERVATIONS_COMPACT_MAX;
        }
      }
    });

    it('triggerObservationCompaction should skip when OBSERVATIONS_COMPACT_ON_SESSION_END=off', () => {
      const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
      const observationsModulePath = path.resolve(
        PROJECT_ROOT,
        '.claude/lib/memory/observations.cjs'
      );
      const observationsKey = require.resolve(observationsModulePath);
      const originalObservations = require.cache[observationsKey];
      const originalCompactOnEnd = process.env.OBSERVATIONS_COMPACT_ON_SESSION_END;

      const calls = [];

      try {
        process.env.OBSERVATIONS_COMPACT_ON_SESSION_END = 'off';

        require.cache[observationsKey] = {
          id: observationsKey,
          filename: observationsKey,
          loaded: true,
          exports: {
            compactObservationsToSummary: () => {
              calls.push(1);
              return { summary: 'ok', count: 1 };
            },
          },
        };

        hook.triggerObservationCompaction();

        assertEqual(calls.length, 0, 'Should not compact when disabled');
      } finally {
        if (originalObservations) require.cache[observationsKey] = originalObservations;
        else delete require.cache[observationsKey];

        if (originalCompactOnEnd !== undefined) {
          process.env.OBSERVATIONS_COMPACT_ON_SESSION_END = originalCompactOnEnd;
        } else {
          delete process.env.OBSERVATIONS_COMPACT_ON_SESSION_END;
        }
      }
    });
  });
});

// ============================================================
// RUN TESTS
// ============================================================

Promise.allSettled(pending).then(() => {
  console.log('\n========================================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('========================================\n');

  // Cleanup
  cleanupTestQueue();
  try {
    hook.QUEUE_FILE = originalQueueFile;
  } catch (_e) {
    // Ignore
  }

  // Restore env
  if (origReflectionEnabled !== undefined) {
    process.env.REFLECTION_ENABLED = origReflectionEnabled;
  } else {
    delete process.env.REFLECTION_ENABLED;
  }
  if (origReflectionMode !== undefined) {
    process.env.REFLECTION_HOOK_MODE = origReflectionMode;
  } else {
    delete process.env.REFLECTION_HOOK_MODE;
  }

  process.exit(failed > 0 ? 1 : 0);
});
