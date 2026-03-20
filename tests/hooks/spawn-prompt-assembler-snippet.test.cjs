'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  appendSemanticMatches,
  appendQueryMemories,
  enforcePromptBudget,
  getPromptFingerprint,
  classifyPromptComplexity,
  shouldThrottleExpensiveEnrichment,
} = require('../../.claude/hooks/routing/spawn-prompt-assembler.cjs');

test('appendSemanticMatches prefers abstract over content', () => {
  const prompt = 'Base prompt';
  const results = [
    {
      content: 'Full content that should not be preferred',
      metadata: {
        abstract: 'Short abstract summary',
        overview: 'Longer overview',
      },
      similarity: 0.9,
      source: 'lancedb',
    },
  ];

  const output = appendSemanticMatches(prompt, results);
  assert.ok(output.includes('Short abstract summary'));
  assert.ok(!output.includes('Full content that should not be preferred'));
});

test('appendQueryMemories uses abstract when available', () => {
  const prompt = 'Base prompt';
  const results = [
    {
      content: 'Full content that should not be preferred',
      metadata: {
        abstract: 'Short abstract summary',
        overview: 'Longer overview',
      },
      similarity: 0.9,
      source: 'lancedb',
    },
  ];

  const output = appendQueryMemories(prompt, results);
  assert.ok(output.includes('Short abstract summary'));
  assert.ok(!output.includes('Full content that should not be preferred'));
});

test('enforcePromptBudget removes heavy context sections when prompt is oversized', () => {
  const oversized = [
    '# Base',
    'Essential task details.',
    '## Memory Context (Auto-Loaded)',
    'A'.repeat(45000),
    '## Agent Constitution',
    'B'.repeat(45000),
  ].join('\n\n');

  const output = enforcePromptBudget(oversized);
  assert.ok(output.length <= 40000);
  assert.ok(!output.includes('## Memory Context (Auto-Loaded)'));
});

test('enforcePromptBudget emits stderr JSON when SPAWN_PROMPT_BUDGET_LOG=on', () => {
  const prevLog = process.env.SPAWN_PROMPT_BUDGET_LOG;
  process.env.SPAWN_PROMPT_BUDGET_LOG = 'on';
  const errors = [];
  const origErr = console.error;
  console.error = (...args) => {
    errors.push(args.map(String).join(' '));
  };
  try {
    const oversized = ['# Base', '## Memory Context (Auto-Loaded)', 'A'.repeat(45000)].join('\n\n');

    enforcePromptBudget(oversized);

    const line = errors.find(e => e.includes('spawn_prompt_budget'));
    assert.ok(line, 'expected spawn_prompt_budget log line');
    const row = JSON.parse(line);
    assert.strictEqual(row.message, 'spawn_prompt_budget');
    assert.strictEqual(row.event, 'spawn_prompt_budget');
    assert.ok(Number(row.beforeChars) > 40000);
    assert.ok(Array.isArray(row.removedHeaders));
    assert.ok(row.afterChars <= 40000);
  } finally {
    console.error = origErr;
    if (prevLog === undefined) delete process.env.SPAWN_PROMPT_BUDGET_LOG;
    else process.env.SPAWN_PROMPT_BUDGET_LOG = prevLog;
  }
});

test('getPromptFingerprint is deterministic for same input', () => {
  const a = getPromptFingerprint({
    agentType: 'developer',
    allowedTools: ['Read', 'Write'],
    basePrompt: 'Hello',
  });
  const b = getPromptFingerprint({
    agentType: 'developer',
    allowedTools: ['Read', 'Write'],
    basePrompt: 'Hello',
  });
  assert.strictEqual(a, b);
});

test('classifyPromptComplexity marks long prompt as high', () => {
  const result = classifyPromptComplexity({ description: 'simple' }, 'x'.repeat(9000));
  assert.strictEqual(result, 'high');
});

test('shouldThrottleExpensiveEnrichment is disabled by default', () => {
  const prev = process.env.SPAWN_ADAPTIVE_ENRICHMENT;
  delete process.env.SPAWN_ADAPTIVE_ENRICHMENT;
  try {
    assert.strictEqual(
      shouldThrottleExpensiveEnrichment({ description: 'simple' }, 'small prompt'),
      false
    );
  } finally {
    if (prev === undefined) delete process.env.SPAWN_ADAPTIVE_ENRICHMENT;
    else process.env.SPAWN_ADAPTIVE_ENRICHMENT = prev;
  }
});

test('shouldThrottleExpensiveEnrichment throttles very large prompts when adaptive mode is enabled', () => {
  const prev = process.env.SPAWN_ADAPTIVE_ENRICHMENT;
  process.env.SPAWN_ADAPTIVE_ENRICHMENT = 'on';
  try {
    assert.strictEqual(
      shouldThrottleExpensiveEnrichment(
        { description: 'high complexity investigation with debugging and performance analysis' },
        'x'.repeat(22000)
      ),
      true
    );
  } finally {
    if (prev === undefined) delete process.env.SPAWN_ADAPTIVE_ENRICHMENT;
    else process.env.SPAWN_ADAPTIVE_ENRICHMENT = prev;
  }
});
