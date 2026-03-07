'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SKILL_PATH = path.resolve(__dirname, '../../../.claude/skills/scheduled-tasks/SKILL.md');

describe('scheduled-tasks SKILL.md', () => {
  test('SKILL.md exists at expected path', () => {
    assert.ok(fs.existsSync(SKILL_PATH), `SKILL.md not found at ${SKILL_PATH}`);
  });

  test('SKILL.md contains CronCreate tool reference', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(content.includes('CronCreate'), 'SKILL.md should reference CronCreate');
  });

  test('SKILL.md contains CronDelete tool reference', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(content.includes('CronDelete'), 'SKILL.md should reference CronDelete');
  });

  test('SKILL.md contains CronList tool reference', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(content.includes('CronList'), 'SKILL.md should reference CronList');
  });

  test('SKILL.md reschedule pattern: CronCreate appears before CronDelete in auto-reschedule section', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');

    // Find the reschedule section
    const rescheduleSectionIndex = content.indexOf('### Reschedule a Specific Task');
    assert.ok(
      rescheduleSectionIndex !== -1,
      'SKILL.md should contain a "Reschedule a Specific Task" section'
    );

    // Extract the section content (up to next section or end of file)
    const sectionContent = content.slice(rescheduleSectionIndex);
    const nextSectionIndex = sectionContent.indexOf('\n### ', 1);
    const rescheduleSection =
      nextSectionIndex !== -1 ? sectionContent.slice(0, nextSectionIndex) : sectionContent;

    // Find positions of CronCreate and CronDelete within the reschedule section
    const cronCreateIndex = rescheduleSection.indexOf('CronCreate');
    const cronDeleteIndex = rescheduleSection.indexOf('CronDelete');

    assert.ok(cronCreateIndex !== -1, 'Reschedule section should contain CronCreate');
    assert.ok(cronDeleteIndex !== -1, 'Reschedule section should contain CronDelete');
    assert.ok(
      cronCreateIndex < cronDeleteIndex,
      `CronCreate (index ${cronCreateIndex}) must appear before CronDelete (index ${cronDeleteIndex}) in the reschedule section to prevent scheduling gaps`
    );
  });

  test('SKILL.md has heartbeat pattern reference', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(
      content.includes('HEARTBEAT_OK') || content.includes('Heartbeat Pattern'),
      'SKILL.md should reference heartbeat pattern'
    );
  });

  test('SKILL.md has auto-reschedule section', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(
      content.includes('Auto-Reschedule'),
      'SKILL.md should have an auto-reschedule section'
    );
  });
});
