/**
 * Cold storage archiver for LTM summaries
 * ======================================
 *
 * Enforces a bounded hot LTM directory by archiving older LTM summary files
 * into compressed cold storage (no gzip append). Optionally indexes archived
 * summaries into LanceDB so they're still searchable.
 *
 * Cold format: one gzip'd JSONL file per archive run.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const { atomicWriteSync } = require('../utils/atomic-write.cjs');
const { PROJECT_ROOT, validatePathWithinProject } = require('../utils/project-root.cjs');
const { getRetentionOptions } = require('./memory-retention-config.cjs');

function validateProjectRoot(projectRoot) {
  if (projectRoot !== PROJECT_ROOT) {
    const validation = validatePathWithinProject(projectRoot, PROJECT_ROOT);
    if (!validation.safe) {
      throw new Error(`Invalid projectRoot: ${validation.reason}`);
    }
  }
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getLtmDir(projectRoot = PROJECT_ROOT) {
  return path.join(projectRoot, '.claude', 'context', 'memory', 'ltm');
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * List LTM summary files (summary_*.json) sorted oldest-first (by mtime).
 *
 * @param {string} projectRoot
 * @returns {Array<{absPath: string, name: string, mtimeMs: number}>}
 * @deprecated Use memory-tiers.cjs for canonical LTM access.
 */
function listLTMSummaries(projectRoot = PROJECT_ROOT) {
  validateProjectRoot(projectRoot);
  const ltmDir = getLtmDir(projectRoot);
  if (!fs.existsSync(ltmDir)) return [];

  const entries = [];
  for (const name of fs.readdirSync(ltmDir)) {
    if (!name.endsWith('.json')) continue;
    if (!name.startsWith('summary_')) continue;
    const absPath = path.join(ltmDir, name);
    try {
      const stat = fs.statSync(absPath);
      if (!stat.isFile()) continue;
      entries.push({ absPath, name, mtimeMs: stat.mtimeMs });
    } catch {
      // skip unreadable entry
    }
  }

  entries.sort((a, b) => a.mtimeMs - b.mtimeMs || a.name.localeCompare(b.name));
  return entries;
}

function buildColdArchivePath(coldDir) {
  const now = new Date();
  const date = toIsoDate(now);
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return path.join(coldDir, `ltm-${date}-${stamp}.jsonl.gz`);
}

function buildIndexDocument(summaryObj, sourcePath, coldPath) {
  const createdAt = summaryObj?.created_at || null;
  const dateRange = summaryObj?.date_range || null;
  const keyLearnings = Array.isArray(summaryObj?.key_learnings) ? summaryObj.key_learnings : [];
  const patterns = Array.isArray(summaryObj?.important_patterns)
    ? summaryObj.important_patterns
    : [];
  const decisions = Array.isArray(summaryObj?.major_decisions) ? summaryObj.major_decisions : [];
  const touched = Array.isArray(summaryObj?.files_frequently_touched)
    ? summaryObj.files_frequently_touched
    : [];

  const header = [
    'LTM Session Summary (Archived)',
    createdAt ? `created_at: ${createdAt}` : null,
    dateRange?.start || dateRange?.end
      ? `date_range: ${dateRange?.start || 'unknown'} → ${dateRange?.end || 'unknown'}`
      : null,
    typeof summaryObj?.session_count === 'number'
      ? `session_count: ${summaryObj.session_count}`
      : null,
    '',
  ]
    .filter(Boolean)
    .join('\n');

  const bodyParts = [];
  if (keyLearnings.length) bodyParts.push(`Key learnings:\n- ${keyLearnings.join('\n- ')}`);
  if (patterns.length) bodyParts.push(`Important patterns:\n- ${patterns.join('\n- ')}`);
  if (decisions.length) bodyParts.push(`Major decisions:\n- ${decisions.join('\n- ')}`);
  if (touched.length) bodyParts.push(`Files frequently touched:\n- ${touched.join('\n- ')}`);

  const text = `${header}\n${bodyParts.join('\n\n')}`.trim();

  const idBase = path.basename(sourcePath, '.json');
  return {
    id: `ltm-archive-${idBase}`,
    text,
    metadata: {
      source: 'ltm_archive',
      tier: 'cold',
      coldPath: path.relative(PROJECT_ROOT, coldPath).replace(/\\/g, '/'),
      ltmFile: path.relative(PROJECT_ROOT, sourcePath).replace(/\\/g, '/'),
      created_at: createdAt,
      date_range: dateRange,
    },
  };
}

