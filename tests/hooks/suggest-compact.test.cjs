#!/usr/bin/env node
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const suggestCompact = require('../../.claude/scripts/hooks/suggest-compact.cjs');

describe('suggest-compact hook', () => {
  let counterFile;

  beforeEach(() => {
    counterFile = path.join(os.tmpdir(), `claude-tool-count-test-${Date.now()}`);
    process.env.STRATEGIC_COMPACT_ENABLED = 'true';
    process.env.COMPACT_THRESHOLD = '2';
    process.env.COMPACT_REMINDER_INTERVAL = '2';
    process.env.COMPACT_COUNTER_FILE = counterFile;
  });

  afterEach(() => {
    if (fs.existsSync(counterFile)) {
      fs.unlinkSync(counterFile);
    }
    delete process.env.STRATEGIC_COMPACT_ENABLED;
    delete process.env.COMPACT_THRESHOLD;
    delete process.env.COMPACT_REMINDER_INTERVAL;
    delete process.env.COMPACT_COUNTER_FILE;
  });

  it('suggests compaction when threshold is reached', () => {
    const first = suggestCompact.maybeSuggestCompact();
    assert.strictEqual(first, null);

    const second = suggestCompact.maybeSuggestCompact();
    assert.ok(second && second.includes('tool calls reached'));
  });
});
