#!/usr/bin/env node
/**
 * Error Pattern Detection Engine
 * Phase 4.2 of error logging integration
 *
 * Analyzes error logs to detect patterns:
 * 1. Repeated Errors: Same error > threshold times
 * 2. Error Cascades: Error A causes Error B
 * 3. Time-Based Patterns: Errors concentrated in certain hours
 * 4. Agent-Specific Issues: Agent has many errors
 * 5. Hook Failures: Same hook failing repeatedly
 * 6. Tool Failures: Tool X fails frequently
 * 7. Severity Escalation: Similar error increasing in severity
 *
 * @module lib/error-pattern-detector
 */

'use strict';

// Configuration
const DEFAULT_REPEATED_THRESHOLD = 3;
const DEFAULT_CASCADE_WINDOW_MS = 5000; // 5 seconds for temporal proximity
const DEFAULT_HOOK_FAILURE_THRESHOLD = 2;
const DEFAULT_TOOL_FAILURE_THRESHOLD = 5;
const DEFAULT_AGENT_ERROR_THRESHOLD = 5;

/**
 * Detect repeated errors (same error message > threshold times)
 * @param {Array<object>} errors - Array of error entries
 * @param {number} [threshold=3] - Minimum occurrences to flag
 * @returns {Array<object>} Array of repeated error patterns
 */
function detectRepeatedErrors(errors, threshold = DEFAULT_REPEATED_THRESHOLD) {
  if (!Array.isArray(errors) || errors.length === 0) {
    return [];
  }

  const messageCounts = new Map();

  for (const error of errors) {
    const message = error.message || 'unknown';
    const key = message;

    if (!messageCounts.has(key)) {
      messageCounts.set(key, {
        message,
        category: error.category,
        count: 0,
        errorIds: [],
        firstSeen: error.timestamp,
        lastSeen: error.timestamp,
      });
    }

    const entry = messageCounts.get(key);
    entry.count++;
    entry.errorIds.push(error.errorId);
    entry.lastSeen = error.timestamp;
  }

  return Array.from(messageCounts.values()).filter(entry => entry.count >= threshold);
}

/**
 * Detect error cascades (errors caused by other errors)
 * Uses parentErrorId correlation or temporal proximity within same task
 * @param {Array<object>} errors - Array of error entries
 * @returns {Array<object>} Array of cascade patterns
 */
function detectCascades(errors) {
  if (!Array.isArray(errors) || errors.length === 0) {
    return [];
  }

  const cascades = [];
  const errorMap = new Map(errors.map(e => [e.errorId, e]));

  // Build parent->child relationships for explicit cascades
  const parentToChildren = new Map();
  const childToParent = new Map();

  for (const error of errors) {
    const parentId = error.correlation?.parentErrorId;
    if (parentId && errorMap.has(parentId)) {
      if (!parentToChildren.has(parentId)) {
        parentToChildren.set(parentId, []);
      }
      parentToChildren.get(parentId).push(error.errorId);
      childToParent.set(error.errorId, parentId);
    }
  }

  // Find root errors (parents that are not children of anyone)
  const processedRoots = new Set();
  for (const parentId of parentToChildren.keys()) {
    // Find the ultimate root by traversing up the chain
    let root = parentId;
    while (childToParent.has(root)) {
      root = childToParent.get(root);
    }

    if (processedRoots.has(root)) continue;
    processedRoots.add(root);

    // Collect all descendants from this root
    const allChildren = [];
    const queue = [root];
    const visited = new Set([root]);

    while (queue.length > 0) {
      const current = queue.shift();
      const children = parentToChildren.get(current) || [];
      for (const child of children) {
        if (!visited.has(child)) {
          visited.add(child);
          allChildren.push(child);
          queue.push(child);
        }
      }
    }

    if (allChildren.length > 0) {
      cascades.push({
        rootErrorId: root,
        childErrorIds: allChildren,
        cascadeDepth: Math.max(1, allChildren.length),
      });
    }
  }

  // Detect implicit cascades via temporal proximity within same task
  const taskGroups = new Map();
  for (const error of errors) {
    const taskId = error.context?.taskId;
    if (taskId) {
      if (!taskGroups.has(taskId)) {
        taskGroups.set(taskId, []);
      }
      taskGroups.get(taskId).push(error);
    }
  }

  for (const [_taskId, taskErrors] of taskGroups) {
    if (taskErrors.length < 2) continue;

    // Sort by timestamp
    const sorted = taskErrors.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // Find critical/high severity errors that might be root causes
    const potentialRoots = sorted.filter(
      e => e.severity === 'CRITICAL' || e.severity === 'HIGH'
    );

    for (const root of potentialRoots) {
      const rootTime = new Date(root.timestamp).getTime();
      const children = sorted.filter(e => {
        if (e.errorId === root.errorId) return false;
        const childTime = new Date(e.timestamp).getTime();
        return (
          childTime > rootTime &&
          childTime - rootTime <= DEFAULT_CASCADE_WINDOW_MS &&
          !processedRoots.has(root.errorId) // Don't duplicate with explicit cascades
        );
      });

      if (children.length > 0) {
        cascades.push({
          rootErrorId: root.errorId,
          childErrorIds: children.map(c => c.errorId),
          cascadeDepth: 1,
          implicit: true,
        });
      }
    }
  }

  return cascades;
}

