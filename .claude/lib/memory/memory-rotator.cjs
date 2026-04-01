#!/usr/bin/env node
/**
 * Memory File Rotation Module
 * ============================
 *
 * Implements memory file rotation for learnings.md, decisions.md, issues.md.
 * When files exceed threshold size, archives oldest sections to warm storage.
 *
 * Security Features:
 * - Uses atomicWriteSync() for crash-safe writes (MF-002)
 * - Validates archive paths with validatePathWithinProject() (path traversal prevention)
 * - Preserves [PERMANENT] sections (never archived)
 * - Creates backups before destructive operations
 *
 * Implementation: ADR-102 (Memory Management Rebuild)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWriteSync, createBackup } = require('../utils/atomic-write.cjs');
const { validatePathWithinProject, PROJECT_ROOT } = require('../utils/project-root.cjs');

// Regex patterns (constants)
const SECTION_DELIMITER_REGEX = /^---$/m;
const H2_HEADER_REGEX = /^## /m;
const DATE_REGEX = /\*\*Date:\*\*\s*(\d{4}-\d{2}-\d{2})/i;
const PERMANENT_TAG_REGEX = /\[PERMANENT\]/i;
const RESOLVED_STATUS_REGEX = /\*\*Status:\s*RESOLVED\*\*/i;

// Default options — 25KB matches Claude Code's memory discipline (200 lines / 25KB cap)
const DEFAULT_THRESHOLD_KB = 25;
const DEFAULT_KEEP_SECTIONS = 10;
// For line-based fallback: group N lines into synthetic sections
const LINES_PER_SYNTHETIC_SECTION = 50;

// Cap constants for enforceMemoryCaps / memoryHealth
const KB_CAP = 25;
const LINE_CAP = 200;

// Canonical memory directory (relative to project root)
const MEMORY_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'memory');

/**
 * Parse a markdown memory file into sections.
 * Sections are delimited by `---` horizontal rules or `## ` H2 headers.
 *
 * @param {string} content - File content
 * @returns {Array<{ title: string, content: string, date: string|null,
 *                    isResolved: boolean, isPermanent: boolean }>}
 */
