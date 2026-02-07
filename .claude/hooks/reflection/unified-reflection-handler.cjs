#!/usr/bin/env node
/**
 * Hook: unified-reflection-handler.cjs
 * Trigger: PostToolUse (TaskUpdate, Bash, Task) + SessionEnd
 * Purpose: Consolidated handler for reflection, memory extraction, and task tracking
 *
 * PERF-003: Consolidates 6 hooks into 1:
 * - task-completion-reflection.cjs (archived; previously PostToolUse:TaskUpdate)
 * - error-recovery-reflection.cjs (archived; previously PostToolUse:Bash)
 * - session-end-reflection.cjs (archived; previously SessionEnd)
 * - Session memory extraction (canonical)
 * - session-end-recorder.cjs (SessionEnd)
 * - task-update-tracker.cjs (PostToolUse:TaskUpdate) [NEW in PERF-003 #2]
 *
 * Benefits:
 * - 66% reduction in process spawns (6 -> 2)
 * - ~900 lines of code saved through deduplication
 * - Single point of maintenance
 * - TaskUpdate tracking integrated (was separate hook)
 *
 * ENFORCEMENT MODES:
 * - block (default): Process events (no blocking behavior for post-hooks)
 * - warn: Process events with warning messages
 * - off: Disabled, no processing
 *
 * Environment variables:
 *   REFLECTION_ENABLED=false - Disable all reflection
 *   REFLECTION_HOOK_MODE=off - Disable this hook
 *   DEBUG_HOOKS=true - Enable debug logging
 */

'use strict';

const fs = require('fs');
const path = require('path');

// PERF-006/PERF-007: Use shared utilities instead of duplicated code
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const { appendJsonl } = require('../../lib/utils/jsonl-utils.cjs');
const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
  getToolOutput,
  auditLog,
  debugLog,
} = require('../../lib/utils/hook-input.cjs');
const eventBus = require('../../lib/events/event-bus.cjs');
const { EventTypes } = require('../../lib/events/event-types.cjs');

// PERF-003 #2: Import router-state for TaskUpdate tracking (consolidated from task-update-tracker.cjs)
const routerState = require('../../lib/routing/router-state.cjs');

// Phase 4 Integration: Error summary extractor for reflection workflow
let errorSummaryExtractor = null;
try {
  errorSummaryExtractor = require('./error-summary-extractor.cjs');
} catch (_e) {
  // Error summary extractor not available - graceful degradation
}

// Phase 5 ML: Optimization engine and feedback loop (advice-only unless ML_AUTOMATION_MODE=log|enforce)
let mlIndex = null;
try {
  mlIndex = require('../../lib/ml/index.cjs');
} catch (_e) {
  // ML not available - graceful degradation
}

// Configuration
let QUEUE_FILE = path.join(PROJECT_ROOT, '.claude', 'context', 'reflection-queue.jsonl');
const REFLECTION_QUEUE_MAX_LINES = Number(process.env.REFLECTION_QUEUE_MAX_LINES || 5000);

// Session end event types
const SESSION_END_EVENTS = ['Stop', 'SessionEnd'];

// Minimum output length for memory extraction
const MIN_OUTPUT_LENGTH = 50;

// ============================================================
// CORE UTILITY FUNCTIONS
// ============================================================

/**
 * Check if reflection/memory hooks are enabled
 * @returns {boolean} True if hooks should run
 */
function isEnabled() {
  // Check REFLECTION_ENABLED (default: true)
  if (process.env.REFLECTION_ENABLED === 'false') {
    return false;
  }

  // Check REFLECTION_HOOK_MODE (default: block, which means enabled)
  const mode = process.env.REFLECTION_HOOK_MODE || 'block';
  if (mode === 'off') {
    return false;
  }

  return true;
}

/**
 * Gather session insights for persistence.
 *
 * Note: hook input is already read/parsed via parseHookInputAsync(), so stdin is
 * not reliably available here. We primarily use structured fields on the input
 * (if provided) and fall back to `.claude/context/memory/active_context.md`.
 *
 * @param {object} [input] - SessionEnd hook input (optional)
 * @returns {object} Normalized insights object
 */
