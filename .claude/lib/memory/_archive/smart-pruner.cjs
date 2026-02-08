#!/usr/bin/env node
/**
 * Smart Pruner - Utility-Based Memory Management
 * ==============================================
 *
 * Implements intelligent memory pruning based on research findings:
 * - Utility-based scoring: Score = 0.3*recency + 0.3*frequency + 0.4*importance
 * - Semantic deduplication using Jaccard similarity
 * - Retention policy enforcement per memory tier
 *
 * Based on research report: memory-system-research.md
 * Key patterns:
 * - Utility-based deletion (10% performance gain over naive truncation)
 * - Rolling summary compression (Factory.ai pattern)
 * - Hierarchical Memory Architecture (MemoryOS, H-MEM)
 */

'use strict';

const fs = require('fs');

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // Utility score weights (must sum to 1.0)
  RECENCY_WEIGHT: 0.3,
  FREQUENCY_WEIGHT: 0.3,
  IMPORTANCE_WEIGHT: 0.4,

  // Recency decay (days until score approaches 0)
  RECENCY_HALF_LIFE_DAYS: 30, // Score halves every 30 days
  RECENCY_MAX_DAYS: 90, // After 90 days, score is near 0

  // Frequency normalization
  FREQUENCY_MAX_COUNT: 20, // Counts above this cap at 1.0

  // Deduplication
  DEFAULT_SIMILARITY_THRESHOLD: 0.4, // 40% word overlap = similar

  // Base importance for unmarked entries
  BASE_IMPORTANCE: 0.2,
};

// Importance markers with their weights
const IMPORTANCE_MARKERS = [
  { pattern: /CRITICAL/i, weight: 1.0 },
  { pattern: /Iron Law/i, weight: 1.0 },
  { pattern: /NEVER|ALWAYS/i, weight: 0.9 },
  { pattern: /IMPORTANT/i, weight: 0.8 },
  { pattern: /decision:/i, weight: 0.8 },
  { pattern: /pattern:/i, weight: 0.7 },
  { pattern: /WARNING/i, weight: 0.7 },
  { pattern: /NOTE:/i, weight: 0.5 },
];

// Retention limits per tier
const RETENTION_LIMITS = {
  STM: 5, // Current session: keep very few (most recent)
  MTM: 15, // Mid-term: keep moderate amount
  LTM: 100, // Long-term: keep many but summarized
};

// ============================================================================
// Recency Score
// ============================================================================

/**
 * Calculate recency score based on last access time
 * Uses exponential decay: score = e^(-days/halfLife)
 *
 * @param {string} lastAccessed - ISO timestamp of last access
 * @returns {number} Score between 0 and 1 (1 = just accessed, 0 = very old)
 */
function getRecencyScore(lastAccessed) {
  if (!lastAccessed) return 0;

  const accessDate = new Date(lastAccessed);
  if (isNaN(accessDate.getTime())) return 0;

  const now = new Date();
  const daysSinceAccess = (now - accessDate) / (1000 * 60 * 60 * 24);

  if (daysSinceAccess < 0) return 1; // Future date = treat as current

  // Exponential decay with half-life
  const decayFactor = Math.log(2) / CONFIG.RECENCY_HALF_LIFE_DAYS;
  const score = Math.exp(-decayFactor * daysSinceAccess);

  // Ensure score stays in [0, 1] range
  return Math.max(0, Math.min(1, score));
}

// ============================================================================
// Frequency Score
// ============================================================================

/**
 * Calculate frequency score based on access count
 * Uses logarithmic scaling to avoid high counts dominating
 *
 * @param {number} accessCount - Number of times entry was accessed
 * @returns {number} Score between 0 and 1
 */
function getFrequencyScore(accessCount) {
  if (!accessCount || accessCount <= 0) return 0;

  // Logarithmic scaling: log(count+1) / log(maxCount+1)
  const score = Math.log(accessCount + 1) / Math.log(CONFIG.FREQUENCY_MAX_COUNT + 1);

  // Cap at 1.0
  return Math.min(1.0, score);
}

// ============================================================================
// Importance Score
// ============================================================================

/**
 * Calculate importance score based on content markers
 * Checks for importance keywords/patterns in the entry text
 *
 * @param {Object} entry - Entry with text field
 * @returns {number} Score between 0 and 1
 */
