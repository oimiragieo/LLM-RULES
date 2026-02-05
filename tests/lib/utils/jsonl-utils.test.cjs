'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { appendJsonl, trimJsonlFile } = require('../../../.claude/lib/utils/jsonl-utils.cjs');

test('trimJsonlFile keeps last N lines when file exceeds maxLines', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonl-trim-'));
  const filePath = path.join(tempDir, 'test.jsonl');

  try {
    // Create a file with 10 lines
    const lines = Array.from({ length: 10 }, (_, i) => JSON.stringify({ n: i + 1 }));
    fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');

    // Trim to 5 lines
    trimJsonlFile(filePath, 5);

    // Read and verify
    const content = fs.readFileSync(filePath, 'utf8');
    const remaining = content.trim().split('\n');

    assert.equal(remaining.length, 5, 'Should have exactly 5 lines');
    assert.deepEqual(
      remaining.map(l => JSON.parse(l).n),
      [6, 7, 8, 9, 10],
      'Should keep the last 5 lines'
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('trimJsonlFile does nothing when file is under maxLines', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonl-trim-'));
  const filePath = path.join(tempDir, 'test.jsonl');

  try {
    // Create a file with 5 lines
    const lines = Array.from({ length: 5 }, (_, i) => JSON.stringify({ n: i + 1 }));
    fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');

    // Try to trim to 10 lines (no-op since we only have 5)
    trimJsonlFile(filePath, 10);

    // Read and verify - should be unchanged
    const content = fs.readFileSync(filePath, 'utf8');
    const remaining = content.trim().split('\n');

    assert.equal(remaining.length, 5, 'Should still have 5 lines');
    assert.deepEqual(
      remaining.map(l => JSON.parse(l).n),
      [1, 2, 3, 4, 5],
      'Lines should be unchanged'
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('trimJsonlFile handles non-existent file gracefully', () => {
  // Should not throw for non-existent file
  trimJsonlFile('/non/existent/path.jsonl', 100);
});

test('trimJsonlFile handles invalid maxLines gracefully', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonl-trim-'));
  const filePath = path.join(tempDir, 'test.jsonl');

  try {
    // Create a file with 5 lines
    const lines = Array.from({ length: 5 }, (_, i) => JSON.stringify({ n: i + 1 }));
    fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');

    // Try with invalid values
    trimJsonlFile(filePath, 0);
    trimJsonlFile(filePath, -1);
    trimJsonlFile(filePath, null);
    trimJsonlFile(filePath, undefined);

    // File should be unchanged
    const content = fs.readFileSync(filePath, 'utf8');
    const remaining = content.trim().split('\n');

    assert.equal(remaining.length, 5, 'Should still have 5 lines');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('appendJsonl with maxLines option trims file after append', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonl-append-'));
  const filePath = path.join(tempDir, 'test.jsonl');

  try {
    // Append 10 entries with maxLines = 5
    for (let i = 1; i <= 10; i++) {
      appendJsonl(filePath, { n: i }, { maxLines: 5 });
    }

    // Read and verify
    const content = fs.readFileSync(filePath, 'utf8');
    const remaining = content.trim().split('\n');

    assert.equal(remaining.length, 5, 'Should have exactly 5 lines');
    assert.deepEqual(
      remaining.map(l => JSON.parse(l).n),
      [6, 7, 8, 9, 10],
      'Should keep the last 5 entries'
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
