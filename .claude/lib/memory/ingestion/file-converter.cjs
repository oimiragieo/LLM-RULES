'use strict';

/**
 * Sandboxed File Processor
 * ========================
 * Parses up to 27 file formats inside `worker_threads` to limit
 * memory leakage or catastrophic parser crashes in the main router.
 */

const { isMainThread, parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');

// 27 Supported Core text extensions
const TEXT_EXTS = new Set([
  '.txt',
  '.md',
  '.csv',
  '.json',
  '.yaml',
  '.yml',
  '.js',
  '.cjs',
  '.mjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.html',
  '.css',
  '.sql',
  '.sh',
  '.py',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.go',
  '.rs',
  '.rb',
  '.php',
  '.xml',
]);

/**
 * Safely convert a file into a generalized text string.
 * @param {string} filePath
 * @returns {{ok: boolean, content: string|null, error: string|null, mimeType: string|null}}
 */
function convertFile(filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();

    if (!fs.existsSync(filePath)) {
      return { ok: false, error: 'File not found', content: null, mimeType: null };
    }

    const stats = fs.statSync(filePath);
    if (stats.size > 15 * 1024 * 1024) {
      // 15MB limit for text files
      return { ok: false, error: 'File too large (>15MB)', content: null, mimeType: null };
    }

    if (TEXT_EXTS.has(ext)) {
      const content = fs.readFileSync(filePath, 'utf8');
      return { ok: true, content, mimeType: 'text/plain', error: null };
    }

    // Binary/unsupported fallback
    return {
      ok: false,
      error: 'Unsupported file type or binary format',
      content: null,
      mimeType: null,
    };
  } catch (err) {
    return { ok: false, error: err.message, content: null, mimeType: null };
  }
}

// Handle message from parent if running as a worker
if (!isMainThread && parentPort) {
  const result = convertFile(workerData.filePath);
  parentPort.postMessage(result);
}

module.exports = {
  convertFile,
  TEXT_EXTS,
};