function getImportanceScore(entry) {
  // Handle null/undefined entry gracefully
  if (!entry) return CONFIG.BASE_IMPORTANCE;
  const text = entry.text || entry.content || entry.description || '';

  let maxWeight = CONFIG.BASE_IMPORTANCE;

  // Check all markers and take the highest weight
  for (const marker of IMPORTANCE_MARKERS) {
    if (marker.pattern.test(text)) {
      maxWeight = Math.max(maxWeight, marker.weight);
    }
  }

  return maxWeight;
}

// ============================================================================
// Utility Score (Combined)
// ============================================================================

/**
 * Calculate overall utility score combining recency, frequency, and importance.
 *
 * Uses weighted formula: Score = 0.3*recency + 0.3*frequency + 0.4*importance
 * Higher scores indicate more valuable entries that should be retained.
 *
 * @param {Object} entry - Memory entry to score
 * @param {string} [entry.lastAccessed] - ISO timestamp of last access
 * @param {string} [entry.last_accessed] - Alternative key for last access time
 * @param {number} [entry.accessCount] - Number of times entry was accessed
 * @param {number} [entry.access_count] - Alternative key for access count
 * @param {string} [entry.text] - Entry text content (used for importance scoring)
 * @param {string} [entry.content] - Alternative key for text content
 * @returns {number} Utility score between 0 and 1 (1 = highest value)
 * @example
 * const score = calculateUtility({
 *   text: 'CRITICAL: Always run tests',
 *   lastAccessed: new Date().toISOString(),
 *   accessCount: 10
 * });
 * // Returns: ~0.9+ (high recency, frequency, and importance)
 */
function calculateUtility(entry) {
  const recencyScore = getRecencyScore(entry.lastAccessed || entry.last_accessed);
  const frequencyScore = getFrequencyScore(entry.accessCount || entry.access_count || 1);
  const importanceScore = getImportanceScore(entry);

  return (
    CONFIG.RECENCY_WEIGHT * recencyScore +
    CONFIG.FREQUENCY_WEIGHT * frequencyScore +
    CONFIG.IMPORTANCE_WEIGHT * importanceScore
  );
}

// ============================================================================
// Semantic Deduplication - Jaccard Similarity
// ============================================================================

/**
 * Calculate Jaccard similarity between two strings
 * Jaccard(A, B) = |A intersection B| / |A union B|
 *
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity score between 0 and 1
 */
function jaccardSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;

  // Tokenize: lowercase, split by non-word chars, filter empty
  const tokenize = s =>
    new Set(
      s
        .toLowerCase()
        .split(/\W+/)
        .filter(word => word.length > 0)
    );

  const set1 = tokenize(str1);
  const set2 = tokenize(str2);

  if (set1.size === 0 && set2.size === 0) return 1;
  if (set1.size === 0 || set2.size === 0) return 0;

  // Calculate intersection
  const intersection = new Set([...set1].filter(x => set2.has(x)));

  // Calculate union
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}

/**
 * Find groups of similar entries
 *
 * @param {Array} entries - Array of entries with text field
 * @param {number} threshold - Similarity threshold (default 0.4)
 * @returns {Array} Array of groups, each group is an array of similar entries
 */
function findSimilarEntries(entries, threshold = CONFIG.DEFAULT_SIMILARITY_THRESHOLD) {
  if (!entries || entries.length === 0) return [];

  const groups = [];
  const assigned = new Set();

  for (let i = 0; i < entries.length; i++) {
    if (assigned.has(i)) continue;

    const group = [entries[i]];
    assigned.add(i);

    for (let j = i + 1; j < entries.length; j++) {
      if (assigned.has(j)) continue;

      const text1 = entries[i].text || entries[i].content || '';
      const text2 = entries[j].text || entries[j].content || '';
      const similarity = jaccardSimilarity(text1, text2);

      if (similarity >= threshold) {
        group.push(entries[j]);
        assigned.add(j);
      }
    }

    groups.push(group);
  }

  return groups;
}

/**
 * Merge similar entries into one, preserving best information
 * Prioritizes entries with importance markers over plain length
 *
 * @param {Array} entries - Array of similar entries to merge
 * @returns {Object} Merged entry
 */
