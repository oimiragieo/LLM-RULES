const { test } = require('node:test');
const assert = require('node:assert');

const {
  buildEmbeddingSpawnOptions,
} = require('../../.claude/hooks/memory/sync-memory-index.cjs');

test('buildEmbeddingSpawnOptions enables windowsHide for detached background jobs', () => {
  const opts = buildEmbeddingSpawnOptions('C:/repo', 60000);
  assert.equal(opts.cwd, 'C:/repo');
  assert.equal(opts.timeout, 60000);
  assert.equal(opts.detached, true);
  assert.equal(opts.windowsHide, true);
  assert.equal(opts.stdio, 'ignore');
});
