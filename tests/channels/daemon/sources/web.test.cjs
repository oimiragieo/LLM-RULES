'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('WebSource', () => {
  it('module loads without error', () => {
    const { WebSource } = require('../../../../scripts/channels/daemon/sources/web.cjs');
    assert.ok(WebSource);
  });

  it('constructor initializes empty state', () => {
    const { WebSource } = require('../../../../scripts/channels/daemon/sources/web.cjs');
    const source = new WebSource({}, () => {});
    assert.equal(source.sessions.size, 0);
    assert.equal(source.sseClients.size, 0);
  });

  it('pushResponse buffers and can be retrieved', () => {
    const { WebSource } = require('../../../../scripts/channels/daemon/sources/web.cjs');
    const source = new WebSource({}, () => {});
    source.sessions.set('test-session', { chatId: 'web-test-session', responses: [] });
    source.pushResponse('test-session', 'Hello from bot');
    const session = source.sessions.get('test-session');
    assert.equal(session.responses.length, 1);
    assert.equal(session.responses[0].text, 'Hello from bot');
  });
});

describe('WebSink', () => {
  it('module loads without error', () => {
    const { WebSink } = require('../../../../scripts/channels/daemon/sinks/web.cjs');
    assert.ok(WebSink);
  });

  it('send() pushes response via web source', async () => {
    const { WebSource } = require('../../../../scripts/channels/daemon/sources/web.cjs');
    const { WebSink } = require('../../../../scripts/channels/daemon/sinks/web.cjs');
    const source = new WebSource({}, () => {});
    source.sessions.set('abc', { chatId: 'web-abc', responses: [] });
    const sink = new WebSink(source);
    await sink.send('web-abc', 'Test response');
    assert.equal(source.sessions.get('abc').responses.length, 1);
  });
});
