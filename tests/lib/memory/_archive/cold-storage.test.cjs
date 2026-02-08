#!/usr/bin/env node
/**
 * Cold Storage Tests - LTM retention + cold archiving
 * ==================================================
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const coldStorage = require('../../../.claude/lib/memory/cold-storage.cjs');

const TEST_PROJECT_ROOT = path.join(__dirname, '..', '.test-memory', '.test-cold-storage');
const MEMORY_DIR = path.join(TEST_PROJECT_ROOT, '.claude', 'context', 'memory');
const LTM_DIR = path.join(MEMORY_DIR, 'ltm');

function setupTestDir() {
  if (fs.existsSync(TEST_PROJECT_ROOT)) {
    fs.rmSync(TEST_PROJECT_ROOT, { recursive: true });
  }
  fs.mkdirSync(LTM_DIR, { recursive: true });
}

function cleanupTestDir() {
  if (fs.existsSync(TEST_PROJECT_ROOT)) {
    fs.rmSync(TEST_PROJECT_ROOT, { recursive: true });
  }
}

function writeSummary(name, createdAtIso, extra = {}) {
  const obj = {
    type: 'session_summary',
    date_range: { start: createdAtIso.slice(0, 10), end: createdAtIso.slice(0, 10) },
    session_count: 2,
    session_ids: ['a', 'b'],
    key_learnings: ['one', 'two'],
    created_at: createdAtIso,
    ...extra,
  };
  fs.writeFileSync(path.join(LTM_DIR, name), JSON.stringify(obj, null, 2));
}

async function testListLTMSummaries() {
  setupTestDir();
  writeSummary('summary_1.json', '2026-01-01T00:00:00.000Z');
  writeSummary('summary_2.json', '2026-01-02T00:00:00.000Z');

  const list = coldStorage.listLTMSummaries(TEST_PROJECT_ROOT);
  assert.strictEqual(list.length, 2);
  assert.ok(list[0].name.startsWith('summary_'));
  cleanupTestDir();
}

async function testArchiveByCountColdEnabled() {
  setupTestDir();

  for (let i = 0; i < 6; i++) {
    writeSummary(
      `summary_${String(i).padStart(3, '0')}.json`,
      `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`
    );
  }

  const fakeVectorStore = {
    isAvailable: async () => true,
    upsertDocuments: async docs => {
      fakeVectorStore._docs = docs;
    },
    _docs: [],
  };

  const res = await coldStorage.archiveOldLTM(TEST_PROJECT_ROOT, {
    maxSummaries: 3,
    coldEnable: true,
    coldDir: path.join(MEMORY_DIR, 'cold'),
    indexIntoLanceDb: true,
    vectorStore: fakeVectorStore,
  });

  assert.strictEqual(res.archived, 3);
  assert.strictEqual(res.deleted, 3);
  assert.strictEqual(res.coldPaths.length, 1);
  assert.strictEqual(res.indexed, 3);
  assert.strictEqual(fakeVectorStore._docs.length, 3);
  for (const d of fakeVectorStore._docs) {
    assert.strictEqual(d.metadata.source, 'ltm_archive');
    assert.strictEqual(d.metadata.tier, 'cold');
    assert.ok(d.metadata.coldPath);
  }

  // Verify LTM now has only 3 summaries.
  const remaining = fs.readdirSync(LTM_DIR).filter(f => f.endsWith('.json'));
  assert.strictEqual(remaining.length, 3);

  // Verify cold archive file exists and is gz.
  assert.ok(fs.existsSync(res.coldPaths[0]));
  assert.ok(String(res.coldPaths[0]).endsWith('.jsonl.gz'));

  cleanupTestDir();
}

async function testArchiveColdDisabledDeletesOnly() {
  setupTestDir();

  for (let i = 0; i < 4; i++) {
    writeSummary(
      `summary_${String(i).padStart(3, '0')}.json`,
      `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`
    );
  }

  const res = await coldStorage.archiveOldLTM(TEST_PROJECT_ROOT, {
    maxSummaries: 2,
    coldEnable: false,
    coldDir: path.join(MEMORY_DIR, 'cold'),
    indexIntoLanceDb: true,
  });

  assert.strictEqual(res.archived, 0);
  assert.strictEqual(res.deleted, 2);
  assert.deepStrictEqual(res.coldPaths, []);
  assert.strictEqual(res.indexed, 0);

  const remaining = fs.readdirSync(LTM_DIR).filter(f => f.endsWith('.json'));
  assert.strictEqual(remaining.length, 2);

  cleanupTestDir();
}

async function run() {
  await testListLTMSummaries();
  await testArchiveByCountColdEnabled();
  await testArchiveColdDisabledDeletesOnly();
}

if (require.main === module) {
  run().catch(err => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { run };
