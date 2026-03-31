'use strict';

/**
 * Tests for F-007: Deviation Rules Protocol
 * Verifies .claude/rules/deviation-protocol.md exists and contains required content.
 *
 * TDD RED phase: These tests must fail before the rule file is created.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '../../');
// deviation-protocol.md was merged into deviation-rules.md (rules-merge-deviations feature)
const RULE_FILE = path.join(PROJECT_ROOT, '.claude', 'rules', 'deviation-rules.md');

describe('F-007: Deviation Rules Protocol', () => {
  test('rule file exists at .claude/rules/deviation-rules.md (merged)', () => {
    assert.ok(fs.existsSync(RULE_FILE), `Expected deviation-rules.md to exist at ${RULE_FILE}`);
  });

  test('rule file contains all 4 deviation rules', () => {
    const content = fs.readFileSync(RULE_FILE, 'utf8');

    // Rule 1: Bug auto-fix
    assert.match(
      content,
      /Rule 1|DR-1|deviation.*bug|bug.*fix.*encountered/i,
      'Expected Rule 1 (auto-fix bugs encountered during execution)'
    );

    // Rule 2: Missing functionality
    assert.match(
      content,
      /Rule 2|DR-2|missing.*functionality|blocking.*missing/i,
      'Expected Rule 2 (add blocking-missing functionality needed for current task)'
    );

    // Rule 3: Architectural escalation
    assert.match(
      content,
      /Rule 3|Rule 4|DR-3|DR-4|architectural|STOP.*escalate|escalate.*architectural/i,
      'Expected Rule 3/4 (architectural decisions require STOP + escalate)'
    );

    // Rule for deviation logging
    assert.match(
      content,
      /session.gap.log|gap.log|log.*deviation|deviation.*log/i,
      'Expected logging rule referencing session-gap-log'
    );
  });

  test('rule file has explicit STOP + escalate instruction for architectural decisions', () => {
    const content = fs.readFileSync(RULE_FILE, 'utf8');
    assert.match(
      content,
      /STOP/,
      'Expected the word STOP (uppercase) for architectural escalation rule'
    );
    assert.match(
      content,
      /escalate/i,
      'Expected explicit escalation instruction for architectural decisions'
    );
  });

  test('rule file has valid markdown structure (has a heading)', () => {
    const content = fs.readFileSync(RULE_FILE, 'utf8');
    assert.match(content, /^#\s+/m, 'Expected at least one markdown heading');
  });

  test('rule file is under 150 lines', () => {
    const content = fs.readFileSync(RULE_FILE, 'utf8');
    const lines = content.split('\n').length;
    assert.ok(lines <= 150, `Expected rule file to be under 150 lines, got ${lines}`);
  });
});
