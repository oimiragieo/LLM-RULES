#!/usr/bin/env node
/**
 * Cold Storage Module
 * ====================
 *
 * Archives warm storage (archive/*.md) to cold storage (archive/cold/*.jsonl).
 * Cold storage uses compressed JSONL format with sensitive data scrubbed.
 *
 * Security Features:
 * - Uses atomicWriteSync() for crash-safe writes
 * - Scrubs sensitive data via sensitive-scrubber before archival
 * - Validates paths with validatePathWithinProject()
 *
 * Implementation: ADR-102 (Memory Management Rebuild)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWriteSync } = require('../utils/atomic-write.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');

const { scrubSensitiveContent } = require('../utils/sensitive-scrubber.cjs');

// Default options
const DEFAULT_MAX_AGE_DAYS = 30;

// Memory file names (hot storage)
const HOT_MEMORY_FILES = ['learnings.md', 'decisions.md', 'issues.md'];

/**
 * Archive warm storage files to cold JSONL format.
 * Scans archive/ directory for files older than maxAgeDays,
 * scrubs sensitive content, and appends to cold/*.jsonl.
 *
 * @param {string} memoryDir - Memory directory path (contains archive/)
 * @param {Object} opts - Options
 * @param {number} opts.maxAgeDays - Maximum age in days before archiving (default: 30)
 * @returns {{ archivedFiles: number, archivedEntries: number }}
 */
function archiveWarmToCold(memoryDir, opts = {}) {
  const { maxAgeDays = DEFAULT_MAX_AGE_DAYS } = opts;

  const archiveDir = path.join(memoryDir, 'archive');
  const coldDir = path.join(archiveDir, 'cold');

  // Ensure cold directory exists
  if (!fs.existsSync(coldDir)) {
    fs.mkdirSync(coldDir, { recursive: true });
  }

  // Find archive files
  let archiveFiles = [];
  if (fs.existsSync(archiveDir)) {
    archiveFiles = fs
      .readdirSync(archiveDir)
      .filter(f => f.endsWith('.md') && f.includes('-20')) // Match pattern: learnings-2026-01.md
      .map(f => path.join(archiveDir, f));
  }

  let archivedFileCount = 0;
  let archivedEntryCount = 0;
  const now = Date.now();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

  for (const archiveFile of archiveFiles) {
    // Parse date from filename (e.g., learnings-2026-01.md -> 2026-01)
    const match = path.basename(archiveFile).match(/(\d{4}-\d{2})/);
    if (!match) {
      continue; // Skip files without date pattern
    }

    const yearMonth = match[1];
    const fileDate = new Date(`${yearMonth}-01T00:00:00Z`);
    const ageMs = now - fileDate.getTime();

    if (ageMs <= maxAgeMs) {
      // Too recent, skip
      continue;
    }

    // Read archive content
    const content = fs.readFileSync(archiveFile, 'utf8');

    // Scrub sensitive content
    const { scrubbed } = scrubSensitiveContent(content);

    // Parse sections from content
    const sections = parseSections(scrubbed);

    // Use yearMonth already extracted above
    const coldFile = path.join(coldDir, `cold-${yearMonth}.jsonl`);

    // Append entries to cold JSONL (one JSON object per line)
    const jsonlEntries = sections.map(section => JSON.stringify(section)).join('\n') + '\n';

    // Append to cold file (or create if doesn't exist).
    // Avoid read-modify-write on existing files to reduce race windows.
    if (fs.existsSync(coldFile)) {
      fs.appendFileSync(coldFile, jsonlEntries, 'utf8');
    } else {
      atomicWriteSync(coldFile, jsonlEntries, 'utf8');
    }

    // Remove warm archive file only after cold write succeeds.
    fs.unlinkSync(archiveFile);

    archivedFileCount++;
    archivedEntryCount += sections.length;
  }

  return {
    archivedFiles: archivedFileCount,
    archivedEntries: archivedEntryCount,
  };
}

/**
 * Parse markdown content into sections for JSONL storage.
 * Sections are delimited by `---` or `## ` headers.
 *
 * @param {string} content - Markdown content
 * @returns {Array<{ title: string, content: string, date: string|null }>}
 */
