#!/usr/bin/env node
'use strict';

/**
 * channel-management/hooks/post-execute.cjs
 *
 * Post-execution observability hook for the channel-management skill.
 * Emits a structured event to tool-events.jsonl after every lifecycle action.
 *
 * Iron Law III compliance: every skill execution emits a traceable event.
 */

const path = require('path');
const fs = require('fs');

const EVENTS_FILE = path.resolve(__dirname, '../../../../context/runtime/tool-events.jsonl');

function postExecute(context = {}) {
  const event = {
    timestamp: new Date().toISOString(),
    tool_name: 'channel-management',
    agent_id: context.agentId || process.env.AGENT_ID || 'unknown',
    session_id: context.sessionId || process.env.SESSION_ID || 'unknown',
    action: context.action || 'unknown',
    outcome: context.success ? 'success' : 'failure',
    pid: context.pid || null,
    health: context.health || 'unknown',
  };

  try {
    // Ensure runtime directory exists
    const dir = path.dirname(EVENTS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.appendFileSync(EVENTS_FILE, JSON.stringify(event) + '\n', 'utf8');
  } catch (err) {
    // Fail-open — observability failure must never block the skill
    process.stderr.write(
      `[channel-management/post-execute] Failed to write event: ${err.message}\n`
    );
  }
}

// If run directly from CLI
if (require.main === module) {
  let rawInput = '';
  process.stdin.on('data', chunk => {
    rawInput += chunk;
  });
  process.stdin.on('end', () => {
    try {
      const context = rawInput.trim() ? JSON.parse(rawInput) : {};
      postExecute(context);
      process.exit(0);
    } catch (err) {
      process.stderr.write(`[channel-management/post-execute] Parse error: ${err.message}\n`);
      process.exit(0); // always fail-open
    }
  });
}

module.exports = { postExecute };
