'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../');
const SKILL_PATH = path.join(ROOT, '.claude/skills/telegram-polling/SKILL.md');

describe('telegram-polling SKILL.md', () => {
  it('exists at expected path', () => {
    assert.ok(fs.existsSync(SKILL_PATH), `SKILL.md not found at ${SKILL_PATH}`);
  });

  it('has valid frontmatter fields', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(content.includes('name: telegram-polling'), 'should have name: telegram-polling');
    assert.ok(content.includes('version:'), 'should have version field');
    assert.ok(content.includes('description:'), 'should have description field');
    assert.ok(content.includes('category: infrastructure'), 'should have category: infrastructure');
  });

  it('references CronCreate for heartbeat loop registration', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(content.includes('CronCreate'), 'should reference CronCreate');
  });

  it('includes offset tracking pattern', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(
      content.includes('offset') && content.includes('telegram-offset.json'),
      'should include offset tracking with state file'
    );
  });

  it('includes DM pairing security gate', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(
      content.includes('pairing') || content.includes('allowlist'),
      'should include DM pairing security gate'
    );
  });

  it('includes TELEGRAM_BOT_TOKEN configuration', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(
      content.includes('TELEGRAM_BOT_TOKEN'),
      'should reference TELEGRAM_BOT_TOKEN env var'
    );
  });

  it('includes getUpdates API reference', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(content.includes('getUpdates'), 'should reference Telegram getUpdates API');
  });

  it('includes sendMessage API reference', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(content.includes('sendMessage'), 'should reference Telegram sendMessage API');
  });

  it('mentions final-only reply constraint (no streaming)', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(
      content.includes('final') || content.includes('streaming') || content.includes('FINAL'),
      'should mention final-only reply requirement'
    );
  });

  it('includes retry handling for 429 rate limit', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(
      content.includes('429') || content.includes('retry'),
      'should include retry handling for rate limits'
    );
  });

  it('includes session tracking for multi-turn conversations', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(
      content.includes('session') || content.includes('multi-turn'),
      'should include session tracking for multi-turn conversations'
    );
  });

  it('mentions Discord webhook as alternative for send-only', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(
      content.includes('Discord') || content.includes('webhook'),
      'should mention Discord webhook for send-only pattern'
    );
  });

  it('includes agent routing table', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(
      content.includes('general-assistant') || content.includes('routing'),
      'should include agent routing guidance'
    );
  });

  it('has invoked_by field set to both or agent', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(
      content.includes('invoked_by: both') || content.includes('invoked_by: agent'),
      'should have invoked_by field'
    );
  });

  it('references heartbeat skill dependency', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(content.includes('heartbeat'), 'should reference heartbeat skill');
  });

  it('warns against raw JSON.parse (SE-02 compliance)', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(
      content.includes('safeParseJSON') || content.includes('SE-02'),
      'should reference safeParseJSON or SE-02'
    );
  });

  it('wraps user message content in untrusted delimiters', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(
      content.includes('untrusted') || content.includes('<untrusted_user_message>'),
      'should use untrusted delimiters for user message'
    );
  });
});