/**
 * Detect hook failures (same hook failing > threshold times)
 * @param {Array<object>} errors - Array of error entries
 * @param {number} [threshold=2] - Minimum failures to flag
 * @returns {Array<object>} Array of hook failure patterns
 */
function detectHookFailures(errors, threshold = DEFAULT_HOOK_FAILURE_THRESHOLD) {
  if (!Array.isArray(errors) || errors.length === 0) {
    return [];
  }

  const hookCounts = new Map();

  for (const error of errors) {
    if (error.category !== 'HOOK_FAILURE') continue;

    const hookName = error.source?.location || 'unknown';

    if (!hookCounts.has(hookName)) {
      hookCounts.set(hookName, {
        hookName,
        count: 0,
        errorIds: [],
        lastOccurrence: null,
      });
    }

    const entry = hookCounts.get(hookName);
    entry.count++;
    entry.errorIds.push(error.errorId);
    entry.lastOccurrence = error.timestamp;
  }

  return Array.from(hookCounts.values()).filter(entry => entry.count > threshold);
}

/**
 * Detect tool failures (same tool failing > threshold times)
 * @param {Array<object>} errors - Array of error entries
 * @param {number} [threshold=5] - Minimum failures to flag
 * @returns {Array<object>} Array of tool failure patterns
 */
function detectToolFailures(errors, threshold = DEFAULT_TOOL_FAILURE_THRESHOLD) {
  if (!Array.isArray(errors) || errors.length === 0) {
    return [];
  }

  const toolCounts = new Map();

  for (const error of errors) {
    if (error.category !== 'TOOL_FAILURE') continue;

    const toolName = error.context?.toolName || 'unknown';

    if (!toolCounts.has(toolName)) {
      toolCounts.set(toolName, {
        toolName,
        count: 0,
        errorIds: [],
        lastOccurrence: null,
      });
    }

    const entry = toolCounts.get(toolName);
    entry.count++;
    entry.errorIds.push(error.errorId);
    entry.lastOccurrence = error.timestamp;
  }

  return Array.from(toolCounts.values()).filter(entry => entry.count >= threshold);
}

/**
 * Detect agents with high error counts
 * @param {Array<object>} errors - Array of error entries
 * @param {number} [threshold=5] - Minimum errors to flag
 * @returns {Array<object>} Array of agent issue patterns
 */
function detectAgentIssues(errors, threshold = DEFAULT_AGENT_ERROR_THRESHOLD) {
  if (!Array.isArray(errors) || errors.length === 0) {
    return [];
  }

  const agentCounts = new Map();

  for (const error of errors) {
    const agentName = error.context?.agentName || 'unknown';

    if (!agentCounts.has(agentName)) {
      agentCounts.set(agentName, {
        agentName,
        errorCount: 0,
        errorIds: [],
        bySeverity: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
      });
    }

    const entry = agentCounts.get(agentName);
    entry.errorCount++;
    entry.errorIds.push(error.errorId);
    if (error.severity) {
      entry.bySeverity[error.severity] = (entry.bySeverity[error.severity] || 0) + 1;
    }
  }

  return Array.from(agentCounts.values()).filter(entry => entry.errorCount > threshold);
}

/**
 * Detect severity escalation (similar errors increasing in severity)
 * @param {Array<object>} errors - Array of error entries
 * @returns {Array<object>} Array of escalation patterns
 */
function detectSeverityEscalations(errors) {
  if (!Array.isArray(errors) || errors.length === 0) {
    return [];
  }

  const severityOrder = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
  const messageHistory = new Map();

  for (const error of errors) {
    const message = error.message || 'unknown';

    if (!messageHistory.has(message)) {
      messageHistory.set(message, []);
    }

    messageHistory.get(message).push({
      timestamp: error.timestamp,
      severity: error.severity,
      errorId: error.errorId,
    });
  }

  const escalations = [];

  for (const [message, history] of messageHistory) {
    if (history.length < 2) continue;

    // Sort by timestamp
    const sorted = history.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // Check if severity is increasing
    let escalating = false;
    let previousSeverity = severityOrder[sorted[0].severity] || 0;

    for (let i = 1; i < sorted.length; i++) {
      const currentSeverity = severityOrder[sorted[i].severity] || 0;
      if (currentSeverity > previousSeverity) {
        escalating = true;
      }
      previousSeverity = currentSeverity;
    }

    if (escalating) {
      escalations.push({
        message,
        fromSeverity: sorted[0].severity,
        toSeverity: sorted[sorted.length - 1].severity,
        occurrences: sorted.length,
        errorIds: sorted.map(s => s.errorId),
      });
    }
  }

  return escalations;
}

