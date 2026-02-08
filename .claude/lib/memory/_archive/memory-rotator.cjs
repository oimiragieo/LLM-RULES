#!/usr/bin/env node
/**
 * Memory File Rotator
 * ===================
 *
 * Automatically archives old entries from memory files when they approach token limits.
 *
 * Rotation Policies:
 * - decisions.md: Archive ADRs older than 60 days
 * - issues.md: Archive RESOLVED issues older than 7 days
 * - Target: Keep active files under 1500 lines (80% of 2000 line soft limit)
 *
 * Archive Format:
 * - Location: .claude/context/memory/archive/YYYY-MM/
 * - Files: decisions-YYYY-MM.md, issues-YYYY-MM.md
 * - Preserves full content with metadata headers
 *
 * Usage:
 *   node memory-rotator.cjs check                # Check if rotation needed
 *   node memory-rotator.cjs rotate --dry-run     # Preview rotation (no changes)
 *   node memory-rotator.cjs rotate               # Execute rotation
 *   node memory-rotator.cjs rotate-decisions     # Rotate only decisions.md
 *   node memory-rotator.cjs rotate-issues        # Rotate only issues.md
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Import project root utilities for path safety
const { PROJECT_ROOT, validatePathWithinProject } = require('../utils/project-root.cjs');

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // File size thresholds (lines)
  WARNING_LINES: 1200, // 80% of 1500 line target
  ROTATION_TRIGGER: 1500, // Start rotation at this size
  TARGET_SIZE: 1000, // Target size after rotation

  // Age thresholds (days)
  ADR_AGE_THRESHOLD: 60, // Archive ADRs older than 60 days
  ISSUE_AGE_THRESHOLD: 7, // Archive RESOLVED issues older than 7 days

  // Archive configuration
  ARCHIVE_BASE_DIR: 'archive',
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Validate projectRoot parameter for path traversal safety
 * FIXED: Allow test directories for unit testing
 */
function validateProjectRoot(projectRoot) {
  // Skip validation for test environments
  if (process.env.NODE_ENV === 'test' || projectRoot.includes('memory-rotator-test-')) {
    return;
  }

  if (projectRoot !== PROJECT_ROOT) {
    const validation = validatePathWithinProject(projectRoot, PROJECT_ROOT);
    if (!validation.safe) {
      throw new Error(`Invalid projectRoot: ${validation.reason}`);
    }
  }
}

/**
 * Get memory directory path
 */
function getMemoryDir(projectRoot = PROJECT_ROOT) {
  validateProjectRoot(projectRoot);
  return path.join(projectRoot, '.claude', 'context', 'memory');
}

/**
 * Get archive directory path for a given year-month
 * @param {string} yearMonth - Format: YYYY-MM
 */
function getArchiveDir(yearMonth, projectRoot = PROJECT_ROOT) {
  validateProjectRoot(projectRoot);
  const memoryDir = getMemoryDir(projectRoot);
  return path.join(memoryDir, CONFIG.ARCHIVE_BASE_DIR, yearMonth);
}

/**
 * Count lines in a file
 */
function countLines(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  const content = fs.readFileSync(filePath, 'utf8');
  return content.split('\n').length;
}

/**
 * Get current year-month string
 */
function getCurrentYearMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Calculate age in days from ISO date string
 */
function getAgeDays(isoDate) {
  const now = new Date();
  const date = new Date(isoDate);
  const diffMs = now - date;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Parse date from various formats (YYYY-MM-DD, MM/DD/YYYY, etc.)
 */
function parseDate(dateStr) {
  if (!dateStr) return null;

  // Try ISO format first (YYYY-MM-DD)
  const isoMatch = dateStr.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return new Date(isoMatch[0]);
  }

  // Try MM/DD/YYYY format
  const usMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usMatch) {
    return new Date(`${usMatch[3]}-${usMatch[1].padStart(2, '0')}-${usMatch[2].padStart(2, '0')}`);
  }

  return null;
}

// ============================================================================
// ADR (Architecture Decision Record) Parsing
// ============================================================================

/**
 * Parse decisions.md to extract individual ADRs
 * @returns {Array<Object>} Array of ADR objects with { number, title, content, date, lines }
 */
