'use strict';

const os = require('os');

function calculateSafeMemoryConfig() {
  const _totalSystemMemoryGB = os.totalmem() / 1024 / 1024 / 1024;
  const availableMemoryGB = os.freemem() / 1024 / 1024 / 1024;

  const maxIndexingMemoryGB = Math.min(availableMemoryGB * 0.5, 12);
  const safeConcurrency = Math.min(8, Math.max(1, Math.floor(maxIndexingMemoryGB / 1.5)));
  const maxOldGenMB = Math.min(
    2048,
    Math.floor((maxIndexingMemoryGB * 1024) / safeConcurrency / 1.5)
  );
  const memoryThresholdGB = Math.max(2, maxIndexingMemoryGB * 0.6);

  return {
    concurrency: safeConcurrency,
    maxOldGenerationSizeMb: maxOldGenMB,
    maxYoungGenerationSizeMb: Math.min(256, Math.floor(maxOldGenMB / 4)),
    memoryThresholdGB,
    flushSize: 50,
    emergencyThresholdGB: Math.max(3, maxIndexingMemoryGB * 0.8),
  };
}

function isExcluded(relativePath, patterns) {
  for (const pattern of patterns) {
    if (pattern.startsWith('**/') && pattern.endsWith('/**')) {
      const dirName = pattern.slice(3, -3);
      if (
        relativePath === dirName ||
        relativePath.startsWith(dirName + '/') ||
        relativePath.includes('/' + dirName + '/') ||
        relativePath.endsWith('/' + dirName)
      ) {
        return true;
      }
      continue;
    }

    if (pattern.startsWith('**/') && pattern.includes('*', 3)) {
      const suffix = pattern.slice(3);
      const regexStr = suffix.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
      const regex = new RegExp('(^|/)' + regexStr + '$');
      if (regex.test(relativePath)) return true;
      continue;
    }

    if (pattern.startsWith('**/')) {
      const name = pattern.slice(3);
      if (relativePath === name || relativePath.endsWith('/' + name)) {
        return true;
      }
      continue;
    }

    if (relativePath === pattern) return true;
  }
  return false;
}

const memoryConfig = calculateSafeMemoryConfig();

const DEFAULT_OPTIONS = {
  projectRoot: process.cwd(),
  excludePatterns: [
    '**/node_modules/**',
    '**/.git/**',
    '**/.claude/context/code-index/**',
    '**/.claude/context/data/**',
    '**/local_cache/**',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/coverage/**',
    '**/*.min.js',
    '**/*.bundle.js',
    '**/*.map',
    '**/.tmp/**',
    '**/.claude.archive/**',
    '**/pnpm-lock.yaml',
    '**/*.jsonl',
    '**/*.db',
  ],
  maxFileSize: 512 * 1024,
  batchSize: 25,
  concurrency: memoryConfig.concurrency,
  chunkFlushSize: memoryConfig.flushSize,
  embedBatchSize: 32,
  verbose: false,
  enableCheckpoints: true,
  checkpointInterval: 50,
};

module.exports = {
  DEFAULT_OPTIONS,
  calculateSafeMemoryConfig,
  isExcluded,
};
