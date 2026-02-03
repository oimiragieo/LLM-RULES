#!/usr/bin/env node
/**
 * @deprecated PERF-003: Use unified-reflection-handler.cjs instead
 * This hook has been consolidated into unified-reflection-handler.cjs
 * which handles task-completion, error-recovery, session-end reflection,
 * and memory extraction in a single process.
 * NOTE: memory-manager.saveSession() is now deprecated and throws; do not run this hook in production.
 *
 * SessionEnd Hook: Records session summary to memory system
 * ============================================================
 *
 * Event: SessionEnd
 * Purpose: Auto-create session files on session end
 *
 * Triggered when a conversation session ends or when explicitly invoked
 * to save session insights to the memory system.
 *
 * Phase 2 Integration: Now uses memory-tiers.cjs for STM->MTM consolidation
 */

'use strict';

/* eslint-disable max-depth */

console.warn(
  '[session-end-recorder] DEPRECATED: saveSession() now throws. Do not run this hook in production. Use unified-reflection-handler.cjs instead.'
);

const fs = require('fs');
const path = require('path');
const { _execSync } = require('child_process');

// Import memory manager and memory tiers
const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();
const { debugLog } = require('../../../lib/utils/hook-input.cjs');

// Try to load memory-tiers (may not exist in older installations)
let memoryTiers = null;
try {
  memoryTiers = require(path.join(PROJECT_ROOT, '.claude', 'lib', 'memory', 'memory-tiers.cjs'));
} catch (_e) {
  // Memory tiers not available - continue with legacy behavior
}

/**
 * Validation function (required for hook interface)
 * SessionEnd always triggers session save
 */
function validate(_input) {
  return { valid: true };
}

/**
 * Parse stdin for session context (if provided)
 */
function parseStdin() {
  return new Promise(resolve => {
    let input = '';
    let hasData = false;

    process.stdin.setEncoding('utf8');

    process.stdin.on('data', chunk => {
      hasData = true;
      input += chunk;
    });

    process.stdin.on('end', () => {
      if (!hasData || !input.trim()) {
        resolve(null);
        return;
      }

      try {
        resolve(JSON.parse(input));
      } catch (_e) {
        // Not JSON, treat as plain text summary
        resolve({ summary: input.trim() });
      }
    });

    process.stdin.on('error', () => {
      resolve(null);
    });

    // Timeout for stdin read
    setTimeout(() => {
      if (!hasData) {
        resolve(null);
      }
    }, 100);

    process.stdin.resume();
  });
}

/**
 * Gather session insights from context or stdin
 */
async function gatherSessionInsights() {
  // Try to read from stdin first
  const stdinData = await parseStdin();
  if (stdinData) {
    return stdinData;
  }

  // Fallback: read from active_context.md if it exists
  const activeContextPath = path.join(
    PROJECT_ROOT,
    '.claude',
    'context',
    'memory',
    'active_context.md'
  );
  if (fs.existsSync(activeContextPath)) {
    try {
      const content = fs.readFileSync(activeContextPath, 'utf8');

      // Extract structured data from markdown if possible
      const insights = {
        summary: 'Session ended',
        tasks_completed: [],
        discoveries: [],
        files_modified: [],
      };

      // Simple extraction - look for lists
      const lines = content.split('\n');
      let currentSection = null;

      for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.match(/^##?\s+(tasks?|completed)/i)) {
          currentSection = 'tasks';
        } else if (trimmed.match(/^##?\s+(discover|found)/i)) {
          currentSection = 'discoveries';
        } else if (trimmed.match(/^##?\s+(files?|modified|changed)/i)) {
          currentSection = 'files';
        } else if (trimmed.startsWith('-') || trimmed.match(/^\d+\./)) {
          const item = trimmed
            .replace(/^[-*]\s*/, '')
            .replace(/^\d+\.\s*/, '')
            .trim();
          if (item && currentSection === 'tasks') {
            insights.tasks_completed.push(item);
          } else if (item && currentSection === 'discoveries') {
            insights.discoveries.push(item);
          } else if (item && currentSection === 'files') {
            insights.files_modified.push(item);
          }
        }
      }

      return insights;
    } catch (_err) {
      // Fall through to default
    }
  }

  // Default empty insights
  return {
    summary: 'Session ended',
    tasks_completed: [],
    discoveries: [],
    files_modified: [],
  };
}

/**
 * Main execution
 */
async function main() {
  try {
    // Gather session insights
    const insights = await gatherSessionInsights();

    // Build session data structure matching saveSession() expectations
    const sessionData = {
      session_id: `session-${Date.now()}`,
      summary: insights.summary || 'Session ended',
      tasks_completed: insights.tasks_completed || [],
      files_modified: insights.files_modified || insights.filesModified || [],
      discoveries: insights.discoveries || [],
      patterns_found: insights.patterns_found || insights.patterns || [],
      gotchas_encountered: insights.gotchas_encountered || insights.gotchas || [],
      decisions_made: insights.decisions_made || insights.decisions || [],
      next_steps: insights.next_steps || insights.nextSteps || [],
      timestamp: new Date().toISOString(),
    };

    // Phase 2: Use memory tiers if available
    if (memoryTiers) {
      // Write to STM first
      memoryTiers.writeSTMEntry(sessionData, PROJECT_ROOT);

      // Consolidate STM -> MTM
      const consolidateResult = memoryTiers.consolidateSession(
        sessionData.session_id,
        PROJECT_ROOT
      );

      debugLog('session-end-recorder', `Consolidated session to MTM: ${consolidateResult.mtmPath}`);
    }

    // Legacy saveSession has been removed; memory-tiers is the canonical path.

    process.exit(0);
  } catch (err) {
    // Fail gracefully - session ends regardless
    debugLog('session-end-recorder', 'Session recording error', err);
    process.exit(0); // Non-blocking - session ends regardless
  }
}

// Export validate function for hook interface
module.exports = { validate };

// Run main if executed directly
if (require.main === module) {
  main();
}
