#!/usr/bin/env node
'use strict';

/**
 * reddit-researcher post-execute hook
 * Emits observability event via send-event.cjs.
 * Fail-open: exits 0 on any error to avoid blocking skill execution.
 */

try {
  const result = safeParseJSON(process.argv[2] || '{}');
  const outcome = result && result.success === false ? 'failure' : 'success';

  // Resolve send-event.cjs relative to this hook's location
  const path = require('path');
  const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');
  const sendEventPath = path.resolve(__dirname, '../../../../tools/observability/send-event.cjs');

  let sendEvent;
  try {
    sendEvent = require(sendEventPath).sendEvent;
  } catch {
    // Observability tool not available — fail open, do not block
    process.exit(0);
  }

  if (typeof sendEvent === 'function') {
    sendEvent({
      tool_name: 'reddit-researcher',
      agent_id: process.env.AGENT_ID || 'unknown',
      session_id: process.env.SESSION_ID || 'unknown',
      outcome,
    });
  }

  process.exit(0);
} catch {
  // Fail-open: post-execute hooks must not block skill execution
  process.exit(0);
}
