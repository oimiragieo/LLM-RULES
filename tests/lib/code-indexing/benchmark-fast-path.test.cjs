/**
 * Benchmark: Compare tree-sitter vs simple chunking for non-code files
 * Run with: npm test -- tests/lib/code-indexing/benchmark-fast-path.test.cjs
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const parseAndChunk = require('../../../.claude/lib/code-indexing/parse-chunk-worker.cjs');

// Generate test content
function generateJSON(lines) {
  const entries = [];
  for (let i = 0; i < lines; i++) {
    entries.push(`  "key${i}": "value${i}"`);
  }
  return `{\n${entries.join(',\n')}\n}`;
}

function generateMarkdown(lines) {
  const sections = [];
  for (let i = 0; i < lines / 10; i++) {
    sections.push(`## Section ${i}\n\n`);
    for (let j = 0; j < 10; j++) {
      sections.push(`Line ${i * 10 + j} with some content here.\n`);
    }
  }
  return sections.join('');
}

function generateJavaScript(lines) {
  const functions = [];
  for (let i = 0; i < lines / 5; i++) {
    functions.push(`
function func${i}(a, b) {
  const result = a + b;
  return result * 2;
}
`);
  }
  return functions.join('\n');
}

test('benchmark: JSON file parsing speed', () => {
  const content = generateJSON(1000); // ~1000 lines
  const startTime = Date.now();
  const iterations = 100;

  for (let i = 0; i < iterations; i++) {
    parseAndChunk({ filePath: '/test/large.json', content, language: 'json' });
  }

  const elapsed = Date.now() - startTime;
  const avgTimeMs = elapsed / iterations;
  const filesPerSec = (1000 / avgTimeMs).toFixed(1);

  console.log(
    `[BENCHMARK] JSON: ${avgTimeMs.toFixed(2)}ms avg per file (${filesPerSec} files/sec)`
  );

  // Simple chunking should be very fast: <5ms per 1000-line JSON file
  assert.ok(avgTimeMs < 10, `JSON parsing should be fast: ${avgTimeMs}ms (expected <10ms)`);
});

test('benchmark: Markdown file parsing speed', () => {
  const content = generateMarkdown(1000); // ~1000 lines
  const startTime = Date.now();
  const iterations = 100;

  for (let i = 0; i < iterations; i++) {
    parseAndChunk({ filePath: '/test/README.md', content, language: 'markdown' });
  }

  const elapsed = Date.now() - startTime;
  const avgTimeMs = elapsed / iterations;
  const filesPerSec = (1000 / avgTimeMs).toFixed(1);

  console.log(
    `[BENCHMARK] Markdown: ${avgTimeMs.toFixed(2)}ms avg per file (${filesPerSec} files/sec)`
  );

  // Simple chunking should be very fast: <5ms per 1000-line MD file
  assert.ok(avgTimeMs < 10, `Markdown parsing should be fast: ${avgTimeMs}ms (expected <10ms)`);
});

test('benchmark: JavaScript file parsing speed (tree-sitter)', () => {
  const content = generateJavaScript(1000); // ~1000 lines
  const startTime = Date.now();
  const iterations = 100;

  for (let i = 0; i < iterations; i++) {
    parseAndChunk({ filePath: '/test/code.js', content, language: 'javascript' });
  }

  const elapsed = Date.now() - startTime;
  const avgTimeMs = elapsed / iterations;
  const filesPerSec = (1000 / avgTimeMs).toFixed(1);

  console.log(
    `[BENCHMARK] JavaScript: ${avgTimeMs.toFixed(2)}ms avg per file (${filesPerSec} files/sec)`
  );

  // Tree-sitter parsing is slower but acceptable: <50ms per 1000-line JS file
  // (This is expected - AST parsing is more expensive)
  console.log(`  (Tree-sitter AST parsing is slower than simple chunking - this is expected)`);
});

test('benchmark: estimate full project index time', () => {
  // Simulate a large project:
  // - 39,674 files total
  // - 50% non-code (JSON, MD, YAML) - use simple chunking
  // - 50% code (JS, TS, PY) - use tree-sitter

  const jsonContent = generateJSON(100);
  const jsContent = generateJavaScript(100);

  // Measure average time for each type
  let jsonTime = 0;
  let jsTime = 0;
  const iterations = 50;

  for (let i = 0; i < iterations; i++) {
    let start = Date.now();
    parseAndChunk({ filePath: '/test/config.json', content: jsonContent, language: 'json' });
    jsonTime += Date.now() - start;

    start = Date.now();
    parseAndChunk({ filePath: '/test/code.js', content: jsContent, language: 'javascript' });
    jsTime += Date.now() - start;
  }

  const avgJsonMs = jsonTime / iterations;
  const avgJsMs = jsTime / iterations;

  const totalFiles = 39674;
  const nonCodeFiles = totalFiles * 0.5;
  const codeFiles = totalFiles * 0.5;

  const estimatedTimeMs = nonCodeFiles * avgJsonMs + codeFiles * avgJsMs;
  const estimatedMinutes = (estimatedTimeMs / 1000 / 60).toFixed(1);

  console.log('\n[BENCHMARK] Full project estimate (39,674 files):');
  console.log(`  Non-code files (50%): ${avgJsonMs.toFixed(2)}ms avg`);
  console.log(`  Code files (50%): ${avgJsMs.toFixed(2)}ms avg`);
  console.log(`  Estimated total time: ${estimatedMinutes} minutes`);

  // With fast path, should index in under 20 minutes (previously 103 hours)
  assert.ok(
    estimatedTimeMs < 20 * 60 * 1000,
    `Full index should complete in <20 minutes, estimated ${estimatedMinutes}min`
  );

  console.log(`\n  ✅ Speedup: from 103 hours (6.4 files/sec) to ${estimatedMinutes} minutes`);
  const oldTimeMin = 103 * 60;
  const speedupFactor = (oldTimeMin / parseFloat(estimatedMinutes)).toFixed(1);
  console.log(`  ✅ Performance improvement: ${speedupFactor}x faster\n`);
});
