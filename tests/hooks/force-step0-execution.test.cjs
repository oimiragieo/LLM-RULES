#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  getPendingReflectionState,
  isTaskNotificationPrompt,
  isBypassPermissionsMode,
} = require('../../.claude/hooks/reflection/force-step0-execution.cjs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const runtimeDir = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
const spawnRequestPath = path.join(runtimeDir, 'reflection-spawn-request.json');
const reminderPath = path.join(runtimeDir, 'reflection-reminder.txt');

function snapshot(filePath) {
  if (!fs.existsSync(filePath)) return { exists: false, content: '' };
  return { exists: true, content: fs.readFileSync(filePath, 'utf8') };
}

function restore(filePath, snap) {
  if (!snap.exists) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return;
  }
  fs.writeFileSync(filePath, snap.content, 'utf8');
}

test('getPendingReflectionState clears stale reminder when no requests', () => {
  fs.mkdirSync(runtimeDir, { recursive: true });
  const spawnSnap = snapshot(spawnRequestPath);
  const reminderSnap = snapshot(reminderPath);
  try {
    if (fs.existsSync(spawnRequestPath)) fs.unlinkSync(spawnRequestPath);
    fs.writeFileSync(reminderPath, 'stale reminder', 'utf8');

    const state = getPendingReflectionState();
    assert.equal(state.hasPending, false);
    assert.equal(state.pendingCount, 0);
    assert.equal(state.cleanedStaleReminder, true);
    assert.equal(fs.existsSync(reminderPath), false);
  } finally {
    restore(spawnRequestPath, spawnSnap);
    restore(reminderPath, reminderSnap);
  }
});

test('isTaskNotificationPrompt detects internal task payload', () => {
  assert.equal(
    isTaskNotificationPrompt({
      prompt: '<task-notification><task-id>a1</task-id></task-notification>',
    }),
    true
  );
  assert.equal(isTaskNotificationPrompt({ prompt: 'implement login form' }), false);
});

test('isBypassPermissionsMode detects bypass permissions mode', () => {
  assert.equal(isBypassPermissionsMode({ permission_mode: 'bypassPermissions' }), true);
  assert.equal(isBypassPermissionsMode({ permission_mode: 'default' }), false);
  assert.equal(isBypassPermissionsMode(null), false);
});
