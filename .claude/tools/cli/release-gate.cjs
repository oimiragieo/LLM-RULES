#!/usr/bin/env node
'use strict';

const fs = require('fs');

const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');
const { evaluateReleaseGate } = require('../../lib/ci/release-gate.cjs');

function parseArgs(argv) {
  const args = argv.slice(2);
  const changedFiles = [];
  let json = false;
  let oldPath = null;
  let newPath = null;
  let artifactType = 'agent';
  let commitMessage = '';
  let commitMessageFile = null;
  let migrationGuidePath = null;

  for (let i = 0; i < args.length; i++) {
    const current = args[i];
    if (current === '--json') {
      json = true;
      continue;
    }
    if (current === '--old' && args[i + 1]) {
      oldPath = args[++i];
      continue;
    }
    if (current === '--new' && args[i + 1]) {
      newPath = args[++i];
      continue;
    }
    if (current === '--type' && args[i + 1]) {
      artifactType = args[++i];
      continue;
    }
    if (current === '--commit-message' && args[i + 1]) {
      commitMessage = args[++i];
      continue;
    }
    if (current === '--commit-message-file' && args[i + 1]) {
      commitMessageFile = args[++i];
      continue;
    }
    if (current === '--migration-guide' && args[i + 1]) {
      migrationGuidePath = args[++i];
      continue;
    }
    if (current === '--changed-file' && args[i + 1]) {
      changedFiles.push(args[++i]);
    }
  }

  return {
    json,
    oldPath,
    newPath,
    artifactType,
    commitMessage,
    commitMessageFile,
    migrationGuidePath,
    changedFiles,
  };
}

function resolveCommitMessage(opts) {
  if (typeof opts.commitMessage === 'string' && opts.commitMessage.trim() !== '') {
    return opts.commitMessage;
  }

  if (typeof opts.commitMessageFile === 'string' && opts.commitMessageFile.trim() !== '') {
    return fs.readFileSync(opts.commitMessageFile, 'utf8');
  }

  return '';
}

function main() {
  const opts = parseArgs(process.argv);
  const commitMessage = resolveCommitMessage(opts);
  const result = evaluateReleaseGate({
    ...opts,
    commitMessage,
  });

  if (opts.json) {
    console.log(JSON.stringify({ result }, null, 2));
  } else {
    console.log('Release gate');
    console.log(`- Docs only: ${result.docsOnly}`);
    console.log(`- Required bump: ${result.requiredBump}`);
    if (result.failures.length > 0) {
      console.log('- Failures:');
      for (const failure of result.failures) {
        console.log(`  - ${failure}`);
      }
    }
  }

  if (result.failures.length > 0) {
    process.exit(1);
  }
}

const wrappedMain = wrapCLITool(main, 'release-gate');

if (require.main === module) {
  wrappedMain();
}

module.exports = {
  parseArgs,
  resolveCommitMessage,
  main,
};
