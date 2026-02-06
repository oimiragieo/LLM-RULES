/**
 * Test for parse-chunk-worker fast path (simple chunking for non-code files)
 * Verifies that JSON, YAML, MD, etc. are chunked without tree-sitter parsing
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const parseAndChunk = require('../../../.claude/lib/code-indexing/parse-chunk-worker.cjs');

test('parse-chunk-worker: fast path for JSON files', () => {
  const content = JSON.stringify(
    {
      name: 'test-package',
      version: '1.0.0',
      dependencies: {
        foo: '^1.0.0',
        bar: '^2.0.0',
      },
    },
    null,
    2
  );

  const filePath = '/test/package.json';
  const result = parseAndChunk({ filePath, content, language: 'json' });

  assert.ok(result, 'Should return result');
  assert.strictEqual(result.filePath, filePath);
  assert.ok(result.hash, 'Should have hash');
  assert.ok(Array.isArray(result.chunks), 'Should have chunks array');
  assert.ok(result.chunks.length > 0, 'Should have at least one chunk');

  // Verify chunk structure
  const chunk = result.chunks[0];
  assert.ok(chunk.id, 'Chunk should have id');
  assert.ok(chunk.text, 'Chunk should have text');
  assert.ok(chunk.metadata, 'Chunk should have metadata');
  assert.strictEqual(chunk.metadata.type, 'text_block');
  assert.strictEqual(chunk.metadata.language, 'json');
});

test('parse-chunk-worker: fast path for YAML files', () => {
  const content = `
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: npm test
`;

  const filePath = '/test/.github/workflows/ci.yml';
  const result = parseAndChunk({ filePath, content, language: 'yaml' });

  assert.ok(result.chunks.length > 0);
  assert.strictEqual(result.chunks[0].metadata.type, 'text_block');
});

test('parse-chunk-worker: fast path for Markdown files', () => {
  const content = `
# README

This is a test README.

## Installation

\`\`\`bash
npm install
\`\`\`

## Usage

Import and use:

\`\`\`javascript
const lib = require('lib');
\`\`\`
`;

  const filePath = '/test/README.md';
  const result = parseAndChunk({ filePath, content, language: 'markdown' });

  assert.ok(result.chunks.length > 0);
  assert.strictEqual(result.chunks[0].metadata.type, 'text_block');
});

test('parse-chunk-worker: slow path for JavaScript files', () => {
  const content = `
function add(a, b) {
  return a + b;
}

class Calculator {
  multiply(a, b) {
    return a * b;
  }
}

module.exports = { add, Calculator };
`;

  const filePath = '/test/calculator.js';
  const result = parseAndChunk({ filePath, content, language: 'javascript' });

  assert.ok(result.chunks.length > 0);
  // Should use semantic chunker for JS (not text_block)
  // If tree-sitter works, we get function_declaration/class_declaration
  // If tree-sitter fails, we get mock chunks
  // Either way, not text_block
  const firstChunkType = result.chunks[0].metadata?.type;
  assert.notStrictEqual(
    firstChunkType,
    'text_block',
    'JS files should use semantic chunking, not simple text chunking'
  );
});

test('parse-chunk-worker: fast path for various config files', () => {
  const configFiles = [
    { ext: '.toml', name: 'Cargo.toml' },
    { ext: '.ini', name: 'config.ini' },
    { ext: '.xml', name: 'pom.xml' },
    { ext: '.env', name: '.env' },
    { ext: '.gitignore', name: '.gitignore' },
    { ext: '.lock', name: 'package-lock.json' },
  ];

  for (const { ext, name } of configFiles) {
    const content = 'test content\nline 2\nline 3';
    const filePath = `/test/${name}`;
    const result = parseAndChunk({ filePath, content, language: 'text' });

    assert.ok(result.chunks.length > 0, `${ext} should be chunked`);
    assert.strictEqual(
      result.chunks[0].metadata.type,
      'text_block',
      `${ext} should use simple chunking`
    );
  }
});

test('parse-chunk-worker: chunks large files appropriately', () => {
  // Generate 200 lines of JSON (4 chunks at 50 lines each)
  const lines = [];
  for (let i = 0; i < 200; i++) {
    lines.push(`  "key${i}": "value${i}",`);
  }
  const content = `{\n${lines.join('\n')}\n}`;

  const filePath = '/test/large.json';
  const result = parseAndChunk({ filePath, content, language: 'json' });

  assert.ok(result.chunks.length >= 4, 'Should split large file into multiple chunks');
  assert.ok(result.chunks.length <= 5, 'Should not create too many chunks');
});
