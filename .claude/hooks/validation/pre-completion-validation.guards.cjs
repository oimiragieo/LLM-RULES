'use strict';

function isInProgressTaskUpdate(toolName, toolInput) {
  return toolName === 'TaskUpdate' && toolInput && toolInput.status === 'in_progress';
}

function isRouterContext(input) {
  return !process.env.CLAUDE_AGENT_ID && !(input && input.agent_id);
}

function shouldBypassPreCompletionValidation({ input, toolName, toolInput }) {
  if (isInProgressTaskUpdate(toolName, toolInput)) {
    return { bypass: true, reason: 'in_progress' };
  }

  if (
    toolName === 'TaskUpdate' &&
    isRouterContext(input) &&
    toolInput &&
    toolInput.status === 'completed'
  ) {
    return { bypass: true, reason: 'router_completed' };
  }

  return { bypass: false, reason: null };
}

module.exports = {
  isInProgressTaskUpdate,
  isRouterContext,
  shouldBypassPreCompletionValidation,
};
