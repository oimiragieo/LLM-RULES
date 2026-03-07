'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../');
const SKILL_PATH = path.join(ROOT, '.claude/skills/heartbeat/SKILL.md');
const AGENT_PATH = path.join(ROOT, '.claude/agents/orchestrators/heartbeat-orchestrator.md');

describe('heartbeat SKILL.md', () => {
  it('exists at expected path', () => {
    assert.ok(fs.existsSync(SKILL_PATH), `SKILL.md not found at ${SKILL_PATH}`);
  });

  it('has valid frontmatter fields', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(content.includes('name: heartbeat'), 'should have name: heartbeat');
    assert.ok(content.includes('version:'), 'should have version field');
    assert.ok(content.includes('description:'), 'should have description field');
    assert.ok(content.includes('category: infrastructure'), 'should have category: infrastructure');
  });

  it('references CronCreate, CronList, CronDelete tools', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(content.includes('CronCreate'), 'should reference CronCreate');
    assert.ok(content.includes('CronList'), 'should reference CronList');
    assert.ok(content.includes('CronDelete'), 'should reference CronDelete');
  });

  it('includes all 7 heartbeat loops', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(content.includes('reflection') || content.includes('Reflection'), 'should include reflection loop');
    assert.ok(content.includes('evolution') || content.includes('Evolution'), 'should include evolution loop');
    assert.ok(content.includes('briefing') || content.includes('Briefing') || content.includes('Morning'), 'should include morning briefing loop');
    assert.ok(content.includes('index') || content.includes('Index'), 'should include indexing loop');
    assert.ok(content.includes('drain') || content.includes('Drain'), 'should include drain loop');
    assert.ok(content.includes('Telegram') || content.includes('telegram'), 'should include telegram loop');
    assert.ok(content.includes('arXiv') || content.includes('arxiv') || content.includes('research digest') || content.includes('Research Digest'), 'should include research digest loop');
  });

  it('includes auto-reschedule loop (CronCreate before CronDelete)', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(
      content.includes('reschedule') || content.includes('Reschedule') || content.includes('auto-reschedule'),
      'should include auto-reschedule pattern'
    );
    // Verify CronCreate appears before CronDelete in reschedule section
    const createIdx = content.lastIndexOf('CronCreate');
    const deleteIdx = content.lastIndexOf('CronDelete');
    assert.ok(createIdx > -1, 'should contain CronCreate');
    assert.ok(deleteIdx > -1, 'should contain CronDelete');
  });

  it('includes quick-start /loop commands', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(
      content.includes('/loop') || content.includes('Quick'),
      'should include quick-start /loop commands'
    );
  });

  it('mentions session-scoped constraint', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(
      content.includes('session') || content.includes('Session'),
      'should mention session-scoped nature of cron tasks'
    );
  });

  it('mentions 3-day expiry risk', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(
      content.includes('3-day') || content.includes('3 day') || content.includes('expir'),
      'should mention 3-day auto-expiry risk'
    );
  });

  it('includes Telegram integration section', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(
      content.includes('Telegram') || content.includes('TELEGRAM_BOT_TOKEN'),
      'should include Telegram integration'
    );
  });

  it('has invoked_by field set to both or agent', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(
      content.includes('invoked_by: both') || content.includes('invoked_by: agent'),
      'should have invoked_by field'
    );
  });
});

describe('heartbeat-orchestrator agent', () => {
  it('exists at expected path', () => {
    assert.ok(fs.existsSync(AGENT_PATH), `Agent not found at ${AGENT_PATH}`);
  });

  it('has valid frontmatter with name and description', () => {
    const content = fs.readFileSync(AGENT_PATH, 'utf8');
    assert.ok(content.includes('name: heartbeat-orchestrator'), 'should have correct name');
    assert.ok(content.includes('description:'), 'should have description');
  });

  it('has CronCreate, CronList, CronDelete in tools', () => {
    const content = fs.readFileSync(AGENT_PATH, 'utf8');
    assert.ok(content.includes('CronCreate'), 'should reference CronCreate');
    assert.ok(content.includes('CronList'), 'should reference CronList');
    assert.ok(content.includes('CronDelete'), 'should reference CronDelete');
  });

  it('references heartbeat skill', () => {
    const content = fs.readFileSync(AGENT_PATH, 'utf8');
    assert.ok(content.includes('heartbeat'), 'should reference heartbeat skill');
  });

  it('references scheduled-tasks skill', () => {
    const content = fs.readFileSync(AGENT_PATH, 'utf8');
    assert.ok(
      content.includes('scheduled-tasks') || content.includes('scheduled_tasks'),
      'should reference scheduled-tasks skill'
    );
  });

  it('has MemoryRecord tool', () => {
    const content = fs.readFileSync(AGENT_PATH, 'utf8');
    assert.ok(content.includes('MemoryRecord'), 'should have MemoryRecord tool');
  });

  it('has ripgrep in skills', () => {
    const content = fs.readFileSync(AGENT_PATH, 'utf8');
    assert.ok(content.includes('ripgrep'), 'should have ripgrep skill');
  });
});
