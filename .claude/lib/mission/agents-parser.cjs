'use strict';

/**
 * AGENTS.md Semantic Parser
 *
 * Parses AGENTS.md files to extract structured sections:
 * - ## Build & Test
 * - ## Architecture
 * - ## Git Workflows
 * - ## Security
 *
 * Discovery hierarchy: searches cwd -> parent dirs -> ~/.claude/AGENTS.md
 * First found wins.
 *
 * Missing AGENTS.md returns default empty structure.
 * Handles malformed markdown gracefully with partial results.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Default empty structure returned for missing files
const DEFAULT_STRUCTURE = Object.freeze({
  buildAndTest: '',
  architecture: '',
  gitWorkflows: '',
  security: '',
  exists: false,
});

// Section header mappings (normalized names)
const SECTION_MAPPINGS = {
  'build & test': 'buildAndTest',
  'build and test': 'buildAndTest',
  'build & testing': 'buildAndTest',
  architecture: 'architecture',
  'git workflows': 'gitWorkflows',
  'git workflow': 'gitWorkflows',
  security: 'security',
};

/**
 * Normalize line endings (CRLF -> LF) for consistent parsing
 *
 * @param {string} content - Raw file content
 * @returns {string} - Normalized content
 */
function normalizeLineEndings(content) {
  return String(content || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

/**
 * Extract a section's content from markdown by header name
 *
 * @param {string} content - The markdown content
 * @param {string} sectionName - The section header to find (without ##)
 * @returns {string} - The section content (trimmed)
 */
function extractSection(content, sectionName) {
  const lines = normalizeLineEndings(content).split('\n');
  const sectionLines = [];

  const targetHeader = sectionName.toLowerCase().trim();
  let inTargetSection = false;
  let headerLevel = 2;
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Track code blocks
    if (trimmedLine.startsWith('```') || trimmedLine.startsWith('~~~')) {
      inCodeBlock = !inCodeBlock;
      if (inTargetSection) {
        sectionLines.push(line);
      }
      continue;
    }

    // Check for section headers (## to ######)
    const headerMatch = trimmedLine.match(/^(#{2,6})\s+(.+)$/);

    if (headerMatch) {
      const currentLevel = headerMatch[1].length;
      const headerText = headerMatch[2].toLowerCase().trim();

      // Check if we found our target section
      if (headerText === targetHeader || headerText.includes(targetHeader)) {
        inTargetSection = true;
        headerLevel = currentLevel;
        continue;
      }

      // If we hit another section at the same or higher level, we're done
      if (inTargetSection && currentLevel <= headerLevel) {
        break;
      }

      // Subsections within the target section
      if (inTargetSection && currentLevel > headerLevel) {
        sectionLines.push(line);
      }

      continue;
    }

    // Collect content in target section
    if (inTargetSection) {
      sectionLines.push(line);
    }
  }

  // Trim and return
  return sectionLines.join('\n').trim();
}

/**
 * Parse an AGENTS.md file and extract structured sections
 *
 * @param {string} agentsPath - Path to the AGENTS.md file
 * @returns {Object} - { buildAndTest, architecture, gitWorkflows, security, exists }
 */
function parseAgents(agentsPath) {
  // Normalize the path
  const normalizedPath = path.normalize(agentsPath);

  // Check if file exists
  if (!fs.existsSync(normalizedPath)) {
    return { ...DEFAULT_STRUCTURE };
  }

  // Read file content
  let content;
  try {
    content = fs.readFileSync(normalizedPath, 'utf8');
  } catch (_readErr) {
    return { ...DEFAULT_STRUCTURE };
  }

  // Handle empty file
  if (!content || content.trim() === '') {
    return { ...DEFAULT_STRUCTURE, exists: true };
  }

  // Extract each section
  const result = {
    buildAndTest: extractSection(content, 'Build & Test'),
    architecture: extractSection(content, 'Architecture'),
    gitWorkflows: extractSection(content, 'Git Workflows'),
    security: extractSection(content, 'Security'),
    exists: true,
  };

  return result;
}

/**
 * Discover AGENTS.md file using the hierarchy:
 * 1. Current working directory
 * 2. Parent directories (recursive up)
 * 3. User global (~/.claude/AGENTS.md)
 *
 * @param {string} [startDir] - Optional starting directory (defaults to cwd)
 * @returns {Object} - { found: boolean, path: string, content: string }
 */
function discoverAgentsFile(startDir) {
  const cwd = startDir || process.cwd();
  const homeDir = os.homedir();

  // Build search paths
  const searchPaths = [];

  // Add current and parent directories
  let currentDir = path.normalize(cwd);
  const root = path.parse(currentDir).root;

  while (currentDir && currentDir !== root) {
    searchPaths.push(path.join(currentDir, 'AGENTS.md'));
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break; // Reached root
    currentDir = parentDir;
  }

  // Add user global path
  searchPaths.push(path.join(homeDir, '.claude', 'AGENTS.md'));

  // Search for the first existing file
  for (const searchPath of searchPaths) {
    if (fs.existsSync(searchPath)) {
      let content = '';
      try {
        content = fs.readFileSync(searchPath, 'utf8');
      } catch (_readErr) {
        // Continue to next path if read fails
        continue;
      }

      return {
        found: true,
        path: searchPath,
        content,
      };
    }
  }

  // Not found
  return {
    found: false,
    path: '',
    content: '',
  };
}

/**
 * Convenience function to discover and parse AGENTS.md
 *
 * @param {string} [startDir] - Optional starting directory
 * @returns {Object} - Parsed AGENTS.md structure
 */
function discoverAndParseAgents(startDir) {
  const discovered = discoverAgentsFile(startDir);

  if (!discovered.found) {
    return { ...DEFAULT_STRUCTURE };
  }

  const result = parseAgents(discovered.path);
  return result;
}

module.exports = {
  parseAgents,
  discoverAgentsFile,
  discoverAndParseAgents,
  extractSection,
  DEFAULT_STRUCTURE,
  SECTION_MAPPINGS,
};
