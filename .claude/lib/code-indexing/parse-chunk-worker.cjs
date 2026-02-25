/**
 * Piscina worker: parse + chunk a single file (CPU-bound). Runs in worker threads for true parallelism.
 * @module code-indexing/parse-chunk-worker
 */

'use strict';

const crypto = require('crypto');
const { CodeParser } = require('./code-parser.cjs');
const { SemanticChunker } = require('./semantic-chunker.cjs');
const { buildMockParseResult } = require('./parse-utils.cjs');

const minTokens = parseInt(process.env.CODE_INDEX_MIN_TOKENS || '5', 10);
const parser = new CodeParser();
const chunker = new SemanticChunker({ minTokens });

/**
 * Simple chunker for non-code files (JSON, YAML, MD, TXT, etc.)
 * 100x faster than tree-sitter for files that don't need AST parsing
 * @param {string} content - File content
 * @param {string} filePath - File path
 * @param {string} language - Language (for metadata)
 * @returns {object[]} Array of chunks
 */
function simpleChunk(content, filePath, language) {
  const lines = content.split('\n');
  const chunks = [];
  const chunkSize = 50; // lines per chunk
  const maxChars = 4000; // max characters per chunk to prevent ONNX tokenizer crashes

  for (let i = 0; i < lines.length; i += chunkSize) {
    const chunkLines = lines.slice(i, i + chunkSize);
    let text = chunkLines.join('\n').trim();

    if (text.length === 0) continue;

    // Hard character split for minified files that use 1 massive line
    while (text.length > 0) {
      const splitText = text.substring(0, maxChars);
      text = text.substring(maxChars);

      chunks.push({
        id: `${filePath}:${i}${text.length > 0 ? '_part' : ''}`,
        text: splitText,
        metadata: {
          filePath,
          language,
          type: 'text_block',
          lineStart: i + 1,
          lineEnd: Math.min(i + chunkSize, lines.length),
        },
      });
    }
  }

  return chunks;
}

/**
 * Detect if file should use simple chunking (non-code files)
 * @param {string} filePath - File path
 * @returns {boolean} True if file should use simple chunking
 */
function shouldUseSimpleChunking(filePath) {
  const lowerPath = filePath.toLowerCase();
  if (
    lowerPath.endsWith('.min.js') ||
    lowerPath.endsWith('.min.css') ||
    lowerPath.endsWith('.map')
  ) {
    return true;
  }

  const ext = lowerPath.match(/\.[^.]+$/)?.[0];
  // Non-code file extensions that don't benefit from AST parsing
  const simpleExtensions = [
    '.json',
    '.yaml',
    '.yml',
    '.md',
    '.txt',
    '.toml',
    '.ini',
    '.xml',
    '.html',
    '.css',
    '.svg',
    '.lock',
    '.log',
    '.env',
    '.gitignore',
    '.dockerignore',
    '.editorconfig',
    '.csv',
    '.tsv',
  ];
  return ext && simpleExtensions.includes(ext);
}

/**
 * Parse and chunk one file. Called by Piscina from worker threads.
 * @param {{ filePath: string, content: string, language: string }} payload
 * @returns {{ filePath: string, chunks: object[], hash: string }}
 */
module.exports = function parseAndChunk({ filePath, content, language }) {
  try {
    const hash = crypto.createHash('sha256').update(content).digest('hex');

    // Fast path: skip tree-sitter for non-code files
    if (shouldUseSimpleChunking(filePath)) {
      const chunks = simpleChunk(content, filePath, language || 'text');
      return { filePath, chunks, hash };
    }

    // Slow path: use tree-sitter for actual code files
    let parseResult = parser.parse(content, language);
    if (!parseResult) {
      parseResult = buildMockParseResult(content, language);
    }
    const chunks = chunker.chunk(parseResult, filePath);
    return { filePath, chunks, hash };
  } catch (error) {
    // CRITICAL FIX: Handle OOM and other worker errors gracefully
    if (
      error.message.includes('memory') ||
      error.message.includes('heap') ||
      error.message.includes('out of memory')
    ) {
      console.error(`[WORKER] OOM on file: ${filePath}, skipping`);
      return { filePath, chunks: [], hash: null, error: 'OOM' };
    }
    // Re-throw other errors for debugging
    throw error;
  }
};
