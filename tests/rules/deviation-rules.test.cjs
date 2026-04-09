'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RULE_PATH = path.resolve(__dirname, '../../.claude/rules/deviation-rules.md');

describe('deviation-rules.md', () => {
  it('rule file exists at expected path', () => {
    assert.ok(fs.existsSync(RULE_PATH), `Expected rule file at ${RULE_PATH}`);
  });

  it('contains Auto-fix rule for minor bugs', () => {
    const content = fs.readFileSync(RULE_PATH, 'utf8');
    assert.ok(content.toLowerCase().includes('auto-fix'), 'Should contain Auto-fix rule');
  });

  it('contains blocking dependencies rule', () => {
    const content = fs.readFileSync(RULE_PATH, 'utf8');
    assert.ok(content.includes('blocking'), 'Should contain blocking dependencies rule');
  });

  it('contains Escalate rule for architectural decisions', () => {
    const content = fs.readFileSync(RULE_PATH, 'utf8');
    assert.ok(
      content.includes('Escalate') || content.includes('escalate'),
      'Should contain Escalate rule'
    );
  });

  it('contains Log rule for all deviations', () => {
    const content = fs.readFileSync(RULE_PATH, 'utf8');
    assert.ok(content.includes('Log') || content.includes('log'), 'Should contain Log rule');
  });
});