/**
 * Detect all patterns in error list
 * @param {Array<object>} errors - Array of error entries
 * @returns {object} Object containing all detected patterns
 */
function detectPatterns(errors) {
  return {
    repeatedErrors: detectRepeatedErrors(errors),
    cascades: detectCascades(errors),
    hookFailures: detectHookFailures(errors),
    toolFailures: detectToolFailures(errors),
    agentIssues: detectAgentIssues(errors),
    severityEscalations: detectSeverityEscalations(errors),
  };
}

/**
 * Calculate health score for an agent based on error history
 * @param {string} agentName - Name of the agent
 * @param {Array<object>} errors - Array of error entries
 * @returns {number} Health score (0-100, higher is better)
 */
function scoreAgentHealth(agentName, errors) {
  if (!Array.isArray(errors) || errors.length === 0) {
    return 100; // No errors = perfect health
  }

  const agentErrors = errors.filter(e => e.context?.agentName === agentName);

  if (agentErrors.length === 0) {
    return 100; // No errors for this agent
  }

  // Base score starts at 100
  let score = 100;

  // Deduct points based on error count and severity
  const severityWeights = { CRITICAL: 20, HIGH: 10, MEDIUM: 5, LOW: 2 };

  for (const error of agentErrors) {
    const weight = severityWeights[error.severity] || 3;
    score -= weight;
  }

  // Ensure score is between 0 and 100
  return Math.max(0, Math.min(100, score));
}

/**
 * Generate recommendations based on detected patterns
 * @param {object} patterns - Detected patterns from detectPatterns()
 * @returns {Array<object>} Array of recommendations
 */
function generateRecommendations(patterns) {
  const recommendations = [];

  // Recommendations for repeated errors
  for (const repeated of patterns.repeatedErrors || []) {
    recommendations.push({
      priority: repeated.count > 5 ? 'HIGH' : 'MEDIUM',
      issue: `${repeated.count} repeated occurrences of: "${repeated.message.substring(0, 50)}..."`,
      suggestion: `Investigate root cause of recurring error. Consider adding retry logic or improving error handling.`,
      errorIds: repeated.errorIds,
    });
  }

  // Recommendations for cascades
  for (const cascade of patterns.cascades || []) {
    recommendations.push({
      priority: 'HIGH',
      issue: `Error cascade detected starting from ${cascade.rootErrorId}, affecting ${cascade.childErrorIds.length} subsequent operations`,
      suggestion: `Fix the root cause error (${cascade.rootErrorId}). Add circuit breaker pattern to prevent cascade failures.`,
      errorIds: [cascade.rootErrorId, ...cascade.childErrorIds],
    });
  }

  // Recommendations for agent issues
  for (const agentIssue of patterns.agentIssues || []) {
    recommendations.push({
      priority: agentIssue.bySeverity?.CRITICAL > 0 ? 'CRITICAL' : 'HIGH',
      issue: `Agent "${agentIssue.agentName}" has ${agentIssue.errorCount} errors`,
      suggestion: `Review agent configuration and training data. Consider adding more explicit error handling.`,
      errorIds: agentIssue.errorIds,
    });
  }

  // Recommendations for hook failures
  for (const hookFailure of patterns.hookFailures || []) {
    recommendations.push({
      priority: 'HIGH',
      issue: `Hook "${hookFailure.hookName}" failed ${hookFailure.count} times`,
      suggestion: `Review hook logic and error handling. Validate inputs and add defensive coding.`,
      errorIds: hookFailure.errorIds,
    });
  }

  // Recommendations for tool failures
  for (const toolFailure of patterns.toolFailures || []) {
    recommendations.push({
      priority: 'MEDIUM',
      issue: `Tool "${toolFailure.toolName}" failed ${toolFailure.count} times`,
      suggestion: `Check tool configuration and dependencies. Consider adding input validation.`,
      errorIds: toolFailure.errorIds,
    });
  }

  // Recommendations for severity escalations
  for (const escalation of patterns.severityEscalations || []) {
    recommendations.push({
      priority: 'HIGH',
      issue: `Error severity escalating: "${escalation.message.substring(0, 30)}..." (${escalation.fromSeverity} -> ${escalation.toSeverity})`,
      suggestion: `Urgent: Address degradation pattern before it becomes critical.`,
      errorIds: escalation.errorIds,
    });
  }

  return recommendations;
}

module.exports = {
  // Core detection functions
  detectRepeatedErrors,
  detectCascades,
  detectHookFailures,
  detectToolFailures,
  detectAgentIssues,
  detectSeverityEscalations,
  detectPatterns,

  // Analysis functions
  scoreAgentHealth,
  generateRecommendations,

  // Configuration
  DEFAULT_REPEATED_THRESHOLD,
  DEFAULT_CASCADE_WINDOW_MS,
  DEFAULT_HOOK_FAILURE_THRESHOLD,
  DEFAULT_TOOL_FAILURE_THRESHOLD,
  DEFAULT_AGENT_ERROR_THRESHOLD,
};
