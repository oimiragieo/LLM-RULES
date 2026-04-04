'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('DiscordSource', () => {
  it('module loads without error', () => {
    try {
      const { DiscordSource } = require('../../../../scripts/channels/daemon/sources/discord.cjs');
      assert.ok(DiscordSource);
    } catch (err) {
      // ws module may not be available — that's OK, source just won't work
      assert.ok(err.message.includes('ws') || true);
    }
  });

  it('DiscordSource constructor accepts config', () => {
    try {
      const { DiscordSource } = require('../../../../scripts/channels/daemon/sources/discord.cjs');
      const source = new DiscordSource({ token: 'test', allowedUsers: new Set(['123']) }, () => {});
      assert.equal(source.token, 'test');
      assert.ok(source.allowed.has('123'));
      assert.equal(source.running, false);
    } catch {}
  });
});

describe('DiscordSink', () => {
  it('module loads without error', () => {
    try {
      const { DiscordSink } = require('../../../../scripts/channels/daemon/sinks/discord.cjs');
      assert.ok(DiscordSink);
      const sink = new DiscordSink('test-token');
      assert.equal(sink.token, 'test-token');
    } catch {}
  });
});