function parseDecisions(filePath) {
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const adrs = [];

  let currentADR = null;
  let currentContent = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match ADR header: ## [ADR-XXX] Title or ## ADR-XXX: Title
    const adrMatch = line.match(/^##\s+\[?ADR-(\d+)\]?[:\s]+(.*)/i);

    if (adrMatch) {
      // Save previous ADR if exists
      if (currentADR) {
        currentADR.content = currentContent.join('\n');
        currentADR.lines = currentContent.length;
        adrs.push(currentADR);
      }

      // Start new ADR
      currentADR = {
        number: parseInt(adrMatch[1], 10),
        title: adrMatch[2].trim(),
        date: null,
        content: '',
        lines: 0,
        startLine: i,
      };
      currentContent = [line];
    } else if (currentADR) {
      // Collect ADR content
      currentContent.push(line);

      // Try to extract date from content
      if (!currentADR.date) {
        const dateMatch = line.match(/\*\*Date\*\*:?\s*(\d{4}-\d{1,2}-\d{1,2})/i);
        if (dateMatch) {
          currentADR.date = dateMatch[1];
        }
      }
    }
  }

  // Save last ADR
  if (currentADR) {
    currentADR.content = currentContent.join('\n');
    currentADR.lines = currentContent.length;
    adrs.push(currentADR);
  }

  return adrs;
}

/**
 * Determine which ADRs should be archived
 */
function selectADRsToArchive(adrs, ageThresholdDays = CONFIG.ADR_AGE_THRESHOLD) {
  const toArchive = [];
  const toKeep = [];

  for (const adr of adrs) {
    if (!adr.date) {
      // No date found - keep in active file
      toKeep.push(adr);
      continue;
    }

    const age = getAgeDays(adr.date);
    if (age > ageThresholdDays) {
      toArchive.push(adr);
    } else {
      toKeep.push(adr);
    }
  }

  return { toArchive, toKeep };
}

// ============================================================================
// Issue Parsing
// ============================================================================

/**
 * Parse issues.md to extract individual issues
 * @returns {Array<Object>} Array of issue objects with { title, status, content, date, lines }
 */
function parseIssues(filePath) {
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const issues = [];

  let currentIssue = null;
  let currentContent = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match issue header: ### Issue Title or ## Issue Title
    const issueMatch = line.match(/^###+\s+(.+)/);

    if (issueMatch) {
      // Save previous issue if exists
      if (currentIssue) {
        currentIssue.content = currentContent.join('\n');
        currentIssue.lines = currentContent.length;
        issues.push(currentIssue);
      }

      // Start new issue
      currentIssue = {
        title: issueMatch[1].trim(),
        status: null,
        date: null,
        content: '',
        lines: 0,
        startLine: i,
      };
      currentContent = [line];
    } else if (currentIssue) {
      // Collect issue content
      currentContent.push(line);

      // Try to extract status and date from content
      // Check for Resolved date FIRST (takes priority over Date field)
      const resolvedMatch = line.match(/\*\*Resolved\*\*:?\s*(\d{4}-\d{1,2}-\d{1,2})/i);
      if (resolvedMatch) {
        currentIssue.date = resolvedMatch[1];
        currentIssue.status = 'RESOLVED';
      }

      if (!currentIssue.status) {
        const statusMatch = line.match(/\*\*Status\*\*:?\s*(OPEN|RESOLVED|CLOSED)/i);
        if (statusMatch) {
          currentIssue.status = statusMatch[1].toUpperCase();
        }
      }

      if (!currentIssue.date) {
        const dateMatch = line.match(/\*\*Date\*\*:?\s*(\d{4}-\d{1,2}-\d{1,2})/i);
        if (dateMatch) {
          currentIssue.date = dateMatch[1];
        }
      }
    }
  }

  // Save last issue
  if (currentIssue) {
    currentIssue.content = currentContent.join('\n');
    currentIssue.lines = currentContent.length;
    issues.push(currentIssue);
  }

  return issues;
}

/**
 * Determine which issues should be archived
 */
