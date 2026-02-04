'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  insertContextModeSection,
} = require('../../.claude/hooks/routing/spawn-prompt-assembler.cjs');

test('insertContextModeSection inserts before next header after discovery section', () => {
  const prompt = [
    'Intro line',
    '## SKILL DISCOVERY PROTOCOL',
    'Some discovery content',
    '',
    '## Memory Context (Auto-Loaded)',
    'Memory content',
  ].join('\n');
  const fragment = '## Context / Mode\n\nPlanning mode prompt';

  const output = insertContextModeSection(prompt, fragment);
  assert.ok(output.includes('## Context / Mode'));
  assert.ok(output.indexOf('## Context / Mode') < output.indexOf('## Memory Context (Auto-Loaded)'));
});

test('insertContextModeSection does not duplicate fragment', () => {
  const prompt = [
    'Intro',
    '## Context / Mode',
    'Existing',
    '## SKILL DISCOVERY PROTOCOL',
    'Discovery',
  ].join('\n');

  const output = insertContextModeSection(prompt, '## Context / Mode\n\nNew');
  const firstIdx = output.indexOf('## Context / Mode');
  const lastIdx = output.lastIndexOf('## Context / Mode');
  assert.equal(firstIdx, lastIdx);
});
