#!/usr/bin/env node
'use strict';

/**
 * adversarial-debate - Post-Execute Hook
 * Iron Law III: Emits observability event after debate execution.
 * Appends structured entry to .claude/context/runtime/tool-events.jsonl
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
      tool_name: 'adversarial-debate',
      agent_id: context.agentId || process.env.AGENT_ID || 'unknown',
      session_id: context.sessionId || process.env.SESSION_ID || 'unknown',
      outcome: context.success !== false ? 'success' : 'failure',
      metadata: {
        topic: context.topic || 'unknown',
        rounds: context.rounds || 0,
        recommendation: context.recommendation || 'unknown',
        confidence: context.confidence || 'unknown',
      },
    });
  } catch (err) {
    // Post hooks fail-open — do not block execution
    process.stderr.write(
      `[adversarial-debate/post-execute] WARNING: Could not emit event: ${err.message}\n`
    );
  }
}

// CLI invocation
if (require.main === module) {
  const context = {};
  try {
    const raw = process.argv.slice(2).join(' ');
    if (raw) Object.assign(context, safeParseJSON(raw));
  } catch (_e) {
    // ignore parse errors
  }
  postExecute(context);
}

module.exports = { postExecute };