function gatherSessionInsights(input = null) {
  // Prefer structured fields on the hook payload if present.
  if (input && typeof input === 'object') {
    const hasStructured =
      input.summary ||
      input.tasks_completed ||
      input.files_modified ||
      input.discoveries ||
      input.patterns_found ||
      input.gotchas_encountered ||
      input.decisions_made ||
      input.next_steps;

    if (hasStructured) {
      return {
        summary: input.summary || 'Session ended',
        tasks_completed: input.tasks_completed || [],
        files_modified: input.files_modified || [],
        discoveries: input.discoveries || [],
        patterns_found: input.patterns_found || [],
        gotchas_encountered: input.gotchas_encountered || [],
        decisions_made: input.decisions_made || [],
        next_steps: input.next_steps || [],
      };
    }
  }

  // Fallback: parse active_context.md (best-effort, non-fatal).
  const activeContextPath = path.join(
    PROJECT_ROOT,
    '.claude',
    'context',
    'memory',
    'active_context.md'
  );
  if (!fs.existsSync(activeContextPath)) {
    return {
      summary: 'Session ended',
      tasks_completed: [],
      files_modified: [],
      discoveries: [],
      patterns_found: [],
      gotchas_encountered: [],
      decisions_made: [],
      next_steps: [],
    };
  }

  try {
    const content = fs.readFileSync(activeContextPath, 'utf8');
    return parseSessionInsightsFromMarkdown(content);
  } catch (_e) {
    return {
      summary: 'Session ended',
      tasks_completed: [],
      files_modified: [],
      discoveries: [],
      patterns_found: [],
      gotchas_encountered: [],
      decisions_made: [],
      next_steps: [],
    };
  }
}

/**
 * Best-effort markdown parser for active_context.md -> session insights.
 * @param {string} content
 * @returns {object}
 */
