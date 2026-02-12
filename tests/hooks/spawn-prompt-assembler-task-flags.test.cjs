const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('spawn-prompt-assembler preserves/sets run_in_background for Task payloads', () => {
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
  assert.equal(output.tool_input.run_in_background, true);
});
