'use strict';

const fs = require('fs').promises;
const path = require('path');
const { isExcluded } = require('./index-manager-config.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');
const { atomicWriteAsync } = require('../utils/atomic-write.cjs');

async function discoverFiles(manager, dir) {
  const files = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  const resolvedRoot = path.resolve(manager.options.projectRoot);
  const MAX_DISCOVERED_FILES = 10000;

  if (dir === manager.options.projectRoot) {
    console.log(`[DISCOVER] Starting file discovery in: ${dir}`);
    console.log(`[DISCOVER] Exclude patterns: ${manager.options.excludePatterns.length}`);
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const resolvedFull = path.resolve(fullPath);

    if (!resolvedFull.startsWith(resolvedRoot)) {
      if (manager.options.verbose) {
        console.log(`[SKIP] Outside project root: ${fullPath}`);
      }
      continue;
    }

    const relativePath = path.relative(manager.options.projectRoot, fullPath).replace(/\\/g, '/');
    const excluded = isExcluded(relativePath, manager.options.excludePatterns);
    if (excluded) continue;

    if (entry.isDirectory()) {
      if (entry.isSymbolicLink()) {
        try {
          const realPath = await fs.realpath(fullPath);
          if (!realPath.startsWith(resolvedRoot)) {
            if (manager.options.verbose) {
              console.log(`[SKIP] Symlink escapes project: ${relativePath} -> ${realPath}`);
            }
            continue;
          }
        } catch {
          continue;
        }
      }

      const subFiles = await discoverFiles(manager, fullPath);
      files.push(...subFiles);
      if (files.length >= MAX_DISCOVERED_FILES) {
        console.warn(`[DISCOVER] Safety limit reached after recursing into ${relativePath}`);
        return files;
      }
    } else if (entry.isFile()) {
      const language = manager.parser.detectLanguage(fullPath);
      if (language) {
        const stats = await fs.stat(fullPath);
        if (stats.size <= manager.options.maxFileSize) {
          files.push(fullPath);
          if (files.length >= MAX_DISCOVERED_FILES) {
            console.warn(
              `[DISCOVER] Safety limit reached: ${MAX_DISCOVERED_FILES} files. Stopping discovery.`
            );
            return files;
          }
        } else if (manager.options.verbose) {
          console.log(
            `[SKIP] File too large: ${relativePath} (${(stats.size / 1024).toFixed(0)}KB)`
          );
        }
      }
    }
  }

  if (dir === manager.options.projectRoot) {
    console.log(`[DISCOVER] Found ${files.length} indexable files`);
  }

  return files;
}

function collectMerkleFilePaths(node, basePath = '') {
  if (!node) return [];
  if (node.type === 'file') {
    return basePath ? [basePath.replace(/\\/g, '/')] : [];
  }

  const children = node.children || {};
  const results = [];
  for (const [name, child] of Object.entries(children)) {
    const childPath = basePath ? `${basePath}/${name}` : name;
    results.push(...collectMerkleFilePaths(child, childPath));
  }

  return results;
}

async function loadCheckpoint(options) {
  if (!options.enableCheckpoints) return { filesProcessed: 0, chunksProcessed: 0 };

  const checkpointPath = path.join(
    options.projectRoot,
    '.claude/context/code-index/checkpoint.json'
  );

  try {
    const checkpoint = safeParseJSON(await fs.readFile(checkpointPath, 'utf8'), null);
    if (!checkpoint || typeof checkpoint !== 'object' || Array.isArray(checkpoint)) {
      return { filesProcessed: 0, chunksProcessed: 0 };
    }
    if (!Number.isFinite(Number(checkpoint.filesProcessed))) {
      return { filesProcessed: 0, chunksProcessed: 0 };
    }
    if (!Number.isFinite(Number(checkpoint.chunksProcessed))) {
      return { filesProcessed: 0, chunksProcessed: 0 };
    }
    console.log(
      `[CHECKPOINT] Resuming: ${checkpoint.filesProcessed}/${checkpoint.totalFiles} files already processed`
    );
    return checkpoint;
  } catch {
    return { filesProcessed: 0, chunksProcessed: 0 };
  }
}

async function saveCheckpoint(options, filesProcessed, totalFiles, totalChunks) {
  if (!options.enableCheckpoints) return;

  const checkpointPath = path.join(
    options.projectRoot,
    '.claude/context/code-index/checkpoint.json'
  );

  await fs.mkdir(path.dirname(checkpointPath), { recursive: true });
  await atomicWriteAsync(
    checkpointPath,
    JSON.stringify({
      filesProcessed,
      totalFiles,
      chunksProcessed: totalChunks,
      timestamp: Date.now(),
    })
  );
}

async function clearCheckpoint(options) {
  const checkpointPath = path.join(
    options.projectRoot,
    '.claude/context/code-index/checkpoint.json'
  );
  try {
    await fs.unlink(checkpointPath);
  } catch {
    /* Ignore */
  }
}

module.exports = {
  clearCheckpoint,
  collectMerkleFilePaths,
  discoverFiles,
  loadCheckpoint,
  saveCheckpoint,
};