function parseSessionInsightsFromMarkdown(content) {
  const insights = {
    summary: 'Session ended',
    tasks_completed: [],
    discoveries: [],
    files_modified: [],
    patterns_found: [],
    gotchas_encountered: [],
    decisions_made: [],
    next_steps: [],
  };

  const lines = String(content || '').split('\n');
  let currentSection = null;

  const normalizeSection = headerLine => {
    const h = headerLine.toLowerCase();
    if (/(^|\b)(tasks?|completed)(\b|$)/.test(h)) return 'tasks';
    // Avoid overly-broad matches like "Patterns Found".
    if (/(^|\b)(discover|discoveries|learning|learnings|insights)(\b|$)/.test(h)) {
      return 'discoveries';
    }
    if (/(^|\b)(files?|modified|changed)(\b|$)/.test(h)) return 'files';
    if (/(^|\b)(patterns?|solutions?|approaches)(\b|$)/.test(h)) return 'patterns';
    if (/(^|\b)(gotchas?|pitfalls?|warnings?|cautions)(\b|$)/.test(h)) return 'gotchas';
    if (/(^|\b)(decisions?|adrs?)(\b|$)/.test(h)) return 'decisions';
    if (/(^|\b)(next|steps?|todo)(\b|$)/.test(h)) return 'next_steps';
    return null;
  };

  const pushItem = (section, item) => {
    if (!item) return;
    if (section === 'tasks') insights.tasks_completed.push(item);
    if (section === 'discoveries') insights.discoveries.push(item);
    if (section === 'files') insights.files_modified.push(item);
    if (section === 'patterns') insights.patterns_found.push(item);
    if (section === 'gotchas') insights.gotchas_encountered.push(item);
    if (section === 'decisions') insights.decisions_made.push(item);
    if (section === 'next_steps') insights.next_steps.push(item);
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Headings define section context.
    const headerMatch = trimmed.match(/^#{1,3}\s+(.+)$/);
    if (headerMatch) {
      currentSection = normalizeSection(headerMatch[1]);
      continue;
    }

    // First meaningful non-heading text becomes summary (unless overwritten later).
    if (
      !currentSection &&
      trimmed &&
      !trimmed.startsWith('-') &&
      !trimmed.startsWith('*') &&
      !/^\d+\.\s+/.test(trimmed)
    ) {
      if (!insights.summary || insights.summary === 'Session ended') {
        insights.summary = trimmed;
      }
      continue;
    }

    // Bulleted or numbered list items.
    if (trimmed.startsWith('-') || trimmed.startsWith('*') || /^\d+\.\s+/.test(trimmed)) {
      const item = trimmed
        .replace(/^[-*]\s*/, '')
        .replace(/^\d+\.\s*/, '')
        .trim();
      pushItem(currentSection, item);
      continue;
    }
  }

  return insights;
}

/**
 * Detect the event type from hook input
 * Routes to appropriate handler based on input content
 *
 * @param {object|null} input - The hook input from Claude Code
 * @returns {string|null} Event type: 'task_completion' | 'task_update' | 'error_recovery' | 'session_end' | 'memory_extraction' | null
 */
function detectEventType(input) {
  if (!input) return null;

  // Check for session end event first (highest priority)
  const eventType = input.event || input.event_type;
  if (eventType && SESSION_END_EVENTS.includes(eventType)) {
    return 'session_end';
  }

  // Get tool information using shared helpers
  const toolName = getToolName(input);
  const toolInput = getToolInput(input);
  const toolResult = getToolOutput(input);

  // Check for TaskUpdate
  if (toolName === 'TaskUpdate') {
    // PERF-003 #2: Track ALL TaskUpdate calls (was in task-update-tracker.cjs)
    // Return 'task_completion' for completed status, 'task_update' for others
    if (toolInput && toolInput.status === 'completed') {
      return 'task_completion';
    }
    // Track non-completion updates too (in_progress, etc.)
    if (toolInput && toolInput.taskId && toolInput.status) {
      return 'task_update';
    }
    return null;
  }

  // Check for Bash with errors (non-zero exit code or error field)
  if (toolName === 'Bash') {
    if (toolResult) {
      if (typeof toolResult.exit_code === 'number' && toolResult.exit_code !== 0) {
        return 'error_recovery';
      }
      if (toolResult.error) {
        return 'error_recovery';
      }
    }
    return null;
  }

  // Check for other tools with errors (generic error handling)
  if (toolResult && toolResult.error) {
    return 'error_recovery';
  }

  // Check for Task tool with sufficient output for memory extraction
  if (toolName === 'Task') {
    const output = typeof toolResult === 'string' ? toolResult : '';
    if (output.length >= MIN_OUTPUT_LENGTH) {
      return 'memory_extraction';
    }
    return null;
  }

  return null;
}

// ============================================================
// EVENT HANDLERS
// ============================================================

/**
 * Handle task completion - create reflection queue entry and record to router state
 * PERF-003 #2: Also records TaskUpdate to router-state (consolidated from task-update-tracker.cjs)
 * @param {object} input - The hook input
 * @returns {object} Reflection entry for the queue
 */
function handleTaskCompletion(input) {
  const toolInput = getToolInput(input);

  // PERF-003 #2: Record TaskUpdate to router-state (was in task-update-tracker.cjs)
  if (toolInput.taskId && toolInput.status) {
    routerState.recordTaskUpdate(toolInput.taskId, toolInput.status);
    if (process.env.DEBUG_HOOKS) {
      debugLog(
        'unified-reflection',
        `TaskUpdate recorded: taskId=${toolInput.taskId}, status=${toolInput.status}`
      );
    }
  }

  const entry = {
    taskId: toolInput.taskId,
    trigger: 'task_completion',
    timestamp: new Date().toISOString(),
    priority: 'high',
  };

  // Extract summary from metadata if present
  if (toolInput.metadata && toolInput.metadata.summary) {
    entry.summary = toolInput.metadata.summary;
  }

  return entry;
}

/**
 * Handle task update (non-completion) - record to router state
 * PERF-003 #2: Consolidated from task-update-tracker.cjs
 * @param {object} input - The hook input
 */
function handleTaskUpdate(input) {
  const toolInput = getToolInput(input);

  if (toolInput.taskId && toolInput.status) {
    routerState.recordTaskUpdate(toolInput.taskId, toolInput.status);
    if (process.env.DEBUG_HOOKS) {
      debugLog(
        'unified-reflection',
        `TaskUpdate recorded: taskId=${toolInput.taskId}, status=${toolInput.status}`
      );
    }
  }
  // No queue entry for non-completion updates - just tracking
}

/**
 * Handle error recovery - create reflection queue entry for error analysis
 * Phase 4: Enhanced with error logging system integration
 * @param {object} input - The hook input
 * @returns {object} Reflection entry for the queue
 */
function handleErrorRecovery(input) {
  const toolName = getToolName(input);
  const toolInput = getToolInput(input);
  const toolResult = getToolOutput(input) || {};

  // Determine severity based on error type
  let severity = 'MEDIUM';
  if (toolResult.error?.includes('CRITICAL') || toolResult.error?.includes('SECURITY')) {
    severity = 'CRITICAL';
  } else if (
    toolResult.error?.includes('permission denied') ||
    toolResult.error?.includes('not found')
  ) {
    severity = 'HIGH';
  }

  // Determine priority based on severity
  const priority = severity === 'CRITICAL' ? 'high' : severity === 'HIGH' ? 'medium' : 'low';

  const entry = {
    context: 'error_recovery',
    trigger: 'error',
    tool: toolName,
    timestamp: new Date().toISOString(),
    priority,
    // Phase 4: Enhanced error context
    severity,
    category: toolName === 'Bash' ? 'TOOL_FAILURE' : 'EXECUTION_ERROR',
  };

  // Add Bash-specific fields
  if (toolName === 'Bash') {
    entry.command = toolInput.command;
    if (toolResult.stderr) {
      entry.error = toolResult.stderr;
    }
    if (typeof toolResult.exit_code === 'number') {
      entry.exitCode = toolResult.exit_code;
    }
  }

  // Add error from tool result
  if (toolResult.error) {
    entry.error =
      typeof toolResult.error === 'string' ? toolResult.error : JSON.stringify(toolResult.error);
  }

  // Include relevant tool input for context
  if (toolInput.file_path) {
    entry.filePath = toolInput.file_path;
  }

  // Add correlation IDs if available
  entry.correlation = {
    sessionId: process.env.CLAUDE_SESSION_ID,
    traceId: process.env.TRACE_ID,
  };

  return entry;
}

/**
 * Get error summary for reflection (Phase 4 Integration)
 * @returns {object|null} Error summary context or null if not available
 */
function getErrorSummaryForReflection() {
  if (!errorSummaryExtractor) {
    return null;
  }

  try {
    const result = errorSummaryExtractor.extractSummaryForReflection({ hours: 24 });

    // Only include if there are errors to review
    if (result.errorCount === 0) {
      return null;
    }

    return {
      errorCount: result.errorCount,
      summaryPath: result.summaryPath,
      reflectionWeight: result.reflectionWeight,
      actionItems: result.actionItems,
      criticalIssues: result.summary?.criticalErrors?.length || 0,
      patterns: {
        repeated: result.summary?.patterns?.repeatedErrors?.length || 0,
        cascades: result.summary?.patterns?.cascades?.length || 0,
      },
    };
  } catch (err) {
    debugLog('unified-reflection', 'Error getting error summary for reflection', err);
    return null;
  }
}

/**
 * Handle session end - create reflection entry and session data for memory recording
 * @param {object} input - The hook input
 * @returns {object} Object with reflection entry and sessionData for memory recording
 */
function handleSessionEnd(input) {
  const sessionId = input.session_id || input.sessionId || process.env.CLAUDE_SESSION_ID;
  const stats = getSessionStats(input);
  const insights = gatherSessionInsights(input);
  const toolsUsed = Array.isArray(input?.tools_used)
    ? input.tools_used
    : Array.isArray(input?.stats?.tool_names)
      ? input.stats.tool_names
      : [];

  // Phase 4 Integration: Get error summary for reflection
  const errorSummary = getErrorSummaryForReflection();

  // Determine reflection priority based on error summary
  let reflectionPriority = 'low';
  if (errorSummary) {
    if (errorSummary.criticalIssues > 0 || errorSummary.reflectionWeight >= 0.7) {
      reflectionPriority = 'high';
    } else if (errorSummary.reflectionWeight >= 0.4) {
      reflectionPriority = 'medium';
    }
  }

  // Create reflection entry
  const reflection = {
    context: 'session_end',
    trigger: 'session_end',
    sessionId: sessionId,
    scope: 'all_unreflected_tasks',
    timestamp: new Date().toISOString(),
    priority: reflectionPriority,
    stats: stats,
    // Phase 4: Include error review context
    errorReview: errorSummary,
  };

  // Create session data for memory recording (formerly from session-end-recorder.cjs)
  const sessionData = {
    session_id: sessionId || `session-${Date.now()}`,
    summary: insights.summary || 'Session ended',
    tasks_completed: insights.tasks_completed || [],
    files_modified: insights.files_modified || insights.filesModified || [],
    discoveries: insights.discoveries || [],
    patterns_found: insights.patterns_found || insights.patterns || [],
    gotchas_encountered: insights.gotchas_encountered || insights.gotchas || [],
    decisions_made: insights.decisions_made || insights.decisions || [],
    next_steps: insights.next_steps || insights.nextSteps || [],
    tools_used: toolsUsed,
    timestamp: new Date().toISOString(),
  };

  return {
    reflection,
    sessionData,
  };
}

/**
 * Extract session statistics from input
 * @param {object} input - The hook input
 * @returns {object} Session statistics
 */
function getSessionStats(input) {
  const stats = input.stats || {};

  return {
    toolCalls: stats.tool_calls || 0,
    errors: stats.errors || 0,
    tasksCompleted: stats.tasks_completed || 0,
  };
}

/**
 * Handle memory extraction - extract patterns, gotchas, and discoveries from Task output
 * @param {object} input - The hook input
 * @returns {object} Extracted memory items
 */
function handleMemoryExtraction(input) {
  const toolResult = getToolOutput(input) || '';
  const output = typeof toolResult === 'string' ? toolResult : '';

  return {
    patterns: extractPatterns(output),
    gotchas: extractGotchas(output),
    discoveries: extractDiscoveries(output),
  };
}

// ============================================================
// MEMORY EXTRACTION HELPERS (canonical session memory extraction)
// ============================================================

/**
 * Extract patterns from task output
 * @param {string} output - Task output text
 * @returns {string[]} Array of extracted patterns (max 3)
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
 * @param {string} output - Task output text
 * @returns {string[]} Array of extracted gotchas (max 3)
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
 * @param {string} output - Task output text
 * @returns {object[]} Array of extracted discoveries (max 5)
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

// ============================================================
// QUEUE MANAGEMENT
// ============================================================

/**
 * Queue a reflection entry
 * @param {object} entry - The reflection entry to queue
 * @param {string} queueFile - Path to queue file (for testing)
 */
function queueReflection(entry, queueFile = QUEUE_FILE) {
  // Check if enabled
  if (!isEnabled()) {
    return;
  }

  try {
    // Ensure directory exists
    const queueDir = path.dirname(queueFile);
    if (!fs.existsSync(queueDir)) {
      fs.mkdirSync(queueDir, { recursive: true });
    }

    appendJsonl(queueFile, entry, { maxLines: REFLECTION_QUEUE_MAX_LINES });

    // Log in warn mode
    const mode = process.env.REFLECTION_HOOK_MODE || 'block';
    if (mode === 'warn') {
      const trigger = entry.trigger || 'unknown';
      const id = entry.taskId || entry.sessionId || entry.tool || 'unknown';
      auditLog('unified-reflection', 'queued', { trigger, id });
    }
  } catch (err) {
    // Log error but don't fail the hook
    debugLog('unified-reflection', 'Error queueing reflection', err);
  }
}

// ============================================================
// MEMORY RECORDING (from session-end-recorder.cjs)
// ============================================================

/**
 * Record session to memory system
 *
 * ITEM-4 FIX: Session recording now uses memory-tiers exclusively (STM → MTM).
 * The legacy memory-manager.saveSession() call has been removed to avoid
 * duplicate session storage in both sessions/ and mtm/ directories.
 *
 * @param {object} sessionData - Session data to record
 */
function recordSession(sessionData) {
  if (!isEnabled()) {
    return;
  }

  try {
    // Try to load memory-tiers (may not exist in older installations)
    let memoryTiers = null;
    try {
      memoryTiers = require(
        path.join(PROJECT_ROOT, '.claude', 'lib', 'memory', 'memory-tiers.cjs')
      );
    } catch (_e) {
      // Memory tiers not available - session recording skipped (saveSession is deprecated no-op)
      debugLog(
        'unified-reflection',
        'memory-tiers not available; session recording skipped (memory-tiers required for session persistence)'
      );
      return;
    }

    // Use memory tiers (canonical path): STM → MTM
    // Write to STM first
    memoryTiers.writeSTMEntry(sessionData, PROJECT_ROOT);

    // Consolidate STM -> MTM
    memoryTiers.consolidateSession(sessionData.session_id, PROJECT_ROOT);

    // NOTE: We no longer call memory-manager.saveSession() here.
    // This avoids duplicate session storage in both sessions/ and mtm/ directories.
    // memory-manager.saveSession() is now deprecated for session recording.
    // Use memory-tiers for sessions; memory-manager for gotchas, patterns, codebase_map, learnings.

    if (process.env.DEBUG_HOOKS) {
      debugLog(
        'unified-reflection',
        `Session recorded via memory-tiers: ${sessionData.session_id}`
      );
    }
  } catch (err) {
    debugLog('unified-reflection', 'Error recording session', err);
  }
}

/**
 * Best-effort: generate embeddings for modified memory markdown files.
 *
 * Note: This is awaited by the SessionEnd handler so the process doesn't exit early.
 * It should still be treated as best-effort (failures must not block SessionEnd).
 *
 * @param {object} sessionData
 * @returns {Promise<void>}
 */
async function triggerEmbeddingGeneration(sessionData) {
  if (!isEnabled()) {
    return;
  }

  const filesModified = Array.isArray(sessionData?.files_modified)
    ? sessionData.files_modified
    : [];
  if (filesModified.length === 0) {
    return;
  }

  const memoryDir = path.resolve(PROJECT_ROOT, '.claude', 'context', 'memory');
  const memoryFiles = filesModified
    .filter(f => typeof f === 'string' && f.toLowerCase().endsWith('.md'))
    .map(f => (path.isAbsolute(f) ? path.resolve(f) : path.resolve(PROJECT_ROOT, f)))
    .filter(fullPath => {
      const resolved = path.resolve(fullPath);
      if (resolved === memoryDir) return false;
      return resolved.startsWith(memoryDir + path.sep);
    })
    .filter(fullPath => fs.existsSync(fullPath));

  if (memoryFiles.length === 0) {
    return;
  }

  try {
    const { MemoryVectorStore } = require('../../lib/memory/lancedb-client.cjs');
    const embeddings = require('../../tools/cli/generate-embeddings.cjs');

    const vectorStore = new MemoryVectorStore({
      persistDirectory:
        process.env.LANCEDB_URI || path.join(PROJECT_ROOT, '.claude', 'data', 'lancedb'),
      collectionName: process.env.LANCEDB_TABLE || 'agent_memory',
    });

    const available = await vectorStore.isAvailable();
    if (!available) {
      debugLog('unified-reflection', 'LanceDB not available, skipping embedding generation');
      return;
    }

    // Process files
    for (const fullPath of memoryFiles) {
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const chunks = embeddings.chunkByHeaders(content, fullPath);
        if (chunks.length === 0) continue;

        const docs = chunks.map(chunk => {
          const metadata = embeddings.extractMetadata(fullPath, chunk.section, chunk.line);
          return {
            id: `${metadata.filePath}-${chunk.line}`,
            text: `${chunk.section}\n\n${chunk.content}`,
            metadata,
          };
        });

        await vectorStore.upsertDocuments(docs);
      } catch (err) {
        debugLog('unified-reflection', `Error processing file ${fullPath}`, err);
      }
    }

    if (process.env.DEBUG_HOOKS) {
      debugLog('unified-reflection', `Generated embeddings for ${memoryFiles.length} files`);
    }
  } catch (err) {
    debugLog('unified-reflection', 'Error in embedding generation workflow', err);
  }
} // End triggerEmbeddingGeneration

