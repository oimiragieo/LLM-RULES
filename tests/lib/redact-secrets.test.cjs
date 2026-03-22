'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  redactSecrets,
  redactObject,
  REDACTED,
} = require('../../.claude/lib/utils/redact-secrets.cjs');

describe('redactSecrets', () => {
  it('redacts AWS access key IDs', () => {
    const input = 'key=AKIAIOSFODNN7EXAMPLE and more';
    const result = redactSecrets(input);
    assert.ok(!result.includes('AKIAIOSFODNN7EXAMPLE'), 'AWS key should be redacted');
    assert.ok(result.includes(REDACTED));
  });

  it('redacts GitHub tokens', () => {
    const input = 'token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij';
    const result = redactSecrets(input);
    assert.ok(!result.includes('ghp_ABCDEF'), 'GitHub token should be redacted');
  });

  it('redacts OpenAI API keys', () => {
    const input = 'OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuv';
    const result = redactSecrets(input);
    assert.ok(!result.includes('sk-proj-abcdefghij'), 'OpenAI key should be redacted');
  });

  it('redacts Stripe secret keys', () => {
    const input = 'stripe_key=sk_' + 'test_XXXXXXXXXXYYYYYYYYYYZZZZ';
    const result = redactSecrets(input);
    assert.ok(!result.includes('XXXXXXXXXXYYYY'), 'Stripe key should be redacted');
  });

  it('redacts JWT tokens', () => {
    const input =
      'auth: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    const result = redactSecrets(input);
    assert.ok(!result.includes('eyJhbGci'), 'JWT should be redacted');
  });

  it('redacts connection string passwords', () => {
    const input = 'postgres://admin:super_secret_pass@db.example.com:5432/mydb';
    const result = redactSecrets(input);
    assert.ok(!result.includes('super_secret_pass'), 'Password should be redacted');
    assert.ok(result.includes('admin'), 'Username should remain');
  });

  it('redacts Bearer tokens', () => {
    const input = 'Authorization: Bearer eyABCDEFGHIJKLMNOPQRSTUVWXYZ123456';
    const result = redactSecrets(input);
    assert.ok(!result.includes('eyABCDEFGHIJK'), 'Bearer token should be redacted');
  });

  it('redacts generic api_key=value patterns', () => {
    const input = 'api_key=my_super_secret_key_12345678';
    const result = redactSecrets(input);
    assert.ok(!result.includes('my_super_secret_key'), 'Generic key should be redacted');
  });

  it('redacts private keys', () => {
    const input =
      '-----BEGIN RSA PRIVATE KEY-----\nMIIBogIBAAJBAL+z\n-----END RSA PRIVATE KEY-----';
    const result = redactSecrets(input);
    assert.ok(!result.includes('MIIBogIBAAJBAL+z'), 'Private key should be redacted');
  });

  it('handles null/undefined/empty gracefully', () => {
    assert.equal(redactSecrets(null), null);
    assert.equal(redactSecrets(undefined), undefined);
    assert.equal(redactSecrets(''), '');
    assert.equal(redactSecrets(42), 42);
  });

  it('does NOT redact non-secret strings', () => {
    const input = 'Hello world, this is a normal string with no secrets.';
    assert.equal(redactSecrets(input), input);
  });

  it('preserves surrounding text', () => {
    const input = 'before AKIAIOSFODNN7EXAMPLE after';
    const result = redactSecrets(input);
    assert.ok(result.includes('before'));
    assert.ok(result.includes('after'));
  });
});

describe('redactObject', () => {
  it('redacts secrets in nested object values', () => {
    const obj = {
      config: {
        apiKey: 'sk-proj-abcdefghijklmnopqrstuv',
        name: 'safe-value',
      },
    };
    const result = redactObject(obj);
    assert.ok(!JSON.stringify(result).includes('sk-proj-abcdefghij'));
    assert.equal(result.config.name, 'safe-value');
  });

  it('handles arrays', () => {
    const obj = { tokens: ['ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij', 'safe'] };
    const result = redactObject(obj);
    assert.ok(!JSON.stringify(result).includes('ghp_ABCDEF'));
    assert.equal(result.tokens[1], 'safe');
  });

  it('handles null/undefined', () => {
    assert.equal(redactObject(null), null);
    assert.equal(redactObject(undefined), undefined);
  });

  it('strips prototype pollution keys', () => {
    const obj = { __proto__: { admin: true }, safe: 'value' };
    const result = redactObject(obj);
    assert.equal(result.safe, 'value');
    // __proto__ should be stripped
    assert.equal(result.admin, undefined);
  });

  it('respects max depth', () => {
    // Build deeply nested object
    let obj = { val: 'AKIAIOSFODNN7EXAMPLE' };
    for (let i = 0; i < 10; i++) {
      obj = { nested: obj };
    }
    const result = redactObject(obj);
    // At depth > MAX_DEPTH, values pass through unredacted
    assert.ok(typeof result === 'object');
  });

  it('passes through non-string primitives', () => {
    const obj = { count: 42, active: true, ratio: 3.14 };
    const result = redactObject(obj);
    assert.equal(result.count, 42);
    assert.equal(result.active, true);
    assert.equal(result.ratio, 3.14);
  });
});
