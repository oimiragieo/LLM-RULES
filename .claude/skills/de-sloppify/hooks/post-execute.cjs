#!/usr/bin/env node
'use strict';

/**
 * de-sloppify post-execute hook
 * Emits observability event to tool-events.jsonl.
 */

const path = require('path');

let _inputData = '';
process.stdin.on('data', chunk => {
  _inputData += chunk;
});

process.stdin.on('end', () => {
  try {
    const { sendEvent } = require(
      path.resolve(__dirname, '../../../../tools/observability/send-event.cjs')
    );

    sendEvent({
      tool_name: 'de-sloppify',
      agent_id: process.env.AGENT_ID || 'unknown',
      session_id: process.env.SESSION_ID || 'unknown',
      outcome: 'success',
    });
  } catch (err) {
    process.stderr.write(`[de-sloppify:post-execute] Event emit failed: ${err.message}\n`);
  }

  // Always exit 0 — post hooks must not block
  process.exit(0);
});
