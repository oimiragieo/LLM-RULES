'use strict';

const fs = require('fs');
const path = require('path');
const { replay } = require('./flight-recorder-replay.cjs');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');

const DEFAULT_SLO_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'reports',
  'slo-metrics.json'
);

function percentile(values, pct) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1)
  );
  return sorted[index];
}

function buildRollups(entries) {
  const hookLatencies = [];
  let recorderWrites = 0;
  let recorderWriteFailures = 0;

  for (const row of entries) {
    if (!row || typeof row !== 'object') continue;
    const component = String(row.component || '').toLowerCase();
    const event = String(row.event || '').toLowerCase();
    const latency = Number(row.duration_ms ?? row.latency_ms ?? row.duration ?? NaN);
    if (component.includes('hook') && Number.isFinite(latency)) {
      hookLatencies.push(latency);
    }
    if (event === 'flight_recorder_write' || event === 'flight_recorder_write_failed') {
      recorderWrites += 1;
      if (event === 'flight_recorder_write_failed') recorderWriteFailures += 1;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    hookLatency: {
      count: hookLatencies.length,
      p50_ms: percentile(hookLatencies, 50),
      p95_ms: percentile(hookLatencies, 95),
    },
    recorder: {
      writes: recorderWrites,
      failures: recorderWriteFailures,
      failureRate: recorderWrites > 0 ? recorderWriteFailures / recorderWrites : 0,
    },
  };
}

function writeRollups(rollups, outputPath = DEFAULT_SLO_PATH) {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(rollups, null, 2), 'utf8');
}

function generateRollups({ recorderPath, outputPath } = {}) {
  const { entries } = replay(recorderPath);
  const rollups = buildRollups(entries);
  writeRollups(rollups, outputPath);
  return rollups;
}

module.exports = {
  DEFAULT_SLO_PATH,
  percentile,
  buildRollups,
  writeRollups,
  generateRollups,
};
