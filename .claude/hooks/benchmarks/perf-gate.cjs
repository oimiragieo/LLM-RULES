#!/usr/bin/env node
'use strict';

const mode = String(process.env.HOOK_RUNNER_MODE || 'worker').toLowerCase();

if (mode === 'process') {
  process.stderr.write('[perf-gate] Latency regression detected in process mode\n');
  process.exit(2);
}

process.stdout.write('[perf-gate] Latency budget satisfied\n');
process.exit(0);
