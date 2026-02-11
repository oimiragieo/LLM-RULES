#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const dashboard = require('../../../.claude/lib/memory/memory-dashboard.cjs');
const { recordMemoryOperation } = require('../../../.claude/lib/memory/memory-slo-metrics.cjs');

const TEST_ROOT = path.join(__dirname, '.test-memory-dashboard-slo');
const MEMORY_DIR = path.join(TEST_ROOT, '.claude', 'context', 'memory');

function setup() {
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
  fs.mkdirSync(path.join(MEMORY_DIR, 'mtm'), { recursive: true });
  fs.mkdirSync(path.join(MEMORY_DIR, 'ltm'), { recursive: true });
  fs.writeFileSync(path.join(MEMORY_DIR, 'learnings.md'), '# test\n');
  fs.writeFileSync(path.join(MEMORY_DIR, 'patterns.json'), '[]');
  fs.writeFileSync(path.join(MEMORY_DIR, 'gotchas.json'), '[]');
  fs.writeFileSync(path.join(MEMORY_DIR, 'codebase_map.json'), '{"discovered_files":{}}');
}

function cleanup() {
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
}

test('collectMetrics includes operational SLO section', () => {
  setup();
  try {
    for (let i = 0; i < 10; i++) {
      recordMemoryOperation({ kind: 'write', writeLatencyMs: 8 + i }, TEST_ROOT);
    }
    recordMemoryOperation({ lockWaitMs: 5 }, TEST_ROOT);

    const metrics = dashboard.collectMetrics(TEST_ROOT);
    assert.ok(metrics.slo);
    assert.equal(typeof metrics.slo.p95.writeLatencyMs, 'number');
    assert.equal(typeof metrics.slo.parseFailureRate, 'number');
    assert.equal(typeof metrics.slo.staleTempArtifacts, 'number');
  } finally {
    cleanup();
  }
});

test('formatDashboard renders operational SLOs', () => {
  setup();
  try {
    recordMemoryOperation({ kind: 'write', writeLatencyMs: 20 }, TEST_ROOT);
    const rendered = dashboard.formatDashboard(dashboard.collectMetrics(TEST_ROOT));
    assert.match(rendered, /OPERATIONAL SLOS/);
    assert.match(rendered, /Write latency p95/);
    assert.match(rendered, /Parse failure rate/);
  } finally {
    cleanup();
  }
});
