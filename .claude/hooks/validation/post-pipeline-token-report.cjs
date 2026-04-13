#!/usr/bin/env node
'use strict';

/**
 * PostToolUse hook: Report token usage when pipeline drains
 *
 * Triggers on TaskUpdate — when the last task completes, reads ccusage-status.txt
 * Advisory hook — always exits 0, never blocks
 *
 * VAL-RF-013: Token report fires regardless of task wording (structural detection)
 * VAL-RF-014: Structural detection is PRIMARY signal, keywords are FALLBACK
 * VAL-RF-015: Token report avoids false positives on intermediate tasks
 *
 * Detection priority:
 * 1. PRIMARY: metadata.pipelineComplete === true OR metadata.isFinalTask === true
 * 2. FALLBACK: Word-boundary keywords in subject/summary (final, deliverable, pipeline)
 *
 * The structural signals allow the report to fire without relying on magic words.
 * Keyword matching uses word boundaries to avoid false positives like "finalize".
 */

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

/**
 * Check if text contains a keyword as a whole word (word-boundary matching).
 * This prevents false positives like "finalize" matching "final".
 *
 * @param {string} text - Text to search in
 * @param {string} keyword - Keyword to search for
 * @returns {boolean} True if keyword found as whole word
 */
function containsWordBoundary(text, keyword) {
  if (!text || !keyword) return false;
  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();
  // Use regex with word boundaries
  const pattern = new RegExp(`\\b${lowerKeyword}\\b`, 'i');
  return pattern.test(lowerText);
}

/**
 * Check if a TaskUpdate should trigger the token report.
 *
 * @param {Object} data - Parsed hook input data
 * @returns {{ shouldReport: boolean, reason: string }}
 */
function shouldTriggerReport(data) {
  // Only fire on TaskUpdate completions
  const toolName = data?.tool_name || data?.tool || data?.toolUse?.tool || '';
  if (!toolName.includes('TaskUpdate')) {
    return { shouldReport: false, reason: 'not_taskupdate' };
  }

  // Check if this is a completion
  const params = data?.tool_input || data?.input || data?.toolUse?.input || {};
  if (params.status !== 'completed') {
    return { shouldReport: false, reason: 'not_completed' };
  }

  const subject = params.subject || '';
  const metadata = params.metadata || {};
  const summary = metadata.summary || '';

  // PRIMARY: Structural signals (explicit pipeline completion flags)
  if (metadata.pipelineComplete === true) {
    return { shouldReport: true, reason: 'structural: pipelineComplete' };
  }
  if (metadata.isFinalTask === true) {
    return { shouldReport: true, reason: 'structural: isFinalTask' };
  }

  // FALLBACK: Keyword detection for legacy tasks (word-boundary matching)
  // Check for keywords in subject OR summary as whole words
  const keywords = ['final', 'deliverable', 'pipeline'];

  for (const keyword of keywords) {
    if (containsWordBoundary(subject, keyword)) {
      return { shouldReport: true, reason: `fallback: keyword "${keyword}" in subject` };
    }
    if (containsWordBoundary(summary, keyword)) {
      return { shouldReport: true, reason: `fallback: keyword "${keyword}" in summary` };
    }
  }

  return { shouldReport: false, reason: 'no_signal' };
}

/**
 * Read and emit token usage report.
 *
 * @param {string} projectRoot - Project root path
 * @returns {string} Report content
 */
function emitReport(projectRoot) {
  const lines = [];
  lines.push('\n=== TOKEN USAGE REPORT (auto-triggered by post-pipeline hook) ===\n');

  try {
    const statusPath = path.join(
      projectRoot || PROJECT_ROOT,
      '.claude',
      'context',
      'runtime',
      'ccusage-status.txt'
    );
    if (fs.existsSync(statusPath)) {
      const status = fs.readFileSync(statusPath, 'utf8').trim();
      lines.push(status + '\n');
    } else {
      lines.push('ccusage-status.txt not found (ccusage-statusline hook may not have fired)\n');
    }
  } catch (readErr) {
    lines.push('Failed to read ccusage-status.txt: ' + (readErr.message || 'unknown error') + '\n');
  }

  lines.push('=== END TOKEN USAGE REPORT ===\n');
  return lines.join('');
}

// Main hook entry point (stdin-based) — only when run directly, not when require()'d
if (require.main === module) {
  let input = '';
  process.stdin.on('data', chunk => {
    input += chunk;
  });
  process.stdin.on('end', () => {
    try {
      const { success: parseSuccess, data } = safeParseJSON(input, {});
      if (!parseSuccess) {
        process.exit(0);
      }

      const { shouldReport } = shouldTriggerReport(data);
      if (!shouldReport) {
        process.exit(0);
      }

      // Pipeline appears complete — read ccusage-status.txt
      process.stderr.write(emitReport(PROJECT_ROOT));
    } catch (_e) {
      // Advisory hook — fail open
    }
    process.exit(0);
  });
}

// Export for testing
module.exports = {
  shouldTriggerReport,
  emitReport,
};
