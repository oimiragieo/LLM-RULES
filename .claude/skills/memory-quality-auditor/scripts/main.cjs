#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function findProjectRoot() {
  let dir = __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.claude'))) return dir;
    if (path.basename(dir) === '.claude') return path.dirname(dir);
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    const hasValue = next && !next.startsWith('--');
    options[key] = hasValue ? argv[++i] : true;
  }
  return options;
}

function safeReadJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function computeAudit() {
  const evalPath = path.join(
    PROJECT_ROOT,
    '.claude',
    'context',
    'runtime',
    'evals',
    'subagent-memory-rag-live-latest.json'
  );
  const evalReport = safeReadJson(evalPath, {});

  const patternsPath = path.join(PROJECT_ROOT, '.claude', 'context', 'memory', 'patterns.json');
  const gotchasPath = path.join(PROJECT_ROOT, '.claude', 'context', 'memory', 'gotchas.json');
  const accessStatsPath = path.join(
    PROJECT_ROOT,
    '.claude',
    'context',
    'memory',
    'access-stats.json'
  );

  const patterns = safeReadJson(patternsPath, []) || [];
  const gotchas = safeReadJson(gotchasPath, []) || [];
  const access = safeReadJson(accessStatsPath, {}) || {};

  const summary = evalReport.summary || {};
  const metrics = {
    memory_entries: patterns.length + gotchas.length,
    access_events: Number(access.total || access.count || 0),
    evidence_injection_rate: Number(summary.evidence_injection_rate || 0),
    citation_use_rate: Number(summary.citation_use_rate || 0),
    groundedness_rate: Number(summary.groundedness_rate || 0),
    stale_ratio_estimate: patterns.length + gotchas.length === 0 ? 1 : 0,
  };

  const thresholds = {
    min_evidence_injection_rate: 0.8,
    min_citation_use_rate: 0.5,
    min_groundedness_rate: 0.6,
    max_stale_ratio_estimate: 0.3,
  };

  const failed = [];
  if (metrics.evidence_injection_rate < thresholds.min_evidence_injection_rate)
    failed.push('evidence_injection_rate');
  if (metrics.citation_use_rate < thresholds.min_citation_use_rate)
    failed.push('citation_use_rate');
  if (metrics.groundedness_rate < thresholds.min_groundedness_rate)
    failed.push('groundedness_rate');
  if (metrics.stale_ratio_estimate > thresholds.max_stale_ratio_estimate)
    failed.push('stale_ratio_estimate');

  return {
    ok: true,
    metrics,
    thresholds,
    status: failed.length === 0 ? 'healthy' : 'degraded',
    failed,
    remediation: failed.map(item => ({
      id: `remediate-${item}`,
      action:
        item === 'stale_ratio_estimate'
          ? 'refresh memory entries with context-compressor and remove stale items'
          : `add tests/guards to improve ${item}`,
    })),
  };
}

function main(input = null) {
  const options = input || parseArgs(process.argv.slice(2));
  if (options.help) {
    return {
      ok: true,
      usage: 'node .claude/skills/memory-quality-auditor/scripts/main.cjs [--mode summary|full]',
    };
  }
  const result = computeAudit();
  if ((options.mode || 'summary') === 'summary') {
    return {
      ok: result.ok,
      status: result.status,
      failed: result.failed,
      metrics: result.metrics,
    };
  }
  return result;
}

if (require.main === module) {
  const result = main();
  if (result.usage) {
    console.log(result.usage);
    process.exit(0);
  }
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

module.exports = { parseArgs, computeAudit, main };
