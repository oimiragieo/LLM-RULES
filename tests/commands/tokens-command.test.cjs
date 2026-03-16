'use strict';

/**
 * Tests for the /tokens slash command.
 * Verifies structure and required references in .claude/commands/tokens.md
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const COMMAND_PATH = path.join(__dirname, '..', '..', '.claude', 'commands', 'tokens.md');

test('tokens command file exists', () => {
  assert.ok(fs.existsSync(COMMAND_PATH), `Expected file to exist at ${COMMAND_PATH}`);
});

test('tokens command contains ccusage reference', () => {
  const content = fs.readFileSync(COMMAND_PATH, 'utf8');
  assert.ok(
    content.includes('ccusage'),
    'Expected tokens.md to reference "ccusage"'
  );
});

test('tokens command contains getTodayTotals reference', () => {
  const content = fs.readFileSync(COMMAND_PATH, 'utf8');
  assert.ok(
    content.includes('getTodayTotals'),
    'Expected tokens.md to reference "getTodayTotals"'
  );
});

test('tokens command is valid markdown starting with #', () => {
  const content = fs.readFileSync(COMMAND_PATH, 'utf8');
  assert.ok(
    content.trimStart().startsWith('#'),
    'Expected tokens.md to start with a # heading (valid markdown)'
  );
});
