#!/usr/bin/env node
/**
 * Tests for BM25 Maintenance & Health (Phase 4.2)
 *
 * Verifies that the indexer can:
 * 1. Remove documents precisely.
 * 2. Detect orphaned documents via HealthChecker.
 * 3. Repair the index and recover health score.
 */

'use strict';

const { BM25Indexer } = require('../../../.claude/lib/code-indexing/bm25-indexer.cjs');
const { BM25HealthChecker } = require('../../../.claude/lib/code-indexing/bm25-health.cjs');

async function testMaintenance() {
  console.log('BM25 Maintenance Tests');
  console.log('======================');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.log(`[FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  await test('should remove documents and update statistics', () => {
    const indexer = new BM25Indexer();
    indexer.addDocuments([
      { id: 'doc1', text: 'hello world' },
      { id: 'doc2', text: 'foo bar' },
    ]);

    if (indexer.N !== 2) throw new Error('Initial N should be 2');

    indexer.removeDocument('doc1');
    if (indexer.N !== 1) throw new Error(`N should be 1 after removal, got ${indexer.N}`);
    if (indexer.documents[0].id !== 'doc2') throw new Error('Wrong document remains');
  });

  await test('should detect and repair orphaned documents', () => {
    const indexer = new BM25Indexer();
    indexer.addDocuments([
      { id: 'doc1', text: 'hello' },
      { id: 'doc2', text: 'world' },
      { id: 'doc3', text: 'orphaned' },
    ]);

    const checker = new BM25HealthChecker(indexer);
    const validIds = ['doc1', 'doc2'];

    const report = checker.check(validIds);
    if (report.orphanedCount !== 1) throw new Error('Should detect 1 orphaned doc');
    if (report.status !== 'degraded') throw new Error('Should be degraded');

    const repairResult = checker.repair(validIds);
    if (repairResult.repairedCount !== 1) throw new Error('Should have repaired 1 doc');
    if (repairResult.finalHealth.status !== 'healthy')
      throw new Error('Should be healthy after repair');
  });

  console.log(`
Result: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

testMaintenance();