function mergeEntries(entries) {
  if (!entries || entries.length === 0) return null;
  if (entries.length === 1) return entries[0];

  // Score entries by: importance first, then length
  const scored = entries.map(entry => ({
    entry,
    importance: getImportanceScore(entry),
    length: (entry.text || entry.content || '').length,
  }));

  // Sort by importance (descending), then by length (descending)
  scored.sort((a, b) => {
    if (b.importance !== a.importance) {
      return b.importance - a.importance; // Higher importance first
    }
    return b.length - a.length; // Then longer text
  });

  const bestEntry = scored[0].entry;

  // Aggregate metadata
  const merged = {
    ...bestEntry,
    // Keep highest access count (or sum)
    accessCount: Math.max(...entries.map(e => e.accessCount || e.access_count || 1)),
    // Keep most recent access time
    lastAccessed: entries.reduce((latest, e) => {
      const current = e.lastAccessed || e.last_accessed;
      if (!latest) return current;
      if (!current) return latest;
      return new Date(current) > new Date(latest) ? current : latest;
    }, null),
    // Keep earliest timestamp (original creation)
    timestamp: entries.reduce((earliest, e) => {
      const current = e.timestamp;
      if (!earliest) return current;
      if (!current) return earliest;
      return new Date(current) < new Date(earliest) ? current : earliest;
    }, null),
    // Mark as merged
    _merged: true,
    _mergedFrom: entries.length,
  };

  return merged;
}

/**
 * Detect if a new entry is a duplicate of existing entries
 *
 * @param {string} newText - Text of new entry to check
 * @param {Array} existingEntries - Existing entries to check against
 * @param {number} threshold - Similarity threshold
 * @returns {Object|null} Matching entry if duplicate found, null otherwise
 */
function detectDuplicates(
  newText,
  existingEntries,
  threshold = CONFIG.DEFAULT_SIMILARITY_THRESHOLD
) {
  if (!newText || !existingEntries || existingEntries.length === 0) return null;

  for (const entry of existingEntries) {
    const existingText = entry.text || entry.content || '';
    const similarity = jaccardSimilarity(newText, existingText);

    if (similarity >= threshold) {
      return entry;
    }
  }

  return null;
}

// ============================================================================
// Retention Policy Enforcement
// ============================================================================

/**
 * Prune entries by utility score, keeping only top N highest-scoring entries.
 *
 * Calculates utility scores for all entries and keeps those with the
 * highest scores, removing low-value entries to meet the target count.
 *
 * @param {Array<Object>} entries - Array of memory entries to prune
 * @param {number} targetCount - Maximum number of entries to keep
 * @returns {Object} Pruning result
 * @returns {Array<Object>} returns.kept - Entries retained (highest utility)
 * @returns {Array<Object>} returns.removed - Entries removed (lowest utility)
 * @example
 * const result = pruneByUtility(entries, 10);
 * console.log(`Kept ${result.kept.length}, removed ${result.removed.length}`);
 */
function pruneByUtility(entries, targetCount) {
  if (!entries || entries.length === 0) {
    return { kept: [], removed: [] };
  }

  if (entries.length <= targetCount) {
    return { kept: entries, removed: [] };
  }

  // Calculate utility for each entry
  const withUtility = entries.map(entry => ({
    entry,
    utility: calculateUtility(entry),
  }));

  // Sort by utility descending (highest first)
  withUtility.sort((a, b) => b.utility - a.utility);

  // Split into kept and removed
  const kept = withUtility.slice(0, targetCount).map(x => x.entry);
  const removed = withUtility.slice(targetCount).map(x => x.entry);

  return { kept, removed };
}

/**
 * Enforce retention policy for a specific memory tier.
 *
 * Applies tier-specific limits:
 * - STM: 5 entries (current session only)
 * - MTM: 15 entries (recent sessions)
 * - LTM: 100 entries (permanent but summarized)
 *
 * @param {Array<Object>} entries - Array of entries to enforce limits on
 * @param {'STM'|'MTM'|'LTM'} tier - Memory tier to apply limits for
 * @returns {Object} Enforcement result
 * @returns {Array<Object>} returns.kept - Entries within retention limit
 * @returns {Array<Object>} returns.removed - Entries exceeding limit
 * @returns {Array<Object>} returns.archived - Archived entries (empty, caller handles archival)
 * @example
 * const result = enforceRetention(entries, 'MTM');
 * if (result.removed.length > 0) {
 *   console.log(`Removed ${result.removed.length} entries exceeding MTM limit`);
 * }
 */
function enforceRetention(entries, tier) {
  const limit = RETENTION_LIMITS[tier];

  // LTM has high limit but not unlimited
  if (tier === 'LTM') {
    // For LTM, keep entries but they should be summarized
    // This function just enforces count limits
    if (!limit || entries.length <= limit) {
      return { kept: entries, removed: [], archived: [] };
    }
  }

  if (!limit || entries.length <= limit) {
    return { kept: entries, removed: [], archived: [] };
  }

  const { kept, removed } = pruneByUtility(entries, limit);

  return {
    kept,
    removed,
    archived: [], // Caller can archive if desired
  };
}

