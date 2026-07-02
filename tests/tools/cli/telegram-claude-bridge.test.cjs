'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  buildClaudeSpawnSpec,
  buildClaudeEnv,
} = require('../../../.claude/tools/cli/telegram-claude-bridge.cjs');
const { getClaudeResponse } = require('../../../scripts/channels/_archive/telegram-poller.cjs');

describe('telegram-claude-bridge command construction', () => {
  it('keeps user prompt out of the Windows cmd.exe command line', () => {
    const prompt = 'hello & echo PWNED > sentinel';
    const spec = buildClaudeSpawnSpec('claude.cmd', ['--output-format', 'text', '-p'], 'win32');
    const commandLine = [spec.command, ...spec.args].join(' ');

    assert.equal(path.basename(spec.command).toLowerCase(), 'cmd.exe');
    assert.ok(!commandLine.includes(prompt), 'prompt must be written to stdin, not cmd.exe args');
    assert.ok(!commandLine.includes('PWNED'), 'shell metacharacter payload must not reach cmd.exe args');
  });

  it('strips Telegram and Anthropic secrets from the Claude child environment', () => {
    const env = buildClaudeEnv({
      PATH: 'C:/bin',
      TELEGRAM_BOT_TOKEN: 'telegram-secret',
      TELEGRAM_ALLOWED_USERS: '123',
      TELEGRAM_OWNER_ID: '123',
      ANTHROPIC_API_KEY: 'anthropic-secret',
    });

    assert.equal(env.PATH, 'C:/bin');
    assert.equal(env.CLAUDECODE, '');
    assert.equal(env.TELEGRAM_BOT_TOKEN, undefined);
    assert.equal(env.TELEGRAM_ALLOWED_USERS, undefined);
    assert.equal(env.TELEGRAM_OWNER_ID, undefined);
    assert.equal(env.ANTHROPIC_API_KEY, undefined);
  });

  it('keeps archived poller Telegram text out of command arguments', () => {
    const prompt = 'hello & echo PWNED > sentinel';
    let captured = null;

    const response = getClaudeResponse(prompt, 'chat-1', {
      resolveClaude: () => 'claude.cmd',
      buildClaudeSpawnSpec: (bin, args) => buildClaudeSpawnSpec(bin, args, 'win32'),
      buildClaudeEnv: env => env,
      spawnSync: (command, args, options) => {
        captured = { command, args, options };
        return { status: 0, stdout: 'ok\n', stderr: '' };
      },
    });

    assert.equal(response, 'ok');
    const commandLine = [captured.command, ...captured.args].join(' ');
    assert.ok(!commandLine.includes(prompt), 'prompt must be written to stdin');
    assert.ok(!commandLine.includes('PWNED'), 'shell payload must not reach command args');
    assert.equal(captured.options.shell, false);
    assert.ok(captured.options.input.includes(prompt), 'prompt should be passed via stdin');
  });
});
