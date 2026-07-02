'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');
const { assembleSpawnPrompt } = require('../../.claude/lib/spawn/prompt-assembler.cjs');

const MEMORY_MANAGER_PATH = require.resolve('../../.claude/lib/memory/memory-manager.cjs');

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
  return fs.mkdtempSync(path.join(testRootBase, 'spawn-memory-fallback-'));
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

function withMockedMemoryManager(mockExports, fn) {
  const previous = require.cache[MEMORY_MANAGER_PATH];
  require.cache[MEMORY_MANAGER_PATH] = {
    id: MEMORY_MANAGER_PATH,
    filename: MEMORY_MANAGER_PATH,
    loaded: true,
    exports: mockExports,
  };

  try {
    return fn();
  } finally {
    if (previous) {
      require.cache[MEMORY_MANAGER_PATH] = previous;
    } else {
      delete require.cache[MEMORY_MANAGER_PATH];
    }
  }
}

test('observational mode falls back to legacy file-backed memory when memory manager load fails', () => {
  const root = createTempRoot();
  try {
    writeLegacyMemory(root);

    const output = withMockedMemoryManager(
      {
        loadMemoryForContext() {
          throw new Error('No such built-in module: node:sqlite');
        },
      },
      () =>
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
        )
    );

    assert.ok(output.includes('## Memory Context (Auto-Loaded)'));
    assert.ok(output.includes('legacy-gotcha-text'));
    assert.ok(output.includes('legacy-pattern-text'));
  } finally {
    cleanup(root);
  }
});
