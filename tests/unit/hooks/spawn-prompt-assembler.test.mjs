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
