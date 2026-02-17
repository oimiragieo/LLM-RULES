'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWriteJSONSync, atomicWriteSync } = require('../utils/atomic-write.cjs');
const { DEFAULT_AREA } = require('./memory-areas.cjs');
const { recordMemoryOperation } = require('./memory-slo-metrics.cjs');
const { sanitizeMemoryContent } = require('./memory-sanitizer.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');

function createRecordingOps({
  PROJECT_ROOT,
  validateProjectRoot,
  getMemoryDir,
  ensureDir,
  withFileLockSync,
  buildEntryId,
  normalizeArea,
  maybeSyncMemoryJson,
  emitMemorySavedEvent,
}) {
  function recordGotcha(gotcha, projectRoot = PROJECT_ROOT) {
    const started = Date.now();
    validateProjectRoot(projectRoot);
    const memoryDir = getMemoryDir(projectRoot);
    ensureDir(memoryDir);

    const gotchasFile = path.join(memoryDir, 'gotchas.json');

    let shouldSync = false;
    try {
      const wrote = withFileLockSync(gotchasFile, () => {
        let gotchas = [];
        if (fs.existsSync(gotchasFile)) {
          const raw = fs.readFileSync(gotchasFile, 'utf8');
          const parsed = safeParseJSON(raw, null);
          if (Array.isArray(parsed)) {
            gotchas = parsed;
            recordMemoryOperation({ parseAttempt: true }, projectRoot);
          } else {
            recordMemoryOperation(
              { parseAttempt: true, parseFailure: true, ok: false, error: 'gotchas_parse_failed' },
              projectRoot
            );
            gotchas = [];
          }
        }

        const gotchaText = typeof gotcha === 'string' ? gotcha : gotcha?.text;
        const sanitizeResult = sanitizeMemoryContent(gotchaText);
        if (!sanitizeResult.safe) {
          process.stderr.write(
            `[memory-manager] WARNING: recordGotcha skipped — unsafe content detected: ${sanitizeResult.detections.join('; ')}\n`
          );
          return false;
        }

        const isDuplicate = gotchas.some(
          g =>
            g.text.toLowerCase() === gotcha.text?.toLowerCase() ||
            g.text.toLowerCase() === gotcha.toLowerCase?.()
        );

        if (!isDuplicate) {
          const now = new Date().toISOString();
          const area =
            typeof gotcha === 'object' && gotcha ? normalizeArea(gotcha.area) : DEFAULT_AREA;
          const entry =
            typeof gotcha === 'string'
              ? { text: gotcha, timestamp: now, accessCount: 0, lastAccessed: null, area }
              : { ...gotcha, timestamp: now, accessCount: 0, lastAccessed: null, area };
          entry.id = buildEntryId(entry);

          gotchas.push(entry);
          atomicWriteJSONSync(gotchasFile, gotchas, { skipLock: true });
          shouldSync = true;
          emitMemorySavedEvent({
            key: `gotchas:${entry.id}`,
            value: { id: entry.id, area: entry.area, timestamp: entry.timestamp },
            source: 'memory-manager.recordGotcha',
          });
        }

        return !isDuplicate;
      });
      recordMemoryOperation(
        {
          kind: 'write',
          ok: true,
          writeLatencyMs: Date.now() - started,
        },
        projectRoot
      );
      if (wrote && shouldSync) {
        maybeSyncMemoryJson(gotchasFile, projectRoot);
      }
      return wrote;
    } catch (err) {
      recordMemoryOperation(
        {
          kind: 'write',
          ok: false,
          writeLatencyMs: Date.now() - started,
          error: err?.message || String(err),
        },
        projectRoot
      );
      throw err;
    }
  }

  function recordPattern(pattern, projectRoot = PROJECT_ROOT) {
    const started = Date.now();
    validateProjectRoot(projectRoot);
    const memoryDir = getMemoryDir(projectRoot);
    ensureDir(memoryDir);

    const patternsFile = path.join(memoryDir, 'patterns.json');

    let shouldSync = false;
    try {
      const wrote = withFileLockSync(patternsFile, () => {
        let patterns = [];
        if (fs.existsSync(patternsFile)) {
          const raw = fs.readFileSync(patternsFile, 'utf8');
          const parsed = safeParseJSON(raw, null);
          if (Array.isArray(parsed)) {
            patterns = parsed;
            recordMemoryOperation({ parseAttempt: true }, projectRoot);
          } else {
            recordMemoryOperation(
              { parseAttempt: true, parseFailure: true, ok: false, error: 'patterns_parse_failed' },
              projectRoot
            );
            patterns = [];
          }
        }

        const patternText = typeof pattern === 'string' ? pattern : pattern?.text;
        const sanitizeResult = sanitizeMemoryContent(patternText);
        if (!sanitizeResult.safe) {
          process.stderr.write(
            `[memory-manager] WARNING: recordPattern skipped — unsafe content detected: ${sanitizeResult.detections.join('; ')}\n`
          );
          return false;
        }

        const isDuplicate = patterns.some(
          p =>
            p.text.toLowerCase() === pattern.text?.toLowerCase() ||
            p.text.toLowerCase() === pattern.toLowerCase?.()
        );

        if (!isDuplicate) {
          const now = new Date().toISOString();
          const area =
            typeof pattern === 'object' && pattern ? normalizeArea(pattern.area) : DEFAULT_AREA;
          const entry =
            typeof pattern === 'string'
              ? { text: pattern, timestamp: now, accessCount: 0, lastAccessed: null, area }
              : { ...pattern, timestamp: now, accessCount: 0, lastAccessed: null, area };
          entry.id = buildEntryId(entry);

          patterns.push(entry);
          atomicWriteJSONSync(patternsFile, patterns, { skipLock: true });
          shouldSync = true;
          emitMemorySavedEvent({
            key: `patterns:${entry.id}`,
            value: { id: entry.id, area: entry.area, timestamp: entry.timestamp },
            source: 'memory-manager.recordPattern',
          });
        }

        return !isDuplicate;
      });
      recordMemoryOperation(
        {
          kind: 'write',
          ok: true,
          writeLatencyMs: Date.now() - started,
        },
        projectRoot
      );
      if (wrote && shouldSync) {
        maybeSyncMemoryJson(patternsFile, projectRoot);
      }
      return wrote;
    } catch (err) {
      recordMemoryOperation(
        {
          kind: 'write',
          ok: false,
          writeLatencyMs: Date.now() - started,
          error: err?.message || String(err),
        },
        projectRoot
      );
      throw err;
    }
  }

  function recordDiscovery(
    filePath,
    description,
    category = 'general',
    projectRoot = PROJECT_ROOT
  ) {
    validateProjectRoot(projectRoot);
    const memoryDir = getMemoryDir(projectRoot);
    ensureDir(memoryDir);

    const mapFile = path.join(memoryDir, 'codebase_map.json');

    const sanitizeResult = sanitizeMemoryContent(description);
    if (!sanitizeResult.safe) {
      process.stderr.write(
        `[memory-manager] WARNING: recordDiscovery skipped — unsafe content detected: ${sanitizeResult.detections.join('; ')}\n`
      );
      return false;
    }

    return withFileLockSync(mapFile, () => {
      let codebaseMap = { discovered_files: {}, last_updated: null };
      if (fs.existsSync(mapFile)) {
        const raw = fs.readFileSync(mapFile, 'utf8');
        const parsed = safeParseJSON(raw, null);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          codebaseMap = {
            discovered_files:
              parsed.discovered_files && typeof parsed.discovered_files === 'object'
                ? parsed.discovered_files
                : {},
            last_updated: parsed.last_updated || null,
          };
        }
      }

      const now = new Date().toISOString();
      const existing = codebaseMap.discovered_files[filePath];

      codebaseMap.discovered_files[filePath] = {
        description,
        category,
        discovered_at: existing?.discovered_at || now,
        last_accessed: now,
      };
      codebaseMap.last_updated = now;

      atomicWriteSync(mapFile, JSON.stringify(codebaseMap, null, 2) + '\n', {
        encoding: 'utf8',
        skipLock: true,
      });
      emitMemorySavedEvent({
        key: `discoveries:${filePath}`,
        value: { path: filePath, category, last_accessed: now },
        source: 'memory-manager.recordDiscovery',
      });
      return true;
    });
  }

  return {
    recordGotcha,
    recordPattern,
    recordDiscovery,
  };
}

module.exports = {
  createRecordingOps,
};
