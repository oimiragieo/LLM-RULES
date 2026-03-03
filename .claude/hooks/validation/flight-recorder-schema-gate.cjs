#!/usr/bin/env node
'use strict';

const { replay } = require('../../lib/monitoring/flight-recorder-replay.cjs');
const { validateFlightRecorderRow } = require('../../lib/monitoring/metrics-schema.cjs');
const { getRecorderPath } = require('../../lib/monitoring/flight-recorder.cjs');

function main() {
  const filePath = process.env.FLIGHT_RECORDER_PATH || getRecorderPath();
  const strict = String(process.env.FLIGHT_RECORDER_SCHEMA_GATE_STRICT || 'true').toLowerCase();
  const requireData = String(
    process.env.FLIGHT_RECORDER_SCHEMA_REQUIRE_DATA || 'false'
  ).toLowerCase();
  const { entries, skipped } = replay(filePath);

  if (requireData === 'true' && entries.length === 0 && skipped === 0) {
    console.error('[flight-recorder-schema-gate] No telemetry data found');
    process.exit(2);
  }

  let invalid = 0;
  for (const row of entries) {
    const check = validateFlightRecorderRow(row);
    if (!check.valid) invalid += 1;
  }

  if (invalid > 0 || skipped > 0) {
    const message = `[flight-recorder-schema-gate] invalid=${invalid} skipped=${skipped}`;
    if (strict === 'false' || strict === 'warn') {
      console.error(message);
      process.exit(0);
    }
    console.error(message);
    process.exit(2);
  }

  console.log('[flight-recorder-schema-gate] PASS');
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { main };
