'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('Spawn template MemoryRecord enforcement', () => {
  const templatePath = path.join(
    __dirname,
    '../../../.claude/templates/spawn/universal-agent-spawn.md'
  );

  it('contains MANDATORY MemoryRecord language', () => {
    const content = fs.readFileSync(templatePath, 'utf8');
    assert.ok(content.includes('MANDATORY'), 'Template should contain MANDATORY');
    assert.ok(content.includes('MemoryRecord'), 'Template should mention MemoryRecord');
    assert.ok(
      content.includes('Zero MemoryRecord calls'),
      'Template should warn about zero calls'
    );
  });

  it('documents memoriesRecorded in completion contract', () => {
    const content = fs.readFileSync(templatePath, 'utf8');
    assert.ok(
      content.includes('memoriesRecorded'),
      'Template should document memoriesRecorded field'
    );
  });
});
