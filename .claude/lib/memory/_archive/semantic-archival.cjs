#!/usr/bin/env node
/**
 * Semantic Archival - Importance-Based Memory Management
 * =====================================================
 *
 * Archives learnings.md entries based on semantic importance rather than
 * simple line count or file size. Preserves critical knowledge while
 * archiving low-value entries.
 *
 * Preservation Rules:
 * - CRITICAL: Keep indefinitely (security fixes, iron laws)
 * - HIGH: Keep indefinitely (key patterns, important decisions)
 * - MEDIUM: Keep for 30 days
 * - LOW: Archive when space needed
 *
 * Integration: Uses learnings-parser.cjs for structured parsing.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Import the learnings parser
const learningsParser = require('./learnings-parser.cjs');

// BUG-001 Fix: Import findProjectRoot to prevent nested .claude folder creation
const { PROJECT_ROOT } = require('../utils/project-root.cjs');

// ============================================================================
// Preservation Rules
// ============================================================================

/**
 * Default preservation rules by importance level
 */
const PRESERVATION_RULES = {
  CRITICAL: {
    keep: true,
    maxAgeDays: Infinity,
    archive: false,
    description: 'Never archive - security fixes, iron laws',
  },
  HIGH: {
    keep: true,
    maxAgeDays: Infinity,
    archive: false,
    description: 'Keep indefinitely - key patterns, important decisions',
  },
  MEDIUM: {
    keep: true,
    maxAgeDays: 30,
    archive: true,
    description: 'Keep for 30 days - context-sensitive information',
  },
  LOW: {
    keep: false,
    maxAgeDays: 0,
    archive: true,
    description: 'Archive when space needed - notes, discoveries',
  },
};

/**
 * Get preservation rules
 * @returns {Object} Preservation rules by importance level
 */
function getPreservationRules() {
  return { ...PRESERVATION_RULES };
}

// ============================================================================
// Selection Logic
// ============================================================================

/**
 * Calculate the age of an entry in days
 * @param {Object} entry - Parsed entry with date field
 * @param {Date} referenceDate - Reference date for age calculation
 * @returns {number} Age in days (Infinity if no date)
 */
