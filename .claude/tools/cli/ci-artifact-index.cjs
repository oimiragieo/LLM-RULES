#!/usr/bin/env node
'use strict';

const fs = require('fs');

const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

function parseArgs(argv) {
  const args = argv.slice(2);
  let inputPath = null;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    const current = args[i];
    if (current === '--json') {
      json = true;
      continue;
    }
    if (current === '--input' && args[i + 1]) {
      inputPath = args[++i];
    }
  }

  return {
    inputPath,
    json,
  };
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value == null) continue;
    const normalized = String(value).trim();
    if (normalized !== '') return normalized;
  }
  return null;
}

function normalizeCreatedAt(value) {
  if (value == null || String(value).trim() === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeRunId(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferArtifactKind(record, name) {
  const explicitKind = firstNonEmpty(record.kind, record.artifactKind, record.metadata?.kind);
  if (explicitKind) return explicitKind.toLowerCase().replace(/[\s-]+/g, '_');

  const normalizedName = String(name || '').toLowerCase();
  if (normalizedName.includes('failure-evidence')) return 'failure_evidence';
  if (normalizedName.includes('impacted-validation')) return 'impacted_validation';
  if (normalizedName.includes('release-gate')) return 'release_gate';
  if (normalizedName.includes('flake')) return 'flake_ops';
  return 'generic';
}

function normalizeArtifactRecord(record = {}) {
  const metadata = record.metadata || {};
  const workflowRun = record.workflow_run || record.workflowRun || {};
  const name = firstNonEmpty(record.name, metadata.name) || 'unnamed-artifact';

  return {
    id: record.id ?? metadata.id ?? null,
    name,
    workflow: firstNonEmpty(
      record.workflow,
      record.workflowName,
      metadata.workflow,
      workflowRun.name
    ),
    job: firstNonEmpty(record.job, record.jobName, metadata.job),
    sha: firstNonEmpty(
      record.sha,
      record.head_sha,
      record.commitSha,
      metadata.sha,
      workflowRun.head_sha
    ),
    branch: firstNonEmpty(
      record.branch,
      record.ref_name,
      record.refName,
      record.head_branch,
      metadata.branch,
      workflowRun.head_branch
    ),
    kind: inferArtifactKind(record, name),
    createdAt: normalizeCreatedAt(record.createdAt || record.created_at || metadata.createdAt),
    runId: normalizeRunId(record.runId || record.run_id || workflowRun.id || metadata.runId),
    url: firstNonEmpty(record.url, record.archive_download_url, metadata.url),
    path: firstNonEmpty(record.path, metadata.path),
  };
}

function compareArtifacts(left, right) {
  const leftTime = Date.parse(left.createdAt || '') || 0;
  const rightTime = Date.parse(right.createdAt || '') || 0;
  if (rightTime !== leftTime) return rightTime - leftTime;
  const workflowCompare = String(left.workflow || '').localeCompare(String(right.workflow || ''));
  if (workflowCompare !== 0) return workflowCompare;
  const jobCompare = String(left.job || '').localeCompare(String(right.job || ''));
  if (jobCompare !== 0) return jobCompare;
  return String(left.name || '').localeCompare(String(right.name || ''));
}

function buildArtifactIndex(records = []) {
  const normalizedRecords = records.map(normalizeArtifactRecord).sort(compareArtifacts);
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    artifacts: normalizedRecords,
  };
}

function readInputRecords(inputPath) {
  if (inputPath) {
    const parsed = safeParseJSON(fs.readFileSync(inputPath, 'utf8'), null);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.artifacts)) return parsed.artifacts;
    return [parsed];
  }

  if (!process.stdin.isTTY) {
    const raw = fs.readFileSync(0, 'utf8').trim();
    if (raw !== '') {
      const parsed = safeParseJSON(raw, null);
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed.artifacts)) return parsed.artifacts;
      return [parsed];
    }
  }

  return [];
}

function main() {
  const opts = parseArgs(process.argv);
  const records = readInputRecords(opts.inputPath);
  const index = buildArtifactIndex(records);

  if (opts.json) {
    console.log(JSON.stringify({ index }, null, 2));
    return;
  }

  console.log('Artifact index');
  console.log(`- Entries: ${index.artifacts.length}`);
  if (index.artifacts[0]) {
    console.log(`- Latest artifact: ${index.artifacts[0].name}`);
  }
}

const wrappedMain = wrapCLITool(main, 'ci-artifact-index');

if (require.main === module) {
  wrappedMain();
}

module.exports = {
  buildArtifactIndex,
  main,
  normalizeArtifactRecord,
  parseArgs,
};
