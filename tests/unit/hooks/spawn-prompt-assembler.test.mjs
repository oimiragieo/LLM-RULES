import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const hook = require('../../../.claude/hooks/routing/spawn-prompt-assembler.cjs');

test('looksAssembled returns true when tool/skill sections are present', () => {
  const prompt = ['## AVAILABLE_TOOLS', '## AVAILABLE_SKILLS', '## SKILL DISCOVERY PROTOCOL'].join(
    '\n'
  );
  assert.equal(hook.looksAssembled(prompt), true);
});

test('looksAssembled returns false when missing sections', () => {
  assert.equal(hook.looksAssembled('hello'), false);
  assert.equal(hook.looksAssembled('## AVAILABLE_TOOLS\nhi'), false);
});

test('appendSemanticMatches appends a semantic section', () => {
  const prompt = '## Memory Context (Auto-Loaded)\n\nHello';
  const out = hook.appendSemanticMatches(prompt, [
    {
      source: 'keyword',
      similarity: null,
      metadata: { path: 'learnings.md' },
      content: 'foo bar baz',
    },
  ]);
  assert.ok(out.includes('### Semantic Matches (ContextualMemory)'));
  assert.ok(out.includes('learnings.md'));
});

test('inferAgentFromPrompt extracts agent from "You are X"', () => {
  assert.equal(hook.inferAgentFromPrompt('You are DEVELOPER.'), 'developer');
  assert.equal(hook.inferAgentFromPrompt('You are the ARCHITECT'), 'architect');
  assert.equal(hook.inferAgentFromPrompt('Hello world'), null);
});

test('enrichAllowedTools returns currentTools when enricher disabled', () => {
  const prev = process.env.ALLOWED_TOOLS_ENRICHER;
  process.env.ALLOWED_TOOLS_ENRICHER = 'off';
  const result = hook.enrichAllowedTools('developer', ['Read', 'Write'], '');
  process.env.ALLOWED_TOOLS_ENRICHER = prev;
  assert.deepEqual(result, ['Read', 'Write']);
});

test('enrichAllowedTools returns array (merged or current when no registry)', () => {
  const prev = process.env.ALLOWED_TOOLS_ENRICHER;
  process.env.ALLOWED_TOOLS_ENRICHER = '';
  const result = hook.enrichAllowedTools('developer', ['Read'], '');
  process.env.ALLOWED_TOOLS_ENRICHER = prev;
  assert.ok(Array.isArray(result));
  assert.ok(result.includes('Read'));
});
