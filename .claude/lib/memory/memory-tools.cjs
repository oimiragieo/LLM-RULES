#!/usr/bin/env node
'use strict';

/**
 * Agent Memory Retrieval Tools (Feature E5)
 * ==========================================
 * Provides grep, describe, and expand operations for agent memory.
 *
 * Usage:
 *   const { memoryGrep, memoryDescribe, memoryExpand } = require('./memory-tools.cjs');
 *
 *   const results = memoryGrep('authentication');
 *   const desc = memoryDescribe('decisions');
 *   const expanded = memoryExpand('decisions', 'ADR-075');
 */

const fs = require('fs');
const path = require('path');

const MEMORY_DIR = path.join(__dirname, '..', '..', 'context', 'memory');

/**
 * Search across memory files for a pattern.
 * @param {string} pattern - Search string (case-insensitive)
 * @param {Object} [options]
 * @param {string[]} [options.files] - Specific files to search (default: all .md files)
 * @param {number} [options.contextLines=1] - Lines of context around matches
 * @param {number} [options.maxResults=20] - Maximum results
 * @returns {Array<{file: string, line: number, text: string, context: string}>}
 */
function memoryGrep(pattern, options = {}) {
  const files = options.files || getMemoryFiles();
  const contextLines = options.contextLines ?? 1;
  const maxResults = options.maxResults ?? 20;
  const results = [];
  const lowerPattern = pattern.toLowerCase();

  for (const file of files) {
    const filePath = path.isAbsolute(file) ? file : path.join(MEMORY_DIR, file);
    if (!fs.existsSync(filePath)) continue;

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(lowerPattern)) {
          const start = Math.max(0, i - contextLines);
          const end = Math.min(lines.length - 1, i + contextLines);
          results.push({
            file: path.basename(filePath),
            line: i + 1,
            text: lines[i].trim(),
            context: lines.slice(start, end + 1).join('\n'),
          });
          if (results.length >= maxResults) return results;
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  return results;
}

/**
 * Describe a memory file: return a structured summary.
 * @param {string} fileName - Memory file name (e.g., 'decisions', 'learnings', 'issues')
 * @returns {{ file: string, size: number, lineCount: number, sections: string[], lastModified: string|null }}
 */
function memoryDescribe(fileName) {
  const baseName = fileName.endsWith('.md') ? fileName : `${fileName}.md`;
  const filePath = path.join(MEMORY_DIR, baseName);

  if (!fs.existsSync(filePath)) {
    return { file: baseName, size: 0, lineCount: 0, sections: [], lastModified: null };
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const stat = fs.statSync(filePath);
    const lines = content.split('\n');
    const sections = lines
      .filter(l => /^#{1,3}\s/.test(l))
      .map(l => l.replace(/^#+\s*/, '').trim());

    return {
      file: baseName,
      size: content.length,
      lineCount: lines.length,
      sections,
      lastModified: stat.mtime.toISOString(),
    };
  } catch {
    return { file: baseName, size: 0, lineCount: 0, sections: [], lastModified: null };
  }
}

/**
 * Expand a memory entry: find and return full content around a heading or keyword.
 * @param {string} fileName - Memory file name
 * @param {string} heading - Section heading or keyword to expand
 * @returns {{ file: string, found: boolean, content: string, startLine: number, endLine: number }}
 */
function memoryExpand(fileName, heading) {
  const baseName = fileName.endsWith('.md') ? fileName : `${fileName}.md`;
  const filePath = path.join(MEMORY_DIR, baseName);

  if (!fs.existsSync(filePath)) {
    return { file: baseName, found: false, content: '', startLine: 0, endLine: 0 };
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const lowerHeading = heading.toLowerCase();

    // Find the heading line
    let startLine = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(lowerHeading)) {
        startLine = i;
        break;
      }
    }

    if (startLine === -1) {
      return { file: baseName, found: false, content: '', startLine: 0, endLine: 0 };
    }

    // Find the end of this section (next heading of same or higher level, or EOF)
    const headingMatch = lines[startLine].match(/^(#+)/);
    const headingLevel = headingMatch ? headingMatch[1].length : 0;
    let endLine = lines.length - 1;

    if (headingLevel > 0) {
      for (let i = startLine + 1; i < lines.length; i++) {
        const nextMatch = lines[i].match(/^(#+)\s/);
        if (nextMatch && nextMatch[1].length <= headingLevel) {
          endLine = i - 1;
          break;
        }
      }
    } else {
      // No heading — return 20 lines of context
      endLine = Math.min(startLine + 20, lines.length - 1);
    }

    return {
      file: baseName,
      found: true,
      content: lines.slice(startLine, endLine + 1).join('\n'),
      startLine: startLine + 1,
      endLine: endLine + 1,
    };
  } catch {
    return { file: baseName, found: false, content: '', startLine: 0, endLine: 0 };
  }
}

/**
 * Get all .md files in the memory directory.
 * @returns {string[]}
 */
function getMemoryFiles() {
  if (!fs.existsSync(MEMORY_DIR)) return [];
  return fs.readdirSync(MEMORY_DIR).filter(f => f.endsWith('.md'));
}

module.exports = {
  memoryGrep,
  memoryDescribe,
  memoryExpand,
  getMemoryFiles,
  MEMORY_DIR,
};
