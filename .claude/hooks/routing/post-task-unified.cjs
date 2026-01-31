#!/usr/bin/env node
/**
 * Unified PostToolUse(Task) Hook
 *
 * Consolidates 5 hooks into a single process for better performance:
 * 1. agent-context-tracker.cjs - Agent mode tracking
 * 2. extract-workflow-learnings.cjs - Workflow learning extraction
 * 3. session-memory-extractor.cjs - Session memory extraction
 * 4. task-completion-guard.cjs - Task completion warning
 * 5. evolution-audit.cjs - Evolution auditing
 *
 * Event: PostToolUse
 * Matcher: Task
 *
 * Performance: Reduces 5 processes to 1, consolidates shared I/O
 *
 * Exit codes:
 * - 0: Always allow (this is a post-tool hook, never blocks)
 */

'use strict';

const fs = require('fs');
const path = require('path');

// =============================================================================
// Shared Utilities
// =============================================================================

const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const {
  parseHookInputSync,
  parseHookInputAsync,
  getToolName,
  getToolInput,
  getToolOutput,
} = require('../../lib/utils/hook-input.cjs');
const { getCachedState } = require('../../lib/utils/state-cache.cjs');
const routerState = require('./router-state.cjs');

// Lazy-load memory manager to avoid crashes if not available
let memoryManager = null;
function getMemoryManager() {
  if (memoryManager === null) {
    try {
      memoryManager = require('../../lib/memory/memory-manager.cjs');
    } catch (_e) {
      memoryManager = false; // Mark as unavailable
    }
  }
  return memoryManager || null;
}

// =============================================================================
// Paths
// =============================================================================

const LEARNINGS_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'memory', 'learnings.md');
const EVOLUTION_STATE_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'evolution-state.json');
const AUDIT_LOG_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'evolution-audit.log');

// =============================================================================
// 1. Agent Context Tracker Logic
// =============================================================================

/**
 * Extract task description from tool input
 */
function extractTaskDescription(toolInput) {
  if (!toolInput) return 'Task spawned';

  // Try to get description from various possible fields
  if (toolInput.description) return toolInput.description;
  if (toolInput.prompt) {
    // Extract first line or truncate
    const firstLine = toolInput.prompt.split('\n')[0];
    return firstLine.length > 100 ? firstLine.slice(0, 100) + '...' : firstLine;
  }
  if (toolInput.subagent_type) return `${toolInput.subagent_type} agent`;

  return 'Task spawned';
}

/**
 * Detect if this is a PLANNER agent spawn
 */
function isPlannerSpawn(toolInput) {
  if (!toolInput) return false;

  const subagentType = (toolInput.subagent_type || '').toLowerCase();
  const description = (toolInput.description || '').toLowerCase();
  const prompt = toolInput.prompt || '';

  if (subagentType.includes('plan')) return true;
  if (description.includes('planner')) return true;
  if (prompt.includes('You are PLANNER') || prompt.includes('You are the PLANNER')) return true;

  return false;
}

/**
 * Detect if this is a SECURITY-ARCHITECT agent spawn
 */
function isSecuritySpawn(toolInput) {
  if (!toolInput) return false;

  const subagentType = (toolInput.subagent_type || '').toLowerCase();
  const description = (toolInput.description || '').toLowerCase();
  const prompt = toolInput.prompt || '';

  if (subagentType.includes('security')) return true;
  if (description.includes('security')) return true;
  if (prompt.includes('SECURITY-ARCHITECT')) return true;

  return false;
}

/**
 * Run agent context tracking
 */
function runAgentContextTracker(toolInput) {
  const description = extractTaskDescription(toolInput);

  // FIX-ROUTER-MONITORING-001 (2026-01-31):
  // DO NOT exit agent mode here. Task() spawns subagent asynchronously.
  // Router must remain in agent mode until:
  //   1. Subagent completes work
  //   2. SessionEnd hook fires to clean up agent mode
  //
  // Previous code caused immediate exit, losing monitoring of spawned agents.
  // Subagents were running invisible to router, causing:
  //   - Tasks stuck in in_progress forever
  //   - Duplicate agent spawning
  //   - Projects appearing abandoned mid-stream
  //
  // const _state = routerState.exitAgentMode(); // ❌ REMOVED - was breaking monitoring

  // Detect and mark special agent spawns
  if (isPlannerSpawn(toolInput)) {
    routerState.markPlannerSpawned();
    if (process.env.ROUTER_DEBUG === 'true') {
      console.error('[post-task-unified] PLANNER agent detected and marked');
    }
  }

  if (isSecuritySpawn(toolInput)) {
    routerState.markSecuritySpawned();
    if (process.env.ROUTER_DEBUG === 'true') {
      console.error('[post-task-unified] SECURITY-ARCHITECT agent detected and marked');
    }
  }

  if (process.env.ROUTER_DEBUG === 'true') {
    console.error(
      '[post-task-unified] Agent mode KEPT ACTIVE (router waiting for subagent completion)'
    );
    console.error(`[post-task-unified] Task description: ${description}`);
  }
}