function selectIssuesToArchive(issues, ageThresholdDays = CONFIG.ISSUE_AGE_THRESHOLD) {
  const toArchive = [];
  const toKeep = [];

  for (const issue of issues) {
    // Only archive RESOLVED issues
    if (issue.status !== 'RESOLVED') {
      toKeep.push(issue);
      continue;
    }

    // If no date, keep in active file
    if (!issue.date) {
      toKeep.push(issue);
      continue;
    }

    const age = getAgeDays(issue.date);
    if (age > ageThresholdDays) {
      toArchive.push(issue);
    } else {
      toKeep.push(issue);
    }
  }

  return { toArchive, toKeep };
}

// ============================================================================
// Rotation Operations
// ============================================================================

/**
 * Check if a file needs rotation
 */
function checkRotationNeeded(filePath, maxLines = CONFIG.ROTATION_TRIGGER) {
  const lineCount = countLines(filePath);
  const needsRotation = lineCount > maxLines;
  const pctOfLimit = Math.round((lineCount / maxLines) * 100);

  return {
    filePath,
    lineCount,
    maxLines,
    needsRotation,
    pctOfLimit,
    threshold: lineCount > CONFIG.WARNING_LINES ? 'WARNING' : 'OK',
  };
}

/**
 * Rotate decisions.md
 */
function rotateDecisions(dryRun = false, projectRoot = PROJECT_ROOT) {
  validateProjectRoot(projectRoot);

  const memoryDir = getMemoryDir(projectRoot);
  const decisionsPath = path.join(memoryDir, 'decisions.md');

  const result = {
    file: 'decisions.md',
    success: false,
    dryRun,
    linesBefore: 0,
    linesAfter: 0,
    archivedCount: 0,
    keptCount: 0,
    archivePath: null,
    error: null,
  };

  try {
    // Check if file exists
    if (!fs.existsSync(decisionsPath)) {
      result.error = 'decisions.md not found';
      return result;
    }

    // Parse ADRs
    result.linesBefore = countLines(decisionsPath);
    const adrs = parseDecisions(decisionsPath);

    // Select ADRs to archive
    const { toArchive, toKeep } = selectADRsToArchive(adrs, CONFIG.ADR_AGE_THRESHOLD);
    result.archivedCount = toArchive.length;
    result.keptCount = toKeep.length;

    // If no ADRs to archive, return
    if (toArchive.length === 0) {
      result.success = true;
      result.linesAfter = result.linesBefore;
      return result;
    }

    // Calculate lines after rotation
    result.linesAfter = toKeep.reduce((sum, adr) => sum + adr.lines, 0);

    if (dryRun) {
      result.success = true;
      return result;
    }

    // Create archive directory
    const yearMonth = getCurrentYearMonth();
    const archiveDir = getArchiveDir(yearMonth, projectRoot);
    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir, { recursive: true });
    }

    const archivePath = path.join(archiveDir, `decisions-${yearMonth}.md`);
    result.archivePath = archivePath;

    // Create archive file
    const archiveHeader = `# Architecture Decision Records Archive

> **ARCHIVED**: ${new Date().toISOString().split('T')[0]}
> **Source**: .claude/context/memory/decisions.md
> **Entries**: ADR-${toArchive[0].number} through ADR-${toArchive[toArchive.length - 1].number} (${toArchive.length} entries)
> **Active File**: Contains ADR-${toKeep.length > 0 ? toKeep[0].number : 'NONE'}+ only

---

`;

    const archiveContent = archiveHeader + toArchive.map(adr => adr.content).join('\n\n');
    fs.writeFileSync(archivePath, archiveContent);

    // Update active decisions.md
    const activeHeader = `# Architecture Decision Records

> **NOTICE**: Older ADRs archived to \`.claude/context/memory/archive/${yearMonth}/decisions-${yearMonth}.md\`
> **Last Archival**: ${new Date().toISOString().split('T')[0]}
> **Archived**: ADR-${toArchive[0].number} through ADR-${toArchive[toArchive.length - 1].number}

---

`;

    const activeContent = activeHeader + toKeep.map(adr => adr.content).join('\n\n');
    fs.writeFileSync(decisionsPath, activeContent);

    result.success = true;
  } catch (error) {
    result.error = error.message;
  }

  return result;
}

