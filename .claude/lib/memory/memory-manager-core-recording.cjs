'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWriteJSONSync, atomicWriteSync } = require('../utils/atomic-write.cjs');
const { DEFAULT_AREA } = require('./memory-areas.cjs');
const { recordMemoryOperation } = require('./memory-slo-metrics.cjs');
const { sanitizeMemoryContent } = require('./memory-sanitizer.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');
const { scoreImportance } = require('./importance-scorer.cjs');

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(Boolean);
}

function similarityScore(a, b) {
  const aTokens = new Set(tokenize(a));
  const bTokens = new Set(tokenize(b));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection += 1;
  }
  const union = new Set([...aTokens, ...bTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

function getEntryText(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof value.text === 'string') return value.text;
  return '';
}

function isDuplicateEntry(entries, candidateText, threshold) {
  const normalizedCandidate = String(candidateText || '').toLowerCase();
  for (const entry of entries) {
    const text = getEntryText(entry);
    if (!text) continue;
    if (text.toLowerCase() === normalizedCandidate) {
      return { duplicate: true, reason: 'exact' };
    }
    if (similarityScore(text, normalizedCandidate) >= threshold) {
      return { duplicate: true, reason: 'semantic' };
    }
  }
  return { duplicate: false, reason: 'none' };
}

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
  function _appendTelemetry(type, area, success, projectRoot) {
    try {
      const memoryDir = getMemoryDir(projectRoot);
      const metricsDir = path.join(memoryDir, 'metrics');
      if (!fs.existsSync(metricsDir)) {
        fs.mkdirSync(metricsDir, { recursive: true });
      }
      const telemetryFile = path.join(metricsDir, 'memory-record-telemetry.jsonl');
      const line =
        JSON.stringify({
          timestamp: new Date().toISOString(),
          type,
          area: area || 'general',
          success,
        }) + '\n';
      fs.appendFileSync(telemetryFile, line);
    } catch (_e) {
      // Never crash on telemetry failure
    }
  }

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

        const dedupEnabled = (process.env.MEMORY_DEDUP_ENABLED || 'on').toLowerCase() !== 'off';
        const dedupThresholdRaw = Number(process.env.MEMORY_DEDUP_THRESHOLD || 0.7);
        const dedupThreshold =
          Number.isFinite(dedupThresholdRaw) && dedupThresholdRaw >= 0 && dedupThresholdRaw <= 1
            ? dedupThresholdRaw
            : 0.7;
        const candidateText = getEntryText(gotcha);
        let dedupStatus = 'dedup_disabled_create';
        let isDuplicate = false;
        try {
          if (dedupEnabled) {
            if (process.env.MEMORY_DEDUP_FORCE_ERROR === '1') {
              throw new Error('forced dedup failure');
            }
            const decision = isDuplicateEntry(gotchas, candidateText, dedupThreshold);
            isDuplicate = decision.duplicate;
            dedupStatus =
              decision.reason === 'exact'
                ? 'duplicate_skipped'
                : decision.reason === 'semantic'
                  ? 'semantic_duplicate_skipped'
                  : 'create';
          } else {
            const decision = isDuplicateEntry(gotchas, candidateText, 1);
            isDuplicate = decision.duplicate;
            dedupStatus = isDuplicate ? 'duplicate_skipped' : 'dedup_disabled_create';
          }
        } catch (_dedupErr) {
          const decision = isDuplicateEntry(gotchas, candidateText, 1);
          isDuplicate = decision.duplicate;
          dedupStatus = isDuplicate ? 'duplicate_skipped' : 'error_fallback_create';
        }

        if (!isDuplicate) {
          const now = new Date().toISOString();
          const area =
            typeof gotcha === 'object' && gotcha ? normalizeArea(gotcha.area) : DEFAULT_AREA;
          const entryBase =
            typeof gotcha === 'string'
              ? { text: gotcha, timestamp: now, accessCount: 0, lastAccessed: null, area }
              : { ...gotcha, timestamp: now, accessCount: 0, lastAccessed: null, area };
          const writeSource =
            typeof entryBase.source === 'string' && entryBase.source.trim()
              ? entryBase.source.trim()
              : 'memory_api';
          const entry = {
            ...entryBase,
            writeSource,
            dedupStatus,
          };
          entry.id = buildEntryId(entry);

          gotchas.push(entry);
          atomicWriteJSONSync(gotchasFile, gotchas, { skipLock: true });
          shouldSync = true;
          emitMemorySavedEvent({
            key: `gotchas:${entry.id}`,
            value: { id: entry.id, area: entry.area, timestamp: entry.timestamp },
            source: 'memory-manager.recordGotcha',
          });
          process.nextTick(() => {
            try {
              scoreImportance(entry.text || '', entry.area);
            } catch (_e) {
              // Never crash on importance scoring failure
            }
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
      if (wrote) {
        const area =
          typeof gotcha === 'object' && gotcha ? normalizeArea(gotcha.area) : DEFAULT_AREA;
        _appendTelemetry('gotcha', area, true, projectRoot);
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

        const dedupEnabled = (process.env.MEMORY_DEDUP_ENABLED || 'on').toLowerCase() !== 'off';
        const dedupThresholdRaw = Number(process.env.MEMORY_DEDUP_THRESHOLD || 0.7);
        const dedupThreshold =
          Number.isFinite(dedupThresholdRaw) && dedupThresholdRaw >= 0 && dedupThresholdRaw <= 1
            ? dedupThresholdRaw
            : 0.7;
        const candidateText = getEntryText(pattern);
        let dedupStatus = 'dedup_disabled_create';
        let isDuplicate = false;
        try {
          if (dedupEnabled) {
            if (process.env.MEMORY_DEDUP_FORCE_ERROR === '1') {
              throw new Error('forced dedup failure');
            }
            const decision = isDuplicateEntry(patterns, candidateText, dedupThreshold);
            isDuplicate = decision.duplicate;
            dedupStatus =
              decision.reason === 'exact'
                ? 'duplicate_skipped'
                : decision.reason === 'semantic'
                  ? 'semantic_duplicate_skipped'
                  : 'create';
          } else {
            const decision = isDuplicateEntry(patterns, candidateText, 1);
            isDuplicate = decision.duplicate;
            dedupStatus = isDuplicate ? 'duplicate_skipped' : 'dedup_disabled_create';
          }
        } catch (_dedupErr) {
          const decision = isDuplicateEntry(patterns, candidateText, 1);
          isDuplicate = decision.duplicate;
          dedupStatus = isDuplicate ? 'duplicate_skipped' : 'error_fallback_create';
        }

        if (!isDuplicate) {
          const now = new Date().toISOString();
          const area =
            typeof pattern === 'object' && pattern ? normalizeArea(pattern.area) : DEFAULT_AREA;
          const entryBase =
            typeof pattern === 'string'
              ? { text: pattern, timestamp: now, accessCount: 0, lastAccessed: null, area }
              : { ...pattern, timestamp: now, accessCount: 0, lastAccessed: null, area };
          const writeSource =
            typeof entryBase.source === 'string' && entryBase.source.trim()
              ? entryBase.source.trim()
              : 'memory_api';
          const entry = {
            ...entryBase,
            writeSource,
            dedupStatus,
          };
          entry.id = buildEntryId(entry);

          patterns.push(entry);
          atomicWriteJSONSync(patternsFile, patterns, { skipLock: true });
          shouldSync = true;
          emitMemorySavedEvent({
            key: `patterns:${entry.id}`,
            value: { id: entry.id, area: entry.area, timestamp: entry.timestamp },
            source: 'memory-manager.recordPattern',
          });
          process.nextTick(() => {
            try {
              scoreImportance(entry.text || '', entry.area);
            } catch (_e) {
              // Never crash on importance scoring failure
            }
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
      if (wrote) {
        const area =
          typeof pattern === 'object' && pattern ? normalizeArea(pattern.area) : DEFAULT_AREA;
        _appendTelemetry('pattern', area, true, projectRoot);
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

    const wrote = withFileLockSync(mapFile, () => {
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
    if (wrote) {
      _appendTelemetry('discovery', category || DEFAULT_AREA, true, projectRoot);
    }
    return wrote;
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
