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

module.exports = {
  parseSections,
  rotateIfNeeded,
};
