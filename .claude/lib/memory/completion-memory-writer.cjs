'use strict';

/**
 * Completion Memory Writer
 * ========================
 *
 * Handles fire-and-forget memory extraction from agent completion metadata.
 * Separated from post-completion-chain.cjs to enforce LOCK_ORDER:
 *   withWorkflowStateLock (workflow domain) MUST NOT mix with withFileLock (memory domain)
 *   in the same file.
 *
 * This module owns the withFileLock domain for completion events.
 *
 * @module completion-memory-writer
 */

const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { auditLog } = require('../utils/hook-input.cjs');
const { extractMemoriesFromSession } = require('./memory-extractor.cjs');
const { readSTMEntry, writeSTMEntry } = require('./memory-tiers.cjs');
const { withFileLock } = require('./memory-tiers-lock.cjs');

const MEMORY_EXTRACTION_TIMEOUT_MS = 5000;
const MEMORY_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Fire-and-forget memory extraction from agent completion metadata.
 * Builds sessionData from TaskUpdate metadata, extracts memories via LLM with a
 * 5-second timeout, applies confidence gating, and merges results into STM.
 *
 * This function MUST NOT throw — it catches all errors internally.
 * It is called without await to avoid blocking the hook pipeline.
 *
 * @param {Object} metadata - TaskUpdate metadata from toolInput
 * @param {string|null} taskId - Task ID for audit logging
 */
function triggerMemoryExtraction(metadata, taskId) {
  // Trigger condition: summary > 50 chars OR non-empty discoveries array
  const summary = typeof metadata.summary === 'string' ? metadata.summary : '';
  const discoveries = Array.isArray(metadata.discoveries) ? metadata.discoveries : [];
  const hasSubstantialContent = summary.length > 50 || discoveries.length > 0;

  if (!hasSubstantialContent) {
    return;
  }

  // Build sessionData from agent-reported metadata
  const sessionMessages = [];
  if (summary) {
    sessionMessages.push({ role: 'assistant', content: summary });
  }
  const sessionData = {
    recent_messages: sessionMessages,
    discoveries,
    filesModified: Array.isArray(metadata.filesModified) ? metadata.filesModified : [],
  };

  // Fire-and-forget: never await this, never let it block the hook
  const extractionStartMs = Date.now();
  Promise.race([
    extractMemoriesFromSession(sessionData, { projectRoot: PROJECT_ROOT }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('memory extraction timeout')), MEMORY_EXTRACTION_TIMEOUT_MS)
    ),
  ])
    .then(async memories => {
      if (!Array.isArray(memories) || memories.length === 0) {
        return;
      }

      // Confidence gating: only commit memories at or above threshold
      const confident = memories.filter(m => {
        if (!m || typeof m !== 'object') return false;
        // If the memory candidate has an explicit confidence field, apply threshold
        // If no confidence field is present, accept the memory (LLM-generated = implicitly high confidence)
        const conf = typeof m.confidence === 'number' ? m.confidence : 1.0;
        return conf >= MEMORY_CONFIDENCE_THRESHOLD;
      });

      if (confident.length === 0) {
        return;
      }

      // Atomic read-modify-write: file lock prevents concurrent agents from overwriting
      // each other's extracted memories (P0-1 fix)
      await withFileLock(async () => {
        const existing = readSTMEntry(PROJECT_ROOT) || {};
        const existingExtracted = Array.isArray(existing.extracted_memories)
          ? existing.extracted_memories
          : [];

        const merged = {
          ...existing,
          extracted_memories: [...existingExtracted, ...confident],
          extracted_memories_updated_at: new Date().toISOString(),
        };

        writeSTMEntry(merged, PROJECT_ROOT);
      }, PROJECT_ROOT);

      const extractionDurationMs = Date.now() - extractionStartMs;
      const memoryTypes = [...new Set(confident.map(m => m.type || 'unknown'))];
      auditLog('post-completion-chain', 'memory_extracted', {
        taskId: taskId || null,
        memoriesCommitted: confident.length,
        memoriesTotal: memories.length,
        memoriesGated: memories.length - confident.length,
        extractionDurationMs,
        memoryTypes,
      });
    })
    .catch(err => {
      // Non-critical: memory extraction failure must NOT break the completion chain
      auditLog('post-completion-chain', 'memory_extraction_failed', {
        taskId: taskId || null,
        error: err.message,
        extractionDurationMs: Date.now() - extractionStartMs,
      });
    });
}

module.exports = {
  triggerMemoryExtraction,
  MEMORY_EXTRACTION_TIMEOUT_MS,
  MEMORY_CONFIDENCE_THRESHOLD,
};
