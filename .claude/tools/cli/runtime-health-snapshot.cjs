#!/usr/bin/env node
'use strict';
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const { logRuntimeHealth } = require('../../lib/monitoring/runtime-health-log.cjs');

function parseArgs(argv) {
  const args = argv.slice(2);
  const map = new Map();
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!key.startsWith('--')) continue;
    const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
    map.set(key, value);
  }
  return {
    component: map.get('--component') || 'runtime-health-snapshot',
    status: map.get('--status') || 'ok',
    sessionId: map.get('--session-id') || null,
    json: map.get('--json') === 'true',
  };
}

function main() {
  const opts = parseArgs(process.argv);
  logRuntimeHealth({
    component: opts.component,
    status: opts.status,
    durationMs: 0,
    sessionId: opts.sessionId,
    extra: {
      source: 'runtime-health-snapshot',
    },
  });

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          component: opts.component,
          status: opts.status,
          source: 'runtime-health-snapshot',
          timestamp: new Date().toISOString(),
        },
        null,
        2
      )
    );
  } else {
    console.log('Runtime health snapshot recorded.');
  }
}

const wrappedMain = wrapCLITool(main, 'runtime-health-snapshot');

if (require.main === module) {
  wrappedMain();
}

module.exports = {
  parseArgs,
};
