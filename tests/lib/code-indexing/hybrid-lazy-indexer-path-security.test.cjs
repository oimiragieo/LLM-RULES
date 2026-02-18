'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { HybridLazyIndexer } = require('../../../.claude/lib/code-indexing/hybrid-lazy-indexer.cjs');

function makeTempProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hybrid-indexer-path-'));
  const projectRoot = path.join(root, 'project');
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.mkdirSync(path.join(projectRoot, 'src'), { recursive: true });
  return { root, projectRoot };
}

test('getFileContent reads files inside project root', async () => {
  const { root, projectRoot } = makeTempProject();
  try {
    const inProject = path.join(projectRoot, 'src', 'safe.js');
    fs.writeFileSync(inProject, 'line1\nline2\nline3\n', 'utf8');

    const indexer = new HybridLazyIndexer({ projectRoot, embeddingEnabled: false });
    const result = await indexer.getFileContent('src/safe.js', 0, 2);

    assert.ok(result);
    assert.equal(result.content, 'line1\nline2');
    assert.equal(result.totalLines, 4);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('getFileContent rejects relative traversal outside project root', async () => {
  const { root, projectRoot } = makeTempProject();
  try {
    const outside = path.join(root, 'outside.js');
    fs.writeFileSync(outside, 'outside', 'utf8');

    const indexer = new HybridLazyIndexer({ projectRoot, embeddingEnabled: false });
    const result = await indexer.getFileContent('../outside.js', 0, 10);

    assert.equal(result, null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('getFileContent rejects absolute paths outside project root', async () => {
  const { root, projectRoot } = makeTempProject();
  try {
    const outside = path.join(root, 'outside-abs.js');
    fs.writeFileSync(outside, 'outside-abs', 'utf8');

    const indexer = new HybridLazyIndexer({ projectRoot, embeddingEnabled: false });
    const result = await indexer.getFileContent(outside, 0, 10);

    assert.equal(result, null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
