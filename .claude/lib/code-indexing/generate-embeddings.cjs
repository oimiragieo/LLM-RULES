'use strict';

/**
 * generate-embeddings.cjs — index MTM/LTM memory tiers into LanceDB
 *
 * Usage:
 *   node .claude/lib/code-indexing/generate-embeddings.cjs [options]
 *
 * Options:
 *   --dry-run       List files that would be indexed without indexing
 *   --memory-only   Restrict indexing to memory directories only
 *   --verbose       Print per-file progress
 *   --project-root  Override project root (default: cwd)
 *
 * The script discovers JSON session files in:
 *   .claude/context/memory/mtm/  (session_*.json)
 *   .claude/context/memory/ltm/  (summary_*.json)
 *
 * Each JSON file is parsed, its text fields extracted, and the resulting
 * chunks are upserted into the shared LanceDB vector store.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { safeParseJSON } = require('../utils/safe-json.cjs');

// ─── CLI arg parsing ────────────────────────────────────────────────────────

const argv = process.argv.slice(2);

function hasFlag(flag) {
  return argv.includes(flag);
}

function getArg(flag) {
  const idx = argv.indexOf(flag);
  if (idx !== -1 && argv[idx + 1] && !argv[idx + 1].startsWith('--')) {
    return argv[idx + 1];
  }
  return null;
}

const DRY_RUN = hasFlag('--dry-run');
const MEMORY_ONLY = hasFlag('--memory-only');
const VERBOSE = hasFlag('--verbose');
const PROJECT_ROOT = getArg('--project-root') || process.cwd();

// ─── Memory directory paths ──────────────────────────────────────────────────

const MEMORY_BASE = path.join(PROJECT_ROOT, '.claude', 'context', 'memory');
const MTM_DIR = path.join(MEMORY_BASE, 'mtm');
const LTM_DIR = path.join(MEMORY_BASE, 'ltm');
const STM_DIR = path.join(MEMORY_BASE, 'stm');

// ─── Code directories (used when --memory-only is NOT set) ───────────────────

const _CODE_DIRS = [path.join(PROJECT_ROOT, 'src'), path.join(PROJECT_ROOT, '.claude', 'lib')];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Recursively list files in a directory.
 * @param {string} dir
 * @returns {string[]} absolute file paths
 */
function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFiles(full));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Derive a stable chunk id from file path + content hash.
 * @param {string} filePath
 * @param {string} text
 * @returns {string}
 */
function chunkId(filePath, text) {
  const hash = crypto
    .createHash('sha256')
    .update(filePath + text)
    .digest('hex')
    .slice(0, 12);
  return `mem:${hash}`;
}

// ─── JSON session file → chunks ───────────────────────────────────────────────

/**
 * Extract searchable text fields from an MTM session JSON.
 *
 * MTM shape:
 * {
 *   session_id, timestamp, summary, tier, updated_at, consolidated_at
 * }
 *
 * @param {Object} data
 * @returns {string[]} text fragments
 */
function extractMTMTexts(data) {
  const parts = [];
  if (data.summary) parts.push(data.summary);
  if (data.session_id) parts.push(`session_id: ${data.session_id}`);
  if (data.tier) parts.push(`tier: ${data.tier}`);
  return parts.filter(Boolean);
}

/**
 * Extract searchable text fields from an LTM summary JSON.
 *
 * LTM shape:
 * {
 *   type, date_range, session_count, session_ids,
 *   key_learnings[], major_decisions[], important_patterns[],
 *   files_frequently_touched[], created_at
 * }
 *
 * @param {Object} data
 * @returns {string[]} text fragments
 */
function extractLTMTexts(data) {
  const parts = [];

  if (data.type) parts.push(`type: ${data.type}`);

  if (data.date_range) {
    parts.push(`date_range: ${data.date_range.start} to ${data.date_range.end}`);
  }

  if (Array.isArray(data.key_learnings)) {
    for (const item of data.key_learnings) {
      if (typeof item === 'string' && item.trim()) parts.push(item.trim());
    }
  }

  if (Array.isArray(data.major_decisions)) {
    for (const item of data.major_decisions) {
      const text = typeof item === 'string' ? item : JSON.stringify(item);
      if (text.trim()) parts.push(text.trim());
    }
  }

  if (Array.isArray(data.important_patterns)) {
    for (const item of data.important_patterns) {
      const text = typeof item === 'string' ? item : JSON.stringify(item);
      if (text.trim()) parts.push(text.trim());
    }
  }

  if (Array.isArray(data.files_frequently_touched)) {
    parts.push(`files: ${data.files_frequently_touched.join(', ')}`);
  }

  return parts.filter(Boolean);
}

/**
 * Generic fallback: stringify every string value in a JSON object.
 * @param {Object} data
 * @returns {string[]}
 */
