'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const {
  loadCheckpoint,
  saveCheckpoint,
  clearCheckpoint,
} = require('../../../.claude/lib/code-indexing/index-manager-files.cjs');

test('saveCheckpoint writes checkpoint atomically without leftover temp file', async () => {
  const projectRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'index-manager-files-'));
  const codeIndexDir = path.join(projectRoot, '.claude', 'context', 'code-index');
  const checkpointPath = path.join(codeIndexDir, 'checkpoint.json');

  try {
    await saveCheckpoint({ projectRoot, enableCheckpoints: true }, 3, 11, 42);
    assert.equal(fs.existsSync(checkpointPath), true);

    const files = await fsp.readdir(codeIndexDir);
    const tmpFiles = files.filter(name => name.includes('.tmp'));
    assert.equal(tmpFiles.length, 0, 'No temporary checkpoint files should remain');
  } finally {
    await fsp.rm(projectRoot, { recursive: true, force: true });
  }
});

test('loadCheckpoint returns defaults when checkpoint JSON is malformed', async () => {
  const projectRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'index-manager-files-bad-json-'));
  const codeIndexDir = path.join(projectRoot, '.claude', 'context', 'code-index');
  const checkpointPath = path.join(codeIndexDir, 'checkpoint.json');

  try {
    await fsp.mkdir(codeIndexDir, { recursive: true });
    await fsp.writeFile(checkpointPath, '{"filesProcessed": 1,', 'utf8');

    const checkpoint = await loadCheckpoint({ projectRoot, enableCheckpoints: true });
    assert.deepEqual(checkpoint, { filesProcessed: 0, chunksProcessed: 0 });
  } finally {
    await clearCheckpoint({ projectRoot });
    await fsp.rm(projectRoot, { recursive: true, force: true });
  }
});
