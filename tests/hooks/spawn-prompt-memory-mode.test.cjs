'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');

const {
  assembleSpawnPrompt,
  estimateTokens,
} = require('../../.claude/lib/spawn/prompt-assembler.cjs');
const {
  appendSemanticMatches,
  shouldUseTierB,
} = require('../../.claude/hooks/routing/spawn-prompt-assembler.cjs');

const BASE_PROMPT = `You are DEVELOPER.

## Memory Protocol
1. Load memory first.
2. Persist learnings.

## PROJECT CONTEXT
PROJECT_ROOT: C:\\dev\\projects\\agent-studio

## Instructions
Implement the task safely.`;

function withEnv(vars, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(vars)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function createTempRoot() {
  const testRootBase = path.join(PROJECT_ROOT, '.claude', 'staging');
  fs.mkdirSync(testRootBase, { recursive: true });
  return fs.mkdtempSync(path.join(testRootBase, 'spawn-memory-mode-'));
}

function cleanup(root) {
  if (root && fs.existsSync(root)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writeLegacyMemory(root) {
  const memoryDir = path.join(root, '.claude', 'context', 'memory');
  fs.mkdirSync(memoryDir, { recursive: true });
  fs.writeFileSync(
    path.join(memoryDir, 'gotchas.json'),
    JSON.stringify(
      [{ text: 'legacy-gotcha-text', timestamp: '2026-02-12T00:00:00.000Z' }],
      null,
      2
    ),
    'utf8'
  );
  fs.writeFileSync(
    path.join(memoryDir, 'patterns.json'),
    JSON.stringify(
      [{ text: 'legacy-pattern-text', timestamp: '2026-02-12T00:00:00.000Z' }],
      null,
      2
    ),
    'utf8'
  );
}

function writeObservationalMemory(root, { summaryLength = 120, count = 3 } = {}) {
  const memoryDir = path.join(root, '.claude', 'context', 'memory');
  fs.mkdirSync(memoryDir, { recursive: true });
  fs.writeFileSync(
    path.join(memoryDir, 'observations_summary.md'),
    'S'.repeat(summaryLength),
    'utf8'
  );
  const lines = [];
  for (let i = 0; i < count; i++) {
    lines.push(
      JSON.stringify({
        timestamp: `2026-02-1${i}T00:00:00.000Z`,
        topic: 'observability',
        fact: `observation-fact-${i}-` + 'x'.repeat(120),
        confidence: 1 - i * 0.1,
        source_session: `session-${i}`,
      })
    );
  }
  fs.writeFileSync(path.join(memoryDir, 'observations.jsonl'), lines.join('\n') + '\n', 'utf8');
}

function sectionBetween(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  if (start === -1) return '';
  const afterStart = text.slice(start + startMarker.length);
  const end = endMarker ? afterStart.indexOf(endMarker) : -1;
  if (end === -1) return afterStart.trim();
  return afterStart.slice(0, end).trim();
}

function getMemoryCacheStabilityPath(root) {
  return path.join(root, '.claude', 'context', 'metrics', 'memory-cache-stability.jsonl');
}

test('MEMORY_MODE=observational uses observational section and excludes legacy gotchas/patterns', () => {
  const root = createTempRoot();
  try {
    writeLegacyMemory(root);
    writeObservationalMemory(root);

    const output = withEnv(
      {
        MEMORY_MODE: 'observational',
        OBSERVATIONAL_MEMORY_ENABLED: 'on',
      },
      () =>
        assembleSpawnPrompt({
          agentType: 'developer',
          allowedTools: ['Read', 'TaskUpdate', 'TaskList', 'Skill'],
          basePrompt: BASE_PROMPT,
          includeMemory: true,
          projectRoot: root,
        })
    );

    assert.ok(output.includes('## Observational Memory Context'));
    assert.ok(output.includes('### Observational summary'));
    assert.ok(output.includes('### Recent observations'));
    assert.ok(!output.includes('### Gotchas (Pitfalls to Avoid)'));
    assert.ok(!output.includes('### Patterns (Reusable Solutions)'));
  } finally {
    cleanup(root);
  }
});

test('observational mode falls back to legacy memory section when observational data is missing', () => {
  const root = createTempRoot();
  try {
    writeLegacyMemory(root);

    const output = withEnv(
      {
        MEMORY_MODE: 'observational',
        OBSERVATIONAL_MEMORY_ENABLED: 'on',
      },
      () =>
        assembleSpawnPrompt({
          agentType: 'developer',
          allowedTools: ['Read', 'TaskUpdate', 'TaskList', 'Skill'],
          basePrompt: BASE_PROMPT,
          includeMemory: true,
          projectRoot: root,
        })
    );

    assert.ok(output.includes('## Memory Context (Auto-Loaded)'));
    assert.ok(output.includes('legacy-gotcha-text'));
  } finally {
    cleanup(root);
  }
});

test('observational mode falls back to legacy memory section when observations.jsonl exists but is empty', () => {
  const root = createTempRoot();
  try {
    writeLegacyMemory(root);
    const memoryDir = path.join(root, '.claude', 'context', 'memory');
    fs.mkdirSync(memoryDir, { recursive: true });
    fs.writeFileSync(path.join(memoryDir, 'observations.jsonl'), '', 'utf8');

    const output = withEnv(
      {
        MEMORY_MODE: 'observational',
        OBSERVATIONAL_MEMORY_ENABLED: 'on',
      },
      () =>
        assembleSpawnPrompt({
          agentType: 'developer',
          allowedTools: ['Read', 'TaskUpdate', 'TaskList', 'Skill'],
          basePrompt: BASE_PROMPT,
          includeMemory: true,
          projectRoot: root,
        })
    );

    assert.ok(output.includes('## Memory Context (Auto-Loaded)'));
    assert.ok(output.includes('legacy-gotcha-text'));
    assert.ok(!output.includes('## Observational Memory Context'));
  } finally {
    cleanup(root);
  }
});

test('OBSERVATIONAL_MEMORY_ENABLED=off forces hybrid mode even if MEMORY_MODE=observational', () => {
  const root = createTempRoot();
  try {
    writeLegacyMemory(root);
    writeObservationalMemory(root);

    const output = withEnv(
      {
        MEMORY_MODE: 'observational',
        OBSERVATIONAL_MEMORY_ENABLED: 'off',
      },
      () =>
        assembleSpawnPrompt({
          agentType: 'developer',
          allowedTools: ['Read', 'TaskUpdate', 'TaskList', 'Skill'],
          basePrompt: BASE_PROMPT,
          includeMemory: true,
          projectRoot: root,
        })
    );

    assert.ok(output.includes('## Memory Context (Auto-Loaded)'));
    assert.ok(!output.includes('## Observational Memory Context'));
  } finally {
    cleanup(root);
  }
});

test('section-based caps bound observational summary and recent observations sections', () => {
  const root = createTempRoot();
  try {
    writeObservationalMemory(root, { summaryLength: 5000, count: 20 });

    const output = withEnv(
      {
        MEMORY_MODE: 'observational',
        OBSERVATIONAL_MEMORY_ENABLED: 'on',
        MEMORY_SUMMARY_BLOCK_MAX_TOKENS: '30',
        MEMORY_RECENT_OBSERVATIONS_MAX_TOKENS: '20',
        MEMORY_TIER_B_MAX_TOKENS: '15',
      },
      () =>
        assembleSpawnPrompt({
          agentType: 'developer',
          allowedTools: ['Read', 'TaskUpdate', 'TaskList', 'Skill'],
          basePrompt: BASE_PROMPT,
          includeMemory: true,
          projectRoot: root,
        })
    );

    const summary = sectionBetween(output, '### Observational summary', '### Recent observations');
    const recent = sectionBetween(output, '### Recent observations', '\n## ');

    assert.ok(
      estimateTokens(summary) <= 31,
      `summary tokens exceeded cap: ${estimateTokens(summary)}`
    );
    assert.ok(
      estimateTokens(recent) <= 21,
      `recent tokens exceeded cap: ${estimateTokens(recent)}`
    );
  } finally {
    cleanup(root);
  }
});

test('Tier B semantic section respects MEMORY_TIER_B_MAX_TOKENS cap', () => {
  const base = [
    '## Memory Context (Auto-Loaded)',
    '_Recent learnings from past sessions_',
    '',
    '## Instructions',
    'Do the thing.',
  ].join('\n');

  const results = [
    {
      source: 'lancedb',
      similarity: 0.98,
      content: 'very-long-semantic-content ' + 'x'.repeat(2000),
      metadata: {},
    },
  ];

  const output = withEnv({ MEMORY_TIER_B_MAX_TOKENS: '12' }, () =>
    appendSemanticMatches(base, results)
  );

  const semanticSection = sectionBetween(
    output,
    '### Semantic Matches (ContextualMemory)',
    '\n## '
  );
  assert.ok(
    estimateTokens(semanticSection) <= 13,
    `semantic section exceeded cap: ${estimateTokens(semanticSection)}`
  );
});

test('observational mode Tier B gate is off for routine prompts without memory_depth', () => {
  const toolInput = {
    description: 'Implement a small refactor for existing code',
    memory_depth: false,
  };
  assert.equal(shouldUseTierB(toolInput, 'Routine task with clear requirements'), false);
});

test('observational mode Tier B gate turns on for exploratory/debug prompts', () => {
  const toolInput = {
    description: 'Investigate why this flow is failing intermittently',
    memory_depth: false,
  };
  assert.equal(shouldUseTierB(toolInput, 'Need to debug root cause in memory behavior'), true);
});

test('observational mode Tier B gate turns on when memory_depth=true', () => {
  const toolInput = {
    description: 'Routine task',
    memory_depth: true,
  };
  assert.equal(shouldUseTierB(toolInput, 'Simple work item'), true);
});

test('spawn-prompt-assembler hook e2e: observational mode returns valid modified tool_input prompt', () => {
  const hookPath = path.join(
    PROJECT_ROOT,
    '.claude',
    'hooks',
    'routing',
    'spawn-prompt-assembler.cjs'
  );
  const payload = {
    session_id: 'test-session-observational',
    tool_name: 'Task',
    tool_input: {
      task_id: 'obs-e2e-001',
      subagent_type: 'developer',
      description: 'Routine implementation task',
      prompt: BASE_PROMPT,
      allowed_tools: ['Read', 'TaskUpdate', 'TaskList', 'Skill'],
      memory_depth: false,
    },
  };

  const result = cp.spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: {
      ...process.env,
      MEMORY_MODE: 'observational',
      OBSERVATIONAL_MEMORY_ENABLED: 'on',
      SPAWN_PROMPT_SEMANTIC_MEMORY: 'on',
      SPAWN_PROMPT_ENTITY_GRAPH: 'on',
      SPAWN_PROMPT_MEMORY_QUERY: 'off',
      SPAWN_ADAPTIVE_ENRICHMENT: 'off',
    },
    shell: false,
  });

  assert.equal(result.status, 0, `hook failed: ${result.stderr || result.stdout}`);
  const output = JSON.parse(result.stdout.trim());
  assert.ok(output.tool_input);
  assert.ok(typeof output.tool_input.prompt === 'string');
  assert.ok(output.tool_input.prompt.includes('## Memory Protocol'));
  assert.ok(output.tool_input.prompt.includes('PROJECT_ROOT'));
});

test('assembleSpawnPrompt records memory cache stability churn metrics', () => {
  const root = createTempRoot();
  try {
    writeObservationalMemory(root, { summaryLength: 120, count: 3 });
    const metricsPath = getMemoryCacheStabilityPath(root);

    withEnv(
      {
        MEMORY_MODE: 'observational',
        OBSERVATIONAL_MEMORY_ENABLED: 'on',
      },
      () =>
        assembleSpawnPrompt({
          agentType: 'developer',
          allowedTools: ['Read', 'TaskUpdate', 'TaskList', 'Skill'],
          basePrompt: BASE_PROMPT,
          includeMemory: true,
          projectRoot: root,
        })
    );

    withEnv(
      {
        MEMORY_MODE: 'observational',
        OBSERVATIONAL_MEMORY_ENABLED: 'on',
      },
      () =>
        assembleSpawnPrompt({
          agentType: 'developer',
          allowedTools: ['Read', 'TaskUpdate', 'TaskList', 'Skill'],
          basePrompt: BASE_PROMPT,
          includeMemory: true,
          projectRoot: root,
        })
    );

    fs.writeFileSync(
      path.join(root, '.claude', 'context', 'memory', 'observations_summary.md'),
      'Changed summary content',
      'utf8'
    );

    withEnv(
      {
        MEMORY_MODE: 'observational',
        OBSERVATIONAL_MEMORY_ENABLED: 'on',
      },
      () =>
        assembleSpawnPrompt({
          agentType: 'developer',
          allowedTools: ['Read', 'TaskUpdate', 'TaskList', 'Skill'],
          basePrompt: BASE_PROMPT,
          includeMemory: true,
          projectRoot: root,
        })
    );

    const lines = fs.readFileSync(metricsPath, 'utf8').split('\n').filter(Boolean);
    assert.ok(lines.length >= 3);
    const entries = lines.map(line => JSON.parse(line));
    const last = entries[entries.length - 1];
    assert.equal(typeof last.memory_block_hash, 'string');
    assert.equal(typeof last.churned, 'boolean');
    assert.equal(last.churned, true);
  } finally {
    cleanup(root);
  }
});
