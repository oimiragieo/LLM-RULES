'use strict';

const fs = require('fs');
const { HybridLazyIndexer } = require('../../lib/code-indexing/hybrid-lazy-indexer.cjs');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

async function runSemanticSearch(input = {}, deps = {}) {
  const query = String(input.query || '').trim();
  if (!query) {
    return { ok: false, error: 'query is required' };
  }

  const limit = Number.isFinite(Number(input.limit)) ? Math.max(1, Number(input.limit)) : 10;
  const indexer =
    typeof deps.createIndexer === 'function'
      ? deps.createIndexer(input)
      : new HybridLazyIndexer({
          projectRoot: input.projectRoot || process.cwd(),
          embeddingEnabled: process.env.HYBRID_EMBEDDINGS !== 'off',
        });

  try {
    const results = await indexer.search(query, { limit });
    return {
      ok: true,
      query,
      limit,
      count: Array.isArray(results) ? results.length : 0,
      results: Array.isArray(results) ? results : [],
    };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

function parseInput() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    if (!raw.trim()) return {};
    const parsed = safeParseJSON(raw, {});
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_e) {
    return {};
  }
}

async function main() {
  const input = parseInput();
  const result = await runSemanticSearch(input);
  process.stdout.write(JSON.stringify(result) + '\n');
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(err => {
    process.stderr.write(String(err && err.message ? err.message : err) + '\n');
    process.exit(1);
  });
}

module.exports = { main, runSemanticSearch };