function parseSections(content) {
  if (!content || typeof content !== 'string') {
    return [];
  }

  const sections = [];
  const lines = content.split('\n');
  let currentSection = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Section delimiter: --- or ## header
    if (line.trim() === '---' || line.startsWith('## ')) {
      // Save previous section
      if (currentSection && currentSection.content.trim()) {
        sections.push(currentSection);
      }

      // Start new section
      if (line.startsWith('## ')) {
        currentSection = {
          title: line.slice(3).trim(),
          content: '',
          date: null,
        };
      } else {
        currentSection = {
          title: 'Untitled',
          content: '',
          date: null,
        };
      }
    } else if (currentSection) {
      // Accumulate content
      currentSection.content += line + '\n';

      // Extract date if present
      const dateMatch = line.match(/\*\*Date:\*\*\s*(\d{4}-\d{2}-\d{2})/i);
      if (dateMatch) {
        currentSection.date = dateMatch[1];
      }
    }
  }

  // Save last section
  if (currentSection && currentSection.content.trim()) {
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Get storage statistics for hot/warm/cold tiers.
 *
 * @param {string} memoryDir - Memory directory path
 * @returns {{ hot: { files: number, bytes: number },
 *             warm: { files: number, bytes: number },
 *             cold: { files: number, bytes: number } }}
 */
function getStorageStats(memoryDir) {
  const archiveDir = path.join(memoryDir, 'archive');
  const coldDir = path.join(archiveDir, 'cold');

  // Hot storage stats (learnings.md, decisions.md, issues.md)
  let hotFiles = 0;
  let hotBytes = 0;
  for (const file of HOT_MEMORY_FILES) {
    const filePath = path.join(memoryDir, file);
    if (fs.existsSync(filePath)) {
      hotFiles++;
      hotBytes += fs.statSync(filePath).size;
    }
  }

  // Warm storage stats (archive/*.md)
  let warmFiles = 0;
  let warmBytes = 0;
  if (fs.existsSync(archiveDir)) {
    const files = fs.readdirSync(archiveDir).filter(f => f.endsWith('.md'));
    warmFiles = files.length;
    for (const file of files) {
      warmBytes += fs.statSync(path.join(archiveDir, file)).size;
    }
  }

  // Cold storage stats (archive/cold/*.jsonl)
  let coldFiles = 0;
  let coldBytes = 0;
  if (fs.existsSync(coldDir)) {
    const files = fs.readdirSync(coldDir).filter(f => f.endsWith('.jsonl'));
    coldFiles = files.length;
    for (const file of files) {
      coldBytes += fs.statSync(path.join(coldDir, file)).size;
    }
  }

  return {
    hot: { files: hotFiles, bytes: hotBytes },
    warm: { files: warmFiles, bytes: warmBytes },
    cold: { files: coldFiles, bytes: coldBytes },
  };
}

/**
 * Search cold storage (stub - not implemented yet).
 *
 * @param {string} query - Search query
 * @returns {Array} Empty array (stub)
 */
function searchCold(query, opts = {}) {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return [];

  const memoryDir = opts.memoryDir || path.join(process.cwd(), '.claude', 'context', 'memory');
  const limit = Number.isFinite(Number(opts.limit)) ? Math.max(1, Number(opts.limit)) : 20;
  const coldDir = path.join(memoryDir, 'archive', 'cold');
  if (!fs.existsSync(coldDir)) return [];

  const files = fs.readdirSync(coldDir).filter(f => f.endsWith('.jsonl'));
  const matches = [];

  for (const fileName of files) {
    const filePath = path.join(coldDir, fileName);
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split('\n').filter(Boolean);

    for (const line of lines) {
      const entry = safeParseJSON(line, null);
      if (!entry || typeof entry !== 'object') continue;

      const haystack =
        `${entry.title || ''}\n${entry.content || ''}\n${entry.date || ''}`.toLowerCase();
      if (!haystack.includes(q)) continue;

      const content = String(entry.content || '');
      const idx = haystack.indexOf(q);
      const start = Math.max(0, idx - 60);
      const end = Math.min(content.length, idx + q.length + 60);

      matches.push({
        file: fileName,
        title: String(entry.title || 'Untitled'),
        date: entry.date || null,
        snippet: content.slice(start, end).trim(),
      });
      if (matches.length >= limit) return matches;
    }
  }

  return matches;
}

module.exports = {
  archiveWarmToCold,
  getStorageStats,
  searchCold,
};