/**
 * Archive old LTM summaries to cold storage (no gzip append).
 *
 * @param {string} projectRoot
 * @param {object} [options]
 * @param {number} [options.maxSummaries]
 * @param {boolean} [options.coldEnable]
 * @param {number|undefined} [options.archiveAfterDays]
 * @param {string} [options.coldDir] Absolute path
 * @param {boolean} [options.indexIntoLanceDb=true]
 * @param {object|null} [options.vectorStore] Optional injected vector store for tests
 * @returns {{ archived: number, deleted: number, coldPaths: string[], indexed: number }}
 */
async function archiveOldLTM(projectRoot = PROJECT_ROOT, options = {}) {
  validateProjectRoot(projectRoot);

  const env = getRetentionOptions(projectRoot);

  const maxSummaries =
    typeof options.maxSummaries === 'number' ? options.maxSummaries : env.maxSummaries;
  const coldEnable = typeof options.coldEnable === 'boolean' ? options.coldEnable : env.coldEnable;
  const archiveAfterDays =
    typeof options.archiveAfterDays === 'number' ? options.archiveAfterDays : env.archiveAfterDays;
  const coldDir = typeof options.coldDir === 'string' ? options.coldDir : env.coldDir;
  const indexIntoLanceDb =
    typeof options.indexIntoLanceDb === 'boolean' ? options.indexIntoLanceDb : true;

  const validation = validatePathWithinProject(coldDir, projectRoot);
  if (!validation.safe) {
    throw new Error(`Invalid coldDir: ${validation.reason}`);
  }

  const all = listLTMSummaries(projectRoot);
  if (all.length === 0) return { archived: 0, deleted: 0, coldPaths: [], indexed: 0 };

  const selected = new Map(); // absPath -> entry

  if (Number.isFinite(maxSummaries) && all.length > maxSummaries) {
    const removeCount = all.length - maxSummaries;
    for (const entry of all.slice(0, removeCount)) {
      selected.set(entry.absPath, entry);
    }
  }

  if (typeof archiveAfterDays === 'number' && Number.isFinite(archiveAfterDays)) {
    const cutoffMs = Date.now() - archiveAfterDays * 24 * 60 * 60 * 1000;
    for (const entry of all) {
      if (entry.mtimeMs <= cutoffMs) {
        selected.set(entry.absPath, entry);
      }
    }
  }

  const toArchive = Array.from(selected.values()).sort(
    (a, b) => a.mtimeMs - b.mtimeMs || a.name.localeCompare(b.name)
  );

  if (toArchive.length === 0) {
    return { archived: 0, deleted: 0, coldPaths: [], indexed: 0 };
  }

  if (!coldEnable) {
    let deleted = 0;
    for (const entry of toArchive) {
      try {
        fs.rmSync(entry.absPath);
        deleted++;
      } catch {
        // ignore delete failures
      }
    }
    return { archived: 0, deleted, coldPaths: [], indexed: 0 };
  }

  ensureDir(coldDir);
  const coldPath = buildColdArchivePath(coldDir);

  const jsonlLines = [];
  const docsForIndex = [];

  for (const entry of toArchive) {
    try {
      const raw = fs.readFileSync(entry.absPath, 'utf8');
      jsonlLines.push(raw.trim());

      try {
        const obj = JSON.parse(raw);
        docsForIndex.push(buildIndexDocument(obj, entry.absPath, coldPath));
      } catch {
        // index is best-effort; still archive raw
      }
    } catch {
      // skip unreadable
    }
  }

  const jsonl = jsonlLines.filter(Boolean).join('\n') + '\n';
  const gz = zlib.gzipSync(Buffer.from(jsonl, 'utf8'));
  atomicWriteSync(coldPath, gz);

  let indexed = 0;
  if (indexIntoLanceDb && docsForIndex.length > 0) {
    try {
      const { MemoryVectorStore } = require('./lancedb-client.cjs');
      const vectorStore =
        options.vectorStore ||
        new MemoryVectorStore({
          persistDirectory: path.join(projectRoot, '.claude', 'data', 'lancedb'),
          collectionName: 'agent_memory',
          embeddingMode: process.env.LANCEDB_EMBEDDING_MODE || 'transformers',
        });

      const available = await vectorStore.isAvailable();
      if (available) {
        await vectorStore.upsertDocuments(docsForIndex);
        indexed = docsForIndex.length;
      }

      if (!options.vectorStore && typeof vectorStore.close === 'function') {
        await vectorStore.close();
      }
    } catch {
      // best-effort indexing
    }
  }

  let deleted = 0;
  for (const entry of toArchive) {
    try {
      fs.rmSync(entry.absPath);
      deleted++;
    } catch {
      // ignore delete failures
    }
  }

  return {
    archived: toArchive.length,
    deleted,
    coldPaths: [coldPath],
    indexed,
  };
}

module.exports = {
  listLTMSummaries,
  archiveOldLTM,
  // exported for tests
  _private: {
    buildIndexDocument,
  },
};
