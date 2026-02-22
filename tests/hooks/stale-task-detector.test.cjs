#!/usr/bin/env node
/**
 * stale-task-detector.test.cjs
 *
 * Tests for stale-task-detector.cjs UserPromptSubmit hook.
 * Validates warning generation for tasks stuck in_progress.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

describe('stale-task-detector hook', () => {
  let staleTaskDetector;
  let originalEnv;
  const GAP_LOG_PATH = path.join(
    PROJECT_ROOT,
    '.claude',
    'context',
    'runtime',
    'session-gap-log.jsonl'
  );

  beforeEach(() => {
    originalEnv = { ...process.env };

    try {
      const modPath = require.resolve(
        '../../.claude/hooks/session/stale-task-detector.cjs'
      );
      delete require.cache[modPath];
      staleTaskDetector = require('../../.claude/hooks/session/stale-task-detector.cjs');
    } catch (_err) {
      staleTaskDetector = null;
    }

    // Clean up gap log before each test
    try {
      if (fs.existsSync(GAP_LOG_PATH)) {
        const content = fs.readFileSync(GAP_LOG_PATH, 'utf8');
        // Only clean test entries
        const lines = content.split('\n').filter(l => !l.includes('stale-task-detector-test'));
        fs.writeFileSync(GAP_LOG_PATH, lines.join('\n'));
      }
    } catch (_err) {
      // ignore
    }
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  it('should export detectStaleTasks function', () => {
    assert.ok(staleTaskDetector, 'Module should load');
    assert.strictEqual(
      typeof staleTaskDetector.detectStaleTasks,
      'function',
      'Should export detectStaleTasks'
    );
  });

  it('should detect a task that has been in_progress for over 15 minutes', () => {
    const now = Date.now();
    const twentyMinutesAgo = new Date(now - 20 * 60 * 1000).toISOString();

    const tasks = [
      {
        id: '42',
        subject: 'Test stale task',
        status: 'in_progress',
        updatedAt: twentyMinutesAgo,
      },
    ];

    const warnings = staleTaskDetector.detectStaleTasks(tasks);
    assert.ok(warnings.length > 0, 'Should detect at least one stale task');
    assert.ok(warnings[0].includes('#42'), 'Warning should include task ID');
    assert.ok(warnings[0].includes('Test stale task'), 'Warning should include task subject');
  });

  it('should NOT warn for tasks in_progress for less than 15 minutes', () => {
    const now = Date.now();
    const fiveMinutesAgo = new Date(now - 5 * 60 * 1000).toISOString();

    const tasks = [
      {
        id: '43',
        subject: 'Recent task',
        status: 'in_progress',
        updatedAt: fiveMinutesAgo,
      },
    ];

    const warnings = staleTaskDetector.detectStaleTasks(tasks);
    assert.strictEqual(warnings.length, 0, 'Should not warn for recent tasks');
  });

  it('should NOT warn for completed tasks', () => {
    const now = Date.now();
    const twentyMinutesAgo = new Date(now - 20 * 60 * 1000).toISOString();

    const tasks = [
      {
        id: '44',
        subject: 'Done task',
        status: 'completed',
        updatedAt: twentyMinutesAgo,
      },
    ];

    const warnings = staleTaskDetector.detectStaleTasks(tasks);
    assert.strictEqual(warnings.length, 0, 'Should not warn for completed tasks');
  });

  it('should NOT warn for pending tasks', () => {
    const now = Date.now();
    const twentyMinutesAgo = new Date(now - 20 * 60 * 1000).toISOString();

    const tasks = [
      {
        id: '45',
        subject: 'Pending task',
        status: 'pending',
        updatedAt: twentyMinutesAgo,
      },
    ];

    const warnings = staleTaskDetector.detectStaleTasks(tasks);
    assert.strictEqual(warnings.length, 0, 'Should not warn for pending tasks');
  });

  it('should handle tasks without updatedAt gracefully', () => {
    const tasks = [
      {
        id: '46',
        subject: 'No timestamp task',
        status: 'in_progress',
      },
    ];

    // Should not throw
    const warnings = staleTaskDetector.detectStaleTasks(tasks);
    assert.ok(Array.isArray(warnings), 'Should return array');
  });

  it('should handle empty task list', () => {
    const warnings = staleTaskDetector.detectStaleTasks([]);
    assert.strictEqual(warnings.length, 0, 'Empty list should produce no warnings');
  });

  it('should detect multiple stale tasks', () => {
    const now = Date.now();
    const thirtyMinutesAgo = new Date(now - 30 * 60 * 1000).toISOString();

    const tasks = [
      { id: '47', subject: 'Stale A', status: 'in_progress', updatedAt: thirtyMinutesAgo },
      { id: '48', subject: 'Stale B', status: 'in_progress', updatedAt: thirtyMinutesAgo },
      { id: '49', subject: 'Fresh', status: 'in_progress', updatedAt: new Date().toISOString() },
    ];

    const warnings = staleTaskDetector.detectStaleTasks(tasks);
    assert.strictEqual(warnings.length, 2, 'Should detect exactly 2 stale tasks');
  });

  it('should include age in minutes in the warning', () => {
    const now = Date.now();
    const twentyMinutesAgo = new Date(now - 20 * 60 * 1000).toISOString();

    const tasks = [
      { id: '50', subject: 'Aged task', status: 'in_progress', updatedAt: twentyMinutesAgo },
    ];

    const warnings = staleTaskDetector.detectStaleTasks(tasks);
    assert.ok(warnings[0].includes('20m') || warnings[0].match(/\d+m/), 'Should include age');
  });
});
