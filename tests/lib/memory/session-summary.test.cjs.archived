#!/usr/bin/env node
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const {
  buildSessionContext,
  generateStructuredSummaryForSession,
} = require('../../../.claude/lib/memory/session-summary.cjs');
const {
  getSessionStructuredSummaryPrompt,
} = require('../../../.claude/lib/memory/prompts/session-structured-summary.cjs');

const TEST_ROOT = path.join(__dirname, '__test_session_summary__');
const MTM_DIR = path.join(TEST_ROOT, '.claude', 'context', 'memory', 'mtm');

function setupDir() {
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
  fs.mkdirSync(MTM_DIR, { recursive: true });
}

function cleanupDir() {
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
}

test('getSessionStructuredSummaryPrompt injects session context', () => {
  const prompt = getSessionStructuredSummaryPrompt('hello world');
  assert.ok(prompt.system.includes('structured session summaries'));
  assert.ok(prompt.user.includes('hello world'));
  assert.ok(prompt.user.includes('# Session Summary'));
  assert.ok(prompt.user.includes('project paths'));
});

test('buildSessionContext formats session data', () => {
  const context = buildSessionContext({
    summary: 'Did a thing',
    decisions_made: ['Use SQLite'],
    patterns_found: ['Cache results'],
    gotchas_encountered: ['Null pointers'],
    tasks_completed: ['Fix tests'],
    files_modified: ['src/app.js'],
  });

  assert.ok(context.includes('Did a thing'));
  assert.ok(context.includes('Decisions'));
  assert.ok(context.includes('Use SQLite'));
  assert.ok(context.includes('Patterns'));
  assert.ok(context.includes('Cache results'));
});

test('generateStructuredSummaryForSession writes summary file', async () => {
  setupDir();
  try {
    const mtmPath = path.join(MTM_DIR, 'session_test.json');
    fs.writeFileSync(mtmPath, JSON.stringify({ session_id: 'test' }));

    const modelClient = {
      generateText: async () => 'SUMMARY OUTPUT',
    };

    const result = await generateStructuredSummaryForSession(
      { session_id: 'test', summary: 'Session summary' },
      {
        projectRoot: TEST_ROOT,
        mtmPath,
        modelClient,
      }
    );

    assert.ok(result.summaryPath.endsWith('.summary.md'));
    assert.ok(fs.existsSync(result.summaryPath));
    const contents = fs.readFileSync(result.summaryPath, 'utf8');
    assert.strictEqual(contents, 'SUMMARY OUTPUT');
  } finally {
    cleanupDir();
  }
});
