#!/usr/bin/env node
'use strict';
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const {
  getRuntimePaths,
  artifactKey,
  readJsonlSafe,
  readRemediationState,
} = require('../../lib/quality/artifact-quality-runtime.cjs');

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function latestAndPrevious(entries) {
  const byArtifact = new Map();
  for (const entry of entries) {
    const key = artifactKey(entry);
    const pair = byArtifact.get(key) || { previous: null, latest: null };
    pair.previous = pair.latest;
    pair.latest = entry;
    byArtifact.set(key, pair);
  }
  return byArtifact;
}

function runGate(options = {}) {
  const runtime =
    options.runtimePaths ||
    getRuntimePaths(
      typeof options.projectRoot === 'string' && options.projectRoot.trim()
        ? options.projectRoot
        : undefined
    );
  const passThreshold =
    toNumber(options.passThreshold ?? process.env.ARTIFACT_SCORE_PASS_THRESHOLD) ?? 0.7;
  const maxRegression =
    toNumber(options.maxRegression ?? process.env.ARTIFACT_SCORE_MAX_REGRESSION) ?? 0.08;
  const enforceRemediation = String(
    options.enforceRemediation ?? process.env.ARTIFACT_REMEDIATION_ENFORCED ?? 'true'
  )
    .trim()
    .toLowerCase();

  const entries = readJsonlSafe(runtime.ledgerPath);
  const pairs = latestAndPrevious(entries);
  const failures = [];
  const warnings = [];

  for (const [key, pair] of pairs.entries()) {
    const latestScore = toNumber(pair.latest?.overallScore);
    const previousScore = toNumber(pair.previous?.overallScore);
    if (latestScore == null) {
      warnings.push(`${key}: latest score missing`);
      continue;
    }
    if (latestScore < passThreshold) {
      failures.push(
        `${key}: latest score ${latestScore.toFixed(3)} < pass threshold ${passThreshold}`
      );
    }
    if (previousScore != null && previousScore - latestScore > maxRegression) {
      failures.push(
        `${key}: regression ${(previousScore - latestScore).toFixed(3)} exceeds max ${maxRegression}`
      );
    }
  }

  if (
    enforceRemediation !== 'false' &&
    enforceRemediation !== 'off' &&
    enforceRemediation !== '0'
  ) {
    const remediationState = readRemediationState(runtime.remediationPath);
    for (const [key, item] of remediationState.entries()) {
      if (item.status === 'open' && (item.severity === 'critical' || item.severity === 'high')) {
        failures.push(`${key}: open remediation (${item.severity})`);
      }
    }
  }

  return {
    ok: failures.length === 0,
    ledgerEntries: entries.length,
    artifactsTracked: pairs.size,
    failures,
    warnings,
    thresholds: {
      passThreshold,
      maxRegression,
      remediationEnforced:
        enforceRemediation !== 'false' &&
        enforceRemediation !== 'off' &&
        enforceRemediation !== '0',
    },
    runtimePaths: runtime,
  };
}

function main() {
  const result = runGate();
  if (!result.ok) {
    console.error('Artifact regression gate FAILED');
    for (const line of result.failures) {
      console.error(`- ${line}`);
    }
    if (result.warnings.length > 0) {
      console.error('Warnings:');
      for (const line of result.warnings) {
        console.error(`- ${line}`);
      }
    }
    process.exit(1);
  }

  console.log(
    `Artifact regression gate passed (entries=${result.ledgerEntries}, artifacts=${result.artifactsTracked})`
  );
  if (result.warnings.length > 0) {
    console.log('Warnings:');
    for (const line of result.warnings) {
      console.log(`- ${line}`);
    }
  }
}

const wrappedMain = wrapCLITool(main, 'validate-artifact-regression-gate');

if (require.main === module) {
  wrappedMain();
}

module.exports = {
  runGate,
  latestAndPrevious,
};
