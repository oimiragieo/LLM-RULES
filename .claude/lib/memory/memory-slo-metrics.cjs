#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { atomicWriteJSONSync } = require('../utils/atomic-write.cjs');

const DEFAULT_SLO_TARGETS = {
  writeP95Ms: Number(process.env.MEMORY_SLO_WRITE_P95_MS || 120),
  lockWaitP95Ms: Number(process.env.MEMORY_SLO_LOCK_WAIT_P95_MS || 40),
  parseFailureRate: Number(process.env.MEMORY_SLO_PARSE_FAILURE_RATE || 0.01),
};

const HISTOGRAM_BUCKETS_MS = [1, 5, 10, 25, 50, 100, 250, 500];

function getMetricsDir(projectRoot = PROJECT_ROOT) {
  return path.join(projectRoot, '.claude', 'context', 'memory', 'metrics');
}

function getOperationalMetricsPath(projectRoot = PROJECT_ROOT) {
  return path.join(getMetricsDir(projectRoot), 'memory-slo-operational.json');
}

function createDefaultHistogram() {
  return {
    bucketsMs: [...HISTOGRAM_BUCKETS_MS],
    counts: new Array(HISTOGRAM_BUCKETS_MS.length + 1).fill(0),
  };
}

function createDefaultMetrics() {
  const now = new Date().toISOString();
  return {
    version: 1,
    windowStartedAt: now,
    updatedAt: now,
    counters: {
      writesTotal: 0,
      writesFailed: 0,
      readsTotal: 0,
      parseAttempts: 0,
      parseFailures: 0,
      lockAcquires: 0,
      staleTempCleanups: 0,
      staleTempFilesRemoved: 0,
    },
    histograms: {
      writeLatencyMs: createDefaultHistogram(),
      readLatencyMs: createDefaultHistogram(),
      lockWaitMs: createDefaultHistogram(),
    },
    latest: {
      writeLatencyMs: null,
      readLatencyMs: null,
      lockWaitMs: null,
      lastError: null,
    },
  };
}

function ensureMetricsDir(projectRoot = PROJECT_ROOT) {
  fs.mkdirSync(getMetricsDir(projectRoot), { recursive: true });
}

function sleepSync(ms) {
  const sab = new SharedArrayBuffer(4);
  const ia = new Int32Array(sab);
  Atomics.wait(ia, 0, 0, ms);
}

