'use strict';

const MAX_CONTEXT_CHARS = 2000; // ~500 tokens

let lastCompletedTask = null;

function recordTaskCompletion(taskData) {
  lastCompletedTask = {
    taskId: taskData.taskId || 'unknown',
    agentType: taskData.agentType || 'unknown',
    summary: taskData.summary || '',
    filesModified: taskData.filesModified || [],
    keyDecisions: taskData.keyDecisions || [],
    completedAt: new Date().toISOString(),
  };
}

function getPreviousTaskContext() {
  if (process.env.PREVIOUS_TASK_INJECTION === 'off') {
    return '';
  }

  if (!lastCompletedTask) {
    return '';
  }

  const t = lastCompletedTask;
  let context = `## Previous Task Context\n`;
  context += `- Task: ${t.taskId} (${t.agentType})\n`;
  context += `- Summary: ${t.summary}\n`;

  if (t.filesModified.length > 0) {
    const files = t.filesModified.slice(0, 10);
    context += `- Files modified: ${files.join(', ')}`;
    if (t.filesModified.length > 10) {
      context += ` (+${t.filesModified.length - 10} more)`;
    }
    context += '\n';
  }

  if (t.keyDecisions.length > 0) {
    const decisions = t.keyDecisions.slice(0, 5);
    context += `- Key decisions: ${decisions.join('; ')}\n`;
  }

  // Truncate to budget
  if (context.length > MAX_CONTEXT_CHARS) {
    context = context.slice(0, MAX_CONTEXT_CHARS - 3) + '...';
  }

  return context;
}

function _reset() {
  lastCompletedTask = null;
}

module.exports = {
  recordTaskCompletion,
  getPreviousTaskContext,
  _reset,
};
