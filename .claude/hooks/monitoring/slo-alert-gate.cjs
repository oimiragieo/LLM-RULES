#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { DEFAULT_SLO_PATH } = require('../../lib/monitoring/slo-rollups.cjs');

function main() {
  const path = process.env.SLO_METRICS_PATH || DEFAULT_SLO_PATH;
  if (!fs.existsSync(path)) {
    console.error('[slo-alert-gate] metrics file missing, skipping');
    process.exit(0);
  }

  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  const hookP95Max = Number(process.env.HOOK_P95_MAX_MS || 5);
  const recorderFailureMax = Number(process.env.RECORDER_FAILURE_RATE_MAX || 0.01);
  const p95 = Number(data?.hookLatency?.p95_ms || 0);
  const failureRate = Number(data?.recorder?.failureRate || 0);

  const violations = [];
  if (p95 > hookP95Max) {
    violations.push(`hook p95 ${p95}ms > ${hookP95Max}ms`);
  }
  if (failureRate > recorderFailureMax) {
    violations.push(`recorder failure rate ${failureRate} > ${recorderFailureMax}`);
  }

  if (violations.length > 0) {
    console.error(`[slo-alert-gate] ${violations.join('; ')}`);
    process.exit(2);
  }

  console.log('[slo-alert-gate] PASS');
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { main };
