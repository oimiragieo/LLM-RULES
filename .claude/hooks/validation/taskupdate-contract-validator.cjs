#!/usr/bin/env node
'use strict';

const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
  formatResult,
  auditLog,
} = require('../../lib/utils/hook-input.cjs');
const {
  parseAndValidateTaskUpdate,
  VALID_TASK_STATUSES,
} = require('../../lib/routing/task-update-contract.cjs');

function parseLegacyInput(input) {
  if (!input || typeof input !== 'object') return null;
  if (input.tool === 'TaskUpdate' && input.params && typeof input.params === 'object') {
    return input.params;
  }
  return null;
}

function runValidation(input) {
  const toolName = getToolName(input) || input?.tool || null;
  if (toolName !== 'TaskUpdate') {
    return { allow: true, message: '' };
  }

  const payload = getToolInput(input);
  const effectivePayload =
    payload && Object.keys(payload).length > 0 ? payload : parseLegacyInput(input) || {};
  const isReflectionCompletion =
    Array.isArray(effectivePayload.metadata?.processedReflectionIds) &&
    effectivePayload.metadata.processedReflectionIds.length > 0;
  const result = parseAndValidateTaskUpdate(effectivePayload, {
    allowedStatuses: VALID_TASK_STATUSES,
    requireTaskId: !isReflectionCompletion, // Reflection completions don't carry a traditional taskId
    requireStatus: true,
    requireCompletionMetadata: !isReflectionCompletion,
  });

  if (result.valid) {
    return { allow: true, message: '' };
  }

  const message = `[TASKUPDATE-CONTRACT] ${result.errors.join(' ')}`;
  auditLog('taskupdate-contract-validator', 'block', {
    check: 'taskupdate-contract',
    errors: result.errors,
    toolName,
  });
  return { allow: false, message };
}

async function main(hookInput = null) {
  const input = hookInput || (await parseHookInputAsync({ timeout: 300, allowEmpty: true }));
  if (!input || typeof input !== 'object') {
    const message = '[TASKUPDATE-CONTRACT] Missing or invalid hook input payload';
    auditLog('taskupdate-contract-validator', 'block', {
      check: 'taskupdate-contract-input-parse',
      error: 'missing_or_invalid_input',
    });
    console.log(formatResult({ allow: false, message }));
    process.exit(2);
  }
  const result = runValidation(input);
  if (!result.allow) {
    console.log(formatResult({ allow: false, message: result.message }));
    process.exit(2);
  }
  console.log(formatResult({ allow: true }));
}

if (require.main === module) {
  main().catch(() => {
    process.stderr.write('[TASKUPDATE-CONTRACT] Failed to parse hook input\n');
    process.exit(2);
  });
}

module.exports = {
  main,
  runValidation,
};
