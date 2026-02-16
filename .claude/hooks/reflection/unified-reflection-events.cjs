'use strict';

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
    const toolResult = getToolOutput(input) || '';
    const output = typeof toolResult === 'string' ? toolResult : '';
    return {
      patterns: extractPatterns(output),
      gotchas: extractGotchas(output),
      discoveries: extractDiscoveries(output),
    };
  }

  function extractPatterns(output) {
    const patterns = [];
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

    return patterns.slice(0, 3);
  }

  function extractGotchas(output) {
    const gotchas = [];
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

    return gotchas.slice(0, 3);
  }

  function extractDiscoveries(output) {
    const discoveries = [];
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

    return discoveries.slice(0, 5);
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
