/**
 * memory-consolidator.cjs — Dream-inspired 4-Phase Memory Consolidation
 * =======================================================================
 *
 * Implements the consolidation cycle:
 *   Phase 1 — Orient:      Read memory directory structure and existing structured files.
 *   Phase 2 — Gather:      Read daily log files with dates AFTER the last consolidation
 *                          timestamp (passed as argument).
 *   Phase 3 — Consolidate: Extract actionable items via heuristic keyword matching and
 *                          append them to the appropriate structured file.
 *   Phase 4 — Prune:       Call enforceMemoryCaps() on affected markdown files.
 *
 * Keyword routing (case-insensitive):
 *   'pattern', 'learned'   → patterns.json
 *   'gotcha'               → gotchas.json
 *   'decision'             → decisions.md
 *   'issue', 'discovered'  → issues.md
 *
 * Idempotency: processed log file paths are tracked in .consolidation-manifest.json.
 * Running consolidation twice on the same logs produces no duplicate entries.
 *
 * All operations are fail-open — consolidate() never throws; errors are caught
 * and reported via console.warn/console.error so callers are not disrupted.
 *
 * Created: Phase 8 — daily-log-consolidation milestone
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { MEMORY_DIR } = require('./memory-paths.cjs');
const { atomicWriteJSONSync } = require('../utils/atomic-write.cjs');
const { enforceMemoryCaps } = require('./memory-rotator.cjs');
const { jaccardSimilarity } = require('./smart-pruner.cjs');

// ── Constants ─────────────────────────────────────────────────────────────────

/** Name of the idempotency manifest file (relative to memoryDir) */
const MANIFEST_FILE = '.consolidation-manifest.json';

// Keyword groups — order matters for priority: gotcha > pattern/learned > decision > issue
const KEYWORDS_GOTCHA = ['gotcha'];
const KEYWORDS_PATTERN = ['pattern', 'learned'];
const KEYWORDS_DECISION = ['decision'];
const KEYWORDS_ISSUE = ['issue', 'discovered'];

// ── Entry ID Generation ───────────────────────────────────────────────────────

/**
 * Build a stable SHA-1 entry ID from text + timestamp + area.
 * Matches the approach used by memory-manager-core-storage.cjs.
 *
 * @param {{ text: string, timestamp: string, area?: string }} entry
 * @returns {string} 40-character hex digest
 */
function buildEntryId(entry) {
  const base = `${entry.text || ''}\n${entry.timestamp || ''}\n${entry.area || ''}`;
  // M-03: non-security use (cache key / content addressing / UUID namespace); MD5/SHA-1 acceptable
  return crypto.createHash('sha1').update(base).digest('hex');
}

// ── Keyword Classification ────────────────────────────────────────────────────

/**
 * Classify an entry text into a destination category via keyword matching.
 * Priority order: gotcha > pattern/learned > decision > issue/discovered.
 *
 * @param {string} text - Log entry text (already stripped of the `- [HH:MM:SS]` prefix)
 * @returns {'pattern'|'gotcha'|'decision'|'issue'|null}
 */
function classifyEntry(text) {
  const lower = String(text || '').toLowerCase();

  for (const kw of KEYWORDS_GOTCHA) {
    if (lower.includes(kw)) return 'gotcha';
  }
  for (const kw of KEYWORDS_PATTERN) {
    if (lower.includes(kw)) return 'pattern';
  }
  for (const kw of KEYWORDS_DECISION) {
    if (lower.includes(kw)) return 'decision';
  }
  for (const kw of KEYWORDS_ISSUE) {
    if (lower.includes(kw)) return 'issue';
  }
  return null;
}

// ── Public: extractActionableItems ───────────────────────────────────────────

/**
 * Parse daily log content and extract actionable items.
 *
 * Only lines matching the standard daily log format `- [HH:MM:SS] <text>` are
 * considered.  Each line is tested for keyword presence; lines with no matching
 * keyword are silently skipped.
 *
 * This function is exported so tests can exercise extraction in isolation.
 *
 * @param {string} logContent - Raw content of a daily log file
 * @returns {Array<{ text: string, category: 'pattern'|'gotcha'|'decision'|'issue', rawLine: string }>}
 */
