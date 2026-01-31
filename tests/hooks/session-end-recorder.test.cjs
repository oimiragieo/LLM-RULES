#!/usr/bin/env node
/**
 * Tests for SessionEnd Hook
 */
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const HOOK_PATH = path.join(__dirname, 'session-end-recorder.cjs');
const SESSIONS_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'memory', 'sessions');

describe('SessionEnd Hook', () => {
  beforeEach(() => {
    // Clean up test sessions
    if (fs.existsSync(SESSIONS_DIR)) {
      const files = fs.readdirSync(SESSIONS_DIR);
      for (const file of files) {
        if (file.startsWith('session_') && file.endsWith('.json')) {
          fs.unlinkSync(path.join(SESSIONS_DIR, file));
        }
      }
    }
  });

  afterEach(() => {
    // Clean up test sessions
    if (fs.existsSync(SESSIONS_DIR)) {
      const files = fs.readdirSync(SESSIONS_DIR);
      for (const file of files) {
        if (file.startsWith('session_') && file.endsWith('.json')) {
          fs.unlinkSync(path.join(SESSIONS_DIR, file));
        }
      }
    }
  });

  it('should create session file when triggered', () => {
    // Arrange
    const sessionContext = {
      summary: 'Test session',
      tasks_completed: ['Task 1'],
      discoveries: ['Found issue in memory system'],
      files_modified: ['test.js'],
    };

    // Act
    const _result = execSync(`node "${HOOK_PATH}"`, {
      input: JSON.stringify(sessionContext),
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });

    // Assert
    const files = fs.readdirSync(SESSIONS_DIR);
    const sessionFiles = files.filter(f => f.startsWith('session_') && f.endsWith('.json'));

    assert.strictEqual(sessionFiles.length, 1, 'Should create exactly one session file');

    const sessionFile = path.join(SESSIONS_DIR, sessionFiles[0]);
    const sessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));

    assert.strictEqual(sessionData.summary, 'Test session');
    assert.deepStrictEqual(sessionData.tasks_completed, ['Task 1']);
    assert.ok(sessionData.timestamp, 'Should have timestamp');
    assert.ok(sessionData.session_number, 'Should have session number');
  });

  it('should handle empty input gracefully', () => {
    // Act - no input
    const _result = execSync(`node "${HOOK_PATH}"`, {
      input: '',
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });

    // Assert - should not error, should exit cleanly
    assert.ok(true, 'Should exit without error');
  });

  it('should handle missing fields gracefully', () => {
    // Arrange - partial data
    const sessionContext = {
      summary: 'Partial session',
    };

    // Act
    execSync(`node "${HOOK_PATH}"`, {
      input: JSON.stringify(sessionContext),
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });

    // Assert
    const files = fs.readdirSync(SESSIONS_DIR);
    const sessionFiles = files.filter(f => f.startsWith('session_') && f.endsWith('.json'));

    assert.strictEqual(sessionFiles.length, 1);

    const sessionFile = path.join(SESSIONS_DIR, sessionFiles[0]);
    const sessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));

    assert.strictEqual(sessionData.summary, 'Partial session');
    assert.deepStrictEqual(sessionData.tasks_completed, []);
    assert.deepStrictEqual(sessionData.discoveries, []);
  });

  it('should increment session numbers', () => {
    // Arrange - create first session
    const session1 = { summary: 'Session 1' };
    execSync(`node "${HOOK_PATH}"`, {
      input: JSON.stringify(session1),
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });

    // Act - create second session
    const session2 = { summary: 'Session 2' };
    execSync(`node "${HOOK_PATH}"`, {
      input: JSON.stringify(session2),
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });

    // Assert
    const files = fs.readdirSync(SESSIONS_DIR);
    const sessionFiles = files.filter(f => f.startsWith('session_') && f.endsWith('.json')).sort();

    assert.strictEqual(sessionFiles.length, 2);

    const session1Data = JSON.parse(
      fs.readFileSync(path.join(SESSIONS_DIR, sessionFiles[0]), 'utf8')
    );
    const session2Data = JSON.parse(
      fs.readFileSync(path.join(SESSIONS_DIR, sessionFiles[1]), 'utf8')
    );

    assert.strictEqual(session2Data.session_number, session1Data.session_number + 1);
  });
});
