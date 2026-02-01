/**
 * Model Client Tests
 * ==================
 *
 * Verifies the ModelClient's ability to:
 * 1. Fallback to mock mode when no API key is present.
 * 2. Construct correct API requests when API key is present (mocking fetch).
 */

'use strict';

const assert = require('assert');
const path = require('path');
const { describe, it, beforeEach, afterEach } = require('node:test');

const clientPath = path.join(__dirname, '../../.claude/lib/clients/model-client.cjs');
const { ModelClient } = require(clientPath);

describe('ModelClient', () => {
  let originalFetch;
  let originalEnvKey;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalEnvKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.ANTHROPIC_API_KEY = originalEnvKey;
  });

  it('should use Mock Mode when no API key is provided', async () => {
    const client = new ModelClient();
    const response = await client.generateText({ system: 'sys', messages: 'make a plan' });

    assert.ok(
      response.includes('Mock Plan') || response.includes('ModelClient'),
      'Should return mock response'
    );
  });

  it('should call API when API key is provided', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key';
    const client = new ModelClient();

    // Mock fetch
    let fetchCalled = false;
    global.fetch = async (url, options) => {
      fetchCalled = true;
      assert.strictEqual(url, 'https://api.anthropic.com/v1/messages');
      assert.strictEqual(options.headers['x-api-key'], 'sk-test-key');

      const body = JSON.parse(options.body);
      assert.strictEqual(body.model, 'claude-3-5-sonnet-20240620');

      return {
        ok: true,
        json: async () => ({
          content: [{ text: 'Real API Response' }],
        }),
      };
    };

    const response = await client.generateText({ system: 'sys', messages: 'hello' });
    assert.strictEqual(response, 'Real API Response');
    assert.ok(fetchCalled);
  });
});