function extractActionableItems(logContent) {
  if (!logContent || typeof logContent !== 'string') {
    return [];
  }

  const items = [];
  const lines = logContent.split('\n');

  for (const line of lines) {
    // Match the canonical daily log entry format: `- [HH:MM:SS] <text>`
    const match = line.match(/^- \[(\d{2}:\d{2}:\d{2})\] (.+)$/);
    if (!match) continue;

    const text = match[2].trim();
    if (!text) continue;

    const category = classifyEntry(text);
    if (!category) continue;

    items.push({ text, category, rawLine: line });
  }

  return items;
}

// ── Internal Helpers ──────────────────────────────────────────────────────────

/**
 * Safely read a JSON array from a file.  Returns `[]` on any error.
 *
 * @param {string} filePath
 * @returns {Array}
 */
function readJSONArray(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_e) {
    return [];
  }
}

/**
 * Read the consolidation manifest (list of already-processed log file paths).
 *
 * @param {string} memoryDir - Base memory directory
 * @returns {string[]}
 */
function readManifest(memoryDir) {
  const manifestPath = path.join(memoryDir, MANIFEST_FILE);
  try {
    if (!fs.existsSync(manifestPath)) return [];
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_e) {
    return [];
  }
}

/**
 * Write the consolidation manifest (fail-open).
 *
 * @param {string} memoryDir - Base memory directory
 * @param {string[]} processedPaths - Absolute paths of processed log files
 */
function writeManifest(memoryDir, processedPaths) {
  const manifestPath = path.join(memoryDir, MANIFEST_FILE);
  try {
    atomicWriteJSONSync(manifestPath, processedPaths);
  } catch (err) {
    console.error('[memory-consolidator] Failed to write manifest:', err.message || String(err));
  }
}

/**
 * Discover daily log files with dates strictly AFTER sinceTimestamp.
 *
 * Walks `<memoryDir>/logs/YYYY/MM/YYYY-MM-DD.md` and compares the file's
 * midnight-UTC timestamp against sinceTimestamp.  Only files whose date is
 * strictly greater than sinceTimestamp are included.
 *
 * @param {string} memoryDir - Base memory directory
 * @param {number} sinceTimestamp - Epoch ms cutoff (exclusive lower bound)
 * @returns {Array<{ filePath: string, dateStr: string, dateMs: number }>} sorted ascending
 */
function findLogsSince(memoryDir, sinceTimestamp) {
  const logsDir = path.join(memoryDir, 'logs');
  if (!fs.existsSync(logsDir)) return [];

  const results = [];

  let years;
  try {
    years = fs.readdirSync(logsDir);
  } catch (_e) {
    return [];
  }

  for (const year of years) {
    if (!/^\d{4}$/.test(year)) continue;

    const yearDir = path.join(logsDir, year);
    try {
      if (!fs.statSync(yearDir).isDirectory()) continue;
    } catch (_e) {
      continue;
    }

    let months;
    try {
      months = fs.readdirSync(yearDir);
    } catch (_e) {
      continue;
    }

    for (const month of months) {
      if (!/^\d{2}$/.test(month)) continue;

      const monthDir = path.join(yearDir, month);
      try {
        if (!fs.statSync(monthDir).isDirectory()) continue;
      } catch (_e) {
        continue;
      }

      let files;
      try {
        files = fs.readdirSync(monthDir);
      } catch (_e) {
        continue;
      }

      for (const file of files) {
        if (!file.endsWith('.md')) continue;

        // Only process files matching the YYYY-MM-DD.md naming convention
        const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
        if (!dateMatch) continue;

        const dateStr = dateMatch[1];
        // Represent the file as its midnight UTC timestamp
        const dateMs = new Date(`${dateStr}T00:00:00.000Z`).getTime();
        if (isNaN(dateMs)) continue;

        // Include only files whose date is STRICTLY after sinceTimestamp
        if (dateMs > sinceTimestamp) {
          results.push({
            filePath: path.join(monthDir, file),
            dateStr,
            dateMs,
          });
        }
      }
    }
  }

  // Return in chronological order so earlier logs are processed first
  results.sort((a, b) => a.dateMs - b.dateMs);
  return results;
}

// ── Semantic Match Helper ─────────────────────────────────────────────────

