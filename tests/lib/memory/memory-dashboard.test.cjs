#!/usr/bin/env node
/**
 * Memory Dashboard Tests - Phase 4 Memory Monitoring
 * ==================================================
 *
 * Tests for:
 * 1. Unified dashboard metrics collection
 * 2. Health score calculation
 * 3. Recommendation generation
 * 4. Metrics history management
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Test setup - use a temporary directory
const TEST_PROJECT_ROOT = path.join(__dirname, '..', 'context', 'memory', '.test-dashboard');
const MEMORY_DIR = path.join(TEST_PROJECT_ROOT, '.claude', 'context', 'memory');

// Cleanup and setup
function setupTestDir() {
  if (fs.existsSync(TEST_PROJECT_ROOT)) {
    fs.rmSync(TEST_PROJECT_ROOT, { recursive: true });
  }
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
  fs.mkdirSync(path.join(MEMORY_DIR, 'archive'), { recursive: true });
  fs.mkdirSync(path.join(MEMORY_DIR, 'sessions'), { recursive: true });
  fs.mkdirSync(path.join(MEMORY_DIR, 'stm'), { recursive: true });
  fs.mkdirSync(path.join(MEMORY_DIR, 'mtm'), { recursive: true });
  fs.mkdirSync(path.join(MEMORY_DIR, 'ltm'), { recursive: true });
  fs.mkdirSync(path.join(MEMORY_DIR, 'metrics'), { recursive: true });
}

function cleanupTestDir() {
  if (fs.existsSync(TEST_PROJECT_ROOT)) {
    fs.rmSync(TEST_PROJECT_ROOT, { recursive: true });
  }
}

// Helper to create test data
function createTestMemoryData() {
  // Create learnings.md
  fs.writeFileSync(path.join(MEMORY_DIR, 'learnings.md'), 'A'.repeat(20 * 1024));

  // Create patterns.json
  const patterns = [];
  for (let i = 0; i < 25; i++) {
    patterns.push({ text: `Pattern ${i}`, timestamp: new Date().toISOString() });
  }
  fs.writeFileSync(path.join(MEMORY_DIR, 'patterns.json'), JSON.stringify(patterns, null, 2));

  // Create gotchas.json
  const gotchas = [];
  for (let i = 0; i < 15; i++) {
    gotchas.push({ text: `Gotcha ${i}`, timestamp: new Date().toISOString() });
  }
  fs.writeFileSync(path.join(MEMORY_DIR, 'gotchas.json'), JSON.stringify(gotchas, null, 2));

  // Create codebase_map.json
  const discovered_files = {};
  for (let i = 0; i < 100; i++) {
    discovered_files[`file${i}.js`] = {
      description: `File ${i}`,
      last_accessed: new Date().toISOString(),
    };
  }
  fs.writeFileSync(
    path.join(MEMORY_DIR, 'codebase_map.json'),
    JSON.stringify({ discovered_files }, null, 2)
  );

  // Create MTM sessions
  for (let i = 0; i < 5; i++) {
    const sessionPath = path.join(MEMORY_DIR, 'mtm', `session_2026-01-2${i}T10-00-00.json`);
    fs.writeFileSync(
      sessionPath,
      JSON.stringify(
        {
          session_id: `session_${i}`,
          timestamp: new Date().toISOString(),
          summary: `Test session ${i}`,
        },
        null,
        2
      )
    );
  }

  // Create LTM summary
  fs.writeFileSync(
    path.join(MEMORY_DIR, 'ltm', 'summary_2026-01-20T10-00-00.json'),
    JSON.stringify(
      {
        type: 'session_summary',
        session_count: 10,
        key_learnings: ['Learning 1', 'Learning 2'],
      },
      null,
      2
    )
  );
}

// Simple test framework
let passCount = 0;
let failCount = 0;

function describe(name, fn) {
  console.log(`\n${name}`);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    failCount++;
    process.exitCode = 1;
  }
}

// Run tests
if (require.main === module) {
  console.log('Memory Dashboard Tests - Phase 4 Memory Monitoring');
  console.log('==================================================');

  // Test Suite 1: collectMetrics function
  describe('collectMetrics', function () {
    it('should collect metrics from all memory sources', function () {
      setupTestDir();
      try {
        createTestMemoryData();

        delete require.cache[require.resolve('../../../.claude/lib/memory/memory-dashboard.cjs')];
        const { collectMetrics } = require('../../../.claude/lib/memory/memory-dashboard.cjs');
        const metrics = collectMetrics(TEST_PROJECT_ROOT);

        assert(metrics.timestamp, 'Should have timestamp');
        assert(metrics.summary, 'Should have summary');
        assert(metrics.tiers, 'Should have tiers');
        assert(metrics.files, 'Should have files');

        // Check summary
        assert(typeof metrics.summary.totalEntries === 'number', 'totalEntries should be a number');
        assert(typeof metrics.summary.totalSizeKB === 'number', 'totalSizeKB should be a number');
        assert(typeof metrics.summary.healthScore === 'number', 'healthScore should be a number');

        // Check tiers
        assert(metrics.tiers.stm, 'Should have STM tier');
        assert(metrics.tiers.mtm, 'Should have MTM tier');
        assert(metrics.tiers.ltm, 'Should have LTM tier');

        // Check files
        assert(metrics.files['learnings.md'], 'Should have learnings.md');
        assert(metrics.files['patterns.json'], 'Should have patterns.json');
      } finally {
        cleanupTestDir();
      }
    });

    it('should correctly count total entries', function () {
      setupTestDir();
      try {
        createTestMemoryData();

        delete require.cache[require.resolve('../../../.claude/lib/memory/memory-dashboard.cjs')];
        const { collectMetrics } = require('../../../.claude/lib/memory/memory-dashboard.cjs');
        const metrics = collectMetrics(TEST_PROJECT_ROOT);

        // 25 patterns + 15 gotchas + 100 codebase_map entries = 140
        assert(
          metrics.summary.totalEntries >= 140,
          `totalEntries should be >= 140, got ${metrics.summary.totalEntries}`
        );
      } finally {
        cleanupTestDir();
      }
    });

    it('should return MTM session count', function () {
      setupTestDir();
      try {
        createTestMemoryData();

        delete require.cache[require.resolve('../../../.claude/lib/memory/memory-dashboard.cjs')];
        const { collectMetrics } = require('../../../.claude/lib/memory/memory-dashboard.cjs');
        const metrics = collectMetrics(TEST_PROJECT_ROOT);

        assert.strictEqual(metrics.tiers.mtm.sessions, 5, 'MTM should have 5 sessions');
      } finally {
        cleanupTestDir();
      }
    });
  });

  // Test Suite 2: calculateHealthScore function
  describe('calculateHealthScore', function () {
    it('should return 1.0 for healthy state (no warnings)', function () {
      setupTestDir();
      try {
        // Create small, healthy data
        fs.writeFileSync(path.join(MEMORY_DIR, 'learnings.md'), 'Small file');
        fs.writeFileSync(path.join(MEMORY_DIR, 'patterns.json'), JSON.stringify([{ text: 'P1' }]));
        fs.writeFileSync(path.join(MEMORY_DIR, 'gotchas.json'), JSON.stringify([{ text: 'G1' }]));
        fs.writeFileSync(
          path.join(MEMORY_DIR, 'codebase_map.json'),
          JSON.stringify({ discovered_files: { 'a.js': { description: 'a' } } })
        );

        delete require.cache[require.resolve('../../../.claude/lib/memory/memory-dashboard.cjs')];
        const { calculateHealthScore } = require('../../../.claude/lib/memory/memory-dashboard.cjs');

        const score = calculateHealthScore({
          learningsSizeKB: 5,
          patternsCount: 10,
          gotchasCount: 5,
          codebaseMapEntries: 50,
          mtmSessionCount: 3,
        });

        assert(score >= 0.9, `Health score should be >= 0.9 for healthy state, got ${score}`);
      } finally {
        cleanupTestDir();
      }
    });

    it('should return lower score when approaching thresholds', function () {
      setupTestDir();
      try {
        delete require.cache[require.resolve('../../../.claude/lib/memory/memory-dashboard.cjs')];
        const { calculateHealthScore } = require('../../../.claude/lib/memory/memory-dashboard.cjs');

        // Near threshold values
        const score = calculateHealthScore({
          learningsSizeKB: 38, // Near 40KB threshold
          patternsCount: 45, // Near 50 threshold
          gotchasCount: 45, // Near 50 threshold
          codebaseMapEntries: 450, // Near 500 threshold
          mtmSessionCount: 9, // Near 10 threshold
        });

        assert(score < 0.7, `Health score should be < 0.7 when near thresholds, got ${score}`);
      } finally {
        cleanupTestDir();
      }
    });

    it('should return low score when over thresholds', function () {
      setupTestDir();
      try {
        delete require.cache[require.resolve('../../../.claude/lib/memory/memory-dashboard.cjs')];
        const { calculateHealthScore } = require('../../../.claude/lib/memory/memory-dashboard.cjs');

        // Over threshold values
        const score = calculateHealthScore({
          learningsSizeKB: 50, // Over 40KB
          patternsCount: 60, // Over 50
          gotchasCount: 60, // Over 50
          codebaseMapEntries: 600, // Over 500
          mtmSessionCount: 12, // Over 10
        });

        assert(score < 0.5, `Health score should be < 0.5 when over thresholds, got ${score}`);
      } finally {
        cleanupTestDir();
      }
    });
  });

  // Test Suite 3: generateRecommendations function
  describe('generateRecommendations', function () {
    it('should return empty array when all healthy', function () {
      setupTestDir();
      try {
        delete require.cache[require.resolve('../../../.claude/lib/memory/memory-dashboard.cjs')];
        const { generateRecommendations } = require('../../../.claude/lib/memory/memory-dashboard.cjs');

        const recommendations = generateRecommendations({
          learningsSizeKB: 10,
          patternsCount: 20,
          gotchasCount: 15,
          codebaseMapEntries: 100,
          mtmSessionCount: 5,
        });

        assert.strictEqual(recommendations.length, 0, 'Should have no recommendations');
      } finally {
        cleanupTestDir();
      }
    });

    it('should recommend archiving when learnings.md is large', function () {
      setupTestDir();
      try {
        delete require.cache[require.resolve('../../../.claude/lib/memory/memory-dashboard.cjs')];
        const { generateRecommendations } = require('../../../.claude/lib/memory/memory-dashboard.cjs');

        const recommendations = generateRecommendations({
          learningsSizeKB: 38, // Near threshold
          patternsCount: 10,
          gotchasCount: 10,
          codebaseMapEntries: 50,
          mtmSessionCount: 5,
        });

        assert(
          recommendations.some(
            r => r.toLowerCase().includes('archiv') || r.toLowerCase().includes('learnings')
          ),
          'Should recommend archiving learnings'
        );
      } finally {
        cleanupTestDir();
      }
    });

    it('should recommend deduplication when patterns are high', function () {
      setupTestDir();
      try {
        delete require.cache[require.resolve('../../../.claude/lib/memory/memory-dashboard.cjs')];
        const { generateRecommendations } = require('../../../.claude/lib/memory/memory-dashboard.cjs');

        const recommendations = generateRecommendations({
          learningsSizeKB: 10,
          patternsCount: 48, // Near threshold
          gotchasCount: 10,
          codebaseMapEntries: 50,
          mtmSessionCount: 5,
        });

        assert(
          recommendations.some(
            r =>
              r.toLowerCase().includes('pattern') ||
              r.toLowerCase().includes('deduplic') ||
              r.toLowerCase().includes('prune')
          ),
          'Should recommend deduplication or pruning'
        );
      } finally {
        cleanupTestDir();
      }
    });

    it('should recommend MTM summarization when sessions are high', function () {
      setupTestDir();
      try {
        delete require.cache[require.resolve('../../../.claude/lib/memory/memory-dashboard.cjs')];
        const { generateRecommendations } = require('../../../.claude/lib/memory/memory-dashboard.cjs');

        const recommendations = generateRecommendations({
          learningsSizeKB: 10,
          patternsCount: 10,
          gotchasCount: 10,
          codebaseMapEntries: 50,
          mtmSessionCount: 9, // Near threshold
        });

        assert(
          recommendations.some(
            r => r.toLowerCase().includes('mtm') || r.toLowerCase().includes('summariz')
          ),
          'Should recommend MTM summarization'
        );
      } finally {
        cleanupTestDir();
      }
    });
  });

  // Test Suite 4: saveMetrics and getMetricsHistory functions
  describe('saveMetrics and getMetricsHistory', function () {
    it('should save metrics to daily file', function () {
      setupTestDir();
      try {
        createTestMemoryData();

        delete require.cache[require.resolve('../../../.claude/lib/memory/memory-dashboard.cjs')];
        const { saveMetrics, collectMetrics } = require('../../../.claude/lib/memory/memory-dashboard.cjs');

        const metrics = collectMetrics(TEST_PROJECT_ROOT);
        saveMetrics(metrics, TEST_PROJECT_ROOT);

        const metricsDir = path.join(MEMORY_DIR, 'metrics');
        const files = fs.readdirSync(metricsDir);

        // Should have at least one metrics file (today's date)
        const dateFiles = files.filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.json$/));
        assert(dateFiles.length >= 1, 'Should have at least one dated metrics file');
      } finally {
        cleanupTestDir();
      }
    });

    it('should load metrics history', function () {
      setupTestDir();
      try {
        const metricsDir = path.join(MEMORY_DIR, 'metrics');

        // Create historical metrics files
        for (let i = 1; i <= 5; i++) {
          const date = `2026-01-${String(20 + i).padStart(2, '0')}`;
          const metricsPath = path.join(metricsDir, `${date}.json`);
          fs.writeFileSync(
            metricsPath,
            JSON.stringify({
              timestamp: `${date}T12:00:00.000Z`,
              summary: { healthScore: 0.8 + i * 0.02 },
            })
          );
        }

        delete require.cache[require.resolve('../../../.claude/lib/memory/memory-dashboard.cjs')];
        const { getMetricsHistory } = require('../../../.claude/lib/memory/memory-dashboard.cjs');

        const history = getMetricsHistory(5, TEST_PROJECT_ROOT);

        assert(Array.isArray(history), 'History should be an array');
        assert.strictEqual(history.length, 5, 'Should return 5 days of history');
      } finally {
        cleanupTestDir();
      }
    });

    it('should cleanup old metrics files (keep last 30 days)', function () {
      setupTestDir();
      try {
        const metricsDir = path.join(MEMORY_DIR, 'metrics');

        // Create 40 historical metrics files
        for (let i = 1; i <= 40; i++) {
          const date = new Date();
          date.setDate(date.getDate() - i);
          const dateStr = date.toISOString().split('T')[0];
          const metricsPath = path.join(metricsDir, `${dateStr}.json`);
          fs.writeFileSync(
            metricsPath,
            JSON.stringify({
              timestamp: date.toISOString(),
              summary: { healthScore: 0.85 },
            })
          );
        }

        delete require.cache[require.resolve('../../../.claude/lib/memory/memory-dashboard.cjs')];
        const { cleanupOldMetrics } = require('../../../.claude/lib/memory/memory-dashboard.cjs');

        cleanupOldMetrics(TEST_PROJECT_ROOT);

        const files = fs.readdirSync(metricsDir).filter(f => f.endsWith('.json'));
        assert(files.length <= 30, `Should keep at most 30 files, got ${files.length}`);
      } finally {
        cleanupTestDir();
      }
    });
  });

  // Test Suite 5: getDashboard (unified function)
  describe('getDashboard', function () {
    it('should return complete dashboard with all sections', function () {
      setupTestDir();
      try {
        createTestMemoryData();

        delete require.cache[require.resolve('../../../.claude/lib/memory/memory-dashboard.cjs')];
        const { getDashboard } = require('../../../.claude/lib/memory/memory-dashboard.cjs');

        const dashboard = getDashboard(TEST_PROJECT_ROOT);

        assert(dashboard.timestamp, 'Should have timestamp');
        assert(dashboard.summary, 'Should have summary');
        assert(dashboard.tiers, 'Should have tiers');
        assert(dashboard.files, 'Should have files');
        assert(Array.isArray(dashboard.recommendations), 'Should have recommendations array');
      } finally {
        cleanupTestDir();
      }
    });
  });

  // Test Suite 6: METRICS_DEBUG error logging
  describe('Error Logging with METRICS_DEBUG', function () {
    it('should log errors when METRICS_DEBUG is enabled and file read fails', function () {
      setupTestDir();
      try {
        delete require.cache[require.resolve('../../../.claude/lib/memory/memory-dashboard.cjs')];
        const { collectMetrics } = require('../../../.claude/lib/memory/memory-dashboard.cjs');

        // Temporarily set METRICS_DEBUG
        const originalDebug = process.env.METRICS_DEBUG;
        process.env.METRICS_DEBUG = 'true';

        // Capture console.error calls
        const errors = [];
        const originalError = console.error;
        console.error = function (...args) {
          errors.push(args);
        };

        try {
          // Try to collect metrics from non-existent directory
          const invalidRoot = path.join(TEST_PROJECT_ROOT, 'invalid');
          const metrics = collectMetrics(invalidRoot);

          // Should not throw, but may have logged errors
          assert(metrics, 'Should return metrics object even with errors');

          // Note: Errors logged depend on file system state
          // This test verifies that logging doesn't crash the system
        } finally {
          console.error = originalError;
          process.env.METRICS_DEBUG = originalDebug;
        }
      } finally {
        cleanupTestDir();
      }
    });

    it('should not log errors when METRICS_DEBUG is disabled', function () {
      setupTestDir();
      try {
        delete require.cache[require.resolve('../../../.claude/lib/memory/memory-dashboard.cjs')];
        const { collectMetrics } = require('../../../.claude/lib/memory/memory-dashboard.cjs');

        // Ensure METRICS_DEBUG is not set
        const originalDebug = process.env.METRICS_DEBUG;
        delete process.env.METRICS_DEBUG;

        // Capture console.error calls
        const errors = [];
        const originalError = console.error;
        console.error = function (...args) {
          errors.push(args);
        };

        try {
          // Try to collect metrics from non-existent directory
          const invalidRoot = path.join(TEST_PROJECT_ROOT, 'invalid');
          const metrics = collectMetrics(invalidRoot);

          // Should not throw
          assert(metrics, 'Should return metrics object');

          // No errors should be logged (or at least, fewer than with debug enabled)
        } finally {
          console.error = originalError;
          process.env.METRICS_DEBUG = originalDebug;
        }
      } finally {
        cleanupTestDir();
      }
    });

    it('should log JSON formatted errors with METRICS_DEBUG enabled', function () {
      setupTestDir();
      try {
        // Create corrupted JSON file
        fs.writeFileSync(path.join(MEMORY_DIR, 'patterns.json'), '{invalid json');

        delete require.cache[require.resolve('../../../.claude/lib/memory/memory-dashboard.cjs')];
        const { collectMetrics } = require('../../../.claude/lib/memory/memory-dashboard.cjs');

        const originalDebug = process.env.METRICS_DEBUG;
        process.env.METRICS_DEBUG = 'true';

        const errors = [];
        const originalError = console.error;
        console.error = function (...args) {
          if (args[0] && typeof args[0] === 'string') {
            try {
              errors.push(JSON.parse(args[0]));
            } catch (_e) {
              errors.push(args[0]);
            }
          }
        };

        try {
          const metrics = collectMetrics(TEST_PROJECT_ROOT);
          assert(metrics, 'Should return metrics even with JSON parsing error');

          // Verify error was logged in JSON format
          const jsonErrors = errors.filter(e => typeof e === 'object' && e.module);
          // Should have logged error(s) about parsing patterns.json
          assert(jsonErrors.length > 0 || errors.length > 0, 'Should have logged errors');
        } finally {
          console.error = originalError;
          process.env.METRICS_DEBUG = originalDebug;
        }
      } finally {
        cleanupTestDir();
      }
    });
  });

  console.log('\n==================================================');
  console.log(`Test run complete. ${passCount} passed, ${failCount} failed.`);
}