function parseSections(content) {
  if (!content || typeof content !== 'string') {
    return [];
  }

  let sections = [];

  // First, try splitting by '---' delimiter
  if (SECTION_DELIMITER_REGEX.test(content)) {
    const parts = content.split(SECTION_DELIMITER_REGEX);
    sections = parts
      .map(part => part.trim())
      .filter(part => part.length > 0)
      .map(part => createSectionObject(part));
  }
  // If no '---' delimiters, try splitting by '## ' H2 headers
  else if (H2_HEADER_REGEX.test(content)) {
    const lines = content.split('\n');
    let currentSection = [];
    let currentTitle = '';
    let foundFirstH2 = false;

    for (const line of lines) {
      // Only match H2 headers (##), not H1 (#) or H3 (###)
      if (line.match(/^## [^#]/)) {
        foundFirstH2 = true;
        // Save previous section if exists
        if (currentSection.length > 0) {
          sections.push(createSectionObject(currentSection.join('\n'), currentTitle));
        }
        // Start new section
        currentTitle = line.substring(3).trim(); // Remove '## ' prefix
        currentSection = [line];
      } else if (foundFirstH2) {
        // Only add lines to section after we've found the first H2
        currentSection.push(line);
      }
      // Skip lines before first H2 header
    }

    // Add the last section
    if (currentSection.length > 0) {
      sections.push(createSectionObject(currentSection.join('\n'), currentTitle));
    }
  }
  // No delimiters found — line-based fallback: group into synthetic sections
  // This handles flat bullet-point files (e.g., issues.md with [ROUTING WARN] lines)
  // that previously escaped rotation because parseSections returned a single section.
  else if (content.trim().length > 0) {
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    if (lines.length > LINES_PER_SYNTHETIC_SECTION) {
      for (let i = 0; i < lines.length; i += LINES_PER_SYNTHETIC_SECTION) {
        const chunk = lines.slice(i, i + LINES_PER_SYNTHETIC_SECTION);
        const chunkContent = chunk.join('\n');
        // Try to extract a date from the chunk for sorting
        const section = createSectionObject(chunkContent);
        // Also try ISO timestamp pattern common in log-style entries
        if (!section.date) {
          const isoMatch = chunkContent.match(/(\d{4}-\d{2}-\d{2})T/);
          if (isoMatch) section.date = isoMatch[1];
        }
        sections.push(section);
      }
    } else {
      sections = [createSectionObject(content)];
    }
  }

  return sections;
}

/**
 * Create a section object from content string.
 *
 * @param {string} content - Section content
 * @param {string} [explicitTitle] - Title extracted from H2 header (optional)
 * @returns {{ title: string, content: string, date: string|null, isResolved: boolean, isPermanent: boolean }}
 */
function createSectionObject(content, explicitTitle = '') {
  // Extract title from first line if not provided
  let title = explicitTitle;
  if (!title) {
    const firstLine = content.split('\n')[0].trim();
    title = firstLine.replace(/^#+\s*/, ''); // Remove markdown header markers
  }

  // Extract date from **Date:** pattern
  const dateMatch = content.match(DATE_REGEX);
  const date = dateMatch ? dateMatch[1] : null;

  // Detect flags
  const isPermanent = PERMANENT_TAG_REGEX.test(content);
  const isResolved = RESOLVED_STATUS_REGEX.test(content);

  return {
    title,
    content,
    date,
    isResolved,
    isPermanent,
  };
}

/**
 * Rotate a memory file if it exceeds the size threshold.
 * Archives oldest sections to warm storage, keeps N most recent + all [PERMANENT] sections.
 *
 * @param {string} filePath - Absolute path to memory file
 * @param {Object} options - Rotation options
 * @param {number} [options.thresholdKB=20] - Size threshold in KB
 * @param {number} [options.keepSections=10] - Number of recent sections to keep
 * @param {string} [options.archiveDir='archive'] - Archive directory name (relative to file)
 * @param {string} [options.projectRoot=PROJECT_ROOT] - Project root for path validation
 * @returns {{ rotated: boolean, archivedBytes?: number, sectionsArchived?: number }}
 */
function rotateIfNeeded(filePath, options = {}) {
  const {
    thresholdKB = DEFAULT_THRESHOLD_KB,
    keepSections = DEFAULT_KEEP_SECTIONS,
    archiveDir = 'archive',
    projectRoot = PROJECT_ROOT,
  } = options;

  // Validate file path is within project
  validatePathWithinProject(filePath, projectRoot);

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return { rotated: false };
  }

  // Check file size
  const stats = fs.statSync(filePath);
  const fileSizeKB = stats.size / 1024;

  if (fileSizeKB <= thresholdKB) {
    return { rotated: false };
  }

  // File is over threshold - proceed with rotation
  const content = fs.readFileSync(filePath, 'utf8');
  const sections = parseSections(content);

  if (sections.length === 0) {
    return { rotated: false };
  }

  // Sort sections by date (oldest first), with null dates at beginning
  const sortedSections = [...sections].sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return -1;
    if (!b.date) return 1;
    return a.date.localeCompare(b.date);
  });

  // Split sections: keep N most recent + all [PERMANENT]
  const permanentSections = sortedSections.filter(s => s.isPermanent);
  const nonPermanentSections = sortedSections.filter(s => !s.isPermanent);

  const recentSections = nonPermanentSections.slice(-keepSections);
  const sectionsToArchive = nonPermanentSections.slice(0, -keepSections);

  if (sectionsToArchive.length === 0) {
    // Nothing to archive (all sections are recent or permanent)
    return { rotated: false };
  }

  // Prepare archive file path
  const fileDir = path.dirname(filePath);
  const fileBasename = path.basename(filePath, '.md');
  const now = new Date();
  const archiveMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const archiveFileName = `${fileBasename}-${archiveMonth}.md`;

  const archiveDirPath = path.join(fileDir, archiveDir);
  const archiveFilePath = path.join(archiveDirPath, archiveFileName);

  // Validate archive path
  validatePathWithinProject(archiveFilePath, projectRoot);

  // Create archive directory if needed
  if (!fs.existsSync(archiveDirPath)) {
    fs.mkdirSync(archiveDirPath, { recursive: true });
  }

  // Build archive content (append to existing file if present)
  let archiveContent = sectionsToArchive.map(s => s.content).join('\n\n---\n\n');

  // Append to existing archive file if it exists
  if (fs.existsSync(archiveFilePath)) {
    const existingArchive = fs.readFileSync(archiveFilePath, 'utf8');
    archiveContent = existingArchive + '\n\n---\n\n' + archiveContent;
  } else {
    // Add header for new archive file
    archiveContent = `# ${fileBasename} Archive (${archiveMonth})\n\n` + archiveContent;
  }

  // Write archive file atomically
  atomicWriteSync(archiveFilePath, archiveContent);

  // Create backup of active file before truncation
  createBackup(filePath);

  // Build truncated active file content preserving original section order.
  const keepSectionsSet = new Set([...recentSections, ...permanentSections]);
  const keptSectionsInOriginalOrder = sections.filter(section => keepSectionsSet.has(section));
  const truncatedContent = keptSectionsInOriginalOrder.map(s => s.content).join('\n\n---\n\n');

  // Write truncated active file atomically
  atomicWriteSync(filePath, truncatedContent);

  // Clean up .bak file — rotation succeeded, backup is no longer needed
  const bakPath = filePath + '.bak';
  try {
    if (fs.existsSync(bakPath)) {
      fs.unlinkSync(bakPath);
    }
  } catch (_) {
    // Non-critical — .bak cleanup failure should not block rotation
  }

  // Clean up stale delegation PID files (> 24 hours old)
  try {
    const memoryDir = path.dirname(filePath);
    const entries = fs.readdirSync(memoryDir);
    const now = Date.now();
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    for (const entry of entries) {
      if (entry.startsWith('delegations.pid-') && entry.endsWith('.json')) {
        const fullPath = path.join(memoryDir, entry);
        const stat = fs.statSync(fullPath);
        if (now - stat.mtimeMs > ONE_DAY_MS) {
          fs.unlinkSync(fullPath);
        }
      }
    }
  } catch (_) {
    // Non-critical — delegation cleanup failure should not block rotation
  }

  // Calculate metrics
  const archivedBytes = sectionsToArchive.reduce((sum, s) => sum + s.content.length, 0);

  return {
    rotated: true,
    archivedBytes,
    sectionsArchived: sectionsToArchive.length,
  };
}