/**
 * Strip common classification prefixes from consolidated log entries.
 * E.g., "Found a gotcha: X" → "X", "Discovered a pattern: Y" → "Y"
 */
function stripClassificationPrefix(text) {
  return String(text || '')
    .replace(
      /^(found\s+a\s+gotcha:\s*|discovered\s+a?\s*pattern:\s*|made\s+a\s+decision\s*(to\s+)?|found\s+an?\s+issue:\s*|learned\s+(that\s+)?)/i,
      ''
    )
    .trim();
}

/**
 * Find a semantically similar entry in an array (Jaccard >= 0.7).
 * Returns the matched entry object (mutable reference) or null.
 */
function findSemanticMatch(entries, candidateText, threshold = 0.7) {
  const candidate = stripClassificationPrefix(candidateText).toLowerCase();
  if (!candidate) return null;
  for (const entry of entries) {
    if (entry.archived) continue;
    const text = String(entry.text || '').toLowerCase();
    if (!text) continue;
    if (jaccardSimilarity(text, candidate) >= threshold) {
      return entry;
    }
  }
  return null;
}

// ── Structured File Writers ───────────────────────────────────────────────────

/**
 * Append a pattern entry to patterns.json.
 *
 * @param {string} patternsFile - Absolute path to patterns.json
 * @param {{ text: string, area: string, timestamp: string }} item
 */
function appendToPatterns(patternsFile, item) {
  const patterns = readJSONArray(patternsFile);
  const entry = {
    id: buildEntryId(item),
    text: item.text,
    area: item.area || 'main',
    timestamp: item.timestamp,
    archived: false,
  };
  // Check for semantic duplicates and supersede instead of blindly appending
  const matched = findSemanticMatch(patterns, item.text);
  if (matched) {
    matched.archived = true;
    entry.supersedes = matched.id;
  }
  patterns.push(entry);
  atomicWriteJSONSync(patternsFile, patterns);
}

/**
 * Append a gotcha entry to gotchas.json.
 *
 * @param {string} gotchasFile - Absolute path to gotchas.json
 * @param {{ text: string, area: string, timestamp: string }} item
 */
function appendToGotchas(gotchasFile, item) {
  const gotchas = readJSONArray(gotchasFile);
  const entry = {
    id: buildEntryId(item),
    text: item.text,
    area: item.area || 'main',
    timestamp: item.timestamp,
    archived: false,
  };
  const matched = findSemanticMatch(gotchas, item.text);
  if (matched) {
    matched.archived = true;
    entry.supersedes = matched.id;
  }
  gotchas.push(entry);
  atomicWriteJSONSync(gotchasFile, gotchas);
}

/**
 * Append a decision section to decisions.md (fail-open).
 *
 * @param {string} decisionsFile - Absolute path to decisions.md
 * @param {{ text: string, timestamp: string }} item
 */
function appendToDecisions(decisionsFile, item) {
  try {
    const date = item.timestamp
      ? item.timestamp.split('T')[0]
      : new Date().toISOString().split('T')[0];
    const section = `\n\n---\n\n## Decision (${date})\n\n**Date:** ${date}\n\n${item.text}\n`;
    fs.appendFileSync(decisionsFile, section, 'utf8');
  } catch (err) {
    console.warn('[memory-consolidator] Failed to append decision:', err.message || String(err));
  }
}

/**
 * Append an issue section to issues.md (fail-open).
 *
 * @param {string} issuesFile - Absolute path to issues.md
 * @param {{ text: string, timestamp: string }} item
 */
function appendToIssues(issuesFile, item) {
  try {
    const date = item.timestamp
      ? item.timestamp.split('T')[0]
      : new Date().toISOString().split('T')[0];
    const section = `\n\n---\n\n## Issue (${date})\n\n**Date:** ${date}\n\n${item.text}\n`;
    fs.appendFileSync(issuesFile, section, 'utf8');
  } catch (err) {
    console.warn('[memory-consolidator] Failed to append issue:', err.message || String(err));
  }
}

// ── Public: consolidate ───────────────────────────────────────────────────────

/**
 * Run the 4-phase consolidation cycle.
 *
 * @param {string}  [memoryDir]      - Base memory directory (defaults to MEMORY_DIR)
 * @param {number}  [sinceTimestamp] - Epoch ms; only process log files whose UTC date
 *                                     is strictly after this value.  Defaults to 0
 *                                     (process all logs).
 * @returns {{ processed: number, extracted: number, affectedFiles: string[] }}
 */
