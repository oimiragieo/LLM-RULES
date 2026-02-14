#!/usr/bin/env node
'use strict';

const {
  parseHookInputSync,
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
  const result = parseAndValidateTaskUpdate(effectivePayload, {
    allowedStatuses: VALID_TASK_STATUSES,
    requireTaskId: true,
    requireStatus: true,
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

function main(hookInput = null) {
  const input = hookInput || parseHookInputSync() || {};
  const result = runValidation(input);
  if (!result.allow) {
    console.log(formatResult({ allow: false, message: result.message }));
    return;
  }
  console.log(formatResult({ allow: true }));
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
  runValidation,
};
