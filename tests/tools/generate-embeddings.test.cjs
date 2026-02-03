const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { processFile, reindexIfNeeded } = require('../../.claude/tools/cli/generate-embeddings.cjs');

test('processFile handles JSON entries and builds documents', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'embeddings-json-'));
  const jsonPath = path.join(tmpDir, 'patterns.json');
  const payload = [
    { text: 'Pattern One', content: 'Use X for Y', timestamp: '2026-02-01' },
    { text: 'Pattern Two', content: 'Avoid Z', timestamp: '2026-02-02' },
  ];
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));

  const captured = [];
  const vectorStore = {
    upsertDocuments: async docs => {
      captured.push(...docs);
    },
  };

  const count = await processFile(jsonPath, { dryRun: false }, vectorStore);

  assert.equal(count, 2);
  assert.equal(captured.length, 2);
  assert.ok(captured[0].id.includes('patterns.json'));
  assert.ok(captured[0].text.includes('Pattern One'));
  assert.ok(captured[0].text.includes('Use X for Y'));
});

test('reindexIfNeeded drops table when enabled', async () => {
  let dropCalls = 0;
  const vectorStore = {
    dropTable: async () => {
      dropCalls += 1;
    },
  };

  const didReindex = await reindexIfNeeded(vectorStore, { reindex: true });

  assert.equal(didReindex, true);
  assert.equal(dropCalls, 1);
});

test('reindexIfNeeded is a no-op when disabled', async () => {
  let dropCalls = 0;
  const vectorStore = {
    dropTable: async () => {
      dropCalls += 1;
    },
  };

  const didReindex = await reindexIfNeeded(vectorStore, { reindex: false });

  assert.equal(didReindex, false);
  assert.equal(dropCalls, 0);
});
