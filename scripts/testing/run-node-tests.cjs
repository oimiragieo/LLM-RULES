'use strict';

const { spawnSync } = require('node:child_process');
const { globSync } = require('glob');

function getMaxCommandLength(platform = process.platform) {
  return platform === 'win32' ? 30000 : 100000;
}

function parseArgs(argv = process.argv) {
  const args = argv.slice(2);
  const nodeArgs = [];
  const patterns = [];

  for (const arg of args) {
    if (arg.startsWith('--node-arg=')) {
      nodeArgs.push(arg.slice('--node-arg='.length));
      continue;
    }
    if (arg.startsWith('--pattern=')) {
      patterns.push(arg.slice('--pattern='.length));
      continue;
    }
    patterns.push(arg);
  }

  return { nodeArgs, patterns };
}

function resolveTestFiles(patterns, { cwd = process.cwd() } = {}) {
  const files = [];
  const seen = new Set();

  for (const pattern of patterns) {
    const matches = globSync(pattern, {
      cwd,
      nodir: true,
      windowsPathsNoEscape: true,
    }).sort();

    for (const match of matches) {
      const normalized = match.replace(/\\/g, '/');
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      files.push(normalized);
    }
  }

  return files;
}

function buildNodeTestArgs(nodeArgs, files) {
  return ['--test', ...nodeArgs, ...files];
}

function estimateCommandLength(nodeArgs, files, { execPath = process.execPath } = {}) {
  return [execPath, ...buildNodeTestArgs(nodeArgs, files)].reduce((total, arg) => {
    return total + String(arg).length + 3;
  }, 0);
}

function partitionTestFiles(nodeArgs, files, options = {}) {
  const maxCommandLength = options.maxCommandLength || getMaxCommandLength(options.platform);
  const batches = [];
  let current = [];

  for (const file of files) {
    const candidate = [...current, file];
    if (
      current.length > 0 &&
      estimateCommandLength(nodeArgs, candidate, options) > maxCommandLength
    ) {
      batches.push(current);
      current = [file];
      continue;
    }
    current = candidate;
  }

  if (current.length > 0) {
    batches.push(current);
  }

  return batches;
}

function main(argv = process.argv) {
  const { nodeArgs, patterns } = parseArgs(argv);
  if (patterns.length === 0) {
    console.error('run-node-tests: no test patterns provided');
    process.exitCode = 1;
    return { files: [], nodeArgs, patterns, status: 1 };
  }

  const files = resolveTestFiles(patterns);
  if (files.length === 0) {
    console.error(`run-node-tests: no test files matched patterns: ${patterns.join(', ')}`);
    process.exitCode = 1;
    return { files, nodeArgs, patterns, status: 1 };
  }

  const batches = partitionTestFiles(nodeArgs, files);
  let status = 0;

  for (const batch of batches) {
    const result = spawnSync(process.execPath, buildNodeTestArgs(nodeArgs, batch), {
      stdio: 'inherit',
      windowsHide: true,
    });

    if (result.error) {
      throw result.error;
    }

    status = typeof result.status === 'number' ? result.status : 1;
    if (status !== 0) {
      process.exitCode = status;
      return { batches, files, nodeArgs, patterns, status };
    }
  }

  process.exitCode = 0;
  return { batches, files, nodeArgs, patterns, status: 0 };
}

if (require.main === module) {
  main();
}

module.exports = {
  buildNodeTestArgs,
  estimateCommandLength,
  getMaxCommandLength,
  main,
  parseArgs,
  partitionTestFiles,
  resolveTestFiles,
};
