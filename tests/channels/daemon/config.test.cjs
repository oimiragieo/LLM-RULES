'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('Config', () => {
  // We test the loadConfig function's output shape without actually loading .env
  // (that would make tests environment-dependent)
  const { DEFAULT_PORT } = require('../../../scripts/channels/daemon/config.cjs');

  it('DEFAULT_PORT is 3101', () => {
    assert.equal(DEFAULT_PORT, 3101);
  });

  it('loadConfig returns expected shape', () => {
    const { loadConfig } = require('../../../scripts/channels/daemon/config.cjs');
    const config = loadConfig('/tmp/nonexistent-agent-studio-test');
    assert.ok(config.daemon);
    assert.ok(config.renderer);
    assert.ok(config.sources);
    assert.ok(config.routes);
    assert.equal(config.daemon.port, 3101);
    assert.equal(config.daemon.host, '127.0.0.1');
    assert.equal(config.renderer.model, 'sonnet');
    assert.equal(typeof config.sources.telegram.enabled, 'boolean');
    assert.ok(Array.isArray(config.routes));
  });

  it('default mode is developer', () => {
    const { loadConfig } = require('../../../scripts/channels/daemon/config.cjs');
    const config = loadConfig('/tmp/nonexistent-agent-studio-test');
    assert.equal(config.mode, 'developer');
    assert.equal(config.renderer.mode, 'developer');
  });

  it('business config has defaults', () => {
    const { loadConfig } = require('../../../scripts/channels/daemon/config.cjs');
    const config = loadConfig('/tmp/nonexistent-agent-studio-test');
    assert.ok(config.business);
    assert.equal(config.business.canExecuteTasks, false);
    assert.ok(config.business.companyName);
  });
});
