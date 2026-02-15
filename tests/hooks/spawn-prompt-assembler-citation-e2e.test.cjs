#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');

const HOOK_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'routing',
  'spawn-prompt-assembler.cjs'
);
const RAG_PRELOAD_PATH = path.join(PROJECT_ROOT, 'tests', 'fixtures', 'spawn-rag-memory-stub.preload.cjs');
const MEMORY_GOTCHAS_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'memory',
  'gotchas.json'
);

async function withTemporaryFile(filePath, temporaryContents, fn) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const existed = fs.existsSync(filePath);
  const original = existed ? fs.readFileSync(filePath, 'utf8') : null;
  fs.writeFileSync(filePath, temporaryContents, 'utf8');
  try {
    return await fn();
  } finally {
    if (existed) {
      fs.writeFileSync(filePath, original, 'utf8');
    } else if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true });
    }
  }
}

function runHook(input, env = {}, preloadPaths = []) {
  return new Promise((resolve, reject) => {
    const preloadArgs = preloadPaths.flatMap(preloadPath => ['--require', preloadPath]);
    const proc = spawn(process.execPath, [...preloadArgs, HOOK_PATH], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        SPAWN_PROMPT_ASSEMBLER: 'on',
        SPAWN_PROMPT_SEMANTIC_MEMORY: 'off',
        SPAWN_PROMPT_ENTITY_GRAPH: 'off',
        SPAWN_PROMPT_MEMORY_QUERY: 'off',
        SPAWN_ASSEMBLY_CACHE: 'off',
        MEMORY_INTENT_ANALYSIS: '0',
        ...env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });
    proc.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });
    proc.on('error', reject);
    proc.on('close', code => {
      resolve({ code: code ?? 0, stdout, stderr });
    });

    proc.stdin.write(JSON.stringify(input));
    proc.stdin.end();
  });
}

function parseHookOutput(result) {
  assert.equal(result.code, 0, `hook should succeed, stderr=${result.stderr}`);
  assert.ok(result.stdout.trim().length > 0, 'hook should output modified Task payload');
  return JSON.parse(result.stdout.trim());
}

function buildTaskInput(overrides = {}) {
  return {
    tool_name: 'Task',
    tool_input: {
      task_id: 'e2e-citation-001',
      subagent_type: 'developer',
      description: 'Investigate task updates and routing reliability',
      prompt: [
        'You are DEVELOPER.',
        '',
        '## PROJECT CONTEXT',
        `PROJECT_ROOT: ${PROJECT_ROOT}`,
        '',
        'Audit and improve reliability.',
      ].join('\n'),
      allowed_tools: ['TaskUpdate', 'TaskList', 'Read'],
      ...overrides,
    },
  };
}

test('hook e2e injects memory evidence IDs [mem:xxxxxxxx] for tier memory', async () => {
  const seededGotchas = JSON.stringify(
    [{ text: 'MEM_E2E_SENTINEL_ALWAYS_USE_TASKUPDATE_FIRST', timestamp: '2026-02-15T00:00:00.000Z' }],
    null,
    2
  );

  await withTemporaryFile(MEMORY_GOTCHAS_PATH, seededGotchas, async () => {
    const result = await runHook(buildTaskInput(), { RAG_AT_SPAWN: 'off' });
    const output = parseHookOutput(result);
    const prompt = output.tool_input.prompt;

    assert.match(prompt, /\[mem:[a-f0-9]{8}\]/, 'Expected memory evidence ID in injected prompt');
    assert.doesNotMatch(prompt, /\[rag:[a-f0-9]{8}\]/, 'RAG evidence should be absent when disabled');
  });
});

test('hook e2e injects RAG evidence IDs [rag:xxxxxxxx] when RAG search returns matches', async () => {
  const result = await runHook(
    buildTaskInput({ task_id: 'e2e-citation-002' }),
    {
    RAG_AT_SPAWN: 'on',
    },
    [RAG_PRELOAD_PATH]
  );
  const output = parseHookOutput(result);
  const prompt = output.tool_input.prompt;

  assert.match(prompt, /\[rag:[a-f0-9]{8}\]/, 'Expected RAG evidence ID in injected prompt');
  assert.match(
    prompt,
    /RAG_E2E_SENTINEL_USE_CANONICAL_TASKUPDATE_FLOW/,
    'Expected stubbed RAG sentinel content in prompt'
  );
});