function withFileLockSync(filePath, callback) {
  const lockPath = `${filePath}.lock`;
  const deadline = Date.now() + 2000;
  while (true) {
    try {
      fs.mkdirSync(lockPath);
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') {
        throw err;
      }
      if (Date.now() >= deadline) {
        throw new Error(`Timed out acquiring SLO metrics lock: ${path.basename(filePath)}`);
      }
      sleepSync(10);
    }
  }
  try {
    return callback();
  } finally {
    try {
      fs.rmSync(lockPath, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

function loadOperationalMetrics(projectRoot = PROJECT_ROOT) {
  const metricsPath = getOperationalMetricsPath(projectRoot);
  if (!fs.existsSync(metricsPath)) {
    return createDefaultMetrics();
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return createDefaultMetrics();
    return {
      ...createDefaultMetrics(),
      ...parsed,
      counters: {
        ...createDefaultMetrics().counters,
        ...(parsed.counters || {}),
      },
      histograms: {
        writeLatencyMs: normalizeHistogram(parsed.histograms?.writeLatencyMs),
        readLatencyMs: normalizeHistogram(parsed.histograms?.readLatencyMs),
        lockWaitMs: normalizeHistogram(parsed.histograms?.lockWaitMs),
      },
      latest: {
        ...createDefaultMetrics().latest,
        ...(parsed.latest || {}),
      },
    };
  } catch (_err) {
    return createDefaultMetrics();
  }
}

function saveOperationalMetrics(metrics, projectRoot = PROJECT_ROOT) {
  ensureMetricsDir(projectRoot);
  const payload = {
    ...metrics,
    updatedAt: new Date().toISOString(),
  };
  const target = getOperationalMetricsPath(projectRoot);
  return withFileLockSync(target, () => {
    let lastErr = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        atomicWriteJSONSync(target, payload);
        return target;
      } catch (err) {
        lastErr = err;
        if (err && (err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EACCES')) {
          sleepSync(10 * (attempt + 1));
          continue;
        }
        throw err;
      }
    }
    if (lastErr) throw lastErr;
    return target;
  });
}

function normalizeHistogram(input) {
  if (!input || !Array.isArray(input.bucketsMs) || !Array.isArray(input.counts)) {
    return createDefaultHistogram();
  }
  const expectedLen = input.bucketsMs.length + 1;
  if (input.counts.length !== expectedLen) {
    return createDefaultHistogram();
  }
  return {
    bucketsMs: input.bucketsMs.map(v => Number(v)),
    counts: input.counts.map(v => Number(v) || 0),
  };
}

function recordHistogram(hist, valueMs) {
  const value = Number.isFinite(Number(valueMs)) ? Math.max(0, Number(valueMs)) : 0;
  let idx = hist.bucketsMs.findIndex(limit => value <= limit);
  if (idx === -1) idx = hist.counts.length - 1;
  hist.counts[idx] += 1;
}

function estimatePercentileMs(hist, percentile) {
  const total = hist.counts.reduce((acc, n) => acc + n, 0);
  if (total === 0) return 0;
  const target = Math.ceil(total * percentile);
  let running = 0;
  for (let i = 0; i < hist.counts.length; i++) {
    running += hist.counts[i];
    if (running >= target) {
      if (i < hist.bucketsMs.length) return hist.bucketsMs[i];
      return hist.bucketsMs[hist.bucketsMs.length - 1] * 2;
    }
  }
  return hist.bucketsMs[hist.bucketsMs.length - 1] * 2;
}

function recordMemoryOperation(operation = {}, projectRoot = PROJECT_ROOT) {
  try {
    const metrics = loadOperationalMetrics(projectRoot);
    const kind = String(operation.kind || '').toLowerCase();
    const ok = operation.ok !== false;
    const parseFailure = operation.parseFailure === true;
    const parseAttempt = operation.parseAttempt === true || parseFailure;
    const lockWaitMs = Number(operation.lockWaitMs || 0);
    const writeLatencyMs = Number(operation.writeLatencyMs || 0);
    const readLatencyMs = Number(operation.readLatencyMs || 0);

    if (kind === 'write') {
      metrics.counters.writesTotal += 1;
      if (!ok) metrics.counters.writesFailed += 1;
      if (Number.isFinite(writeLatencyMs) && writeLatencyMs >= 0) {
        metrics.latest.writeLatencyMs = writeLatencyMs;
        recordHistogram(metrics.histograms.writeLatencyMs, writeLatencyMs);
      }
    }

    if (kind === 'read') {
      metrics.counters.readsTotal += 1;
      if (Number.isFinite(readLatencyMs) && readLatencyMs >= 0) {
        metrics.latest.readLatencyMs = readLatencyMs;
        recordHistogram(metrics.histograms.readLatencyMs, readLatencyMs);
      }
    }

    if (parseAttempt) {
      metrics.counters.parseAttempts += 1;
      if (parseFailure) metrics.counters.parseFailures += 1;
    }

    if (Number.isFinite(lockWaitMs) && lockWaitMs > 0) {
      metrics.counters.lockAcquires += 1;
      metrics.latest.lockWaitMs = lockWaitMs;
      recordHistogram(metrics.histograms.lockWaitMs, lockWaitMs);
    }

    if (!ok && operation.error) {
      metrics.latest.lastError = String(operation.error);
    }

    if (Number.isFinite(operation.staleTempFilesRemoved) && operation.staleTempFilesRemoved > 0) {
      metrics.counters.staleTempCleanups += 1;
      metrics.counters.staleTempFilesRemoved += Number(operation.staleTempFilesRemoved);
    }

    saveOperationalMetrics(metrics, projectRoot);
    return metrics;
  } catch (_err) {
    // SLO collection is best-effort and must never break memory operations.
    return null;
  }
}

function summarizeOperationalSLO(projectRoot = PROJECT_ROOT) {
  const metrics = loadOperationalMetrics(projectRoot);
  const parseAttempts = metrics.counters.parseAttempts || 0;
  const parseFailures = metrics.counters.parseFailures || 0;
  const parseFailureRate = parseAttempts > 0 ? parseFailures / parseAttempts : 0;

  const summary = {
    targets: { ...DEFAULT_SLO_TARGETS },
    counters: { ...metrics.counters },
    p95: {
      writeLatencyMs: estimatePercentileMs(metrics.histograms.writeLatencyMs, 0.95),
      lockWaitMs: estimatePercentileMs(metrics.histograms.lockWaitMs, 0.95),
      readLatencyMs: estimatePercentileMs(metrics.histograms.readLatencyMs, 0.95),
    },
    parseFailureRate,
    updatedAt: metrics.updatedAt,
    pass: {
      writeLatency: true,
      lockWait: true,
      parseFailures: true,
    },
  };

  summary.pass.writeLatency = summary.p95.writeLatencyMs <= summary.targets.writeP95Ms;
  summary.pass.lockWait = summary.p95.lockWaitMs <= summary.targets.lockWaitP95Ms;
  summary.pass.parseFailures = parseFailureRate <= summary.targets.parseFailureRate;

  summary.allPass =
    summary.pass.writeLatency && summary.pass.lockWait && summary.pass.parseFailures;
  return summary;
}

module.exports = {
  DEFAULT_SLO_TARGETS,
  HISTOGRAM_BUCKETS_MS,
  getOperationalMetricsPath,
  loadOperationalMetrics,
  saveOperationalMetrics,
  recordMemoryOperation,
  summarizeOperationalSLO,
  estimatePercentileMs,
};