// =============================================================================
// 2. Workflow Learning Extraction Logic
// =============================================================================

// Workflow completion markers
const WORKFLOW_COMPLETE_MARKERS = [
  'workflow complete',
  'workflow completed',
  'all phases complete',
  'all tasks completed',
  'implementation complete',
];

// Learning indicators in output (ReDoS-safe patterns)
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
 */
function isWorkflowComplete(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  return WORKFLOW_COMPLETE_MARKERS.some(marker => lower.includes(marker));
}

/**
 * Extract learning phrases from text
 */
function extractLearnings(text) {
  if (!text || typeof text !== 'string') return [];

  const learnings = [];

  for (const pattern of LEARNING_PATTERNS) {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      if (match[1] && match[1].length > 10 && match[1].length < 500) {
        learnings.push(match[1].trim());
      }
    }
    pattern.lastIndex = 0;
  }

  return [...new Set(learnings)]; // Remove duplicates
}

/**
 * Append learnings to file
 */
function appendLearnings(learnings, workflowName = 'Unknown Workflow') {
  if (!learnings || learnings.length === 0) return false;

  const timestamp = new Date().toISOString().split('T')[0];
  const entry = `\n## [${timestamp}] Auto-Extracted: ${workflowName}\n\n${learnings.map(l => `- ${l}`).join('\n')}\n`;

  try {
    const dir = path.dirname(LEARNINGS_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.appendFileSync(LEARNINGS_PATH, entry);
    return true;
  } catch (err) {
    if (process.env.DEBUG_HOOKS) {
      console.error('Failed to append learnings:', err.message);
    }
    return false;
  }
}

/**
 * Run workflow learning extraction
 */
function runWorkflowLearningExtraction(toolOutput, toolInput) {
  if (!isWorkflowComplete(toolOutput)) {
    return;
  }

  const learnings = extractLearnings(toolOutput);
  if (learnings.length > 0) {
    const workflowName = toolInput?.description || 'Workflow';
    appendLearnings(learnings, workflowName);
  }
}

// =============================================================================
// 3. Session Memory Extraction Logic
// =============================================================================

/**
 * Extract patterns from task output
 */
function extractPatterns(output) {
  if (!output || typeof output !== 'string') return [];

  const patterns = [];
  const patternIndicators = [
    /(?:pattern|approach|solution|technique|best practice):\s*(.+)/gi,
    /(?:always|should|must|prefer)\s+(.{20,100})/gi,
    /(?:use|using)\s+(\w+)\s+(?:for|to|when)\s+(.{10,50})/gi,
  ];

  for (const regex of patternIndicators) {
    let match;
    regex.lastIndex = 0;
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
  if (!output || typeof output !== 'string') return [];

  const gotchas = [];
  const gotchaIndicators = [
    /(?:gotcha|pitfall|warning|caution|watch out|careful):\s*(.+)/gi,
    /(?:don't|do not|never|avoid)\s+(.{20,100})/gi,
    /(?:bug|issue|problem):\s*(.{20,150})/gi,
    /(?:fixed|resolved)\s+(?:by|with)\s+(.{20,100})/gi,
  ];

  for (const regex of gotchaIndicators) {
    let match;
    regex.lastIndex = 0;
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
  if (!output || typeof output !== 'string') return [];

  const discoveries = [];
  const filePatterns = [
    /`([^`]+\.[a-z]{2,4})`[:\s-]+(.{10,100})/gi,
    /(?:file|module|component)\s+`?([^\s`]+\.[a-z]{2,4})`?\s+(?:is|handles|contains|manages)\s+(.{10,80})/gi,
  ];

  for (const regex of filePatterns) {
    let match;
    regex.lastIndex = 0;
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

/**
 * Run session memory extraction
 */
function runSessionMemoryExtraction(toolOutput) {
  if (!toolOutput || typeof toolOutput !== 'string' || toolOutput.length < 50) {
    return;
  }

  const mm = getMemoryManager();
  if (!mm) return;

  const patterns = extractPatterns(toolOutput);
  const gotchas = extractGotchas(toolOutput);
  const discoveries = extractDiscoveries(toolOutput);

  let recorded = 0;

  for (const pattern of patterns) {
    if (mm.recordPattern && mm.recordPattern(pattern, PROJECT_ROOT)) {
      recorded++;
    }
  }

  for (const gotcha of gotchas) {
    if (mm.recordGotcha && mm.recordGotcha(gotcha, PROJECT_ROOT)) {
      recorded++;
    }
  }

  for (const discovery of discoveries) {
    if (
      mm.recordDiscovery &&
      mm.recordDiscovery(discovery.path, discovery.description, 'general', PROJECT_ROOT)
    ) {
      recorded++;
    }
  }

  if (recorded > 0 && process.env.DEBUG_HOOKS) {
    console.error(`[post-task-unified] Recorded ${recorded} items from Task output`);
  }
}

// =============================================================================
// 4. Task Completion Guard Logic
// =============================================================================

// Phrases that indicate task completion
const COMPLETION_INDICATORS = [
  /task.*(?:complete|completed|done|finished)/i,
  /(?:complete|completed|done|finished).*task/i,
  /successfully.*(?:complete|created|implemented|fixed)/i,
  /all.*(?:tests|checks).*pass/i,
  /implementation.*complete/i,
  /changes.*made/i,
  /summary.*(?:of|:)/i,
  /## Summary/i,
  /Task \d+ (?:is )?(?:now )?complete/i,
  /I have (?:successfully )?(?:completed|finished|done)/i,
];

/**
 * Check if output text indicates task completion
 */
function detectsCompletion(output) {
  if (!output || typeof output !== 'string') return false;
  return COMPLETION_INDICATORS.some(pattern => pattern.test(output));
}

/**
 * Format the warning message
 */
function formatTaskCompletionWarning(output) {
  const snippet = output.substring(0, 200).replace(/\n/g, ' ');

  return `
+======================================================================+
|  WARNING: TASK COMPLETION DETECTED WITHOUT TaskUpdate                |
+======================================================================+
|  Agent output indicates task completion, but no TaskUpdate was       |
|  recorded recently.                                                  |
|                                                                      |
|  Output snippet: "${snippet.substring(0, 50)}..."                    |
|                                                                      |
|  AGENTS MUST call TaskUpdate({ status: "completed" }) when done!     |
|                                                                      |
|  This may indicate the agent ignored task tracking instructions.     |
+======================================================================+
`;
}

/**
 * Run task completion guard
 */
function runTaskCompletionGuard(toolOutput) {
  const enforcement = process.env.TASK_COMPLETION_GUARD || 'warn';
  if (enforcement === 'off') return;

  if (!toolOutput || !detectsCompletion(toolOutput)) return;

  // Check if TaskUpdate was called recently
  const wasUpdated = routerState.wasTaskUpdateCalledRecently();

  if (wasUpdated) {
    if (process.env.DEBUG_HOOKS) {
      console.error('[post-task-unified] Agent properly called TaskUpdate');
    }
    return;
  }

  // Warning - completion detected but no TaskUpdate
  console.error(formatTaskCompletionWarning(toolOutput));
}

// =============================================================================
// 5. Evolution Audit Logic
// =============================================================================

/**
 * Get the evolution state from file
 */
function getEvolutionState() {
  return getCachedState(EVOLUTION_STATE_PATH, null);
}

/**
 * Check if this represents a completed evolution
 */
function isEvolutionCompletion(state) {
  if (!state) return false;

  // Check if currentEvolution is in the final 'enable' phase
  if (state.currentEvolution && state.currentEvolution.phase === 'enable') {
    return true;
  }

  // Check for newly completed evolutions in array using createdAt timestamps
  if (state.evolutions && Array.isArray(state.evolutions) && state.evolutions.length > 0) {
    const lastEvolution = state.evolutions[state.evolutions.length - 1];
    const completedTime = lastEvolution.createdAt
      ? new Date(lastEvolution.createdAt).getTime()
      : lastEvolution.completedAt
        ? new Date(lastEvolution.completedAt).getTime()
        : 0;

    if (completedTime > 0) {
      // Check if completed recently (within last 5 minutes)
      const now = Date.now();
      if (now - completedTime < 5 * 60 * 1000) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Get the most recent completed evolution
 */
function getLatestEvolution(state) {
  if (!state) return null;

  if (state.evolutions && Array.isArray(state.evolutions) && state.evolutions.length > 0) {
    return state.evolutions[state.evolutions.length - 1];
  }

  if (state.currentEvolution) {
    return state.currentEvolution;
  }

  return null;
}

/**
 * Format an audit log entry
 */
function formatAuditEntry(evolution) {
  if (!evolution) {
    return (
      '[EVOLUTION] ' +
      new Date().toISOString() +
      ' | type=unknown | name=unknown | status=completed'
    );
  }

  const timestamp = evolution.completedAt || new Date().toISOString();
  const type = evolution.type || 'unknown';
  const name = evolution.name || 'unknown';
  const artifactPath = evolution.path || evolution.artifactPath || 'unknown';
  const researchReport = evolution.researchReport || 'none';

  const parts = [
    '[EVOLUTION]',
    timestamp,
    '| type=' + type,
    '| name=' + name,
    '| path=' + artifactPath,
    '| research=' + researchReport,
    '| status=completed',
  ];

  return parts.join(' ');
}

/**
 * Append an entry to the audit log
 */
function appendToAuditLog(entry) {
  try {
    const dir = path.dirname(AUDIT_LOG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.appendFileSync(AUDIT_LOG_PATH, entry + '\n');
  } catch (e) {
    if (process.env.DEBUG_HOOKS) {
      console.error('Failed to write audit log:', e.message);
    }
  }
}

/**
 * Run evolution audit
 */
function runEvolutionAudit() {
  const enforcement = process.env.EVOLUTION_AUDIT || 'on';
  if (enforcement === 'off') return;

  const state = getEvolutionState();
  if (!isEvolutionCompletion(state)) return;

  const evolution = getLatestEvolution(state);
  const entry = formatAuditEntry(evolution);
  appendToAuditLog(entry);

  if (process.env.DEBUG_HOOKS) {
    console.error('[post-task-unified] Audit entry written:', entry);
  }
}

// =============================================================================
// Main Execution
// =============================================================================

/**
 * Main async execution function
 */
async function main() {
  try {
    // Parse hook input
    const hookInput = await parseHookInputAsync();

    if (!hookInput) {
      process.exit(0);
      return;
    }

    // Validate this is a Task tool call
    const toolName = getToolName(hookInput);
    if (toolName !== 'Task') {
      process.exit(0);
      return;
    }

    // Get tool input and output
    const toolInput = getToolInput(hookInput);
    const toolOutput = getToolOutput(hookInput) || '';
    const toolOutputStr = typeof toolOutput === 'string' ? toolOutput : '';

    // Run all consolidated hooks
    // 1. Agent context tracking (always runs)
    runAgentContextTracker(toolInput);

    // 2. Workflow learning extraction
    runWorkflowLearningExtraction(toolOutputStr, toolInput);

    // 3. Session memory extraction
    runSessionMemoryExtraction(toolOutputStr);

    // 4. Task completion guard
    runTaskCompletionGuard(toolOutputStr);

    // 5. Evolution audit
    runEvolutionAudit();

    // Always exit 0 - post-tool hooks should never block
    process.exit(0);
  } catch (err) {
    // Fail open - post-tool hooks should never block
    if (process.env.DEBUG_HOOKS) {
      console.error('[post-task-unified] Error:', err.message);
    }
    process.exit(0);
  }
}

// Run if this is the main module
if (require.main === module) {
  main();
}

// =============================================================================
// Exports for Testing
// =============================================================================

module.exports = {
  // Main function
  main,

  // Project root
  PROJECT_ROOT,

  // Agent context tracker exports
  extractTaskDescription,
  isPlannerSpawn,
  isSecuritySpawn,

  // Workflow learning exports
  isWorkflowComplete,
  extractLearnings,
  appendLearnings,
  WORKFLOW_COMPLETE_MARKERS,
  LEARNING_PATTERNS,

  // Session memory exports
  extractPatterns,
  extractGotchas,
  extractDiscoveries,

  // Task completion guard exports
  detectsCompletion,
  COMPLETION_INDICATORS,

  // Evolution audit exports
  isEvolutionCompletion,
  getLatestEvolution,
  formatAuditEntry,
  appendToAuditLog,
  getEvolutionState,
  EVOLUTION_STATE_PATH,
  AUDIT_LOG_PATH,
};