/**
 * Archive low-value entries by creating a compressed summary
 *
 * @param {Array} entries - Entries to archive
 * @returns {Object} Archive object with summary
 */
function archiveLowValue(entries) {
  if (!entries || entries.length === 0) {
    return {
      type: 'archive',
      entries: [],
      summary: 'No entries to archive',
      created_at: new Date().toISOString(),
    };
  }

  // Extract key themes from entries
  const allText = entries.map(e => e.text || e.content || '').join(' ');
  const words = allText
    .toLowerCase()
    .split(/\W+/)
    .filter(w => w.length > 3);
  const wordCounts = {};
  words.forEach(w => {
    wordCounts[w] = (wordCounts[w] || 0) + 1;
  });

  // Get top keywords
  const topKeywords = Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);

  // Generate summary
  const summary = `Archived ${entries.length} entries. Key topics: ${topKeywords.join(', ')}`;

  return {
    type: 'archive',
    entries: entries.map(e => ({
      text: (e.text || e.content || '').slice(0, 100) + '...',
      timestamp: e.timestamp,
      utility: calculateUtility(e),
    })),
    summary,
    entry_count: entries.length,
    created_at: new Date().toISOString(),
  };
}

// ============================================================================
// Integration Function
// ============================================================================

/**
 * Deduplicate and prune entries in one operation.
 *
 * Performs a two-step cleanup:
 * 1. Finds and merges duplicate entries using Jaccard similarity
 * 2. Prunes remaining entries by utility score to meet target count
 *
 * @param {Array<Object>} entries - Array of entries to process
 * @param {Object} [options={}] - Processing options
 * @param {number} [options.targetCount=20] - Maximum entries to keep after pruning
 * @param {number} [options.similarityThreshold=0.4] - Jaccard similarity threshold (0-1)
 * @returns {Object} Processing result
 * @returns {Array<Object>} returns.kept - Entries retained after deduplication and pruning
 * @returns {Array<Object>} returns.removed - Entries removed during pruning
 * @returns {number} returns.deduplicated - Count of entries merged as duplicates
 * @returns {Object|null} returns.archived - Archive object if entries were archived
 * @example
 * const result = deduplicateAndPrune(entries, {
 *   targetCount: 30,
 *   similarityThreshold: 0.5
 * });
 * console.log(`Deduplicated ${result.deduplicated}, kept ${result.kept.length}`);
 */
function deduplicateAndPrune(entries, options = {}) {
  // Handle null options gracefully
  const opts = options || {};
  const { targetCount = 20, similarityThreshold = CONFIG.DEFAULT_SIMILARITY_THRESHOLD } = opts;

  if (!entries || entries.length === 0) {
    return {
      kept: [],
      removed: [],
      deduplicated: 0,
      archived: null,
    };
  }

  // Step 1: Find and merge duplicates
  const groups = findSimilarEntries(entries, similarityThreshold);
  const mergedEntries = groups.map(group => {
    if (group.length === 1) return group[0];
    return mergeEntries(group);
  });

  const deduplicated = entries.length - mergedEntries.length;

  // Step 2: Prune by utility if still over target
  const { kept, removed } = pruneByUtility(mergedEntries, targetCount);

  // Step 3: Archive removed entries
  const archived = removed.length > 0 ? archiveLowValue(removed) : null;

  return {
    kept,
    removed,
    deduplicated,
    archived,
  };
}

