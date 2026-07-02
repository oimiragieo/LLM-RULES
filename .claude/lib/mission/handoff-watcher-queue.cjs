'use strict';

const fs = require('node:fs');
const path = require('node:path');

function extractTimestamp(filename) {
  const match = filename.match(/^(\d+)-/);
  return match ? parseInt(match[1], 10) : null;
}

function compareFilenames(a, b) {
  const tsA = extractTimestamp(a);
  const tsB = extractTimestamp(b);

  if (tsA !== null && tsB !== null) {
    return tsA === tsB ? a.localeCompare(b) : tsA - tsB;
  }
  if (tsA !== null) return -1;
  if (tsB !== null) return 1;
  return a.localeCompare(b);
}

function getFileSignature(watcher, filename) {
  try {
    const stats = fs.statSync(path.join(watcher.handoffsDir, filename));
    return stats.isFile() ? `${stats.size}:${stats.mtimeMs}` : null;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      watcher.emit('handoff-error', { filename, error: err.message });
    }
    return null;
  }
}

function forgetFile(watcher, filename) {
  watcher.lastProcessedTime.delete(filename);
  watcher.processedFileSignatures.delete(filename);
  watcher.pendingFiles = watcher.pendingFiles.filter(file => file !== filename);
}

function markProcessed(watcher, filename) {
  watcher.lastProcessedTime.set(filename, Date.now());

  const signature = getFileSignature(watcher, filename);
  if (signature) {
    watcher.processedFileSignatures.set(filename, signature);
  } else {
    watcher.processedFileSignatures.delete(filename);
  }
}

function hasUnprocessedChanges(watcher, filename) {
  const signature = getFileSignature(watcher, filename);
  if (!signature) {
    forgetFile(watcher, filename);
    return false;
  }
  return watcher.processedFileSignatures.get(filename) !== signature;
}

function collectProcessableFiles(watcher) {
  const candidates = new Set(watcher.pendingFiles);

  try {
    const files = fs.readdirSync(watcher.handoffsDir);
    for (const file of files) {
      if (file.endsWith('.json') && hasUnprocessedChanges(watcher, file)) {
        candidates.add(file);
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      watcher.emit('error', err);
    }
  }

  return [...candidates]
    .filter(file => file.endsWith('.json') && hasUnprocessedChanges(watcher, file))
    .sort(compareFilenames);
}

module.exports = {
  extractTimestamp,
  compareFilenames,
  getFileSignature,
  forgetFile,
  markProcessed,
  hasUnprocessedChanges,
  collectProcessableFiles,
};
