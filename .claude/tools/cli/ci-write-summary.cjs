#!/usr/bin/env node
'use strict';

const fs = require('fs');

const { buildSummary, normalizeSummaryKind } = require('../../lib/ci/github-actions-summary.cjs');
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

function parseArgs(argv) {
  const args = argv.slice(2);
  let kind = null;
  let inputPath = null;
  let payload = null;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    const current = args[i];
    if (current === '--json') {
      json = true;
      continue;
    }
    if (current === '--kind' && args[i + 1]) {
      kind = args[++i];
      continue;
    }
    if (current === '--input' && args[i + 1]) {
      inputPath = args[++i];
      continue;
    }
    if (current === '--payload' && args[i + 1]) {
      payload = JSON.parse(args[++i]);
    }
  }

  return {
    json,
    kind,
    inputPath,
    payload,
  };
}

function readJSONFile(inputPath) {
  return JSON.parse(fs.readFileSync(inputPath, 'utf8'));
}

function resolvePayload(kind, rawPayload) {
  const normalizedKind = normalizeSummaryKind(kind);
  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
    return rawPayload || {};
  }

  switch (normalizedKind) {
    case 'impacted-validation': {
      const plan = rawPayload.plan || rawPayload;
      const matchedRules = Array.isArray(plan.matchedRules) ? plan.matchedRules : [];
      const rationale =
        matchedRules.length > 0
          ? `Matched rules: ${matchedRules.join(', ')}`
          : plan.conservativeFallback
            ? 'No targeted rules matched; using conservative fallback.'
            : undefined;

      return {
        advisory: plan.advisory !== false,
        changedFiles: Array.isArray(plan.changedFiles) ? plan.changedFiles : [],
        rationale,
        recommendedCommands: Array.isArray(plan.recommendedCommands)
          ? plan.recommendedCommands
          : [],
      };
    }
    case 'release-gate':
      return rawPayload.result || rawPayload;
    case 'flake-ops':
      return rawPayload.summary || rawPayload;
    default:
      return rawPayload;
  }
}

function appendGitHubStepSummary(env, markdown) {
  const summaryPath = String(env?.GITHUB_STEP_SUMMARY || '').trim();
  if (summaryPath === '') {
    return false;
  }

  fs.appendFileSync(summaryPath, `${markdown}\n`, 'utf8');
  return true;
}

function main() {
  const opts = parseArgs(process.argv);
  if (!opts.kind) {
    throw new Error('Missing required --kind flag.');
  }

  const rawPayload = opts.inputPath ? readJSONFile(opts.inputPath) : opts.payload || {};
  const payload = resolvePayload(opts.kind, rawPayload);
  const markdown = buildSummary(opts.kind, payload);
  const wrote = appendGitHubStepSummary(process.env, markdown);

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          kind: normalizeSummaryKind(opts.kind),
          wrote,
          markdown,
        },
        null,
        2
      )
    );
  }
}

const wrappedMain = wrapCLITool(main, 'ci-write-summary');

if (require.main === module) {
  wrappedMain();
}

module.exports = {
  appendGitHubStepSummary,
  main,
  parseArgs,
  resolvePayload,
};
