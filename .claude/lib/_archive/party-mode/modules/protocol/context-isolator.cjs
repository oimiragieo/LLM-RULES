/**
 * Context Isolator (SEC-PM-004 - CRITICAL)
 *
 * Provides context isolation for Party Mode agents.
 * Creates deep copy of context with sensitive data stripped.
 *
 * Security Properties:
 * - Deep copy (no reference sharing)
 * - Internal data stripped (_internal, _system*, rawThinking, toolCalls)
 * - Agent metadata added (agentId, agentType, timestamp)
 * - Performance: <10ms for typical context
 */

/**
 * Isolate context for specific agent
 *
 * Creates deep copy of context and strips internal/sensitive data.
 * Each agent receives isolated copy - modifications don't affect others.
 *
 * @param {Object} originalContext - Shared context object
 * @param {string} agentId - Agent identifier
 * @param {string} agentType - Agent type (developer, architect, etc.)
 * @returns {Object} Isolated context copy
 */
function isolateContext(originalContext, agentId, agentType) {
  // STEP 1: Deep clone (no reference sharing)
  const isolated = JSON.parse(JSON.stringify(originalContext));

  // STEP 2: Add agent-specific metadata
  isolated.agentId = agentId;
  isolated.agentType = agentType;
  isolated.timestamp = Date.now();

  // STEP 3: Strip internal fields
  delete isolated._internal;
  delete isolated._systemPrompts;
  delete isolated._orchestratorState;
  delete isolated._allAgentContexts;
  delete isolated._sessionSecrets;
  delete isolated._coordinationState;
  delete isolated._agentQueue;

  // STEP 4: Sanitize previous responses (remove internal data)
  if (isolated.previousResponses && Array.isArray(isolated.previousResponses)) {
    isolated.previousResponses = isolated.previousResponses.map(response => ({
      agentName: response.agentName,
      displayName: response.displayName,
      icon: response.icon,
      content: response.content,
      hash: response.hash,
      timestamp: response.timestamp,
      // EXPLICITLY EXCLUDED:
      // - rawThinking (internal reasoning)
      // - toolCalls (tool usage patterns)
      // - memoryAccess (what agent read)
      // - _internalState (any internal state)
    }));
  }

  return isolated;
}

/**
 * Sanitize shared context before merging
 *
 * Removes sensitive data (credentials, tokens, paths, session IDs).
 *
 * @param {Object} context - Context to sanitize
 * @returns {Object} Sanitized context
 */
function sanitizeSharedContext(context) {
  const sanitized = JSON.parse(JSON.stringify(context));

  // Remove sensitive fields
  delete sanitized.apiKey;
  delete sanitized.token;
  delete sanitized.filePath;
  delete sanitized.sessionId;
  delete sanitized.credentials;
  delete sanitized.password;
  delete sanitized.secret;
  delete sanitized.privateKey;

  return sanitized;
}

/**
 * Validate context isolation boundaries
 *
 * Verifies agent hasn't accessed forbidden context fields.
 *
 * @param {Object} context - Context to validate
 * @param {string} agentId - Agent identifier
 * @returns {Object} Validation result
 * @returns {boolean} result.valid - Whether context is valid
 * @returns {Array<string>} result.violations - Array of violations found
 */
function validateContextBoundary(context, agentId) {
  const violations = [];

  // Check 1: No internal fields
  if (context._internal) {
    violations.push('Context contains _internal field');
  }
  if (context._systemPrompts) {
    violations.push('Context contains _systemPrompts field');
  }
  if (context._orchestratorState) {
    violations.push('Context contains _orchestratorState field');
  }

  // Check 2: Agent ID matches
  if (context.agentId && context.agentId !== agentId) {
    violations.push(`Context agentId mismatch: expected ${agentId}, got ${context.agentId}`);
  }

  // Check 3: No rawThinking in previous responses
  if (context.previousResponses && Array.isArray(context.previousResponses)) {
    context.previousResponses.forEach((response, index) => {
      if (response.rawThinking) {
        violations.push(`Response ${index} contains rawThinking`);
      }
      if (response.toolCalls) {
        violations.push(`Response ${index} contains toolCalls`);
      }
    });
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Merge agent contributions back to shared context
 *
 * Safely appends agent response to shared context.
 * Strips internal data during merge.
 *
 * @param {Object} sharedContext - Shared context object
 * @param {Object} agentContribution - Agent's response
 * @returns {Object} Updated shared context
 */
function mergeAgentContributions(sharedContext, agentContribution) {
  // Strip internal data from contribution
  const publicContribution = {
    agentName: agentContribution.agentName,
    displayName: agentContribution.displayName,
    icon: agentContribution.icon,
    content: agentContribution.content,
    hash: agentContribution.hash,
    timestamp: agentContribution.timestamp,
    // EXPLICITLY EXCLUDED:
    // - rawThinking
    // - toolCalls
    // - memoryAccess
  };

  // Append to previousResponses
  if (!sharedContext.previousResponses) {
    sharedContext.previousResponses = [];
  }

  sharedContext.previousResponses.push(publicContribution);

  return sharedContext;
}

module.exports = {
  isolateContext,
  sanitizeSharedContext,
  validateContextBoundary,
  mergeAgentContributions,
};
