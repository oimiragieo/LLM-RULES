#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  deduplicateAgainstMemory,
} = require('../../.claude/skills/token-saver-context-compression/scripts/main.cjs');

function makeTempMemoryDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'token-saver-dedup-'));
}

test('filters out records that exactly match existing patterns', () => {
  const dir = makeTempMemoryDir();
  fs.writeFileSync(
    path.join(dir, 'patterns.json'),
    JSON.stringify([{ text: 'Use canonical transition validation' }]),
    'utf8'
  );

  const records = {
    patterns: [
      { text: 'Use canonical transition validation', timestamp: '2026-01-01', source: 'test' },
      { text: 'Brand new pattern here', timestamp: '2026-01-01', source: 'test' },
    ],
    gotchas: [],
    issues: [],
    decisions: [],
  };

  const { dedupedRecords } = deduplicateAgainstMemory(records, dir);

  assert.equal(dedupedRecords.patterns.length, 1);
  assert.equal(dedupedRecords.patterns[0].text, 'Brand new pattern here');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('filters out records that exactly match existing gotchas', () => {
  const dir = makeTempMemoryDir();
  fs.writeFileSync(
    path.join(dir, 'gotchas.json'),
    JSON.stringify([{ text: 'Avoid shell: true for spawn' }]),
    'utf8'
  );

  const records = {
    patterns: [],
    gotchas: [
      { text: 'Avoid shell: true for spawn', timestamp: '2026-01-01', source: 'test' },
      { text: 'New gotcha about path handling', timestamp: '2026-01-01', source: 'test' },
    ],
    issues: [],
    decisions: [],
  };

  const { dedupedRecords } = deduplicateAgainstMemory(records, dir);

  assert.equal(dedupedRecords.gotchas.length, 1);
  assert.equal(dedupedRecords.gotchas[0].text, 'New gotcha about path handling');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('keeps records that are genuinely new', () => {
  const dir = makeTempMemoryDir();
  fs.writeFileSync(
    path.join(dir, 'patterns.json'),
    JSON.stringify([{ text: 'Existing pattern X' }]),
    'utf8'
  );
  fs.writeFileSync(
    path.join(dir, 'gotchas.json'),
    JSON.stringify([{ text: 'Existing gotcha Y' }]),
    'utf8'
  );

  const records = {
    patterns: [{ text: 'Completely new pattern', timestamp: '2026-01-01', source: 'test' }],
    gotchas: [{ text: 'Completely new gotcha', timestamp: '2026-01-01', source: 'test' }],
    issues: [{ text: 'Some issue', timestamp: '2026-01-01', source: 'test' }],
    decisions: [{ text: 'Some decision', timestamp: '2026-01-01', source: 'test' }],
  };

  const { dedupedRecords } = deduplicateAgainstMemory(records, dir);

  assert.equal(dedupedRecords.patterns.length, 1);
  assert.equal(dedupedRecords.gotchas.length, 1);
  assert.equal(dedupedRecords.issues.length, 1);
  assert.equal(dedupedRecords.decisions.length, 1);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('handles empty existing memory gracefully', () => {
  const dir = makeTempMemoryDir();
  // No patterns.json or gotchas.json created — directory is empty

  const records = {
    patterns: [{ text: 'Pattern A', timestamp: '2026-01-01', source: 'test' }],
    gotchas: [{ text: 'Gotcha B', timestamp: '2026-01-01', source: 'test' }],
    issues: [],
    decisions: [],
  };

  const { dedupedRecords } = deduplicateAgainstMemory(records, dir);

  assert.equal(dedupedRecords.patterns.length, 1);
  assert.equal(dedupedRecords.gotchas.length, 1);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('handles corrupt patterns.json gracefully', () => {
  const dir = makeTempMemoryDir();
  fs.writeFileSync(path.join(dir, 'patterns.json'), '{{{not valid json!!!', 'utf8');
  fs.writeFileSync(
    path.join(dir, 'gotchas.json'),
    JSON.stringify([{ text: 'Valid gotcha' }]),
    'utf8'
  );

  const records = {
    patterns: [{ text: 'Pattern C', timestamp: '2026-01-01', source: 'test' }],
    gotchas: [{ text: 'Valid gotcha', timestamp: '2026-01-01', source: 'test' }],
    issues: [],
    decisions: [],
  };

  const { dedupedRecords } = deduplicateAgainstMemory(records, dir);

  // Corrupt patterns.json → keeps all patterns
  assert.equal(dedupedRecords.patterns.length, 1);
  // Valid gotchas.json still filters
  assert.equal(dedupedRecords.gotchas.length, 0);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('dedup is case-insensitive', () => {
  const dir = makeTempMemoryDir();
  fs.writeFileSync(
    path.join(dir, 'patterns.json'),
    JSON.stringify([{ text: 'Use shell: false' }]),
    'utf8'
  );

  const records = {
    patterns: [{ text: 'use shell: false', timestamp: '2026-01-01', source: 'test' }],
    gotchas: [],
    issues: [],
    decisions: [],
  };

  const { dedupedRecords } = deduplicateAgainstMemory(records, dir);

  assert.equal(dedupedRecords.patterns.length, 0);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('returns dedup stats', () => {
  const dir = makeTempMemoryDir();
  fs.writeFileSync(
    path.join(dir, 'patterns.json'),
    JSON.stringify([{ text: 'Existing pattern' }]),
    'utf8'
  );
  fs.writeFileSync(
    path.join(dir, 'gotchas.json'),
    JSON.stringify([{ text: 'Existing gotcha' }]),
    'utf8'
  );

  const records = {
    patterns: [
      { text: 'Existing pattern', timestamp: '2026-01-01', source: 'test' },
      { text: 'New pattern', timestamp: '2026-01-01', source: 'test' },
    ],
    gotchas: [{ text: 'Existing gotcha', timestamp: '2026-01-01', source: 'test' }],
    issues: [{ text: 'An issue', timestamp: '2026-01-01', source: 'test' }],
    decisions: [],
  };

  const { stats } = deduplicateAgainstMemory(records, dir);

  assert.equal(stats.total, 4);
  assert.equal(stats.kept, 2);
  assert.equal(stats.filtered, 2);

  fs.rmSync(dir, { recursive: true, force: true });
});
