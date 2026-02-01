#!/usr/bin/env node
/**
 * @deprecated PERF-003: Use unified-reflection-handler.cjs instead
 * This hook has been consolidated into unified-reflection-handler.cjs
 * which handles task-completion, error-recovery, session-end reflection,
 * and memory extraction in a single process.
 *
 * Session Memory Extractor Hook
 * ==============================
 *
 * PostToolUse hook that extracts learnings from completed Task agent runs.
 * Automatically records patterns, gotchas, and discoveries.
 *
 * Triggers on: Task tool completion
 */

'use strict';

const path = require('path');

// PERF-006/PERF-007: Use shared utilities instead of duplicated code
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const {
  parseHookInputAsync,
  getToolName,
  getToolOutput,
  _auditLog,
  debugLog,
} = require('../../lib/utils/hook-input.cjs');

// Import memory manager
let memoryManager;
try {
  memoryManager = require('../../lib/memory/memory-manager.cjs');
} catch (_e) {
  // Fallback path resolution
  const libPath = path.join(__dirname, '..', '..', 'lib', 'memory', 'memory-manager.cjs');
  memoryManager = require(libPath);
}

/**
 * Extract patterns from task output
 */
function extractPatterns(output) {
  const patterns = [];

  // Look for pattern indicators
  const patternIndicators = [
    /(?:pattern|approach|solution|technique|best practice):\s*(.+)/gi,
    /(?:always|should|must|prefer)\s+(.{20,100})/gi,
    /(?:use|using)\s+(\w+)\s+(?:for|to|when)\s+(.{10,50})/gi,
  ];

  for (const regex of patternIndicators) {
    let match;
    while ((match = regex.exec(output)) !== null) {
      const patternText = match[1]?.trim();
      if (patternText && patternText.length > 10 && patternText.length < 200) {
        patterns.push(patternText);
      }
    }
  }

  return patterns.slice(0, 3); // Max 3 patterns per task
}

/**
 * Extract gotchas from task output
 */
function extractGotchas(output) {
  const gotchas = [];

  // Look for gotcha indicators
  const gotchaIndicators = [
    /(?:gotcha|pitfall|warning|caution|watch out|careful):\s*(.+)/gi,
    /(?:don't|do not|never|avoid)\s+(.{20,100})/gi,
    /(?:bug|issue|problem):\s*(.{20,150})/gi,
    /(?:fixed|resolved)\s+(?:by|with)\s+(.{20,100})/gi,
  ];

  for (const regex of gotchaIndicators) {
    let match;
    while ((match = regex.exec(output)) !== null) {
      const gotchaText = match[1]?.trim();
      if (gotchaText && gotchaText.length > 10 && gotchaText.length < 200) {
        gotchas.push(gotchaText);
      }
    }
  }

  return gotchas.slice(0, 3); // Max 3 gotchas per task
}

/**
 * Extract file discoveries from task output
 */
function extractDiscoveries(output) {
  const discoveries = [];

  // Look for file path mentions with descriptions
  const filePatterns = [
    /`([^`]+\.[a-z]{2,4})`[:\s-]+(.{10,100})/gi,
    /(?:file|module|component)\s+`?([^\s`]+\.[a-z]{2,4})`?\s+(?:is|handles|contains|manages)\s+(.{10,80})/gi,
  ];

  for (const regex of filePatterns) {
    let match;
    while ((match = regex.exec(output)) !== null) {
      const filePath = match[1]?.trim();
      const description = match[2]?.trim();
      if (filePath && description && !filePath.includes(' ')) {
        discoveries.push({ path: filePath, description });
      }
    }
  }

  return discoveries.slice(0, 5); // Max 5 discoveries per task
}

// PERF-006: parseHookInput is now imported from hook-input.cjs at the top of the file
// Removed 35-line duplicated function

/**
 * Main execution
 */
async function main() {
  try {
    // Deprecated hook: do nothing unless explicitly enabled.
    // This prevents accidental re-wiring from causing double-counting or extra IO.
    const enabled =
      process.env.SESSION_MEMORY_EXTRACTOR_ENABLE === 'true' ||
      process.env.SESSION_MEMORY_EXTRACTOR_ENABLE === '1';
    if (!enabled) {
      if (process.env.DEBUG_HOOKS) {
        debugLog('session-memory-extractor', 'Deprecated hook skipped (not enabled)');
      }
      process.exit(0);
    }

    // PERF-006: Use shared utility
    const hookInput = await parseHookInputAsync();

    if (!hookInput) {
      process.exit(0);
    }

    // PERF-006: Only process Task tool results using shared helper
    const toolName = getToolName(hookInput);
    if (toolName !== 'Task') {
      process.exit(0);
    }

    // PERF-006: Get the tool output/result using shared helper
    const toolOutput = getToolOutput(hookInput) || '';

    if (!toolOutput || typeof toolOutput !== 'string' || toolOutput.length < 50) {
      process.exit(0);
    }

    // Extract learnings
    const patterns = extractPatterns(toolOutput);
    const gotchas = extractGotchas(toolOutput);
    const discoveries = extractDiscoveries(toolOutput);

    // Record extracted items
    let recorded = 0;

    for (const pattern of patterns) {
      if (memoryManager.recordPattern(pattern, PROJECT_ROOT)) {
        recorded++;
      }
    }

    for (const gotcha of gotchas) {
      if (memoryManager.recordGotcha(gotcha, PROJECT_ROOT)) {
        recorded++;
      }
    }

    for (const discovery of discoveries) {
      if (
        memoryManager.recordDiscovery(
          discovery.path,
          discovery.description,
          'general',
          PROJECT_ROOT
        )
      ) {
        recorded++;
      }
    }

    // Log if we recorded anything (for debugging)
    if (recorded > 0) {
      debugLog('session-memory-extractor', `Recorded ${recorded} items from Task output`);
    }

    process.exit(0);
  } catch (err) {
    // Fail silently - memory extraction is non-critical
    debugLog('session-memory-extractor', 'Memory extraction error', err);
    process.exit(0);
  }
}

main();

module.exports = {
  extractPatterns,
  extractGotchas,
  extractDiscoveries,
  PROJECT_ROOT,
};
