'use strict';

const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

function createReflectionEventHandlers({
  getToolName,
  getToolInput,
  getToolOutput,
  debugLog,
  routerState,
  taskClaimLedger,
  parseAndValidateTaskUpdate,
  gatherSessionInsights,
  errorSummaryExtractor,
  sessionEndEvents,
  minOutputLength,
}) {
  function classifyFailureType({ errorText = '', toolName = '', exitCode = null } = {}) {
    const text = String(errorText || '').toLowerCase();

    if (
      text.includes('context window') ||
      text.includes('context length') ||
      text.includes('too many tokens') ||
      text.includes('token limit')
    ) {
      return 'context_overflow';
    }

    if (
      text.includes('timed out') ||
      text.includes('timeout') ||
      text.includes('etimedout') ||
      text.includes('deadline exceeded')
    ) {
      return 'timeout';
    }

    if (
      text.includes('cannot find module') ||
      text.includes('module not found') ||
      text.includes('dependency') ||
      text.includes('enoent') ||
      text.includes('no such file or directory')
    ) {
      return 'dependency_error';
    }

    if (
      text.includes('hallucination') ||
      text.includes('hallucinated') ||
      text.includes('fabricated')
    ) {
      return 'hallucination';
    }

    if (
      text.includes('scope creep') ||
      text.includes('out of scope') ||
      text.includes('not requested')
    ) {
      return 'scope_drift';
    }

    if (toolName === 'Bash' && typeof exitCode === 'number' && exitCode !== 0) {
      return 'tool_failure';
    }

    return 'tool_failure';
  }

  function normalizeTaskUpdateFields(toolInput) {
    const parsed = parseAndValidateTaskUpdate(toolInput, {
      requireTaskId: false,
      requireStatus: false,
    });
    return parsed.normalized;
  }

  /**
   * Detect the event type from hook input
   * @param {object|null} input
   * @returns {string|null}
   */
  function detectEventType(input) {
    if (!input) return null;

    const eventType = input.event || input.event_type;
    if (eventType && sessionEndEvents.includes(eventType)) {
      return 'session_end';
    }

    const toolName = getToolName(input);
    const toolInput = getToolInput(input);
    const toolResult = getToolOutput(input);

    if (toolName === 'TaskUpdate') {
      const update = normalizeTaskUpdateFields(toolInput);
      if (update.taskId && update.status === 'completed') {
        return 'task_completion';
      }
      if (update.taskId && update.status) {
        return 'task_update';
      }
      return null;
    }

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

    if (toolName === 'MemoryRecord') {
      return 'memory_extraction';
    }

    if (toolResult && toolResult.error) {
      return 'error_recovery';
    }

    if (toolName === 'Task') {
      const output = typeof toolResult === 'string' ? toolResult : '';
      if (output.length >= minOutputLength) {
        return 'memory_extraction';
      }
      return null;
    }

    return null;
  }

  function handleTaskCompletion(input) {
    const toolInput = getToolInput(input);
    const update = normalizeTaskUpdateFields(toolInput);

    if (update.taskId && update.status) {
      routerState.recordTaskUpdate(update.taskId, update.status);
      if (taskClaimLedger && typeof taskClaimLedger.releaseClaim === 'function') {
        taskClaimLedger.releaseClaim(update.taskId, update.status);
      }
      if (process.env.DEBUG_HOOKS) {
        debugLog(
          'unified-reflection',
          `TaskUpdate recorded: taskId=${update.taskId}, status=${update.status}`
        );
      }
    }

    const entry = {
      taskId: update.taskId,
      trigger: 'task_completion',
      timestamp: new Date().toISOString(),
      priority: 'high',
    };

    if (toolInput.metadata && toolInput.metadata.summary) {
      entry.summary = toolInput.metadata.summary;
    } else {
      const fallbackTaskId = update.taskId || 'unknown';
      entry.summary = `Task ${fallbackTaskId} completed without summary metadata`;
    }

    return entry;
  }

  function handleTaskUpdate(input) {
    const toolInput = getToolInput(input);
    const update = normalizeTaskUpdateFields(toolInput);

    if (update.taskId && update.status) {
      routerState.recordTaskUpdate(update.taskId, update.status);
      if (taskClaimLedger && typeof taskClaimLedger.releaseClaim === 'function') {
        taskClaimLedger.releaseClaim(update.taskId, update.status);
      }
      if (process.env.DEBUG_HOOKS) {
        debugLog(
          'unified-reflection',
          `TaskUpdate recorded: taskId=${update.taskId}, status=${update.status}`
        );
      }
    }
  }

  function handleErrorRecovery(input) {
    const toolName = getToolName(input);
    const toolInput = getToolInput(input);
    const toolResult = getToolOutput(input) || {};

    let severity = 'MEDIUM';
    if (toolResult.error?.includes('CRITICAL') || toolResult.error?.includes('SECURITY')) {
      severity = 'CRITICAL';
    } else if (
      toolResult.error?.includes('permission denied') ||
      toolResult.error?.includes('not found')
    ) {
      severity = 'HIGH';
    }

    const priority = severity === 'CRITICAL' ? 'high' : severity === 'HIGH' ? 'medium' : 'low';
    const entry = {
      context: 'error_recovery',
      trigger: 'error',
      tool: toolName,
      timestamp: new Date().toISOString(),
      priority,
      severity,
      category: toolName === 'Bash' ? 'TOOL_FAILURE' : 'EXECUTION_ERROR',
    };

    if (toolName === 'Bash') {
      entry.command = toolInput.command;
      if (toolResult.stderr) {
        entry.error = toolResult.stderr;
      }
      if (typeof toolResult.exit_code === 'number') {
        entry.exitCode = toolResult.exit_code;
      }
    }

    if (toolResult.error) {
      entry.error =
        typeof toolResult.error === 'string' ? toolResult.error : JSON.stringify(toolResult.error);
    }

    if (toolInput.file_path) {
      entry.filePath = toolInput.file_path;
    }

    entry.correlation = {
      sessionId: process.env.CLAUDE_SESSION_ID,
      traceId: process.env.TRACE_ID,
    };

    const errorText = [
      entry.error,
      typeof toolResult.stderr === 'string' ? toolResult.stderr : '',
      typeof toolInput.command === 'string' ? toolInput.command : '',
    ]
      .filter(Boolean)
      .join('\n');
    entry.failureType = classifyFailureType({
      errorText,
      toolName,
      exitCode: entry.exitCode,
    });

    return entry;
  }

  function getErrorSummaryForReflection() {
    if (!errorSummaryExtractor) {
      return null;
    }

    try {
      const result = errorSummaryExtractor.extractSummaryForReflection({ hours: 24 });
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

  function getSessionStats(input) {
    const stats = input.stats || {};
    return {
      toolCalls: stats.tool_calls || 0,
      errors: stats.errors || 0,
      tasksCompleted: stats.tasks_completed || 0,
    };
  }

  function handleSessionEnd(input) {
    const sessionId = input.session_id || input.sessionId || process.env.CLAUDE_SESSION_ID;
    const stats = getSessionStats(input);
    const insights = gatherSessionInsights(input);
    const toolsUsed = Array.isArray(input?.tools_used)
      ? input.tools_used
      : Array.isArray(input?.stats?.tool_names)
        ? input.stats.tool_names
        : [];

    const errorSummary = getErrorSummaryForReflection();

    let reflectionPriority = 'low';
    if (errorSummary) {
      if (errorSummary.criticalIssues > 0 || errorSummary.reflectionWeight >= 0.7) {
        reflectionPriority = 'high';
      } else if (errorSummary.reflectionWeight >= 0.4) {
        reflectionPriority = 'medium';
      }
    }

    const reflection = {
      context: 'session_end',
      trigger: 'session_end',
      sessionId: sessionId,
      scope: 'all_unreflected_tasks',
      timestamp: new Date().toISOString(),
      priority: reflectionPriority,
      stats,
      errorReview: errorSummary,
    };

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

    return { reflection, sessionData };
  }

  function handleMemoryExtraction(input) {
    const toolName = getToolName(input);
    const toolInput = getToolInput(input) || {};
    if (toolName === 'MemoryRecord') {
      const type = String(toolInput.type || '').toLowerCase();
      const content = typeof toolInput.content === 'string' ? toolInput.content.trim() : '';
      if (!content) {
        return { patterns: [], gotchas: [], discoveries: [] };
      }
      const memoryItem = {
        text: content,
        area: toolInput.area,
        source: toolInput.source,
        confidence: toolInput.confidence,
        taskId: toolInput.taskId || toolInput.task_id,
      };
      if (type === 'pattern') {
        return { patterns: [memoryItem], gotchas: [], discoveries: [] };
      }
      if (type === 'gotcha') {
        return { patterns: [], gotchas: [memoryItem], discoveries: [] };
      }
      if (type === 'discovery') {
        return {
          patterns: [],
          gotchas: [],
          discoveries: [
            {
              path: toolInput.path || toolInput.filePath || 'unknown',
              description: content,
              area: toolInput.area,
              source: toolInput.source,
              confidence: toolInput.confidence,
              taskId: toolInput.taskId || toolInput.task_id,
            },
          ],
        };
      }
      return { patterns: [], gotchas: [], discoveries: [] };
    }

    const toolResult = getToolOutput(input) || '';
    const output = typeof toolResult === 'string' ? toolResult : '';
    return extractStructuredInsights(output);
  }

  function sanitizeTextEntries(value, maxEntries = 3) {
    if (!Array.isArray(value)) return [];
    return value
      .filter(item => typeof item === 'string')
      .map(item => item.trim())
      .filter(item => item.length > 0 && item.length <= 200)
      .slice(0, maxEntries);
  }

  function sanitizeDiscoveries(value) {
    if (!Array.isArray(value)) return [];
    return value
      .filter(item => item && typeof item === 'object')
      .map(item => ({
        path: typeof item.path === 'string' ? item.path.trim() : '',
        description: typeof item.description === 'string' ? item.description.trim() : '',
      }))
      .filter(item => item.path && item.description && !item.path.includes(' '))
      .slice(0, 5);
  }

  function extractInsightsFromLines(text) {
    const patterns = [];
    const gotchas = [];
    const discoveries = [];
    const str = String(text);

    // Pattern extraction — matches "pattern:", "best practice:", "approach:", etc.
    const patternIndicators = [
      /(?:pattern|approach|solution|technique|best practice):\s*(.+)/gi,
      /(?:always|should|must|prefer)\s+(.{20,100})/gi,
      /(?:use|using)\s+(\w+)\s+(?:for|to|when)\s+(.{10,50})/gi,
    ];
    for (const regex of patternIndicators) {
      let match;
      regex.lastIndex = 0;
      while ((match = regex.exec(str)) !== null) {
        const patternText = (match[1] || match[2] || '').trim();
        if (patternText && patternText.length > 10 && patternText.length < 200) {
          patterns.push(patternText);
        }
      }
    }

    // Gotcha extraction — matches "gotcha:", "warning:", "don't ...", etc.
    const gotchaIndicators = [
      /(?:gotcha|pitfall|warning|caution|watch out|careful):\s*(.+)/gi,
      /(?:don't|do not|never|avoid)\s+(.{20,100})/gi,
      /(?:bug|issue|problem):\s*(.{20,150})/gi,
      /(?:fixed|resolved)\s+(?:by|with)\s+(.{20,100})/gi,
    ];
    for (const regex of gotchaIndicators) {
      let match;
      regex.lastIndex = 0;
      while ((match = regex.exec(str)) !== null) {
        const gotchaText = (match[1] || '').trim();
        if (gotchaText && gotchaText.length > 10 && gotchaText.length < 200) {
          gotchas.push(gotchaText);
        }
      }
    }

    // Discovery extraction — matches backtick-wrapped filenames with .cjs/.js/.ts etc.
    const filePattern = /`([^`]+\.[a-z]{1,5})`/gi;
    let match;
    while ((match = filePattern.exec(str)) !== null) {
      const fileName = match[1].trim();
      if (fileName && !fileName.includes(' ') && fileName.length < 100) {
        // Find a short description after the filename reference
        const afterFile = str.slice(
          match.index + match[0].length,
          match.index + match[0].length + 120
        );
        const desc = afterFile.replace(/^\s+/, '').split(/[.!?]/)[0].trim();
        discoveries.push({ path: fileName, description: desc || `File ${fileName} referenced` });
      }
    }

    return {
      patterns: sanitizeTextEntries(patterns, 3),
      gotchas: sanitizeTextEntries(gotchas, 3),
      discoveries: sanitizeDiscoveries(discoveries),
    };
  }

  function extractStructuredInsights(output) {
    if (typeof output !== 'string') {
      return { patterns: [], gotchas: [], discoveries: [] };
    }

    const trimmed = output.trim();

    if (trimmed.startsWith('{')) {
      try {
        const parsed = safeParseJSON(trimmed, null);
        if (!parsed || !parsed.patterns) return { patterns: [], gotchas: [], discoveries: [] };
        const result = {
          patterns: sanitizeTextEntries(parsed?.patterns, 3),
          gotchas: sanitizeTextEntries(parsed?.gotchas, 3),
          discoveries: sanitizeDiscoveries(parsed?.discoveries),
        };
        // Fall through to line-based extraction if all arrays are empty
        if (
          result.patterns.length > 0 ||
          result.gotchas.length > 0 ||
          result.discoveries.length > 0
        ) {
          return result;
        }
      } catch (_err) {
        // JSON parse failed — fall through to line-based extraction
      }
    }

    // Fallback: scan line-by-line for Pattern:/Gotcha:/Discovery: prefixes
    return extractInsightsFromLines(output);
  }

  function extractPatterns(output) {
    return extractStructuredInsights(output).patterns;
  }

  function extractGotchas(output) {
    return extractStructuredInsights(output).gotchas;
  }

  function extractDiscoveries(output) {
    return extractStructuredInsights(output).discoveries;
  }

  return {
    detectEventType,
    handleTaskCompletion,
    handleTaskUpdate,
    handleErrorRecovery,
    handleSessionEnd,
    handleMemoryExtraction,
    extractPatterns,
    extractGotchas,
    extractDiscoveries,
    getSessionStats,
  };
}

module.exports = {
  createReflectionEventHandlers,
};