/**
 * Best-effort: Phase 5 ML session-end. Ingests session into FeedbackLoop (training when
 * ML_AUTOMATION_MODE=log|enforce) and logs optimization recommendations (advice-only).
 * Does not apply config; ML remains advisory unless ML_AUTOMATION_MODE=enforce (future).
 * @param {{ reflection: object, sessionData: object }} result - From handleSessionEnd
 * @returns {void}
 */
function triggerMLSessionEnd(result) {
  if (!mlIndex || !mlIndex.isMLEnabled()) return;

  try {
    const toSafeInt = (value, fallback = 0) => {
      const n = Number(value);
      return Number.isFinite(n) ? Math.trunc(n) : fallback;
    };

    const bucketize = (value, thresholds, labels) => {
      const v = Math.max(0, toSafeInt(value, 0));
      for (let i = 0; i < thresholds.length; i++) {
        if (v < thresholds[i]) return labels[i];
      }
      return labels[labels.length - 1];
    };

    const stats = result.reflection?.stats || {};
    const errorReview = result.reflection?.errorReview || {};
    const sessionData = result.sessionData || {};

    const tasksCompleted = Array.isArray(sessionData.tasks_completed)
      ? sessionData.tasks_completed
      : [];
    const filesModified = Array.isArray(sessionData.files_modified)
      ? sessionData.files_modified
      : [];

    // Use real signals we have today: reflection stats + sessionData lists.
    // If duration/tokens/memory are available later from the host payload, they can flow through
    // sessionData.* and will be picked up below.
    const tasksCount = Math.max(tasksCompleted.length, toSafeInt(stats.tasksCompleted, 0), 0);
    const historyLen = Math.min(Math.max(tasksCount, 1), 200);

    const toolCalls = toSafeInt(stats.toolCalls, 0);
    const toolCallsBucket = bucketize(toolCalls, [1, 10, 50], ['none', 'low', 'med', 'high']);

    const filesModifiedCount = filesModified.length;
    const filesModifiedBucket = bucketize(
      filesModifiedCount,
      [1, 5, 20],
      ['none', 'low', 'med', 'high']
    );

    const history = Array.from({ length: historyLen }, () => {
      const tools = ['Task', `toolCalls:${toolCallsBucket}`];
      if (filesModifiedCount > 0) {
        tools.push(`filesModified:${filesModifiedBucket}`);
      }
      return { agent: 'session', tools };
    });

    // Prefer real metrics if present. Otherwise, use consistent proxies:
    // - tokenUsage: toolCalls * 500 (roughly correlates with "work done"; keeps scale stable)
    const totalDuration =
      toSafeInt(sessionData.totalDuration, null) ??
      toSafeInt(sessionData.duration_ms, null) ??
      toSafeInt(sessionData.durationMs, null) ??
      0;
    const tokenUsage =
      toSafeInt(sessionData.tokenUsage, null) ??
      toSafeInt(sessionData.token_usage, null) ??
      (toolCalls > 0 ? toolCalls * 500 : 0);
    const peakMemoryMB =
      toSafeInt(sessionData.peakMemoryMB, null) ??
      toSafeInt(sessionData.peak_memory_mb, null) ??
      toSafeInt(sessionData.peakMemoryMb, null) ??
      0;

    // Minimal session shape for ML: { history, metrics, trace }
    const sessionForML = {
      history,
      metrics: {
        totalDuration,
        errorCount: toSafeInt(stats.errors, 0),
        tokenUsage,
        peakMemoryMB,
        criticalErrors: toSafeInt(errorReview.criticalIssues, 0),
      },
      trace: {
        tasksCount,
        filesModifiedCount,
        toolCalls,
      },
    };

    const mlContextDir = path.join(PROJECT_ROOT, '.claude', 'context', 'ml');
    const persistence = {
      modelPath: process.env.ML_MODEL_PATH || path.join(mlContextDir, 'pattern-model.json'),
      policyPath:
        process.env.ML_POLICY_PATH || path.join(mlContextDir, 'optimization-policies.json'),
      statePath:
        process.env.ML_FEEDBACK_STATE_PATH || path.join(mlContextDir, 'feedback-loop-state.json'),
      sessionsPath: process.env.ML_SESSIONS_LOG_PATH || path.join(mlContextDir, 'sessions.jsonl'),
    };

    const feedback = mlIndex.getFeedbackLoop(persistence);
    if (feedback) {
      feedback.process(sessionForML);
    }

    const engine = feedback?.optimizationEngine || mlIndex.getOptimizationEngine(persistence);
    if (engine && engine.isReady().ready) {
      const recommendation = engine.optimize(sessionForML);
      const mode = mlIndex.getMLAutomationMode();
      if (recommendation && (mode === 'log' || mode === 'enforce')) {
        debugLog(
          'unified-reflection',
          'ML optimization recommendation (advice-only)',
          recommendation
        );
      }
    }
  } catch (err) {
    debugLog('unified-reflection', 'ML session-end failed', err);
  }
}

