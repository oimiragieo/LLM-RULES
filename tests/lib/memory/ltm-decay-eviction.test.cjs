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
  const helperPath = require.resolve('../../../.claude/lib/memory/memory-tiers-ltm-helpers.cjs');
  delete require.cache[modPath];
  delete require.cache[helperPath];
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
    // Mass extinction cap: can evict at most (5 - 3) = 2 files even though all are stale
    // utility = 1 * (1/(1 + 365*0.05)) = 1/19.25 ≈ 0.052 < 0.1 (all are eviction candidates)
    assert.strictEqual(
      result.evicted,
      2,
      'Mass extinction cap: evict at most files.length - LTM_MAX_FILES = 2'
    );
    const remaining = fs.readdirSync(getLtmDir()).filter(f => f.endsWith('.json'));
    assert.strictEqual(remaining.length, 3, 'Must preserve at least LTM_MAX_FILES=3 files');
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
    // 5 total files, LTM_MAX_FILES=3 → cap = 5-3 = 2 evictions
    // Stale files have utility ≈ 0 (oldest), recent files have high utility → correct 2 evicted
    assert.strictEqual(
      result.evicted,
      2,
      'Mass extinction cap: evict at most files.length - LTM_MAX_FILES = 2'
    );
    const remaining = fs.readdirSync(getLtmDir()).filter(f => f.endsWith('.json'));
    assert.strictEqual(remaining.length, 3, 'Should preserve 3 files (cap = 5-3)');
    // The high-utility files must always survive
    assert.ok(remaining.includes('keep_a.json'), 'keep_a must survive');
    assert.ok(remaining.includes('keep_b.json'), 'keep_b must survive');
  });

  it('treats missing access_count as baseline 1 (still evicts when very stale)', () => {
    const evict = getEvictStaleLTM();
    const now = new Date();
    const oldDate = new Date(now - 200 * 86400000).toISOString();
    // 4 files without access_count field, old dates (200 days)
    for (let i = 0; i < 4; i++) {
      writeLtmFile(`no_ac_${i}.json`, { consolidated_at: oldDate, summary: 'test' });
    }
    const result = evict(TEST_DIR);
    // utility = 1 * (1 / (1 + 200*0.05)) = 1/11 ≈ 0.0909 < 0.1 threshold -> candidates for eviction
    // (access_count=0 is raised to baseline 1, not 0, but entry is still stale enough)
    // Mass extinction cap: 4 files, LTM_MAX_FILES=3 → cap = 4-3 = 1
    assert.strictEqual(result.evicted, 1, 'Mass extinction cap: evict at most 4-3=1 file');
  });

  it('never evicts promoted_*.json files even when above LTM_MAX_FILES', () => {
    const evict = getEvictStaleLTM();
    const now = new Date();
    const oldDate = new Date(now - 500 * 86400000).toISOString();
    // 2 promoted files with old timestamps and zero access — must NEVER be deleted
    writeLtmFile('promoted_important.json', { access_count: 0, consolidated_at: oldDate });
    writeLtmFile('promoted_critical.json', { access_count: 0, consolidated_at: oldDate });
    // 3 regular stale files that should be evicted
    writeLtmFile('summary_old_1.json', { access_count: 0, consolidated_at: oldDate });
    writeLtmFile('summary_old_2.json', { access_count: 0, consolidated_at: oldDate });
    writeLtmFile('summary_old_3.json', { access_count: 0, consolidated_at: oldDate });
    const result = evict(TEST_DIR);
    // Mass extinction cap: 5 total files, LTM_MAX_FILES=3 → cap = 5-3 = 2 evictions
    // Promoted files are never candidates. 3 stale regular files are candidates.
    // Cap limits eviction to 2 (not 3) of the stale files.
    assert.strictEqual(result.evicted, 2, 'Mass extinction cap limits eviction to 5-3=2 files');
    const remaining = fs.readdirSync(getLtmDir()).filter(f => f.endsWith('.json'));
    assert.strictEqual(remaining.length, 3, 'Should preserve 3 files after evicting 2');
    // Promoted files must always survive
    assert.ok(
      remaining.includes('promoted_important.json'),
      'promoted_important.json must survive'
    );
    assert.ok(remaining.includes('promoted_critical.json'), 'promoted_critical.json must survive');
  });

  it('uses file mtime for missing timestamp — recently written files are preserved', () => {
    const evict = getEvictStaleLTM();
    // 4 files with access_count but no timestamp — written just now → mtime is "today"
    for (let i = 0; i < 4; i++) {
      writeLtmFile(`no_ts_${i}.json`, { access_count: 5, summary: 'data' });
    }
    const result = evict(TEST_DIR);
    // Fix 3 (mtime fallback): mtime ≈ now → stalenessDays ≈ 0 → utility ≈ 5 >> 0.1 → NOT evicted
    // Previously (before Fix 3): stalenessDays = Infinity → utility = 0 → all evicted (BUG)
    assert.strictEqual(
      result.evicted,
      0,
      'Files with no timestamp but recent mtime must NOT be evicted'
    );
    const remaining = fs.readdirSync(getLtmDir()).filter(f => f.endsWith('.json'));
    assert.strictEqual(
      remaining.length,
      4,
      'All 4 recently-created files must survive via mtime fallback'
    );
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
    // 4 files, LTM_MAX_FILES=3 → cap = 4-3 = 1 eviction
    // e1/e2/e3 are stale candidates, keep.json is not (high utility)
    // Only 1 stale file can be evicted due to cap
    assert.strictEqual(typeof result.evicted, 'number');
    assert.strictEqual(result.evicted, 1, 'Mass extinction cap: evict at most 4-3=1 file');
  });

  // ===== Fix 1: P0 NaN Guard — env var validation =====

  it('NaN guard: uses default DECAY_FACTOR (0.05) when env var is invalid string', () => {
    process.env.LTM_DECAY_FACTOR = 'not-a-number';
    process.env.LTM_MAX_FILES = '1'; // Use low max so cap = 4-1 = 3, allowing more evictions
    const evict = getEvictStaleLTM();
    const now = new Date();
    // With valid decay=0.05, a 365-day-old file with access=1 has utility ~0.052 < 0.1 → evicted
    // With NaN decay, 1/(1 + 365*NaN) = 1/NaN = NaN, utility = NaN, NaN < 0.1 is false → NOT evicted (BUG)
    // So: if NaN guard is MISSING → 0 evictions; if PRESENT → up to cap evictions
    const oldDate = new Date(now - 365 * 86400000).toISOString();
    for (let i = 0; i < 4; i++) {
      writeLtmFile(`nan_decay_${i}.json`, { access_count: 0, consolidated_at: oldDate });
    }
    const result = evict(TEST_DIR);
    // With correct NaN guard: falls back to 0.05 → stale files evicted (capped at 4-1=3)
    // Without NaN guard: utility=NaN → nothing evicted
    assert.ok(
      result.evicted >= 1,
      `NaN guard must fall back to default DECAY_FACTOR=0.05 and evict stale files, got ${result.evicted}`
    );
  });

  it('NaN guard: uses default EVICTION_THRESHOLD (0.1) when env var is invalid string', () => {
    process.env.LTM_EVICTION_THRESHOLD = 'bad-value';
    process.env.LTM_MAX_FILES = '1'; // Low max so cap allows evictions
    const evict = getEvictStaleLTM();
    const now = new Date();
    const oldDate = new Date(now - 365 * 86400000).toISOString();
    for (let i = 0; i < 4; i++) {
      writeLtmFile(`nan_thresh_${i}.json`, { access_count: 0, consolidated_at: oldDate });
    }
    const result = evict(TEST_DIR);
    // With invalid threshold, NaN comparison (utility < NaN) always false → no eviction (BUG)
    // With NaN guard, falls back to 0.1 → files with utility=0.052 < 0.1 are evicted (CORRECT)
    assert.ok(
      result.evicted >= 1,
      `NaN guard must fall back to default EVICTION_THRESHOLD=0.1 and evict stale files, got ${result.evicted}`
    );
  });

  it('NaN guard: uses default LTM_MAX_FILES (50) when env var is NaN', () => {
    process.env.LTM_MAX_FILES = 'garbage';
    const evict = getEvictStaleLTM();
    // With NaN max_files, files.length <= NaN is false → eviction proceeds (accidental)
    // With NaN guard, falls back to 50 → with only 2 files, should skip (below_max_files)
    writeLtmFile('a.json', { access_count: 0, consolidated_at: '2025-01-01T00:00:00Z' });
    writeLtmFile('b.json', { access_count: 0, consolidated_at: '2025-01-01T00:00:00Z' });
    const result = evict(TEST_DIR);
    // 2 files < 50 default → should be skipped
    assert.strictEqual(result.evicted, 0, 'NaN guard must fall back to LTM_MAX_FILES=50');
    assert.strictEqual(
      result.skipped,
      'below_max_files',
      'Must return skipped=below_max_files when below default max'
    );
  });

  // ===== Fix 2: P0 Mass Extinction Cap =====

  it('mass extinction cap: never evicts more than (files.length - LTM_MAX_FILES) entries', () => {
    // LTM_MAX_FILES=3, total files=7 → max evictable = 7-3 = 4
    process.env.LTM_MAX_FILES = '3';
    const evict = getEvictStaleLTM();
    const now = new Date();
    const oldDate = new Date(now - 500 * 86400000).toISOString();
    // 7 stale files — all have utility below threshold
    for (let i = 0; i < 7; i++) {
      writeLtmFile(`mass_${i}.json`, { access_count: 0, consolidated_at: oldDate });
    }
    const result = evict(TEST_DIR);
    // Cap: can only evict 7-3=4 max, even though all 7 are stale
    assert.ok(result.evicted <= 4, `Must cap eviction at 4, but evicted ${result.evicted}`);
    const remaining = fs.readdirSync(getLtmDir()).filter(f => f.endsWith('.json'));
    assert.ok(
      remaining.length >= 3,
      `Must keep at least LTM_MAX_FILES=3 files, found ${remaining.length}`
    );
  });

  it('mass extinction cap: evicts lowest-utility files first when capped', () => {
    // LTM_MAX_FILES=3, 6 files total → cap at 3 evictions
    process.env.LTM_MAX_FILES = '3';
    const evict = getEvictStaleLTM();
    const now = new Date();
    const veryOldDate = new Date(now - 800 * 86400000).toISOString(); // very stale
    const oldDate = new Date(now - 400 * 86400000).toISOString(); // moderately stale
    const recentDate = new Date(now - 30 * 86400000).toISOString(); // recent
    // 3 very-stale files (should be evicted first)
    writeLtmFile('worst_a.json', { access_count: 0, consolidated_at: veryOldDate });
    writeLtmFile('worst_b.json', { access_count: 0, consolidated_at: veryOldDate });
    writeLtmFile('worst_c.json', { access_count: 0, consolidated_at: veryOldDate });
    // 2 moderately-stale (may be evicted)
    writeLtmFile('mid_a.json', { access_count: 1, consolidated_at: oldDate });
    writeLtmFile('mid_b.json', { access_count: 1, consolidated_at: oldDate });
    // 1 recent (should be kept)
    writeLtmFile('recent.json', { access_count: 10, consolidated_at: recentDate });
    const result = evict(TEST_DIR);
    // 6 files, max_files=3 → cap = 3 evictions
    assert.strictEqual(result.evicted, 3, 'Should evict exactly 3 (cap=6-3=3)');
    const remaining = fs.readdirSync(getLtmDir()).filter(f => f.endsWith('.json'));
    assert.strictEqual(remaining.length, 3, 'Should keep exactly 3 files');
    // The most recent file must survive
    assert.ok(remaining.includes('recent.json'), 'Most recent file must be preserved');
    // The worst files should have been evicted
    assert.ok(!remaining.includes('worst_a.json'), 'worst_a must be evicted');
    assert.ok(!remaining.includes('worst_b.json'), 'worst_b must be evicted');
    assert.ok(!remaining.includes('worst_c.json'), 'worst_c must be evicted');
  });

  // ===== Fix 3: P1 File mtime Fallback =====

  it('mtime fallback: uses file mtime when no timestamp fields present', () => {
    // Write a file with no timestamp fields — mtime will be "just now"
    // So staleness will be ~0 → high utility → should NOT be evicted
    process.env.LTM_MAX_FILES = '3';
    const evict = getEvictStaleLTM();
    const now = new Date();
    const oldDate = new Date(now - 500 * 86400000).toISOString();
    // 3 very old stale files with explicit old timestamps
    writeLtmFile('old_1.json', { access_count: 0, consolidated_at: oldDate });
    writeLtmFile('old_2.json', { access_count: 0, consolidated_at: oldDate });
    writeLtmFile('old_3.json', { access_count: 0, consolidated_at: oldDate });
    // 1 file with no timestamp — mtime is "now" → should be treated as recently created, not infinite staleness
    writeLtmFile('no_ts_mtime.json', { access_count: 1, summary: 'data' });
    const result = evict(TEST_DIR);
    const remaining = fs.readdirSync(getLtmDir()).filter(f => f.endsWith('.json'));
    // The no-timestamp file should survive because its mtime is ~0 days old → high utility
    assert.ok(
      remaining.includes('no_ts_mtime.json'),
      'File with no timestamp but recent mtime must be preserved via mtime fallback'
    );
  });

  // ===== Fix 4: P2 Eviction Preview Log =====

  it('preview log: emits warning to stderr listing files to be evicted before deletion', () => {
    const evict = getEvictStaleLTM();
    const now = new Date();
    const oldDate = new Date(now - 365 * 86400000).toISOString();
    // Write 4 stale files (above LTM_MAX_FILES=3)
    writeLtmFile('preview_1.json', { access_count: 0, consolidated_at: oldDate });
    writeLtmFile('preview_2.json', { access_count: 0, consolidated_at: oldDate });
    writeLtmFile('preview_3.json', { access_count: 0, consolidated_at: oldDate });
    writeLtmFile('preview_4.json', { access_count: 0, consolidated_at: oldDate });

    // Capture stderr
    const stderrChunks = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk, ...args) => {
      stderrChunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return originalWrite(chunk, ...args);
    };

    try {
      evict(TEST_DIR);
    } finally {
      process.stderr.write = originalWrite;
    }

    const stderrOutput = stderrChunks.join('');
    // Must have a preview/warning line BEFORE deletions listing files to evict
    assert.ok(
      stderrOutput.includes('[memory-tiers] evictStaleLTM: preview'),
      `stderr must contain preview log line, got: ${stderrOutput.slice(0, 200)}`
    );
    // The preview must mention at least one file to be evicted
    assert.ok(
      stderrOutput.includes('preview_'),
      `preview log must name eviction candidates, got: ${stderrOutput.slice(0, 200)}`
    );
  });
});
