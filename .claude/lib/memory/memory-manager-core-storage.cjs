'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { atomicWriteJSONSync, atomicWriteSync } = require('../utils/atomic-write.cjs');
const { createLogger } = require('../utils/logger.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');
const { DEFAULT_AREA, isValidArea } = require('./memory-areas.cjs');
const {
  syncJsonMemory,
  ensureEntityDbInitialized,
} = require('../../hooks/memory/sync-memory-index.cjs');
const { recordMemoryOperation } = require('./memory-slo-metrics.cjs');
const { sanitizeMemoryContent } = require('./memory-sanitizer.cjs');

const logger = createLogger('memory-manager');

function createStorageHelpers({
  PROJECT_ROOT,
  validatePathWithinProject,
  validateProjectRoot,
  getMemoryDir,
  ensureDir,
}) {
  function inferProjectRootFromMemoryFile(filePath) {
    const marker = `${path.sep}.claude${path.sep}context${path.sep}memory${path.sep}`;
    const idx = String(filePath || '').indexOf(marker);
    if (idx > 0) {
      return filePath.slice(0, idx);
    }
    return PROJECT_ROOT;
  }

  function sleepSync(ms) {
    if (typeof SharedArrayBuffer !== 'undefined' && typeof Atomics !== 'undefined') {
      try {
        const sharedBuffer = new SharedArrayBuffer(4);
        const int32 = new Int32Array(sharedBuffer);
        Atomics.wait(int32, 0, 0, ms);
        return;
      } catch (_e) {
        // Fall back to busy-wait for environments without Atomics.wait support.
      }
    }

    const start = Date.now();
    while (Date.now() - start < ms) {
      // Busy wait fallback.
    }
  }

  function withFileLockSync(filePath, callback) {
    const lockPath = `${filePath}.lock`;
    const waitMs = Number(process.env.MEMORY_FILE_LOCK_WAIT_MS || 20);
    const timeoutMs = Number(process.env.MEMORY_FILE_LOCK_TIMEOUT_MS || 5000);
    const staleMs = Number(process.env.MEMORY_FILE_LOCK_STALE_MS || 60000);
    const deadline = Date.now() + timeoutMs;
    const waitStart = Date.now();
    let acquired = false;

    while (!acquired) {
      try {
        fs.mkdirSync(lockPath);
        acquired = true;
        break;
      } catch (err) {
        const code = err && err.code ? err.code : '';
        if (code !== 'EEXIST' && code !== 'EPERM' && code !== 'EBUSY') {
          throw err;
        }

        if (code === 'EEXIST' || code === 'EPERM' || code === 'EBUSY') {
          try {
            if (fs.existsSync(lockPath)) {
              const stats = fs.statSync(lockPath);
              if (Date.now() - stats.mtimeMs > staleMs) {
                fs.rmSync(lockPath, { recursive: true, force: true });
                continue;
              }
            } else {
              continue;
            }
          } catch (_e) {
            // Lock may have been released between exists and stat; retry.
          }
        }

        if (Date.now() >= deadline) {
          try {
            recordMemoryOperation(
              {
                kind: 'write',
                ok: false,
                error: `lock_timeout:${path.basename(filePath)}`,
              },
              inferProjectRootFromMemoryFile(filePath)
            );
          } catch (_e) {
            // Best-effort metrics only.
          }
          throw new Error(`Timed out acquiring memory file lock: ${path.basename(filePath)}`);
        }

        sleepSync(waitMs);
      }
    }

    try {
      recordMemoryOperation(
        {
          lockWaitMs: Date.now() - waitStart,
        },
        inferProjectRootFromMemoryFile(filePath)
      );
    } catch (_e) {
      // Best-effort metrics only.
    }

    try {
      return callback();
    } finally {
      if (acquired) {
        let released = false;
        for (let attempt = 0; attempt < 200 && !released; attempt += 1) {
          try {
            fs.rmSync(lockPath, { recursive: true, force: true });
            released = true;
          } catch (_e) {
            // Transient Windows handle lag; retry a few times.
            sleepSync(10);
          }
        }
        if (!released) {
          // Best-effort only; stale lock cleanup handles leftovers.
        }
      }
    }
  }

  function buildEntryId(entry) {
    if (entry && typeof entry.id === 'string' && entry.id.trim()) {
      return entry.id;
    }
    const text = entry?.text || '';
    const ts = entry?.timestamp || '';
    const category = entry?.category || '';
    const area = entry?.area || '';
    const base = `${text}\n${ts}\n${category}\n${area}`;
    return crypto.createHash('sha1').update(base).digest('hex');
  }

  function normalizeArea(area) {
    return isValidArea(area) ? area : DEFAULT_AREA;
  }

  function maybeSyncMemoryJson(filePath, projectRoot = PROJECT_ROOT) {
    if (process.env.MEMORY_AUTO_SYNC === 'off') return;
    if (!filePath) return;

    try {
      const validated = validatePathWithinProject(filePath, projectRoot);
      if (!validated.safe) return;

      const dbPath = path.join(projectRoot, '.claude', 'context', 'data', 'memory.db');
      ensureEntityDbInitialized(dbPath);
      syncJsonMemory(filePath, dbPath);

      if (process.env.MEMORY_EMBED_ON_WRITE === 'on') {
        const generatorPath = path.join(
          projectRoot,
          '.claude',
          'tools',
          'cli',
          'generate-embeddings.cjs'
        );
        if (fs.existsSync(generatorPath)) {
          const timeoutMs = Number(process.env.MEMORY_EMBED_ON_WRITE_TIMEOUT_MS || 30000);
          const spawnResult = spawnSync(process.execPath, [generatorPath, '--file', filePath], {
            cwd: projectRoot,
            stdio: 'ignore',
            timeout: timeoutMs,
            windowsHide: true,
          });
          if (spawnResult.signal === 'SIGTERM' || spawnResult.status !== 0) {
            logger.warn('Embedding generation may be partial', {
              file: path.basename(filePath),
              status: spawnResult.status,
              signal: spawnResult.signal,
            });
          }
        }
      }
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        // Transient concurrent read/write race; skip this sync cycle without warning noise.
        return;
      }
      logger.warn('Memory sync failed', { file: path.basename(filePath), error: err.message });
    }
  }

  function normalizeMemoryName(name) {
    return String(name || '')
      .trim()
      .replace(/\.md$/i, '')
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_.-]/g, '_')
      .toLowerCase();
  }

  function getNamedMemoryDir(projectRoot = PROJECT_ROOT) {
    validateProjectRoot(projectRoot);
    const dir = path.join(getMemoryDir(projectRoot), 'named');
    ensureDir(dir);
    return dir;
  }

  function readMemory(name, projectRoot = PROJECT_ROOT) {
    validateProjectRoot(projectRoot);
    const baseName = normalizeMemoryName(name);
    const filePath = path.join(getNamedMemoryDir(projectRoot), `${baseName}.md`);
    const validation = validatePathWithinProject(filePath, projectRoot);
    if (!validation.safe) {
      throw new Error(`Invalid memory path: ${validation.reason}`);
    }
    if (!fs.existsSync(filePath)) {
      return `Memory '${name}' not found. Use write_memory to create it.`;
    }
    return fs.readFileSync(filePath, 'utf8');
  }

  function writeMemory(name, content, projectRoot = PROJECT_ROOT) {
    validateProjectRoot(projectRoot);
    const result = sanitizeMemoryContent(String(content || ''));

    if (!result.safe) {
      logger.warn('Memory sanitizer detected dangerous content', {
        name,
        detections: result.detections,
      });
      throw new Error(
        `Memory write blocked: dangerous content detected (${result.detections.join(', ')})`
      );
    }

    const baseName = normalizeMemoryName(name);
    const filePath = path.join(getNamedMemoryDir(projectRoot), `${baseName}.md`);
    const validation = validatePathWithinProject(filePath, projectRoot);
    if (!validation.safe) {
      throw new Error(`Invalid memory path: ${validation.reason}`);
    }
    atomicWriteSync(filePath, result.original, 'utf8');
    return `Memory '${name}' written.`;
  }

  function listMemories(projectRoot = PROJECT_ROOT) {
    validateProjectRoot(projectRoot);
    const dir = path.join(getMemoryDir(projectRoot), 'named');
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter(file => file.endsWith('.md'))
      .map(file => file.replace(/\.md$/, ''));
  }

  function deleteMemory(name, projectRoot = PROJECT_ROOT) {
    validateProjectRoot(projectRoot);
    const baseName = normalizeMemoryName(name);
    const filePath = path.join(getNamedMemoryDir(projectRoot), `${baseName}.md`);
    const validation = validatePathWithinProject(filePath, projectRoot);
    if (!validation.safe) {
      throw new Error(`Invalid memory path: ${validation.reason}`);
    }
    if (!fs.existsSync(filePath)) {
      return `Memory '${name}' not found.`;
    }
    fs.unlinkSync(filePath);
    return `Memory '${name}' deleted.`;
  }

  function loadMemoryArray(filePath) {
    if (!fs.existsSync(filePath)) return [];
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const data = safeParseJSON(content, null, null, []);
      recordMemoryOperation(
        {
          parseAttempt: true,
          parseFailure: false,
        },
        inferProjectRootFromMemoryFile(filePath)
      );
      return Array.isArray(data) ? data : [];
    } catch (err) {
      recordMemoryOperation(
        {
          parseAttempt: true,
          parseFailure: true,
          ok: false,
          error: err?.message || String(err),
        },
        inferProjectRootFromMemoryFile(filePath)
      );
      logger.warn('memory_json_parse_failed', {
        file: filePath,
        error: err?.message || String(err),
      });
      return [];
    }
  }

  function writeMemoryArray(filePath, data, options = {}) {
    const arrayData = Array.isArray(data) ? data : [];

    for (const entry of arrayData) {
      if (entry && typeof entry === 'object' && entry.text) {
        const result = sanitizeMemoryContent(String(entry.text));
        if (!result.safe) {
          logger.warn('Memory sanitizer detected dangerous content in array entry', {
            detections: result.detections,
          });
          throw new Error(
            `Memory write blocked: dangerous content detected in array entry (${result.detections.join(', ')})`
          );
        }
        entry.text = result.sanitized;
      }
    }

    atomicWriteJSONSync(filePath, arrayData, options);
  }

  function normalizeEntryIds(entries) {
    let changed = false;
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      if (!entry.id) {
        entry.id = buildEntryId(entry);
        changed = true;
      }
    }
    return changed;
  }

  function deleteMemoryByIds(ids, projectRoot = PROJECT_ROOT) {
    validateProjectRoot(projectRoot);
    const list = Array.isArray(ids) ? ids.filter(Boolean) : [];
    if (list.length === 0) return { deleted: 0, notFound: [] };

    const memoryDir = getMemoryDir(projectRoot);
    const gotchasFile = path.join(memoryDir, 'gotchas.json');
    const patternsFile = path.join(memoryDir, 'patterns.json');

    let deleted = 0;
    const remainingIds = new Set(list);

    try {
      withFileLockSync(gotchasFile, () => {
        const gotchas = loadMemoryArray(gotchasFile);
        const gotchasChanged = normalizeEntryIds(gotchas);
        const keptGotchas = gotchas.filter(entry => {
          const entryId = buildEntryId(entry);
          if (remainingIds.has(entryId)) {
            remainingIds.delete(entryId);
            deleted += 1;
            return false;
          }
          return true;
        });
        if (gotchasChanged || keptGotchas.length !== gotchas.length) {
          writeMemoryArray(gotchasFile, keptGotchas, { skipLock: true });
        }
      });
    } catch (e) {
      logger.warn('Failed to lock/update gotchas.json', { error: e.message });
    }

    try {
      withFileLockSync(patternsFile, () => {
        const patterns = loadMemoryArray(patternsFile);
        const patternsChanged = normalizeEntryIds(patterns);
        const keptPatterns = patterns.filter(entry => {
          const entryId = buildEntryId(entry);
          if (remainingIds.has(entryId)) {
            remainingIds.delete(entryId);
            deleted += 1;
            return false;
          }
          return true;
        });
        if (patternsChanged || keptPatterns.length !== patterns.length) {
          writeMemoryArray(patternsFile, keptPatterns, { skipLock: true });
        }
      });
    } catch (e) {
      logger.warn('Failed to lock/update patterns.json', { error: e.message });
    }

    return { deleted, notFound: [...remainingIds] };
  }

  return {
    inferProjectRootFromMemoryFile,
    withFileLockSync,
    buildEntryId,
    normalizeArea,
    maybeSyncMemoryJson,
    getNamedMemoryDir,
    readMemory,
    writeMemory,
    listMemories,
    deleteMemory,
    loadMemoryArray,
    writeMemoryArray,
    normalizeEntryIds,
    deleteMemoryByIds,
  };
}

module.exports = {
  createStorageHelpers,
};
