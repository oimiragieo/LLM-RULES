'use strict';

/**
 * Workflow Learning Extraction Hook
 *
 * Automatically captures learnings from completed workflows
 * and appends them to learnings.md.
 *
 * Trigger: PostToolUse (after Task tool completes)
 *
 * @deprecated
 * Logic is consolidated into `.claude/hooks/routing/post-task-unified.cjs`.
 * Do not register this file in `.claude/settings.json`.
 */

const fs = require('fs');
const path = require('path');

// PROC-002: Use shared utility instead of duplicated findProjectRoot
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
// HOOK-001: Use shared hook-input utility instead of inline argv parsing
const { parseHookInputSync, auditLog, debugLog } = require('../../lib/utils/hook-input.cjs');
const LEARNINGS_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'memory', 'learnings.md');

// Workflow completion markers
const WORKFLOW_COMPLETE_MARKERS = [
  'workflow complete',
  'workflow completed',
  'all phases complete',
  'all tasks completed',
  'implementation complete',
];

// Learning indicators in output
// Use [^\n]+ instead of (.+) to prevent ReDoS (catastrophic backtracking)
// Character class [^\n] matches any char except newline, preventing exponential backtracking
const LEARNING_PATTERNS = [
  /learned[:\s]+([^\n]+)/gi,
  /discovered[:\s]+([^\n]+)/gi,
  /pattern[:\s]+([^\n]+)/gi,
  /insight[:\s]+([^\n]+)/gi,
  /best practice[:\s]+([^\n]+)/gi,
  /tip[:\s]+([^\n]+)/gi,
  /note[:\s]+([^\n]+)/gi,
];

/**
 * Check if text indicates workflow completion
 * @param {string} text - Text to check
 * @returns {boolean}
 */
function isWorkflowComplete(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  return WORKFLOW_COMPLETE_MARKERS.some(marker => lower.includes(marker));
}

/**
 * Extract learning phrases from text
 * @param {string} text - Text to extract learnings from
 * @returns {string[]} Array of extracted learnings
 */
function extractLearnings(text) {
  if (!text || typeof text !== 'string') return [];

  const learnings = [];

  for (const pattern of LEARNING_PATTERNS) {
    let match;
    // Reset lastIndex for global patterns before starting
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      if (match[1] && match[1].length > 10 && match[1].length < 500) {
        learnings.push(match[1].trim());
      }
    }
    // Reset lastIndex for global patterns after finishing
    pattern.lastIndex = 0;
  }

  return [...new Set(learnings)]; // Remove duplicates
}

/**
 * Append learnings to file
 * @param {string[]} learnings - Array of learnings to append
 * @param {string} workflowName - Name of the workflow
 * @returns {boolean} Success status
 */
function appendLearnings(learnings, workflowName = 'Unknown Workflow') {
  if (!learnings || learnings.length === 0) return false;

  const timestamp = new Date().toISOString().split('T')[0];
  const entry = `\n## [${timestamp}] Auto-Extracted: ${workflowName}\n\n${learnings.map(l => `- ${l}`).join('\n')}\n`;

  try {
    // Ensure directory exists
    const dir = path.dirname(LEARNINGS_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.appendFileSync(LEARNINGS_PATH, entry);
    return true;
  } catch (err) {
    debugLog('extract-workflow-learnings', 'Failed to append learnings', err);
    return false;
  }
}

/**
 * Validate hook - called after Task tool completes
 * @param {Object} context - Hook context with tool result
 * @returns {{ valid: boolean, error: string }}
 */
function validate(context) {
  const { tool, result, parameters } = context || {};

  // Only process Task tool completions
  if (tool !== 'Task') {
    return { valid: true, error: '' };
  }

  const output = result?.output || '';

  // Check if workflow completed
  if (!isWorkflowComplete(output)) {
    return { valid: true, error: '' };
  }

  // Extract and save learnings
  const learnings = extractLearnings(output);
  if (learnings.length > 0) {
    const workflowName = parameters?.description || 'Workflow';
    appendLearnings(learnings, workflowName);
  }

  return { valid: true, error: '' };
}

/**
 * Main execution when run directly
 *
 * Note: This is a PostToolUse hook for learning extraction.
 * It fails open since it's not a security gate (the tool has already executed).
 * However, we add audit logging for observability.
 */
function main() {
  try {
    // HOOK-001: Use shared hook-input utility instead of inline argv parsing
    const input = parseHookInputSync();

    if (!input) {
      process.exit(0);
    }

    // Validate and process
    const result = validate(input);

    // Output result for hook framework
    console.log(JSON.stringify(result));
    process.exit(0);
  } catch (err) {
    // For PostToolUse hooks, we fail open since the tool has already executed.
    // However, we still audit log the error for observability.
    auditLog('extract-workflow-learnings', 'error_post_tool', { error: err.message });

    // PostToolUse hooks should not block (tool already ran), so exit 0
    process.exit(0);
  }
}

// Run main if executed directly
if (require.main === module) {
  main();
}

module.exports = {
  validate,
  isWorkflowComplete,
  extractLearnings,
  appendLearnings,
  WORKFLOW_COMPLETE_MARKERS,
  LEARNING_PATTERNS,
};