function extractGenericTexts(data) {
  const parts = [];
  function walk(obj) {
    if (!obj || typeof obj !== 'object') return;
    for (const val of Object.values(obj)) {
      if (typeof val === 'string' && val.trim().length > 4) {
        parts.push(val.trim());
      } else if (Array.isArray(val)) {
        for (const item of val) {
          if (typeof item === 'string' && item.trim().length > 4) parts.push(item.trim());
          else if (typeof item === 'object') walk(item);
        }
      } else if (typeof val === 'object') {
        walk(val);
      }
    }
  }
  walk(data);
  return parts;
}

/**
 * Convert a memory JSON file to an array of indexable chunks.
 *
 * @param {string} filePath  absolute path to the JSON file
 * @param {'mtm'|'ltm'|'stm'|'unknown'} tier
 * @returns {Array<{id: string, content: string, filePath: string, language: string, type: string, lineStart: number, lineEnd: number}>}
 */
function fileToChunks(filePath, tier) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.error(`[WARN] Cannot read ${filePath}: ${err.message}`);
    return [];
  }

  let data;
  try {
    data = safeParseJSON(raw);
  } catch (err) {
    console.error(`[WARN] Cannot parse JSON ${filePath}: ${err.message}`);
    return [];
  }

  let texts;
  if (tier === 'mtm') {
    texts = extractMTMTexts(data);
  } else if (tier === 'ltm') {
    texts = extractLTMTexts(data);
  } else {
    texts = extractGenericTexts(data);
  }

  if (texts.length === 0) return [];

  // Produce one chunk per non-empty text fragment
  return texts
    .map((text, idx) => ({
      id: chunkId(filePath, text + idx),
      content: text,
      filePath: filePath.replace(/\\/g, '/'),
      language: 'json',
      type: `memory-${tier}`,
      lineStart: idx + 1,
      lineEnd: idx + 1,
      name: path.basename(filePath, '.json'),
      signature: null,
      tokenCount: Math.ceil(text.length / 4),
    }))
    .filter(c => c.content.trim().length > 0);
}

// ─── Discovery ────────────────────────────────────────────────────────────────

/**
 * Discover all memory tier files that should be indexed.
 * @returns {Array<{filePath: string, tier: 'mtm'|'ltm'|'stm'}>}
 */
function discoverMemoryFiles() {
  const files = [];

  // MTM: session_*.json
  for (const f of listFiles(MTM_DIR)) {
    if (f.endsWith('.json')) {
      files.push({ filePath: f, tier: 'mtm' });
    }
  }

  // LTM: summary_*.json
  for (const f of listFiles(LTM_DIR)) {
    if (f.endsWith('.json')) {
      files.push({ filePath: f, tier: 'ltm' });
    }
  }

  // STM: session_current.json (optional — index if present)
  for (const f of listFiles(STM_DIR)) {
    if (f.endsWith('.json')) {
      files.push({ filePath: f, tier: 'stm' });
    }
  }

  return files;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[generate-embeddings] project root: ${PROJECT_ROOT}`);
  console.log(
    `[generate-embeddings] flags: dry-run=${DRY_RUN} memory-only=${MEMORY_ONLY} verbose=${VERBOSE}`
  );

  // 1. Discover memory files
  const memFiles = discoverMemoryFiles();
  console.log(`[generate-embeddings] found ${memFiles.length} memory files`);

  if (memFiles.length === 0) {
    console.log('[generate-embeddings] no memory files found — nothing to do');
    process.exit(0);
  }

  // 2. Build chunks
  const allChunks = [];
  for (const { filePath, tier } of memFiles) {
    const rel = path.relative(PROJECT_ROOT, filePath).replace(/\\/g, '/');
    const chunks = fileToChunks(filePath, tier);

    if (VERBOSE || DRY_RUN) {
      console.log(`  [${tier.toUpperCase()}] ${rel}  →  ${chunks.length} chunk(s)`);
    }

    allChunks.push(...chunks);
  }

  console.log(`[generate-embeddings] total chunks: ${allChunks.length}`);

  // 3. Dry run exits here
  if (DRY_RUN) {
    console.log('[generate-embeddings] dry-run complete — no data written');
    process.exit(0);
  }

  if (allChunks.length === 0) {
    console.log('[generate-embeddings] no chunks produced — nothing to index');
    process.exit(0);
  }

  // 4. Upsert into LanceDB / BM25 vector store
  console.log('[generate-embeddings] initialising vector store…');

  const { VectorStore } = require('./vector-store.cjs');
  const store = new VectorStore({ projectRoot: PROJECT_ROOT });

  // Ensure BM25 index is loaded from disk (if it exists)
  await store.loadBM25Index();

  console.log(`[generate-embeddings] upserting ${allChunks.length} chunks…`);

  // Use addChunks (upsert semantics) so reruns are idempotent
  await store.addChunks(allChunks, {
    embedBatchSize: 32,
    onEmbedProgress: (done, total) => {
      process.stdout.write(`\r  embedding progress: ${done}/${total}   `);
    },
  });

  process.stdout.write('\n');

  // Save updated BM25 index to disk
  await store.saveBM25Index();

  console.log('[generate-embeddings] done.');
}

main().catch(err => {
  console.error('[generate-embeddings] fatal error:', err);
  process.exit(1);
});
