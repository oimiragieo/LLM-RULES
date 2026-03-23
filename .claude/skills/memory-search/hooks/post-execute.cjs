#!/usr/bin/env node

'use strict';
const path = require('path');
const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');
const { sendEvent } = require(
  path.resolve(__dirname, '../../../../tools/observability/send-event.cjs')
);

const context = safeParseJSON(process.argv[2] || '{}');
const success = context.outcome === 'success' || !context.error;

sendEvent({
  tool_name: 'memory-search',
  agent_id: context.agentId || process.env.AGENT_ID || 'unknown',
  session_id: context.sessionId || process.env.SESSION_ID || 'unknown',
  outcome: success ? 'success' : 'failure',
});

process.exit(0);