function getEntryAgeDays(entry, referenceDate) {
  if (!entry.date) {
    // Conservative: treat entries without dates as recent
    return 0;
  }

  const entryDate = new Date(entry.date);
  if (isNaN(entryDate.getTime())) {
    return 0;
  }

  const diffMs = referenceDate.getTime() - entryDate.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Determine if an entry should be kept based on preservation rules
 * @param {Object} entry - Parsed entry
 * @param {Date} referenceDate - Reference date for age calculation
 * @returns {boolean} True if entry should be kept
 */
function shouldKeepEntry(entry, referenceDate) {
  const importance = entry.importance || 'LOW';
  const rules = PRESERVATION_RULES[importance] || PRESERVATION_RULES.LOW;

  // Always keep if rule says keep and maxAge is Infinity
  if (rules.keep && rules.maxAgeDays === Infinity) {
    return true;
  }

  // Keep if rule says keep and within maxAge
  if (rules.keep) {
    const ageDays = getEntryAgeDays(entry, referenceDate);
    return ageDays <= rules.maxAgeDays;
  }

  // Archive if rule says archive
  return false;
}

/**
 * Select entries for archival vs keeping
 * @param {Array<Object>} entries - Parsed entries
 * @param {Date} referenceDate - Reference date for age calculation
 * @returns {Object} { toKeep: [...], toArchive: [...] }
 */
function selectForArchival(entries, referenceDate = new Date()) {
  if (!entries || entries.length === 0) {
    return { toKeep: [], toArchive: [] };
  }

  const toKeep = [];
  const toArchive = [];

  for (const entry of entries) {
    if (shouldKeepEntry(entry, referenceDate)) {
      toKeep.push(entry);
    } else {
      toArchive.push(entry);
    }
  }

  return { toKeep, toArchive };
}

// ============================================================================
// Archival Operations
// ============================================================================

/**
 * Get memory directory path
 * @param {string} projectRoot - Project root path
 * @returns {string} Memory directory path
 */
function getMemoryDir(projectRoot = PROJECT_ROOT) {
  return path.join(projectRoot, '.claude', 'context', 'memory');
}

/**
 * Ensure directory exists
 * @param {string} dirPath - Directory path to create
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Archive entries by importance level
 *
 * @param {string} projectRoot - Project root path
 * @param {Date} referenceDate - Reference date for age calculation
 * @param {Object} options - Options { targetSizeKB?: number }
 * @returns {Object} Result { archived, archivedCount, keptCount, archivePath, newSizeKB }
 */
function archiveByImportance(projectRoot = PROJECT_ROOT, referenceDate = new Date(), options = {}) {
  const { targetSizeKB } = options;

  const memoryDir = getMemoryDir(projectRoot);
  const learningsPath = path.join(memoryDir, 'learnings.md');
  const archiveDir = path.join(memoryDir, 'archive');

  const result = {
    archived: false,
    archivedCount: 0,
    keptCount: 0,
    archivePath: null,
    newSizeKB: 0,
    originalSizeKB: 0,
  };

  // Check if learnings.md exists
  if (!fs.existsSync(learningsPath)) {
    return result;
  }

  // Get original size
  const originalStats = fs.statSync(learningsPath);
  result.originalSizeKB = Math.round(originalStats.size / 1024);

  // Parse entries
  const content = fs.readFileSync(learningsPath, 'utf8');
  const entries = learningsParser.parseEntries(content);

  if (entries.length === 0) {
    return result;
  }

  // Select entries for archival
  const { toKeep, toArchive } = selectForArchival(entries, referenceDate);

  // If nothing to archive, return
  if (toArchive.length === 0) {
    result.keptCount = toKeep.length;
    result.newSizeKB = result.originalSizeKB;
    return result;
  }

  // Ensure archive directory exists
  ensureDir(archiveDir);

  // Create archive filename with timestamp
  const timestamp = referenceDate.toISOString().slice(0, 10); // YYYY-MM-DD
  const archiveFilename = `learnings-archived-${timestamp}.md`;
  const archivePath = path.join(archiveDir, archiveFilename);

  // Serialize entries for archive
  const archiveContent = serializeArchiveEntries(toArchive);

  // Append to archive file (may have content from same day)
  if (fs.existsSync(archivePath)) {
    fs.appendFileSync(archivePath, '\n\n' + archiveContent);
  } else {
    const header =
      `# Archived Learnings - ${timestamp}\n\n` +
      `Archived by semantic-archival (importance-based preservation)\n\n` +
      `---\n\n`;
    fs.writeFileSync(archivePath, header + archiveContent);
  }

  // Write remaining entries back to learnings.md
  const remainingContent = learningsParser.serializeEntries(toKeep);
  fs.writeFileSync(learningsPath, remainingContent);

  // Check if we need further reduction for targetSizeKB
  if (targetSizeKB) {
    const currentSize = fs.statSync(learningsPath).size;
    if (currentSize > targetSizeKB * 1024) {
      // Need to archive more aggressively
      // Re-read and try to archive MEDIUM entries (oldest first) until target reached
      const reRead = fs.readFileSync(learningsPath, 'utf8');
      const reEntries = learningsParser.parseEntries(reRead);

      const criticalAndHigh = reEntries.filter(
        e => e.importance === 'CRITICAL' || e.importance === 'HIGH'
      );
      const medium = reEntries.filter(e => e.importance === 'MEDIUM');

      // Sort MEDIUM entries by date (oldest first), entries without dates go first (assumed old)
      medium.sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return -1;
        if (!b.date) return 1;
        return new Date(a.date) - new Date(b.date);
      });

      // Archive MEDIUM entries one by one until target is reached
      const toArchiveMore = [];
      const toKeepMedium = [...medium];
      let projectedSize = currentSize;

      while (toKeepMedium.length > 0 && projectedSize > targetSizeKB * 1024) {
        const entryToArchive = toKeepMedium.shift();
        toArchiveMore.push(entryToArchive);
        projectedSize -= learningsParser.getEntrySize(entryToArchive);
      }

      // Archive selected MEDIUM entries
      if (toArchiveMore.length > 0) {
        const additionalArchive = serializeArchiveEntries(toArchiveMore);
        fs.appendFileSync(archivePath, '\n\n' + additionalArchive);

        const remainingEntries = [...criticalAndHigh, ...toKeepMedium];
        const minimalContent = learningsParser.serializeEntries(remainingEntries);
        fs.writeFileSync(learningsPath, minimalContent);

        result.archivedCount += toArchiveMore.length;
        result.keptCount = remainingEntries.length;
      }
    }
  }

  // Get final size
  const newStats = fs.statSync(learningsPath);
  result.newSizeKB = Math.round(newStats.size / 1024);

  result.archived = true;
  result.archivedCount = toArchive.length;
  result.keptCount = toKeep.length;
  result.archivePath = archivePath;

  return result;
}

/**
 * Serialize entries for archive file (includes metadata about archival)
 * @param {Array<Object>} entries - Entries to serialize
 * @returns {string} Markdown content
 */
