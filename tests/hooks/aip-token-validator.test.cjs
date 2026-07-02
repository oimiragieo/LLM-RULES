'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { issueToken, _resetKeyCache } = require('../../.claude/lib/aip/capability-tokens.cjs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const HOOK_PATH = path.join(PROJECT_ROOT, '.claude', 'hooks', 'routing', 'aip-token-validator.cjs');
const TEST_SECRET = 'aip-validator-test-secret';

function makeToken(capabilities) {
  process.env.AIP_TOKEN_SECRET = TEST_SECRET;
  _resetKeyCache();
  return issueToken('router', 'developer', capabilities, 3600);
}

function runValidator(payload) {
  return spawnSync(process.execPath, [HOOK_PATH], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: {
      ...process.env,
      AIP_TOKEN_SECRET: TEST_SECRET,
      AIP_TOKENS: 'on',
    },
    timeout: 5000,
  });
}

test('aip-token-validator rejects token that lacks an explicitly requested tool', () => {
  const token = makeToken(['Read']);
  const result = runValidator({
    tool_name: 'Task',
    tool_input: {
      subagent_type: 'developer',
      allowed_tools: ['Read', 'Bash'],
      _aip_token: token,
    },
  });

  assert.equal(result.status, 2);
  const output = JSON.parse(result.stdout);
  assert.equal(output.allow, false);
  assert.match(output.message, /capability/i);
});

test('aip-token-validator accepts token that covers every explicitly requested tool', () => {
  const token = makeToken(['Read', 'Bash', 'TaskUpdate']);
  const result = runValidator({
    tool_name: 'Task',
    tool_input: {
      subagent_type: 'developer',
      allowed_tools: ['Read', 'Bash'],
      _aip_token: token,
    },
  });

  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.allow, true);
});

test('aip-token-validator falls back to Read when no explicit allowed_tools are present', () => {
  const token = makeToken(['Read']);
  const result = runValidator({
    tool_name: 'Task',
    tool_input: {
      subagent_type: 'developer',
      _aip_token: token,
    },
  });

  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.allow, true);
});
