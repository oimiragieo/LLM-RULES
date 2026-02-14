#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');

const HOOK_PATH = path.join(PROJECT_ROOT, '.claude', 'hooks', 'routing', 'spawn-prompt-assembler.cjs');

function runHook(input, env = {}) {
  return new Promise(resolve => {
    const proc = spawn('node', [HOOK_PATH], {
      env: {
        ...process.env,
        SPAWN_PROMPT_ASSEMBLER: 'on',
        SPAWN_PROMPT_SEMANTIC_MEMORY: 'off',
        MEMORY_INTENT_ANALYSIS: '0',
        ...env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', data => {
      stdout += data.toString();
    });
    proc.stderr.on('data', data => {
      stderr += data.toString();
    });
    proc.on('close', code => {
      resolve({ code: code ?? 0, stdout, stderr });
    });

    proc.stdin.write(JSON.stringify(input));
    proc.stdin.end();
  });
}

test('spawn-prompt-assembler emits RAG telemetry when RAG is disabled', async () => {
  const result = await runHook(
    {
      tool_name: 'Task',
      tool_input: {
        task_id: 'task-rag-telemetry-1',
        subagent_type: 'developer',
        description: 'Audit error handling and test failures',
        prompt: [
          'You are DEVELOPER.',
          '',
          '## PROJECT CONTEXT',
          `PROJECT_ROOT: ${PROJECT_ROOT}`,
          '',
          'Find code issues and propose fixes.',
        ].join('\n'),
        allowed_tools: ['TaskUpdate', 'TaskList', 'Read'],
      },
    },
    {
      RAG_AT_SPAWN: 'off',
    }
  );

  assert.equal(result.code, 0, `hook should succeed, stderr=${result.stderr}`);
  assert.ok(result.stdout.trim().length > 0, 'hook should output modified Task payload');
  assert.match(
    result.stderr,
    /"message":"spawn_rag_status"/,
    `expected spawn_rag_status telemetry in stderr; got ${result.stderr}`
  );
  assert.match(
    result.stderr,
    /"enabled":false/,
    `expected telemetry to include enabled=false; got ${result.stderr}`
  );
});