/**
 * Enforce dual caps (25KB and 200 lines) on a markdown memory file.
 *
 * When either cap is exceeded, oldest non-[PERMANENT] sections are pruned.
 * [PERMANENT] sections are always kept, even if the file remains slightly over cap.
 * Pruned content is archived to `<fileDir>/archive/<basename>-YYYY-MM-DD.md`
 * (appending to an existing same-day archive if present).
 * A warning line is appended to the active file after pruning.
 *
 * @param {string} filePath - Absolute path to the markdown file
 * @param {Object} [options]
 * @param {number} [options.kbCap=25] - KB cap
 * @param {number} [options.lineCap=200] - Line count cap
 * @param {string} [options.archiveDir='archive'] - Archive subdirectory name (relative to file dir)
 * @param {string} [options.projectRoot=PROJECT_ROOT] - Project root for path validation
 * @returns {{ pruned: boolean, archivedBytes?: number, sectionsArchived?: number }}
 */
function enforceMemoryCaps(filePath, options = {}) {
  const {
    kbCap = KB_CAP,
    lineCap = LINE_CAP,
    archiveDir = 'archive',
    projectRoot = PROJECT_ROOT,
  } = options;

  // Validate path is within project (advisory — matches existing rotateIfNeeded pattern)
  validatePathWithinProject(filePath, projectRoot);

  // Missing file → no-op
  if (!fs.existsSync(filePath)) {
    return { pruned: false };
  }

  // Read content
  const content = fs.readFileSync(filePath, 'utf8');

  // Empty file → no-op
  if (!content || content.trim().length === 0) {
    return { pruned: false };
  }

  // Check caps
  const sizeBytes = Buffer.byteLength(content, 'utf8');
  const lineCount = content.split('\n').length;
  const overKBCap = sizeBytes > kbCap * 1024;
  const overLineCap = lineCount > lineCap;

  if (!overKBCap && !overLineCap) {
    return { pruned: false };
  }

  // Parse into sections
  const sections = parseSections(content);
  if (sections.length === 0) {
    return { pruned: false };
  }

  // Separate permanent from non-permanent sections
  const permanentSections = sections.filter(s => s.isPermanent);
  const nonPermanentSections = sections.filter(s => !s.isPermanent);

  // Sort non-permanent by date, oldest first (null dates sort first → archived first)
  const sortedNonPermanent = [...nonPermanentSections].sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return -1;
    if (!b.date) return 1;
    return a.date.localeCompare(b.date);
  });

  const sectionsToArchive = [];
  // remainingNonPermanent starts oldest-first; we shift() from the front to archive oldest first
  const remainingNonPermanent = [...sortedNonPermanent];

  // Remove oldest non-permanent sections until both caps satisfied (or none remain)
  while (remainingNonPermanent.length > 0) {
    // Compute current content size with permanents + remaining non-permanents in original order
    const currentSet = new Set([...permanentSections, ...remainingNonPermanent]);
    const currentSectionsInOrder = sections.filter(s => currentSet.has(s));
    const currentContent = currentSectionsInOrder.map(s => s.content).join('\n\n---\n\n');
    const currentBytes = Buffer.byteLength(currentContent, 'utf8');
    const currentLines = currentContent.split('\n').length;

    if (currentBytes <= kbCap * 1024 && currentLines <= lineCap) {
      break; // Both caps satisfied
    }

    // Remove oldest non-permanent section
    sectionsToArchive.push(remainingNonPermanent.shift());
  }

  // If nothing was archived (can happen if only permanents exist and they're over cap)
  if (sectionsToArchive.length === 0) {
    return { pruned: false };
  }

  // Prepare archive path — daily: <basename>-YYYY-MM-DD.md
  const now = new Date();
  const dateStr = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');

  const fileDir = path.dirname(filePath);
  const fileBasename = path.basename(filePath, '.md');
  const archiveFileName = `${fileBasename}-${dateStr}.md`;
  const archiveDirPath = path.join(fileDir, archiveDir);
  const archiveFilePath = path.join(archiveDirPath, archiveFileName);

  validatePathWithinProject(archiveFilePath, projectRoot);

  // Create archive directory if needed
  if (!fs.existsSync(archiveDirPath)) {
    fs.mkdirSync(archiveDirPath, { recursive: true });
  }

  // Build archive content; append to existing same-day archive
  const archivedBody = sectionsToArchive.map(s => s.content).join('\n\n---\n\n');
  let archiveContent;
  if (fs.existsSync(archiveFilePath)) {
    const existing = fs.readFileSync(archiveFilePath, 'utf8');
    archiveContent = existing + '\n\n---\n\n' + archivedBody;
  } else {
    archiveContent = `# ${fileBasename} Archive (${dateStr})\n\n${archivedBody}`;
  }

  atomicWriteSync(archiveFilePath, archiveContent);

  // Rebuild active file in original section order
  const keepSet = new Set([...permanentSections, ...remainingNonPermanent]);
  const keptInOrder = sections.filter(s => keepSet.has(s));
  const newContent = keptInOrder.map(s => s.content).join('\n\n---\n\n');

  // Append warning line
  const warningLine = `\n\n> ⚠️ Content archived to archive/${archiveFileName} on ${dateStr}`;
  atomicWriteSync(filePath, newContent + warningLine);

  const archivedBytes = sectionsToArchive.reduce(
    (sum, s) => sum + Buffer.byteLength(s.content, 'utf8'),
    0
  );

  return {
    pruned: true,
    archivedBytes,
    sectionsArchived: sectionsToArchive.length,
  };
}