function consolidate(memoryDir, sinceTimestamp) {
  const effectiveDir = typeof memoryDir === 'string' && memoryDir ? memoryDir : MEMORY_DIR;
  const cutoff = typeof sinceTimestamp === 'number' && !isNaN(sinceTimestamp) ? sinceTimestamp : 0;

  // Phase 1 — Orient: resolve structured file paths
  const patternsFile = path.join(effectiveDir, 'patterns.json');
  const gotchasFile = path.join(effectiveDir, 'gotchas.json');
  const decisionsFile = path.join(effectiveDir, 'decisions.md');
  const issuesFile = path.join(effectiveDir, 'issues.md');

  // Phase 2 — Gather: find log files after the cutoff
  const logFiles = findLogsSince(effectiveDir, cutoff);

  if (logFiles.length === 0) {
    return { processed: 0, extracted: 0, affectedFiles: [] };
  }

  // Load manifest for idempotency tracking
  const processedPaths = readManifest(effectiveDir);
  const processedSet = new Set(processedPaths);

  const affectedFilesSet = new Set();
  let extractedCount = 0;
  let processedCount = 0;

  // Phase 3 — Consolidate: extract and route items to structured files
  for (const { filePath, dateStr } of logFiles) {
    // Skip already-processed log files (idempotency guarantee)
    if (processedSet.has(filePath)) {
      continue;
    }

    // Read the log file (fail-open on read errors)
    let logContent;
    try {
      logContent = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      console.warn(
        `[memory-consolidator] Skipping unreadable log: ${filePath}:`,
        err.message || String(err)
      );
      // Mark as processed so we don't retry indefinitely
      processedSet.add(filePath);
      processedPaths.push(filePath);
      continue;
    }

    // Skip empty or whitespace-only files
    if (!logContent || logContent.trim().length === 0) {
      processedSet.add(filePath);
      processedPaths.push(filePath);
      processedCount++;
      continue;
    }

    // Extract actionable items (fail-open)
    let items;
    try {
      items = extractActionableItems(logContent);
    } catch (err) {
      console.warn(
        `[memory-consolidator] Extraction failed for ${filePath}:`,
        err.message || String(err)
      );
      processedSet.add(filePath);
      processedPaths.push(filePath);
      continue;
    }

    // Use start-of-day UTC timestamp for structured entries derived from this log
    const entryTimestamp = `${dateStr}T00:00:00.000Z`;

    for (const item of items) {
      try {
        const entry = { text: item.text, area: 'main', timestamp: entryTimestamp };

        if (item.category === 'pattern') {
          appendToPatterns(patternsFile, entry);
          affectedFilesSet.add(patternsFile);
        } else if (item.category === 'gotcha') {
          appendToGotchas(gotchasFile, entry);
          affectedFilesSet.add(gotchasFile);
        } else if (item.category === 'decision') {
          appendToDecisions(decisionsFile, entry);
          affectedFilesSet.add(decisionsFile);
        } else if (item.category === 'issue') {
          appendToIssues(issuesFile, entry);
          affectedFilesSet.add(issuesFile);
        }

        extractedCount++;
      } catch (err) {
        console.warn('[memory-consolidator] Failed to append item:', err.message || String(err));
      }
    }

    processedSet.add(filePath);
    processedPaths.push(filePath);
    processedCount++;
  }

  // Persist updated manifest (idempotency state)
  writeManifest(effectiveDir, Array.from(processedSet));

  const affectedFiles = Array.from(affectedFilesSet);

  // Phase 4 — Prune: enforce 25KB / 200-line caps on affected markdown files
  // enforceMemoryCaps is designed for markdown; skip JSON files.
  for (const filePath of affectedFiles) {
    if (!filePath.endsWith('.md')) continue;
    try {
      enforceMemoryCaps(filePath);
    } catch (err) {
      console.warn(
        `[memory-consolidator] Cap enforcement failed on ${filePath}:`,
        err.message || String(err)
      );
    }
  }

  return { processed: processedCount, extracted: extractedCount, affectedFiles };
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  consolidate,
  extractActionableItems,
};
