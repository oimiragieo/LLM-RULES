'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const cp = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const SPAWN_HOOK = path.join(PROJECT_ROOT, '.claude', 'hooks', 'routing', 'spawn-prompt-assembler.cjs');
const RUNTIME_TEST_DIR = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'tmp',
  `spawn-required-output-tools-${process.pid}`
);
const CONTRACTS_PATH = path.join(RUNTIME_TEST_DIR, 'task-output-contracts.json');
const METRICS_PATH = path.join(RUNTIME_TEST_DIR, 'task-output-enforcement-metrics.json');

const AGENTS = ['developer', 'researcher', 'architect', 'security-architect', 'qa'];

function runSpawn(agentType, allowedTools) {
  return cp.spawnSync(
    process.execPath,
    [SPAWN_HOOK],
    {
      input: JSON.stringify({
        session_id: `spawn-required-tools-${agentType}`,
        tool_name: 'Task',
        tool_input: {
          task_id: `task-required-tools-${agentType}`,
          subagent_type: agentType,
          description: 'Produce security review report',
          allowed_tools: allowedTools,
          prompt:
            'Analyze findings and write a detailed report to `.claude/context/reports/enforcement-check.md`.',
        },
      }),
      encoding: 'utf8',
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        TASK_OUTPUT_CONTRACTS_PATH: CONTRACTS_PATH,
        TASK_OUTPUT_METRICS_PATH: METRICS_PATH,
        SPAWN_PROMPT_MEMORY_QUERY: 'off',
        SPAWN_PROMPT_SEMANTIC_MEMORY: 'off',
        SPAWN_PROMPT_ENTITY_GRAPH: 'off',
        SPAWN_ADAPTIVE_ENRICHMENT: 'off',
      },
      shell: false,
    }
  );
}

test('cross-agent: explicit allowed_tools without Write/Edit are blocked when report output is required', async t => {
  for (const agentType of AGENTS) {
    await t.test(agentType, () => {
      const result = runSpawn(agentType, ['TaskUpdate', 'TaskList']);
      assert.equal(
        result.status,
        2,
        `expected block for ${agentType}, got ${result.status}: ${result.stdout || result.stderr}`
      );
      assert.match(
        result.stdout,
        /missing Write\/Edit|Required output artifact/i,
        `expected missing writer tools message for ${agentType}`
      );
    });
  }
});

test('cross-agent: explicit allowed_tools with Write are allowed when report output is required', async t => {
  for (const agentType of AGENTS) {
    await t.test(agentType, () => {
      const result = runSpawn(agentType, ['TaskUpdate', 'TaskList', 'Write']);
      assert.equal(
        result.status,
        0,
        `expected allow for ${agentType}, got ${result.status}: ${result.stdout || result.stderr}`
      );
    });
  }
});
