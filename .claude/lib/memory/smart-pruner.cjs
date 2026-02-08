#!/usr/bin/env node
/**
 * Smart Memory Pruner Module
 * ===========================
 *
 * Deduplication and pruning for memory files.
 * - Removes near-duplicate entries (Jaccard similarity)
 * - Prunes old resolved entries
 *
 * Security Features:
 * - Uses atomicWriteSync() for crash-safe writes (MF-002)
 * - Preserves [PERMANENT] sections (never pruned/deduped)
 *
 * Implementation: ADR-102 (Memory Management Rebuild)
 */

'use strict';

const fs = require('fs');
const { atomicWriteSync } = require('../utils/atomic-write.cjs');
const { parseSections } = require('./memory-rotator.cjs');

// Default options
const DEFAULT_SIMILARITY_THRESHOLD = 0.5;
const DEFAULT_RESOLVED_MAX_AGE_DAYS = 30;

/**
 * Calculate Jaccard similarity between two text strings (word-level).
 * Jaccard similarity = |intersection| / |union|
 *
 * @param {string} textA - First text
 * @param {string} textB - Second text
 * @returns {number} - Similarity score 0.0 to 1.0
 */
function jaccardSimilarity(textA, textB) {
  if (!textA || !textB || typeof textA !== 'string' || typeof textB !== 'string') {
    return 0;
  }

  // Normalize and tokenize into words (lowercase, split on whitespace/punctuation)
  const wordsA = new Set(
    textA
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0)
  );

  const wordsB = new Set(
    textB
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0)
  );

  if (wordsA.size === 0 && wordsB.size === 0) {
    return 0; // Edge case: both empty
  }

  // Calculate intersection and union
  const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);

  return intersection.size / union.size;
}

/**
 * Deduplicate a memory file by removing near-duplicate sections.
 * Keeps the longer version when duplicates are found.
 * Preserves [PERMANENT] sections.
 *
 * @param {string} filePath - Absolute path to memory file
 * @param {Object} options - Deduplication options
 * @param {number} [options.threshold=0.5] - Similarity threshold (0.0 to 1.0)
 * @param {boolean} [options.dryRun=false] - If true, report but don't modify file
 * @returns {{ duplicatesFound: number, duplicatesRemoved: number, mergedEntries: Array<string> }}
 */
function deduplicateFile(filePath, options = {}) {
  const { threshold = DEFAULT_SIMILARITY_THRESHOLD, dryRun = false } = options;

  if (!fs.existsSync(filePath)) {
    return { duplicatesFound: 0, duplicatesRemoved: 0, mergedEntries: [] };
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const sections = parseSections(content);

  if (sections.length === 0) {
    return { duplicatesFound: 0, duplicatesRemoved: 0, mergedEntries: [] };
  }

  // Build list of sections to keep, marking duplicates to remove
  const toRemove = new Set();
  const duplicateSections = new Set(); // Track all sections involved in duplication (including kept ones)
  const mergedEntries = [];

  for (let i = 0; i < sections.length; i++) {
    if (toRemove.has(i)) continue;

    // Compare with all subsequent sections
    for (let j = i + 1; j < sections.length; j++) {
      if (toRemove.has(j)) continue;

      const similarity = jaccardSimilarity(sections[i].content, sections[j].content);

      if (similarity >= threshold) {
        // Mark both sections as involved in duplication (for counting)
        duplicateSections.add(i);
        duplicateSections.add(j);

        // If either is [PERMANENT], keep both
        if (sections[i].isPermanent || sections[j].isPermanent) {
          continue; // Don't mark as duplicate for removal
        }

        // Keep the longer version, remove the shorter
        if (sections[j].content.length > sections[i].content.length) {
          toRemove.add(i);
          mergedEntries.push(sections[i].title || 'Untitled');
          break; // i is removed, stop checking it against others
        } else {
          toRemove.add(j);
          mergedEntries.push(sections[j].title || 'Untitled');
        }
      }
    }
  }

  const toKeep = sections.filter((_, idx) => !toRemove.has(idx));
  const duplicatesFound = duplicateSections.size; // Count all sections involved in duplication
  const duplicatesRemoved = toRemove.size;

  // Write back deduplicated content (if not dry run and changes exist)
  if (!dryRun && duplicatesRemoved > 0) {
    const dedupedContent = toKeep.map(s => s.content).join('\n\n---\n\n');
    atomicWriteSync(filePath, dedupedContent);
  }

  return {
    duplicatesFound,
    duplicatesRemoved,
    mergedEntries,
  };
}

/**
 * Prune old resolved entries from a memory file.
 * Entries with **Status: RESOLVED** older than maxAgeDays are removed.
 * Preserves [PERMANENT] sections.
 *
 * @param {string} filePath - Absolute path to memory file
 * @param {Object} options - Pruning options
 * @param {number} [options.maxAgeDays=30] - Max age for resolved entries (days)
 * @returns {{ removed: number }}
 */
function pruneResolvedEntries(filePath, options = {}) {
  const { maxAgeDays = DEFAULT_RESOLVED_MAX_AGE_DAYS } = options;

  if (!fs.existsSync(filePath)) {
    return { removed: 0 };
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const sections = parseSections(content);

  if (sections.length === 0) {
    return { removed: 0 };
  }

  const now = new Date();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

  const toKeep = sections.filter(section => {
    // Keep if not resolved
    if (!section.isResolved) {
      return true;
    }

    // Keep if [PERMANENT]
    if (section.isPermanent) {
      return true;
    }

    // Keep if no date (can't determine age)
    if (!section.date) {
      return true;
    }

    // Remove if resolved and older than threshold
    const sectionDate = new Date(section.date);
    const ageMs = now - sectionDate;

    return ageMs <= maxAgeMs;
  });

  const removed = sections.length - toKeep.length;

  // Write back pruned content if changes exist
  if (removed > 0) {
    const prunedContent = toKeep.map(s => s.content).join('\n\n---\n\n');
    atomicWriteSync(filePath, prunedContent);
  }

  return { removed };
}

module.exports = {
  jaccardSimilarity,
  deduplicateFile,
  pruneResolvedEntries,
};
