#!/usr/bin/env node
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');
const planningProgress = require('../../.claude/hooks/memory/planning-progress-tracker.cjs');

const PLAN_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'plans');
const STAMP_FILE = path.join(PLAN_DIR, '.last-plan-update.txt');

function readStamp() {
  if (!fs.existsSync(STAMP_FILE)) return '';
  return fs.readFileSync(STAMP_FILE, 'utf8');
}

describe('planning-progress-tracker', () => {
  beforeEach(() => {
    if (!fs.existsSync(PLAN_DIR)) {
      fs.mkdirSync(PLAN_DIR, { recursive: true });
    }
    if (fs.existsSync(STAMP_FILE)) {
      fs.unlinkSync(STAMP_FILE);
    }
  });

  afterEach(() => {
    if (fs.existsSync(STAMP_FILE)) {
      fs.unlinkSync(STAMP_FILE);
    }
  });

  it('appends a stamp for progress.md updates', () => {
    const input = {
      tool_name: 'Write',
      tool_input: {
        file_path: path.join(PLAN_DIR, 'progress.md'),
      },
    };

    planningProgress.handleHookInput(input);

    const content = readStamp();
    assert.ok(content.includes('progress.md'));
  });

  it('does not append for non-plan files', () => {
    const input = {
      tool_name: 'Write',
      tool_input: {
        file_path: path.join(PROJECT_ROOT, 'README.md'),
      },
    };

    planningProgress.handleHookInput(input);

    assert.strictEqual(fs.existsSync(STAMP_FILE), false);
  });
});
