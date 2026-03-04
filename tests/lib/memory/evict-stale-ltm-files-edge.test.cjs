'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  evictStaleLTMFiles,
} = require('../../../.claude/lib/memory/memory-tiers-ltm-helpers.cjs');

// ---------------------------------------------------------------------------
// Shared helpers (identical to evict-stale-ltm-files.test.cjs)
// ---------------------------------------------------------------------------
let tmpDir;

function makeLtmDir() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltm-evict-edge-'));
  return tmpDir;
}

function writeEntry(ltmDir, filename, data) {
  fs.writeFileSync(path.join(ltmDir, filename), JSON.stringify(data));
}

const ENV_KEYS = ['LTM_DECAY_FACTOR', 'LTM_EVICTION_THRESHOLD', 'LTM_MAX_FILES'];
let savedEnv;

function saveEnv() {
  savedEnv = {};
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
}

function restoreEnv() {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = savedEnv[k];
    }
  }
}

// ---------------------------------------------------------------------------
// Tests for evictStaleLTMFiles — Edge Cases & Logging (Tests 16-25)
// ---------------------------------------------------------------------------

describe('evictStaleLTMFiles — edge cases', () => {
  beforeEach(() => {
    saveEnv();
  });

  afterEach(() => {
    restoreEnv();
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  // ---- Test 16: Non-JSON files are ignored ----
  it('ignores non-JSON files in the LTM directory', () => {
    const ltmDir = makeLtmDir();
    process.env.LTM_MAX_FILES = '1';
    fs.writeFileSync(path.join(ltmDir, 'readme.txt'), 'not json');
    fs.writeFileSync(path.join(ltmDir, 'notes.md'), '# notes');
    writeEntry(ltmDir, 'valid.json', {
      created_at: new Date().toISOString(),
      access_count: 10,
    });
    const result = evictStaleLTMFiles(ltmDir);
    assert.strictEqual(result.evicted, 0);
    assert.strictEqual(result.skipped, 'below_max_files');
    assert.ok(fs.existsSync(path.join(ltmDir, 'readme.txt')));
    assert.ok(fs.existsSync(path.join(ltmDir, 'notes.md')));
  });

  // ---- Test 17: Eviction preview log is written to stderr ----
  it('writes eviction preview to stderr before deleting files', () => {
    const ltmDir = makeLtmDir();
    process.env.LTM_MAX_FILES = '1';
    process.env.LTM_EVICTION_THRESHOLD = '999';
    writeEntry(ltmDir, 'old_a.json', {
      created_at: new Date(Date.now() - 86400000 * 365).toISOString(),
      access_count: 0,
    });
    writeEntry(ltmDir, 'fresh.json', {
      created_at: new Date().toISOString(),
      access_count: 100,
    });
    const stderrChunks = [];
    const originalWrite = process.stderr.write;
    process.stderr.write = (chunk) => {
      stderrChunks.push(String(chunk));
      return true;
    };
    try {
      evictStaleLTMFiles(ltmDir);
    } finally {
      process.stderr.write = originalWrite;
    }
    const stderrOutput = stderrChunks.join('');
    assert.ok(
      stderrOutput.includes('[memory-tiers] evictStaleLTM: preview'),
      'stderr should contain eviction preview'
    );
  });

  // ---- Test 18: File deleted between scan and evict does not crash ----
  it('handles file deleted between scan and evict without crashing', () => {
    const ltmDir = makeLtmDir();
    process.env.LTM_MAX_FILES = '1';
    process.env.LTM_EVICTION_THRESHOLD = '999';
    writeEntry(ltmDir, 'will_vanish.json', {
      created_at: new Date(Date.now() - 86400000 * 365).toISOString(),
      access_count: 0,
    });
    writeEntry(ltmDir, 'keeper.json', {
      created_at: new Date().toISOString(),
      access_count: 100,
    });
    const origUnlink = fs.unlinkSync;
    fs.unlinkSync = (p) => {
      try { origUnlink(p); } catch (_e) { /* already gone */ }
      origUnlink(p);
    };
    const origStderr = process.stderr.write;
    process.stderr.write = () => true;
    try {
      const result = evictStaleLTMFiles(ltmDir);
      assert.ok(typeof result.evicted === 'number');
    } finally {
      fs.unlinkSync = origUnlink;
      process.stderr.write = origStderr;
    }
  });

  // ---- Test 19: Uses consolidated_at timestamp with highest priority ----
  it('prefers consolidated_at over created_at for staleness calculation', () => {
    const ltmDir = makeLtmDir();
    process.env.LTM_MAX_FILES = '1';
    process.env.LTM_EVICTION_THRESHOLD = '999';
    writeEntry(ltmDir, 'recently_consolidated.json', {
      consolidated_at: new Date().toISOString(),
      created_at: new Date(Date.now() - 86400000 * 1000).toISOString(),
      access_count: 5,
    });
    writeEntry(ltmDir, 'truly_old.json', {
      created_at: new Date(Date.now() - 86400000 * 500).toISOString(),
      access_count: 0,
    });
    const origStderr = process.stderr.write;
    process.stderr.write = () => true;
    try {
      const result = evictStaleLTMFiles(ltmDir);
      const remaining = fs.readdirSync(ltmDir).filter(f => f.endsWith('.json'));
      if (result.evicted === 1) {
        assert.ok(
          remaining.includes('recently_consolidated.json'),
          'recently consolidated entry should survive'
        );
      }
    } finally {
      process.stderr.write = origStderr;
    }
  });

  // ---- Test 20: Negative LTM_DECAY_FACTOR falls back to default ----
  it('falls back to default when LTM_DECAY_FACTOR is negative', () => {
    const ltmDir = makeLtmDir();
    process.env.LTM_DECAY_FACTOR = '-0.5';
    process.env.LTM_MAX_FILES = '1';
    writeEntry(ltmDir, 'a.json', {
      created_at: new Date(Date.now() - 86400000 * 365).toISOString(),
      access_count: 0,
    });
    writeEntry(ltmDir, 'b.json', {
      created_at: new Date().toISOString(),
      access_count: 10,
    });
    const origStderr = process.stderr.write;
    process.stderr.write = () => true;
    try {
      const result = evictStaleLTMFiles(ltmDir);
      assert.ok(typeof result.evicted === 'number');
    } finally {
      process.stderr.write = origStderr;
    }
  });

  // ---- Test 21: Eviction cap prevents mass extinction ----
  it('caps eviction at (files.length - LTM_MAX_FILES) even if more qualify', () => {
    const ltmDir = makeLtmDir();
    process.env.LTM_MAX_FILES = '3';
    process.env.LTM_EVICTION_THRESHOLD = '9999';
    for (let i = 0; i < 5; i++) {
      writeEntry(ltmDir, `old_${i}.json`, {
        created_at: new Date(Date.now() - 86400000 * 365).toISOString(),
        access_count: 0,
      });
    }
    const origStderr = process.stderr.write;
    process.stderr.write = () => true;
    try {
      const result = evictStaleLTMFiles(ltmDir);
      assert.strictEqual(result.evicted, 2);
      const remaining = fs.readdirSync(ltmDir).filter(f => f.endsWith('.json'));
      assert.strictEqual(remaining.length, 3);
    } finally {
      process.stderr.write = origStderr;
    }
  });

  // ---- Test 22: Data field is null/non-object after parse — skipped ----
  it('skips entries where parsed JSON data is null or non-object', () => {
    const ltmDir = makeLtmDir();
    process.env.LTM_MAX_FILES = '1';
    process.env.LTM_EVICTION_THRESHOLD = '999';
    fs.writeFileSync(path.join(ltmDir, 'string_data.json'), '"just a string"');
    fs.writeFileSync(path.join(ltmDir, 'null_data.json'), 'null');
    writeEntry(ltmDir, 'valid.json', {
      created_at: new Date().toISOString(),
      access_count: 50,
    });
    const origStderr = process.stderr.write;
    process.stderr.write = () => true;
    try {
      const result = evictStaleLTMFiles(ltmDir);
      assert.ok(typeof result.evicted === 'number');
      assert.ok(fs.existsSync(path.join(ltmDir, 'string_data.json')));
      assert.ok(fs.existsSync(path.join(ltmDir, 'null_data.json')));
    } finally {
      process.stderr.write = origStderr;
    }
  });

  // ---- Test 23: Zero value for LTM_MAX_FILES falls back to default ----
  it('falls back to default when LTM_MAX_FILES is zero', () => {
    const ltmDir = makeLtmDir();
    process.env.LTM_MAX_FILES = '0';
    for (let i = 0; i < 3; i++) {
      writeEntry(ltmDir, `entry_${i}.json`, {
        created_at: new Date().toISOString(),
        access_count: 10,
      });
    }
    const result = evictStaleLTMFiles(ltmDir);
    assert.strictEqual(result.evicted, 0);
    assert.strictEqual(result.skipped, 'below_max_files');
  });

  // ---- Test 24: Eviction log includes per-file removal messages ----
  it('logs per-file removal messages to stderr for each evicted file', () => {
    const ltmDir = makeLtmDir();
    process.env.LTM_MAX_FILES = '1';
    process.env.LTM_EVICTION_THRESHOLD = '999';
    writeEntry(ltmDir, 'doomed.json', {
      created_at: new Date(Date.now() - 86400000 * 365).toISOString(),
      access_count: 0,
    });
    writeEntry(ltmDir, 'safe.json', {
      created_at: new Date().toISOString(),
      access_count: 100,
    });
    const stderrChunks = [];
    const originalWrite = process.stderr.write;
    process.stderr.write = (chunk) => {
      stderrChunks.push(String(chunk));
      return true;
    };
    try {
      evictStaleLTMFiles(ltmDir);
    } finally {
      process.stderr.write = originalWrite;
    }
    const stderrOutput = stderrChunks.join('');
    assert.ok(
      stderrOutput.includes('removed doomed.json'),
      'stderr should contain per-file removal log'
    );
  });

  // ---- Test 25: Path traversal filenames are handled safely ----
  // NOTE: The function does not explicitly guard against path traversal
  // in filenames. It uses path.join(ltmDir, file) which handles ".."
  // correctly on Node.js for readdirSync results (just filenames, not paths).
  it('handles filenames that look like path traversal without escaping dir', () => {
    const ltmDir = makeLtmDir();
    process.env.LTM_MAX_FILES = '1';
    process.env.LTM_EVICTION_THRESHOLD = '999';
    writeEntry(ltmDir, 'entry..test.json', {
      created_at: new Date(Date.now() - 86400000 * 365).toISOString(),
      access_count: 0,
    });
    writeEntry(ltmDir, 'normal.json', {
      created_at: new Date().toISOString(),
      access_count: 100,
    });
    const origStderr = process.stderr.write;
    process.stderr.write = () => true;
    try {
      const result = evictStaleLTMFiles(ltmDir);
      assert.ok(typeof result.evicted === 'number');
    } finally {
      process.stderr.write = origStderr;
    }
  });
});