/**
 * Best-effort: run memory maintenance tasks on SessionEnd.
 *
 * @returns {void}
 */
function triggerMaintenance() {
  if (!isEnabled()) {
    return;
  }

  try {
    const scheduler = require('../../lib/memory/memory-scheduler.cjs');

    scheduler.runDailyMaintenance(PROJECT_ROOT);

    const status = scheduler.getMaintenanceStatus(PROJECT_ROOT);
    const lastWeekly = status?.lastWeekly ? new Date(status.lastWeekly) : null;
    const daysSinceWeekly = lastWeekly
      ? (Date.now() - lastWeekly.getTime()) / (1000 * 60 * 60 * 24)
      : Infinity;

    if (daysSinceWeekly >= 7) {
      scheduler.runWeeklyMaintenance(PROJECT_ROOT);
      debugLog('unified-reflection', 'Weekly maintenance completed');
    } else {
      debugLog(
        'unified-reflection',
        `Weekly maintenance not due (${Math.round(daysSinceWeekly * 10) / 10} days since last run)`
      );
    }
  } catch (err) {
    debugLog('unified-reflection', 'Error running maintenance', err);
  }
}

/**
 * Record extracted memory items
 * @param {object} extracted - Object with patterns, gotchas, discoveries
 */
function recordMemoryItems(extracted) {
  if (!isEnabled()) {
    return;
  }

  try {
    // Import memory manager
    let memoryManager;
    try {
      memoryManager = require('../../lib/memory/memory-manager.cjs');
    } catch (_e) {
      const libPath = path.join(__dirname, '..', '..', 'lib', 'memory', 'memory-manager.cjs');
      memoryManager = require(libPath);
    }

    let recorded = 0;

    for (const pattern of extracted.patterns || []) {
      if (memoryManager.recordPattern(pattern, PROJECT_ROOT)) {
        recorded++;
      }
    }

    for (const gotcha of extracted.gotchas || []) {
      if (memoryManager.recordGotcha(gotcha, PROJECT_ROOT)) {
        recorded++;
      }
    }

    for (const discovery of extracted.discoveries || []) {
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

    if (recorded > 0 && process.env.DEBUG_HOOKS) {
      debugLog('unified-reflection', `Recorded ${recorded} memory items`);
    }
  } catch (err) {
    debugLog('unified-reflection', 'Error recording memory items', err);
  }
}

// ============================================================
// MAIN EXECUTION
// ============================================================

/**
 * Main execution - route to appropriate handler based on event type
 */
async function main() {
  const startTime = Date.now();
  const outcome = {
    eventType: null,
    queued: false,
    sessionRecorded: false,
    memoryItemsRecorded: false,
    taskUpdateTracked: false,
    embeddingTriggered: false,
    maintenanceTriggered: false,
  };
  try {
    // Check if enabled
    if (!isEnabled()) {
      process.exit(0);
    }

    // Parse input
    const hookInput = await parseHookInputAsync();

    if (!hookInput) {
      process.exit(0);
    }

    // Detect event type
    const eventType = detectEventType(hookInput);

    if (!eventType) {
      process.exit(0);
    }

    outcome.eventType = eventType;

    // Route to appropriate handler
    switch (eventType) {
      case 'task_completion': {
        const entry = handleTaskCompletion(hookInput);
        queueReflection(entry);
        outcome.queued = true;
        break;
      }

      // PERF-003 #2: Handle non-completion TaskUpdate (was task-update-tracker.cjs)
      case 'task_update': {
        handleTaskUpdate(hookInput);
        // No queue entry for non-completion updates
        outcome.taskUpdateTracked = true;
        break;
      }

      case 'error_recovery': {
        const entry = handleErrorRecovery(hookInput);
        queueReflection(entry);
        outcome.queued = true;
        break;
      }

      case 'session_end': {
        const result = handleSessionEnd(hookInput);
        // Queue reflection entry
        queueReflection(result.reflection);
        outcome.queued = true;
        // Record session to memory
        recordSession(result.sessionData);
        outcome.sessionRecorded = true;
        // Best-effort activations
        // Note: Embedding generation is awaited to ensure the process doesn't exit before work completes.
        outcome.embeddingTriggered = true;
        await triggerEmbeddingGeneration(result.sessionData).catch(err => {
          debugLog('unified-reflection', 'Embedding generation failed', err);
        });
        triggerMLSessionEnd(result);
        triggerMaintenance();
        outcome.maintenanceTriggered = true;
        break;
      }

      case 'memory_extraction': {
        const extracted = handleMemoryExtraction(hookInput);
        // Record to memory system
        recordMemoryItems(extracted);
        outcome.memoryItemsRecorded = true;
        break;
      }
    }

    try {
      await eventBus.emit(EventTypes.TOOL_COMPLETED, {
        type: EventTypes.TOOL_COMPLETED,
        timestamp: new Date().toISOString(),
        toolName: 'unified-reflection-handler',
        output: outcome,
        duration: Date.now() - startTime,
      });
    } catch (_e) {
      // Best-effort
    }
    // PostToolUse/SessionEnd hooks always exit 0 (don't block)
    process.exit(0);
  } catch (err) {
    try {
      await eventBus.emit(EventTypes.TOOL_FAILED, {
        type: EventTypes.TOOL_FAILED,
        timestamp: new Date().toISOString(),
        toolName: 'unified-reflection-handler',
        error: err.message,
      });
    } catch (_e) {
      // Best-effort
    }
    // Fail open
    debugLog('unified-reflection', 'Hook error during processing', err);
    process.exit(0);
  }
}

// Run if main module
if (require.main === module) {
  main();
}

// Exports for testing
module.exports = {
  // Core functions
  isEnabled,
  gatherSessionInsights,
  parseSessionInsightsFromMarkdown,
  detectEventType,

  // Event handlers
  handleTaskCompletion,
  handleTaskUpdate, // PERF-003 #2: Consolidated from task-update-tracker.cjs
  handleErrorRecovery,
  handleSessionEnd,
  handleMemoryExtraction,

  // Memory extraction helpers
  extractPatterns,
  extractGotchas,
  extractDiscoveries,
  getSessionStats,

  // Queue/memory management
  queueReflection,
  recordSession,
  triggerEmbeddingGeneration,
  triggerMLSessionEnd,
  triggerMaintenance,
  recordMemoryItems,

  // Main entry point
  main,

  // Configuration
  SESSION_END_EVENTS,
  MIN_OUTPUT_LENGTH,
  get QUEUE_FILE() {
    return QUEUE_FILE;
  },
  set QUEUE_FILE(val) {
    QUEUE_FILE = val;
  },
};
