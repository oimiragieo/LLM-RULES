#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('logger sanitizer integration', () => {
  it('redacts secrets from message and meta payloads', () => {
    delete require.cache[require.resolve('../../../.claude/lib/utils/logger.cjs')];
    const { createLogger } = require('../../../.claude/lib/utils/logger.cjs');
    const logger = createLogger('logger-test');

    const originalError = console.error;
    const captured = [];
    console.error = line => captured.push(line);

    try {
      logger.info('url=https://mcp.exa.ai/mcp?exaApiKey=abc123', {
        endpoint: 'https://api.ref.tools/mcp?apiKey=secret-value',
      });
    } finally {
      console.error = originalError;
    }

    assert.equal(captured.length, 1);
    const payload = JSON.parse(captured[0]);
    assert.ok(payload.message.includes('exaApiKey=[REDACTED]'));
    assert.ok(!payload.message.includes('abc123'));
    assert.ok(payload.endpoint.includes('apiKey=[REDACTED]'));
    assert.ok(!payload.endpoint.includes('secret-value'));
  });
});

