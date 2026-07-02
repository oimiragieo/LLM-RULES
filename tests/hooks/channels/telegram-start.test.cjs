'use strict';

const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const {
  buildDaemonEnv,
  launchDaemon,
  DAEMON,
  ROOT,
} = require('../../../.claude/hooks/channels/telegram-start.cjs');

describe('telegram-start launcher', () => {
  it('builds daemon env without inheriting ANTHROPIC_API_KEY', () => {
    const env = buildDaemonEnv({
      TELEGRAM_BOT_TOKEN: 'bot-secret',
      TELEGRAM_ALLOWED_USERS: '123&456',
      ANTHROPIC_API_KEY: 'anthropic-secret',
    });

    assert.equal(env.TELEGRAM_BOT_TOKEN, 'bot-secret');
    assert.equal(env.TELEGRAM_ALLOWED_USERS, '123&456');
    assert.equal(env.TELEGRAM_HEADLESS_SESSION, '1');
    assert.equal(Object.hasOwn(env, 'ANTHROPIC_API_KEY'), false);
  });

  it('spawns node directly with env object and no shell or secret args', () => {
    const child = new EventEmitter();
    child.unref = mock.fn();
    const spawnFn = mock.fn(() => child);

    launchDaemon({
      spawnFn,
      env: {
        TELEGRAM_BOT_TOKEN: 'bot-secret',
        CHANNEL_AUTO_START: 'true',
      },
    });

    assert.equal(spawnFn.mock.callCount(), 1);
    const [command, args, options] = spawnFn.mock.calls[0].arguments;
    assert.equal(command, process.execPath);
    assert.deepEqual(args, [DAEMON]);
    assert.equal(args.join(' ').includes('bot-secret'), false);
    assert.equal(options.cwd, ROOT);
    assert.equal(options.shell, false);
    assert.equal(options.windowsHide, true);
    assert.equal(options.detached, true);
    assert.equal(options.env.TELEGRAM_BOT_TOKEN, 'bot-secret');
    assert.equal(child.unref.mock.callCount(), 1);
  });
});
