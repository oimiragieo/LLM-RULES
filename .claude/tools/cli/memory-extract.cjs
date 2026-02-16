#!/usr/bin/env node
'use strict';
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const { runExtractionPipeline } = require('../../lib/memory/run-extraction-pipeline.cjs');
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');

function parseArgs(args) {
  const parsed = {
    json: false,
    user: 'default',
    maxMtmSessions: 3,
    deduplicate: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') parsed.json = true;
    if (arg === '--user' && args[i + 1]) {
      parsed.user = args[i + 1];
      i += 1;
    }
    if (arg === '--max' && args[i + 1]) {
      parsed.maxMtmSessions = Number(args[i + 1]);
      i += 1;
    }
    if (arg === '--no-dedupe') parsed.deduplicate = false;
  }

  return parsed;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runExtractionPipeline(PROJECT_ROOT, options);
  if (options.json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}

const wrappedMain = wrapCLITool(main, 'memory-extract');

if (require.main === module) {
  wrappedMain();
}