/**
 * Report memory health for all markdown files in the memory directory.
 *
 * Returns the file name, size in bytes, line count, and whether each cap
 * (25KB / 200 lines) is exceeded.  Only top-level `.md` files are scanned
 * (subdirectories such as archive/, stm/, mtm/ are excluded).
 *
 * @param {Object} [options]
 * @param {string} [options.memoryDir] - Directory to scan (defaults to MEMORY_DIR)
 * @returns {Array<{ file: string, sizeBytes: number, lineCount: number,
 *                   overKBCap: boolean, overLineCap: boolean }>}
 */
function memoryHealth(options = {}) {
  const { memoryDir = MEMORY_DIR } = options;

  if (!fs.existsSync(memoryDir)) {
    return [];
  }

  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(memoryDir);
  } catch (_) {
    return [];
  }

  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;

    const filePath = path.join(memoryDir, entry);

    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch (_) {
      continue;
    }

    if (!stat.isFile()) continue;

    let fileContent = '';
    try {
      fileContent = fs.readFileSync(filePath, 'utf8');
    } catch (_) {
      continue;
    }

    const sizeBytes = stat.size;
    const lineCount = fileContent.split('\n').length;

    results.push({
      file: entry,
      sizeBytes,
      lineCount,
      overKBCap: sizeBytes > KB_CAP * 1024,
      overLineCap: lineCount > LINE_CAP,
    });
  }

  return results;
}

module.exports = {
  parseSections,
  rotateIfNeeded,
  enforceMemoryCaps,
  memoryHealth,
};
