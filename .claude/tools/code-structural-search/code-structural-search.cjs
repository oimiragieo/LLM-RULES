'use strict';

const fs = require('fs');
const { HybridLazyIndexer } = require('../../lib/code-indexing/hybrid-lazy-indexer.cjs');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

async function runStructuralSearch(input = {}, deps = {}) {
  const indexer =
    typeof deps.createIndexer === 'function'
      ? deps.createIndexer(input)
      : new HybridLazyIndexer({
          projectRoot: input.projectRoot || process.cwd(),
          embeddingEnabled: false,
        });

  try {
    if (input.filePath) {
      const start = Number.isFinite(Number(input.start)) ? Number(input.start) : 0;
      const end = Number.isFinite(Number(input.end)) ? Number(input.end) : 50;
      const content = await indexer.getFileContent(String(input.filePath), start, end);
      return { ok: true, mode: 'file', content };
    }

    const structure = await indexer.analyzeStructure();
    return { ok: true, mode: 'structure', structure };
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
  const result = await runStructuralSearch(input);
  process.stdout.write(JSON.stringify(result) + '\n');
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(err => {
    process.stderr.write(String(err && err.message ? err.message : err) + '\n');
    process.exit(1);
  });
}

module.exports = { main, runStructuralSearch };
