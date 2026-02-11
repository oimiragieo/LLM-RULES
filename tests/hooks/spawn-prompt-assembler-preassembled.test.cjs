const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { spawn } = require('node:child_process');

const { generateRequiredPrefixFragment } = require('../../.claude/hooks/routing/spawn-prompt-assembler.cjs');

const HOOK_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '.claude',
  'hooks',
  'routing',
  'spawn-prompt-assembler.cjs'
);

function runHook(input) {
  return new Promise(resolve => {
    const proc = spawn('node', [HOOK_PATH], {
      env: {
        ...process.env,
        SPAWN_PROMPT_ASSEMBLER: 'on',
        SPAWN_PROMPT_SEMANTIC_MEMORY: 'off',
        MEMORY_INTENT_ANALYSIS: '0',
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

test('already assembled prompts preserve explicit allowed_tools (plus mandatory skill tools)', async () => {
  const taskId = 'task-preassembled-1';
  const prefix = generateRequiredPrefixFragment(taskId, 'Preassembled prompt test');
  const assembledPrompt = [
    prefix,
    '',
    '## AVAILABLE_TOOLS (2/2 tools available)',
    '',
    '- **TaskUpdate**',
    '- **TaskList**',
    '',
    '## AVAILABLE_SKILLS',
    '',
    '- **debugging**',
    '',
    '## SKILL DISCOVERY PROTOCOL',
    '',
    'Use Skill({ skill: "debugging" }) when needed.',
  ].join('\n');

  const result = await runHook({
    tool_name: 'Task',
    tool_input: {
      task_id: taskId,
      subagent_type: 'developer',
      description: 'Run a quick verification',
      prompt: assembledPrompt,
      allowed_tools: ['TaskUpdate', 'TaskList'],
    },
  });

  assert.equal(result.code, 0, `hook should succeed, stderr=${result.stderr}`);
  assert.ok(result.stdout.trim().length > 0, 'hook should output modified tool_input JSON');

  const output = JSON.parse(result.stdout);
  assert.ok(Array.isArray(output.tool_input.allowed_tools), 'allowed_tools should be an array');
  assert.ok(
    output.tool_input.allowed_tools.length <= 3,
    `expected explicit tool scope to stay tight, got ${JSON.stringify(output.tool_input.allowed_tools)}`
  );
  assert.ok(output.tool_input.allowed_tools.includes('TaskUpdate'));
  assert.ok(output.tool_input.allowed_tools.includes('TaskList'));
});
