const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('spawn-prompt-assembler defaults to foreground and blocks background for non-allowlisted agents', () => {
  const scriptPath = path.join(
    __dirname,
    '..',
    '..',
    '.claude',
    'hooks',
    'routing',
    'spawn-prompt-assembler.cjs'
  );

  const payload = {
    tool_name: 'Task',
    tool_input: {
      description: 'Flag preservation test',
      prompt: 'Investigate code quality issues in hooks.',
      subagent_type: 'code-reviewer',
      task_id: 'task-run-background-preserve',
      allowed_tools: ['TaskUpdate', 'TaskList'],
    },
    session_id: 'session-run-background-preserve',
  };

  const proc = spawnSync(process.execPath, [scriptPath], {
    cwd: path.join(__dirname, '..', '..'),
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: {
      ...process.env,
      SPAWN_PROMPT_ASSEMBLER: 'on',
    },
  });

  assert.equal(proc.status, 0, `Expected success. stderr: ${proc.stderr || ''}`);
  assert.ok(proc.stdout && proc.stdout.trim().length > 0, 'Expected JSON hook output');

  const output = JSON.parse(proc.stdout.trim());
  assert.ok(output.tool_input, 'Expected tool_input payload from hook');
  assert.equal(output.tool_input.run_in_background, false);

  const payloadExplicit = {
    ...payload,
    tool_input: {
      ...payload.tool_input,
      task_id: 'task-run-background-explicit',
      run_in_background: true,
    },
  };

  const procExplicit = spawnSync(process.execPath, [scriptPath], {
    cwd: path.join(__dirname, '..', '..'),
    input: JSON.stringify(payloadExplicit),
    encoding: 'utf8',
    env: {
      ...process.env,
      SPAWN_PROMPT_ASSEMBLER: 'on',
    },
  });

  assert.equal(procExplicit.status, 0, `Expected success. stderr: ${procExplicit.stderr || ''}`);
  const outputExplicit = JSON.parse(procExplicit.stdout.trim());
  assert.equal(outputExplicit.tool_input.run_in_background, false);
});

test('spawn-prompt-assembler allows explicit background for allowlisted agents', () => {
  const scriptPath = path.join(
    __dirname,
    '..',
    '..',
    '.claude',
    'hooks',
    'routing',
    'spawn-prompt-assembler.cjs'
  );

  const payload = {
    tool_name: 'Task',
    tool_input: {
      description: 'Background integrator test',
      prompt: 'Process integration queue.',
      subagent_type: 'artifact-integrator',
      task_id: 'task-run-background-allowlisted',
      run_in_background: true,
      allowed_tools: ['TaskUpdate', 'TaskList'],
    },
    session_id: 'session-run-background-allowlisted',
  };

  const proc = spawnSync(process.execPath, [scriptPath], {
    cwd: path.join(__dirname, '..', '..'),
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: {
      ...process.env,
      SPAWN_PROMPT_ASSEMBLER: 'on',
    },
  });

  assert.equal(proc.status, 0, `Expected success. stderr: ${proc.stderr || ''}`);
  const output = JSON.parse(proc.stdout.trim());
  assert.equal(output.tool_input.run_in_background, true);
});