// ============================================================================
// CLI Interface
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'score':
      if (args[1]) {
        const input = fs.readFileSync(args[1], 'utf8');
        const entry = JSON.parse(input);
        console.log(
          JSON.stringify(
            {
              recency: getRecencyScore(entry.lastAccessed || entry.last_accessed),
              frequency: getFrequencyScore(entry.accessCount || entry.access_count || 1),
              importance: getImportanceScore(entry),
              utility: calculateUtility(entry),
            },
            null,
            2
          )
        );
      } else {
        console.error('Usage: smart-pruner.cjs score <entry.json>');
      }
      break;

    case 'similarity':
      if (args[1] && args[2]) {
        console.log(`Jaccard similarity: ${jaccardSimilarity(args[1], args[2])}`);
      } else {
        console.error('Usage: smart-pruner.cjs similarity "text1" "text2"');
      }
      break;

    case 'prune': {
      // Prune a JSON array file
      const filePath = args[1];
      const targetCount = parseInt(args[2] || '20', 10);

      if (!filePath) {
        console.error('Usage: smart-pruner.cjs prune <file.json> [target-count]');
        process.exit(1);
      }

      if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        process.exit(1);
      }

      const entries = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const result = deduplicateAndPrune(entries, {
        targetCount,
        similarityThreshold: CONFIG.DEFAULT_SIMILARITY_THRESHOLD,
      });

      console.log(
        JSON.stringify(
          {
            original: entries.length,
            kept: result.kept.length,
            deduplicated: result.deduplicated,
            pruned: result.removed.length,
            archived: result.archived ? result.archived.entry_count : 0,
          },
          null,
          2
        )
      );

      // Optionally write back
      if (args[3] === '--write') {
        fs.writeFileSync(filePath, JSON.stringify(result.kept, null, 2));
        console.log(`Written to ${filePath}`);
      }
      break;
    }

    case 'analyze': {
      // Analyze a JSON array file and show top/bottom entries by utility
      const filePath = args[1];

      if (!filePath) {
        console.error('Usage: smart-pruner.cjs analyze <file.json>');
        process.exit(1);
      }

      if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        process.exit(1);
      }

      const entries = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const scored = entries
        .map(entry => ({
          text: (entry.text || entry.content || '').slice(0, 60),
          utility: calculateUtility(entry),
          recency: getRecencyScore(entry.lastAccessed || entry.last_accessed),
          frequency: getFrequencyScore(entry.accessCount || entry.access_count || 1),
          importance: getImportanceScore(entry),
        }))
        .sort((a, b) => b.utility - a.utility);

      console.log(`\nAnalysis of ${filePath} (${entries.length} entries)\n`);

      console.log('TOP 5 by utility:');
      scored.slice(0, 5).forEach((s, i) => {
        console.log(`  ${i + 1}. [${s.utility.toFixed(3)}] ${s.text}...`);
      });

      console.log('\nBOTTOM 5 by utility:');
      scored.slice(-5).forEach((s, i) => {
        console.log(`  ${scored.length - 4 + i}. [${s.utility.toFixed(3)}] ${s.text}...`);
      });

      // Find duplicates
      const groups = findSimilarEntries(entries, CONFIG.DEFAULT_SIMILARITY_THRESHOLD);
      const dupeGroups = groups.filter(g => g.length > 1);
      if (dupeGroups.length > 0) {
        console.log(
          `\nFound ${dupeGroups.length} groups of similar entries (potential duplicates)`
        );
      }

      break;
    }

    default:
      console.log(`
Smart Pruner - Utility-Based Memory Management

Commands:
  score <entry.json>           Calculate utility score for an entry
  similarity "t1" "t2"         Calculate Jaccard similarity between two texts
  prune <file.json> [count]    Prune a JSON array file to target count (add --write to save)
  analyze <file.json>          Analyze entries by utility score

Configuration:
  Recency Weight:     ${CONFIG.RECENCY_WEIGHT}
  Frequency Weight:   ${CONFIG.FREQUENCY_WEIGHT}
  Importance Weight:  ${CONFIG.IMPORTANCE_WEIGHT}
  Half-Life (days):   ${CONFIG.RECENCY_HALF_LIFE_DAYS}
  Max Days:           ${CONFIG.RECENCY_MAX_DAYS}

Importance Markers (highest wins):
${IMPORTANCE_MARKERS.map(m => `  ${m.weight.toFixed(1)}: ${m.pattern}`).join('\n')}

Retention Limits:
  STM: ${RETENTION_LIMITS.STM}
  MTM: ${RETENTION_LIMITS.MTM}
  LTM: ${RETENTION_LIMITS.LTM}

Examples:
  node smart-pruner.cjs analyze .claude/context/memory/patterns.json
  node smart-pruner.cjs prune .claude/context/memory/gotchas.json 30
  node smart-pruner.cjs prune .claude/context/memory/patterns.json 50 --write
  node smart-pruner.cjs similarity "run tests before commit" "always run tests"
`);
  }
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Configuration
  CONFIG,
  IMPORTANCE_MARKERS,
  RETENTION_LIMITS,

  // Scoring functions
  getRecencyScore,
  getFrequencyScore,
  getImportanceScore,
  calculateUtility,

  // Deduplication
  jaccardSimilarity,
  findSimilarEntries,
  mergeEntries,
  detectDuplicates,

  // Retention
  pruneByUtility,
  enforceRetention,
  archiveLowValue,

  // Integration
  deduplicateAndPrune,
};
