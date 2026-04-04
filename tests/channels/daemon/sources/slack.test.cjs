'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('SlackSource', () => {
  it('module loads without error', () => {
    const { SlackSource } = require('../../../../scripts/channels/daemon/sources/slack.cjs');
    assert.ok(SlackSource);
  });

  it('constructor accepts config', () => {
    const { SlackSource } = require('../../../../scripts/channels/daemon/sources/slack.cjs');
    const source = new SlackSource(
      {
        botToken: 'xoxb-test',
        channels: ['C123'],
        allowedUsers: new Set(['U123']),
      },
      () => {}
    );
    assert.equal(source.botToken, 'xoxb-test');
    assert.equal(source.channels.length, 1);
    assert.ok(source.allowed.has('U123'));
  });
});

describe('SlackSink', () => {
  it('module loads without error', () => {
    const { SlackSink } = require('../../../../scripts/channels/daemon/sinks/slack.cjs');
    assert.ok(SlackSink);
    const sink = new SlackSink({ botToken: 'xoxb-test' });
    assert.equal(sink.botToken, 'xoxb-test');
  });
});
