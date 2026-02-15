#!/usr/bin/env node
'use strict';

const { parseHookInputAsync, formatResult, debugLog } = require('../../lib/utils/hook-input.cjs');
const {
  getRuntimePaths,
  buildScoreEntry,
  readLastScoreByArtifact,
  appendScoreEntry,
  maybeQueueRemediation,
  ensureRuntimeDirs,
  artifactKey,
} = require('../../lib/quality/artifact-quality-runtime.cjs');

function processHookInput(hookInput, projectRootOverride = null) {
  const runtimePaths = getRuntimePaths(projectRootOverride || undefined);
  ensureRuntimeDirs(projectRootOverride || undefined);

  const entry = buildScoreEntry(hookInput);
  if (!entry) {
    return { scored: false, remediated: false, reason: 'not_completed_taskupdate' };
  }

  const previousMap = readLastScoreByArtifact(runtimePaths.ledgerPath);
  const previous = previousMap.get(artifactKey(entry)) || null;

  appendScoreEntry(entry, runtimePaths.ledgerPath);
  const remediationEvent = maybeQueueRemediation(entry, previous, runtimePaths.remediationPath);

  return {
    scored: true,
    remediated: Boolean(remediationEvent),
    entry,
    remediationEvent,
  };
}

async function main() {
  try {
    const hookInput = await parseHookInputAsync();
    const result = processHookInput(hookInput);
    if (process.env.DEBUG_HOOKS) {
      debugLog('artifact-scoring-ledger-hook', 'processed', result);
    }
    console.log(formatResult({}));
    process.exit(0);
  } catch (err) {
    if (process.env.DEBUG_HOOKS) {
      debugLog('artifact-scoring-ledger-hook', 'error', { error: err.message });
    }
    console.log(formatResult({}));
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  processHookInput,
  main,
};
