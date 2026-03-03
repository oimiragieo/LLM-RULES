'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  RollbackManager,
  validatePathWithinRoot,
  validateCheckpointId,
} = require('../../../.claude/lib/self-healing/rollback-manager.cjs');

test('validateCheckpointId rejects traversal and accepts safe ids', () => {
  assert.equal(validateCheckpointId('cp-123_abc'), 'cp-123_abc');
  assert.throws(() => validateCheckpointId('../oops'), /SEC-006/);
});

test('validatePathWithinRoot blocks paths outside project root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rollback-root-'));
  try {
    const ok = validatePathWithinRoot(path.join(root, 'a.txt'), root);
    assert.ok(ok.startsWith(root));
    assert.throws(() => validatePathWithinRoot(path.join(root, '..', 'outside.txt'), root), /SEC-006/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('RollbackManager createCheckpoint + rollback restores file contents', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rollback-manager-'));
  const checkpointDir = path.join(root, 'checkpoints');
  const filePath = path.join(root, 'test.txt');
  fs.writeFileSync(filePath, 'before', 'utf8');
  const manager = new RollbackManager({ checkpointDir });

  try {
    const checkpointId = manager.createCheckpoint('test', [filePath], {}, root);
    fs.writeFileSync(filePath, 'after', 'utf8');
    const result = manager.rollback(checkpointId, root);
    assert.equal(result.restored, 1);
    assert.equal(fs.readFileSync(filePath, 'utf8'), 'before');
    assert.ok(manager.listCheckpoints().length >= 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