function serializeArchiveEntries(entries) {
  if (!entries || entries.length === 0) return '';

  const lines = [];

  for (const entry of entries) {
    lines.push(`## [${entry.category || 'UNKNOWN'}] ${entry.title || 'Untitled'}`);

    if (entry.date) {
      lines.push(`**Date**: ${entry.date}`);
    }

    lines.push(`**Importance**: ${entry.importance || 'LOW'}`);
    lines.push(`**Archived**: ${new Date().toISOString().slice(0, 10)}`);

    if (entry.content) {
      lines.push('');
      lines.push(entry.content);
    }

    lines.push('\n---\n');
  }

  return lines.join('\n');
}

// ============================================================================
// Analysis Functions
// ============================================================================

/**
 * Analyze learnings.md and report statistics by importance
 * @param {string} projectRoot - Project root path
 * @param {Date} referenceDate - Reference date for age calculation
 * @returns {Object} Analysis statistics
 */
function analyzeLearnings(projectRoot = PROJECT_ROOT, referenceDate = new Date()) {
  const memoryDir = getMemoryDir(projectRoot);
  const learningsPath = path.join(memoryDir, 'learnings.md');

  const result = {
    exists: false,
    totalEntries: 0,
    totalSizeKB: 0,
    byImportance: {
      CRITICAL: { count: 0, sizeKB: 0 },
      HIGH: { count: 0, sizeKB: 0 },
      MEDIUM: { count: 0, sizeKB: 0 },
      LOW: { count: 0, sizeKB: 0 },
    },
    archivable: {
      count: 0,
      sizeKB: 0,
    },
    potentialSavings: 0,
  };

  if (!fs.existsSync(learningsPath)) {
    return result;
  }

  result.exists = true;

  const stats = fs.statSync(learningsPath);
  result.totalSizeKB = Math.round(stats.size / 1024);

  const content = fs.readFileSync(learningsPath, 'utf8');
  const entries = learningsParser.parseEntries(content);

  result.totalEntries = entries.length;

  for (const entry of entries) {
    const importance = entry.importance || 'LOW';
    const size = learningsParser.getEntrySize(entry);
    const sizeKB = size / 1024;

    if (result.byImportance[importance]) {
      result.byImportance[importance].count++;
      result.byImportance[importance].sizeKB += sizeKB;
    }

    if (!shouldKeepEntry(entry, referenceDate)) {
      result.archivable.count++;
      result.archivable.sizeKB += sizeKB;
    }
  }

  // Round KB values
  for (const level of Object.keys(result.byImportance)) {
    result.byImportance[level].sizeKB = Math.round(result.byImportance[level].sizeKB * 10) / 10;
  }
  result.archivable.sizeKB = Math.round(result.archivable.sizeKB * 10) / 10;
  result.potentialSavings = result.archivable.sizeKB;

  return result;
}

// ============================================================================
// CLI Interface
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'analyze': {
      const projectRoot = args[1] || PROJECT_ROOT;
      const analysis = analyzeLearnings(projectRoot);

      console.log('Learnings Analysis:');
      console.log(`  Total entries: ${analysis.totalEntries}`);
      console.log(`  Total size: ${analysis.totalSizeKB} KB`);
      console.log('  By importance:');
      for (const level of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']) {
        const data = analysis.byImportance[level];
        console.log(`    ${level}: ${data.count} entries (${data.sizeKB} KB)`);
      }
      console.log(
        `  Archivable: ${analysis.archivable.count} entries (${analysis.archivable.sizeKB} KB)`
      );
      console.log(`  Potential savings: ${analysis.potentialSavings} KB`);
      break;
    }

    case 'archive': {
      const projectRoot = args[1] || PROJECT_ROOT;
      const targetSizeKB = args[2] ? parseInt(args[2], 10) : undefined;

      const result = archiveByImportance(projectRoot, new Date(), { targetSizeKB });

      console.log('Archive Result:');
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'rules':
      console.log('Preservation Rules:');
      for (const [level, rules] of Object.entries(PRESERVATION_RULES)) {
        console.log(`  ${level}:`);
        console.log(`    Keep: ${rules.keep}`);
        console.log(
          `    Max Age: ${rules.maxAgeDays === Infinity ? 'Infinity' : rules.maxAgeDays + ' days'}`
        );
        console.log(`    ${rules.description}`);
      }
      break;

    default:
      console.log(`
Semantic Archival - Importance-Based Memory Management

Commands:
  analyze [projectRoot]           Analyze learnings.md by importance
  archive [projectRoot] [size]    Archive entries (optional target size in KB)
  rules                           Show preservation rules

Examples:
  node semantic-archival.cjs analyze
  node semantic-archival.cjs archive
  node semantic-archival.cjs archive . 30
  node semantic-archival.cjs rules
`);
  }
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Constants
  PRESERVATION_RULES,

  // Core functions
  getPreservationRules,
  selectForArchival,
  shouldKeepEntry,
  getEntryAgeDays,

  // Archival operations
  archiveByImportance,
  serializeArchiveEntries,

  // Analysis
  analyzeLearnings,
};
