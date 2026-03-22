'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const path = require('path');

const HOOK_PATH = path.resolve('.claude/hooks/safety/dlp-pretool.cjs');

function runHook(input, env = {}) {
  try {
    const result = execFileSync('node', [HOOK_PATH, JSON.stringify(input)], {
      encoding: 'utf8',
      timeout: 5000,
      env: { ...process.env, ...env },
    });
    return { exitCode: 0, stdout: result, stderr: '' };
  } catch (err) {
    return {
      exitCode: err.status,
      stdout: err.stdout || '',
      stderr: err.stderr || '',
    };
  }
}

describe('dlp-pretool hook', () => {
  it('allows clean tool input', () => {
    const result = runHook({
      tool_name: 'Write',
      tool_input: { file_path: '/tmp/test.txt', content: 'Hello world' },
    });
    assert.equal(result.exitCode, 0);
  });

  it('detects AWS access keys in block mode', () => {
    const result = runHook(
      {
        tool_name: 'Bash',
        tool_input: { command: 'export AWS_KEY=AKIAIOSFODNN7EXAMPLE' },
      },
      { DLP_PRETOOL_ENFORCEMENT: 'block' }
    );
    assert.equal(result.exitCode, 2, 'Should block on AWS key');
    assert.ok(result.stdout.includes('AWS Access Key') || result.stdout.includes('DLP'));
  });

  it('detects GitHub tokens in block mode', () => {
    const result = runHook(
      {
        tool_name: 'Bash',
        tool_input: {
          command: 'git clone https://ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij@github.com/org/repo',
        },
      },
      { DLP_PRETOOL_ENFORCEMENT: 'block' }
    );
    assert.equal(result.exitCode, 2, 'Should block on GitHub token');
  });

  it('detects private keys in block mode', () => {
    const result = runHook(
      {
        tool_name: 'Write',
        tool_input: {
          file_path: '/tmp/key.pem',
          content:
            '-----BEGIN RSA PRIVATE KEY-----\nMIIBogIBAAJBAL+z\n-----END RSA PRIVATE KEY-----',
        },
      },
      { DLP_PRETOOL_ENFORCEMENT: 'block' }
    );
    assert.equal(result.exitCode, 2, 'Should block on private key');
  });

  it('warns but allows in warn mode', () => {
    const result = runHook(
      {
        tool_name: 'Bash',
        tool_input: { command: 'export KEY=AKIAIOSFODNN7EXAMPLE' },
      },
      { DLP_PRETOOL_ENFORCEMENT: 'warn' }
    );
    assert.equal(result.exitCode, 0, 'Should warn but allow in warn mode');
  });

  it('skips when enforcement is off', () => {
    const result = runHook(
      {
        tool_name: 'Bash',
        tool_input: { command: 'export KEY=AKIAIOSFODNN7EXAMPLE' },
      },
      { DLP_PRETOOL_ENFORCEMENT: 'off' }
    );
    assert.equal(result.exitCode, 0, 'Should pass when off');
  });

  it('handles empty input gracefully', () => {
    const result = runHook({});
    assert.equal(result.exitCode, 0);
  });

  it('scans nested objects', () => {
    const result = runHook(
      {
        tool_name: 'Bash',
        tool_input: {
          nested: {
            deep: {
              secret: 'sk_' + 'live_XXXXXXXXXXYYYYYYYYYYZZZZ',
            },
          },
        },
      },
      { DLP_PRETOOL_ENFORCEMENT: 'block' }
    );
    assert.equal(result.exitCode, 2, 'Should detect secrets in nested objects');
  });
});
