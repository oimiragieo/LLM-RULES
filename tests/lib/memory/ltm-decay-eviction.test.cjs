#!/usr/bin/env node
/**
 * LTM Decay Eviction Tests
 * ========================
 *
 * Tests for evictStaleLTM() from memory-tiers.cjs:
 * 1. Does NOT evict when LTM file count is below LTM_MAX_FILES threshold
 * 2. Evicts stale entries (old consolidated_at, low access_count) above threshold
 * 3. Preserves recent entries (new consolidated_at, high access_count) above threshold
 * 4. Handles missing access_count field (treat as 0 = stalest)
 * 5. Handles missing timestamp fields (treat as oldest possible)
 * 6. Empty LTM directory returns without error
 * 7. Returns count of evicted files
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

let TEST_DIR;
let savedEnv;

function setup() {
  TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ltm-decay-'));
  const ltmDir = path.join(TEST_DIR, '.claude', 'context', 'memory', 'ltm');
  fs.mkdirSync(ltmDir, { recursive: true });
  savedEnv = {
    LTM_DECAY_FACTOR: process.env.LTM_DECAY_FACTOR,
    LTM_EVICTION_THRESHOLD: process.env.LTM_EVICTION_THRESHOLD,
    LTM_MAX_FILES: process.env.LTM_MAX_FILES,
  };
  // Set low max to trigger eviction logic
  process.env.LTM_MAX_FILES = '3';
  delete process.env.LTM_DECAY_FACTOR;
  delete process.env.LTM_EVICTION_THRESHOLD;
}

function cleanup() {
  if (savedEnv) {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
  if (TEST_DIR && fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

function getLtmDir() {
  return path.join(TEST_DIR, '.claude', 'context', 'memory', 'ltm');
}

function writeLtmFile(name, data) {
  fs.writeFileSync(path.join(getLtmDir(), name), JSON.stringify(data));
}

function getEvictStaleLTM() {
  const modPath = require.resolve('../../../.claude/lib/memory/memory-tiers.cjs');
  delete require.cache[modPath];
  return require(modPath).evictStaleLTM;
}

describe('evictStaleLTM', () => {
  beforeEach(() => setup());
  afterEach(() => cleanup());

  it('does NOT evict when file count is below LTM_MAX_FILES', () => {
    process.env.LTM_MAX_FILES = '10';
    const evict = getEvictStaleLTM();
    // Write only 2 files (below threshold of 10)
    writeLtmFile('a.json', { access_count: 0, consolidated_at: '2025-01-01T00:00:00Z' });
    writeLtmFile('b.json', { access_count: 0, consolidated_at: '2025-01-01T00:00:00Z' });
    const result = evict(TEST_DIR);
    assert.strictEqual(result.evicted, 0);
    assert.strictEqual(result.skipped, 'below_max_files');
    const remaining = fs.readdirSync(getLtmDir());
    assert.strictEqual(remaining.length, 2);
  });

  it('evicts stale entries with old timestamp and low access_count', () => {
    const evict = getEvictStaleLTM();
    const now = new Date();
    const oldDate = new Date(now - 365 * 86400000).toISOString();
    // Write 5 files (above LTM_MAX_FILES=3) with old dates and 0 access
    for (let i = 0; i < 5; i++) {
      writeLtmFile(`stale_${i}.json`, { access_count: 0, consolidated_at: oldDate });
    }
    const result = evict(TEST_DIR);
    // All 5 should be evicted: utility = 0 * (1/(1 + 365*0.05)) = 0 < 0.1
    assert.strictEqual(result.evicted, 5);
    const remaining = fs.readdirSync(getLtmDir()).filter(f => f.endsWith('.json'));
    assert.strictEqual(remaining.length, 0);
  });

  it('preserves recent entries with high access_count', () => {
    const evict = getEvictStaleLTM();
    const now = new Date();
    const recentDate = new Date(now - 1 * 86400000).toISOString();
    const oldDate = new Date(now - 500 * 86400000).toISOString();
    // 2 high-utility files (recent + high access)
    writeLtmFile('keep_a.json', { access_count: 100, consolidated_at: recentDate });
    writeLtmFile('keep_b.json', { access_count: 50, consolidated_at: recentDate });
    // 3 low-utility files (old + 0 access)
    writeLtmFile('evict_1.json', { access_count: 0, consolidated_at: oldDate });
    writeLtmFile('evict_2.json', { access_count: 0, consolidated_at: oldDate });
    writeLtmFile('evict_3.json', { access_count: 0, consolidated_at: oldDate });
    const result = evict(TEST_DIR);
    assert.strictEqual(result.evicted, 3, 'Should evict 3 stale files');
    const remaining = fs.readdirSync(getLtmDir()).filter(f => f.endsWith('.json'));
    assert.strictEqual(remaining.length, 2, 'Should preserve 2 high-utility files');
    assert.ok(remaining.includes('keep_a.json'));
    assert.ok(remaining.includes('keep_b.json'));
  });

  it('treats missing access_count as 0 (stalest)', () => {
    const evict = getEvictStaleLTM();
    const now = new Date();
    const oldDate = new Date(now - 200 * 86400000).toISOString();
    // 4 files without access_count field, old dates
    for (let i = 0; i < 4; i++) {
      writeLtmFile(`no_ac_${i}.json`, { consolidated_at: oldDate, summary: 'test' });
    }
    const result = evict(TEST_DIR);
    // utility = 0 * anything = 0 < 0.1 threshold -> all evicted
    assert.strictEqual(result.evicted, 4);
  });

  it('treats missing timestamp as oldest possible (Infinity staleness)', () => {
    const evict = getEvictStaleLTM();
    // 4 files with access_count but no timestamp
    for (let i = 0; i < 4; i++) {
      writeLtmFile(`no_ts_${i}.json`, { access_count: 5, summary: 'data' });
    }
    const result = evict(TEST_DIR);
    // stalenessDays = Infinity -> utility = 5 * (1/(1+Inf*0.05)) = 5 * 0 = 0 < 0.1
    assert.strictEqual(result.evicted, 4);
  });

  it('returns without error when LTM directory is empty', () => {
    const evict = getEvictStaleLTM();
    // LTM dir exists but is empty
    const result = evict(TEST_DIR);
    assert.strictEqual(result.evicted, 0);
  });

  it('returns count of evicted files in result object', () => {
    const evict = getEvictStaleLTM();
    const now = new Date();
    const oldDate = new Date(now - 300 * 86400000).toISOString();
    writeLtmFile('e1.json', { access_count: 0, consolidated_at: oldDate });
    writeLtmFile('e2.json', { access_count: 0, consolidated_at: oldDate });
    writeLtmFile('e3.json', { access_count: 0, consolidated_at: oldDate });
    writeLtmFile('keep.json', { access_count: 200, consolidated_at: new Date().toISOString() });
    const result = evict(TEST_DIR);
    assert.strictEqual(typeof result.evicted, 'number');
    assert.strictEqual(result.evicted, 3);
  });
});
