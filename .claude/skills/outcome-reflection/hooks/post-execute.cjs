#!/usr/bin/env node
'use strict';

/**
 * outcome-reflection - Post-Execute Hook
 * Iron Law III: Emits observability event after calibration execution.
 */

const path = require('path');
const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');

function findProjectRoot(start) {
  const fs = require('fs');
  let dir = start || __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.claude'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

function postExecute(context = {}) {
  try {
    const projectRoot = findProjectRoot(__dirname);
    const sendEventPath = path.join(
      projectRoot,
      '.claude',
      'tools',
      'observability',
      'send-event.cjs'
    );

    const { sendEvent } = require(sendEventPath);
    sendEvent({
      tool_name: 'outcome-reflection',
      agent_id: context.agentId || process.env.AGENT_ID || 'unknown',
      session_id: context.sessionId || process.env.SESSION_ID || 'unknown',
      outcome: context.success !== false ? 'success' : 'failure',
      metadata: {
        taskId: context.taskId || 'unknown',
        overallScore: context.overallScore || null,
        flagged: context.flagged || false,
        reflectionQueued: context.reflectionQueued || false,
      },
    });
  } catch (err) {
    // Post hooks fail-open
    process.stderr.write(
      `[outcome-reflection/post-execute] WARNING: Could not emit event: ${err.message}\n`
    );
  }
}

if (require.main === module) {
  const context = {};
  try {
    const raw = process.argv.slice(2).join(' ');
    if (raw) Object.assign(context, safeParseJSON(raw));
  } catch (_e) {
    // ignore
  }
  postExecute(context);
}

module.exports = { postExecute };