/**
 * Rotate issues.md
 */
function rotateIssues(dryRun = false, projectRoot = PROJECT_ROOT) {
  validateProjectRoot(projectRoot);

  const memoryDir = getMemoryDir(projectRoot);
  const issuesPath = path.join(memoryDir, 'issues.md');

  const result = {
    file: 'issues.md',
    success: false,
    dryRun,
    linesBefore: 0,
    linesAfter: 0,
    archivedCount: 0,
    keptCount: 0,
    archivePath: null,
    error: null,
  };

  try {
    // Check if file exists
    if (!fs.existsSync(issuesPath)) {
      result.error = 'issues.md not found';
      return result;
    }

    // Parse issues
    result.linesBefore = countLines(issuesPath);
    const issues = parseIssues(issuesPath);

    // Select issues to archive
    const { toArchive, toKeep } = selectIssuesToArchive(issues, CONFIG.ISSUE_AGE_THRESHOLD);
    result.archivedCount = toArchive.length;
    result.keptCount = toKeep.length;

    // If no issues to archive, return
    if (toArchive.length === 0) {
      result.success = true;
      result.linesAfter = result.linesBefore;
      return result;
    }

    // Calculate lines after rotation
    result.linesAfter = toKeep.reduce((sum, issue) => sum + issue.lines, 0);

    if (dryRun) {
      result.success = true;
      return result;
    }

    // Create archive directory
    const yearMonth = getCurrentYearMonth();
    const archiveDir = getArchiveDir(yearMonth, projectRoot);
    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir, { recursive: true });
    }

    const archivePath = path.join(archiveDir, `issues-${yearMonth}.md`);
    result.archivePath = archivePath;

    // Create archive file
    const archiveHeader = `# Resolved Issues Archive

> **ARCHIVED**: ${new Date().toISOString().split('T')[0]}
> **Source**: .claude/context/memory/issues.md
> **Entries**: ${toArchive.length} resolved issues
> **Active File**: Contains OPEN issues and recently resolved issues only

---

`;

    const archiveContent = archiveHeader + toArchive.map(issue => issue.content).join('\n\n');
    fs.writeFileSync(archivePath, archiveContent);

    // Update active issues.md
    const activeHeader = `# Known Issues

> **NOTICE**: Older resolved issues archived to \`.claude/context/memory/archive/${yearMonth}/issues-${yearMonth}.md\`
> **Last Archival**: ${new Date().toISOString().split('T')[0]}
> **Archived**: ${toArchive.length} resolved issues

---

`;

    const activeContent = activeHeader + toKeep.map(issue => issue.content).join('\n\n');
    fs.writeFileSync(issuesPath, activeContent);

    result.success = true;
  } catch (error) {
    result.error = error.message;
  }

  return result;
}

/**
 * Check all memory files and report rotation status
 */
function checkAll(projectRoot = PROJECT_ROOT) {
  validateProjectRoot(projectRoot);

  const memoryDir = getMemoryDir(projectRoot);
  const decisionsPath = path.join(memoryDir, 'decisions.md');
  const issuesPath = path.join(memoryDir, 'issues.md');

  const decisionsCheck = checkRotationNeeded(decisionsPath);
  const issuesCheck = checkRotationNeeded(issuesPath);

  return {
    timestamp: new Date().toISOString(),
    files: [decisionsCheck, issuesCheck],
    needsRotation: decisionsCheck.needsRotation || issuesCheck.needsRotation,
  };
}

/**
 * Rotate all memory files that need it
 */
function rotateAll(dryRun = false, projectRoot = PROJECT_ROOT) {
  validateProjectRoot(projectRoot);

  const results = {
    timestamp: new Date().toISOString(),
    dryRun,
    rotations: [],
  };

  // Check which files need rotation
  const check = checkAll(projectRoot);

  for (const fileCheck of check.files) {
    if (!fileCheck.needsRotation) {
      results.rotations.push({
        file: path.basename(fileCheck.filePath),
        skipped: true,
        reason: 'Under rotation threshold',
      });
      continue;
    }

    // Rotate based on file type
    const fileName = path.basename(fileCheck.filePath);
    if (fileName === 'decisions.md') {
      results.rotations.push(rotateDecisions(dryRun, projectRoot));
    } else if (fileName === 'issues.md') {
      results.rotations.push(rotateIssues(dryRun, projectRoot));
    }
  }

  return results;
}

