#!/usr/bin/env node
/**
 * @deprecated PERF-003 (2026-01-27): Use user-prompt-unified.cjs instead
 *
 * This hook has been CONSOLIDATED into:
 *   .claude/hooks/routing/user-prompt-unified.cjs
 *
 * The unified hook handles memory reminders as part of Check 3 (lines 488-566).
 * This file is retained for reference and backward compatibility but is
 * NOT registered in settings.json and will NOT execute.
 *
 * See: .claude/workflows/operations/hook-consolidation.md for consolidation details.
 *
 * ============================================================================
 * ORIGINAL DOCUMENTATION (preserved for reference)
 * ============================================================================
 *
 * Memory Reminder Hook
 *
 * Runs on SessionStart to remind agents to read memory files.
 * This helps maintain context across sessions.
 *
 * WHEN IT RUNS:
 * - On session start/resume
 * - When context is cleared or compacted
 *
 * WHAT IT DOES:
 * - Checks if memory files exist
 * - Outputs a reminder to read them
 * - Lists available memory files and their last modified times
 *
 * MEMORY FILES:
 * - learnings.md - Patterns, solutions, preferences
 * - decisions.md - Architecture Decision Records
 * - issues.md - Known issues, blockers
 * - active_context.md - Scratchpad for long tasks
 *
 * Adapted from Superpowers session-start hook for agent-studio.
 */

const fs = require('fs');
const path = require('path');

// PROC-002: Use shared utility instead of duplicated findProjectRoot
const { PROJECT_ROOT } = require('../../../lib/utils/project-root.cjs');
const MEMORY_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'memory');

/**
 * Get memory file info.
 */
function getMemoryFiles() {
  const files = [];
  const expectedFiles = [
    { name: 'learnings.md', description: 'Patterns, solutions, preferences' },
    { name: 'decisions.md', description: 'Architecture Decision Records' },
    { name: 'issues.md', description: 'Known issues, blockers' },
    { name: 'active_context.md', description: 'Long task scratchpad' },
  ];

  for (const file of expectedFiles) {
    const filePath = path.join(MEMORY_DIR, file.name);
    try {
      const stats = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, 'utf-8');
      const lineCount = content.split('\n').length;
      const lastModified = stats.mtime.toISOString().split('T')[0];

      files.push({
        ...file,
        exists: true,
        lines: lineCount,
        modified: lastModified,
      });
    } catch (_error) {
      files.push({
        ...file,
        exists: false,
      });
    }
  }

  return files;
}

/**
 * Check if there's meaningful content in memory files.
 */
function hasMemoryContent(files) {
  return files.some(f => f.exists && f.lines > 5);
}

/**
 * Main execution.
 */
function main() {
  // Check if memory directory exists
  if (!fs.existsSync(MEMORY_DIR)) {
    // No memory directory, skip reminder
    process.exit(0);
  }

  const memoryFiles = getMemoryFiles();

  // Only show reminder if there's meaningful memory content
  if (!hasMemoryContent(memoryFiles)) {
    process.exit(0);
  }

  console.log('\n+--------------------------------------------------+');
  console.log('| MEMORY PROTOCOL REMINDER                         |');
  console.log('+--------------------------------------------------+');
  console.log('| Read memory files BEFORE starting work:          |');
  console.log('|                                                  |');

  for (const file of memoryFiles) {
    if (file.exists && file.lines > 5) {
      const status = `${file.lines} lines, ${file.modified}`;
      console.log(`|  - ${file.name.padEnd(20)} (${status.padEnd(20)})|`);
    }
  }

  console.log('|                                                  |');
  console.log('| Path: .claude/context/memory/                    |');
  console.log('|                                                  |');
  console.log('| "If it is not in memory, it did not happen."    |');
  console.log('+--------------------------------------------------+\n');

  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { main };
main();
