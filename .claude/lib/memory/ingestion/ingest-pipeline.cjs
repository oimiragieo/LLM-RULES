'use strict';

/**
 * Ingestion Pipeline Orchestrator (Phase 1)
 * =========================================
 * Processes raw files through format conversion, token gating,
 * importance scoring, and finally writes to the `file_memory` DB table.
 */

const crypto = require('crypto');
const path = require('path');
const { Worker } = require('worker_threads');
const { getDb } = require('../../db/sqlite-manager.cjs');
const { exceedsLimit, truncateToLimit } = require('./token-gate.cjs');
const { scoreContent } = require('./importance-scorer.cjs');
const { extractMetadata } = require('./image-metadata-extractor.cjs');

/**
 * Runs the sandboxed file-converter.cjs in a Worker thread to prevent
 * parsing crashes or memory leaks from affecting the main router.
 *
 * @param {string} filePath
 * @returns {Promise<{ok: boolean, content: string|null, error: string|null, mimeType: string|null}>}
 */
function convertFileInWorker(filePath) {
  return new Promise((resolve, _reject) => {
    const workerPath = path.join(__dirname, 'file-converter.cjs');
    const worker = new Worker(workerPath, { workerData: { filePath } });

    worker.on('message', message => resolve(message));
    worker.on('error', err =>
      resolve({ ok: false, error: err.message, content: null, mimeType: null })
    );
    worker.on('exit', code => {
      if (code !== 0) {
        resolve({
          ok: false,
          error: `Worker stopped with exit code ${code}`,
          content: null,
          mimeType: null,
        });
      }
    });
  });
}

/**
 * Main ingestion entrypoint. Takes a file path and processes it.
 *
 * @param {string} filePath
 * @returns {Promise<{ success: boolean, id?: string, error?: string, reason?: string }>}
 */
async function ingestFile(filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();

    // 1. Image Fast-Path (Vision omitted for lazy load)
    const IS_IMAGE = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext);
    if (IS_IMAGE) {
      const meta = await extractMetadata(filePath);
      if (meta.format === 'error') {
        return { success: false, error: meta.summary };
      }
      return await writeToFileMemory({
        sourcePath: filePath,
        mimeType: `image/${meta.format}`,
        content: '',
        summary: meta.summary,
        sizeBytes: meta.sizeBytes,
        isImage: true,
      });
    }

    // 2. Text/Document format parsing (Worker thread)
    const conversion = await convertFileInWorker(filePath);
    if (!conversion.ok || !conversion.content) {
      return { success: false, error: conversion.error || 'Unknown conversion error' };
    }

    let textContent = conversion.content;

    // 3. Token Gate
    if (exceedsLimit(textContent)) {
      textContent = truncateToLimit(textContent);
      // We still ingest the truncated snippet
    }

    // 4. Importance Scorer Gate
    const importance = await scoreContent(textContent);
    if (importance < 0.2) {
      // Reject noise completely to save LanceDB and SQLite space
      return { success: false, reason: 'Importance score too low (<0.2)' };
    }

    // 5. Store File Memory
    return await writeToFileMemory({
      sourcePath: filePath,
      mimeType: conversion.mimeType || 'text/plain',
      content: textContent,
      summary: `Auto-ingested ${ext} file`,
      sizeBytes: textContent.length,
      isImage: false,
      importance,
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Inserts the processed file artifact into `file_memory` SQLite cache.
 */
async function writeToFileMemory({
  sourcePath,
  mimeType,
  content,
  summary,
  sizeBytes,
  isImage,
  importance = 0.5,
}) {
  const db = getDb();

  // Hash for dedup
  const hash = crypto
    .createHash('sha256')
    .update(content || summary)
    .digest('hex');

  // Skip if already ingested
  const existing = db.prepare('SELECT id FROM file_memory WHERE hash = ?').get(hash);
  if (existing) {
    return { success: true, id: existing.id, reason: 'Duplicate file hash bypassed' };
  }

  const id = crypto.randomUUID();
  const ingestedAt = Date.now();

  try {
    db.prepare(
      `
      INSERT INTO file_memory (
        id, source, mime_type, hash, size_bytes, 
        importance_score, summary, entities, clean_text,
        vision_embedded, indexed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      sourcePath,
      mimeType,
      hash,
      sizeBytes,
      importance,
      summary,
      '[]',
      isImage ? null : content,
      0,
      ingestedAt
    );

    return { success: true, id };
  } catch (err) {
    return { success: false, error: `DB Insert Failed: ${err.message}` };
  }
}

module.exports = {
  ingestFile,
  convertFileInWorker,
};