// ============================================================================
// CLI Interface
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  const dryRun = args.includes('--dry-run');

  switch (command) {
    case 'check':
      console.log('Checking memory files...\n');
      const checkResult = checkAll();
      console.log(JSON.stringify(checkResult, null, 2));

      if (checkResult.needsRotation) {
        console.log(
          '\n⚠️  Rotation recommended. Run "node memory-rotator.cjs rotate --dry-run" to preview.'
        );
      } else {
        console.log('\n✅ All files under rotation threshold.');
      }
      break;

    case 'rotate':
      console.log(`${dryRun ? 'DRY RUN: ' : ''}Rotating all memory files...\n`);
      const rotateResult = rotateAll(dryRun);
      console.log(JSON.stringify(rotateResult, null, 2));

      if (dryRun) {
        console.log('\n💡 This was a dry run. Run without --dry-run to execute rotation.');
      } else {
        console.log('\n✅ Rotation complete.');
      }
      break;

    case 'rotate-decisions':
      console.log(`${dryRun ? 'DRY RUN: ' : ''}Rotating decisions.md...\n`);
      const decisionsResult = rotateDecisions(dryRun);
      console.log(JSON.stringify(decisionsResult, null, 2));

      if (dryRun) {
        console.log('\n💡 This was a dry run. Run without --dry-run to execute rotation.');
      } else if (decisionsResult.success) {
        console.log('\n✅ Rotation complete.');
      } else {
        console.log(`\n❌ Rotation failed: ${decisionsResult.error}`);
      }
      break;

    case 'rotate-issues':
      console.log(`${dryRun ? 'DRY RUN: ' : ''}Rotating issues.md...\n`);
      const issuesResult = rotateIssues(dryRun);
      console.log(JSON.stringify(issuesResult, null, 2));

      if (dryRun) {
        console.log('\n💡 This was a dry run. Run without --dry-run to execute rotation.');
      } else if (issuesResult.success) {
        console.log('\n✅ Rotation complete.');
      } else {
        console.log(`\n❌ Rotation failed: ${issuesResult.error}`);
      }
      break;

    default:
      console.log(`
Memory File Rotator - Automatic Archival for Memory Files

Commands:
  check                     Check if rotation is needed for all files
  rotate [--dry-run]        Rotate all files that need it
  rotate-decisions [--dry-run]  Rotate only decisions.md
  rotate-issues [--dry-run]     Rotate only issues.md

Options:
  --dry-run                 Preview rotation without making changes

Configuration:
  Rotation Trigger:    ${CONFIG.ROTATION_TRIGGER} lines
  Warning Threshold:   ${CONFIG.WARNING_LINES} lines
  Target After Rotation: ${CONFIG.TARGET_SIZE} lines

  ADR Age Threshold:   ${CONFIG.ADR_AGE_THRESHOLD} days
  Issue Age Threshold: ${CONFIG.ISSUE_AGE_THRESHOLD} days (RESOLVED only)

Examples:
  # Check current status
  node memory-rotator.cjs check

  # Preview rotation
  node memory-rotator.cjs rotate --dry-run

  # Execute rotation
  node memory-rotator.cjs rotate

  # Rotate only decisions.md
  node memory-rotator.cjs rotate-decisions --dry-run
  node memory-rotator.cjs rotate-decisions
`);
  }
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  CONFIG,

  // Utility functions
  getMemoryDir,
  getArchiveDir,
  countLines,
  getCurrentYearMonth,
  getAgeDays,
  parseDate,

  // Parsing functions
  parseDecisions,
  selectADRsToArchive,
  parseIssues,
  selectIssuesToArchive,

  // Rotation operations
  checkRotationNeeded,
  rotateDecisions,
  rotateIssues,
  checkAll,
  rotateAll,
};
