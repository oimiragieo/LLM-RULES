const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  hasPendingReflections,
  readSpawnRequests,
} = require('../.claude/hooks/reflection/reflection-step0-guard.cjs');

const runtimeDir = path.join(__dirname, '..', '.claude', 'context', 'runtime');
const spawnRequestPath = path.join(runtimeDir, 'reflection-spawn-request.json');
const reminderPath = path.join(runtimeDir, 'reflection-reminder.txt');

function captureFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { exists: false, content: null };
  }
  return { exists: true, content: fs.readFileSync(filePath, 'utf8') };
}

function restoreFile(filePath, snapshot) {
  if (!snapshot.exists) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return;
  }
  fs.writeFileSync(filePath, snapshot.content, 'utf8');
}

test('readSpawnRequests returns array for valid JSON', () => {
  fs.mkdirSync(runtimeDir, { recursive: true });
  const snapshot = captureFile(spawnRequestPath);
  try {
    fs.writeFileSync(spawnRequestPath, JSON.stringify([{ id: 'r1' }], null, 2), 'utf8');
    const result = readSpawnRequests(spawnRequestPath);
    assert.equal(Array.isArray(result), true);
    assert.equal(result.length, 1);
  } finally {
    restoreFile(spawnRequestPath, snapshot);
  }
});

test('hasPendingReflections detects reminder or spawn requests', () => {
  fs.mkdirSync(runtimeDir, { recursive: true });
  const spawnSnapshot = captureFile(spawnRequestPath);
  const reminderSnapshot = captureFile(reminderPath);
  try {
    if (fs.existsSync(spawnRequestPath)) fs.unlinkSync(spawnRequestPath);
    if (fs.existsSync(reminderPath)) fs.unlinkSync(reminderPath);

    assert.equal(hasPendingReflections(), false);

    fs.writeFileSync(spawnRequestPath, JSON.stringify([{ id: 'r1' }], null, 2), 'utf8');
    assert.equal(hasPendingReflections(), true);

    fs.unlinkSync(spawnRequestPath);
    fs.writeFileSync(reminderPath, 'pending reflections', 'utf8');
    assert.equal(hasPendingReflections(), true);
  } finally {
    restoreFile(spawnRequestPath, spawnSnapshot);
    restoreFile(reminderPath, reminderSnapshot);
  }
});
