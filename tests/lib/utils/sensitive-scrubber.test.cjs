const { test } = require('node:test');
const assert = require('node:assert/strict');

// RED: Test API key pattern
test('scrubSensitiveContent - API key pattern', () => {
  const { scrubSensitiveContent } = require('../../../.claude/lib/utils/sensitive-scrubber.cjs');

  const input = 'API_KEY=sk-abc123456789';
  const result = scrubSensitiveContent(input);

  assert.equal(result.scrubbed, 'API_KEY=[REDACTED]');
  assert.equal(result.redactionCount, 1);
});

// RED: Test JWT pattern
test('scrubSensitiveContent - JWT pattern', () => {
  const { scrubSensitiveContent } = require('../../../.claude/lib/utils/sensitive-scrubber.cjs');

  const input = 'Token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
  const result = scrubSensitiveContent(input);

  assert.equal(result.scrubbed, 'Token: [JWT-REDACTED]');
  assert.equal(result.redactionCount, 1);
});

// RED: Test email pattern
test('scrubSensitiveContent - email pattern', () => {
  const { scrubSensitiveContent} = require('../../../.claude/lib/utils/sensitive-scrubber.cjs');

  const input = 'Contact: user@example.com';
  const result = scrubSensitiveContent(input);

  assert.equal(result.scrubbed, 'Contact: [EMAIL-REDACTED]');
  assert.equal(result.redactionCount, 1);
});

// RED: Test password pattern
test('scrubSensitiveContent - password pattern', () => {
  const { scrubSensitiveContent } = require('../../../.claude/lib/utils/sensitive-scrubber.cjs');

  const input = 'password=secret123';
  const result = scrubSensitiveContent(input);

  assert.equal(result.scrubbed, 'password=[REDACTED]');
  assert.equal(result.redactionCount, 1);
});

// RED: Test code reference preservation
test('scrubSensitiveContent - preserves code variable names', () => {
  const { scrubSensitiveContent } = require('../../../.claude/lib/utils/sensitive-scrubber.cjs');

  const input = 'const password = req.body.password';
  const result = scrubSensitiveContent(input);

  // Variable names should be preserved, only actual values redacted
  assert.ok(result.scrubbed.includes('password'));
  assert.equal(result.redactionCount, 0);
});

// RED: Test no-op on clean text
test('scrubSensitiveContent - no-op on clean text', () => {
  const { scrubSensitiveContent } = require('../../../.claude/lib/utils/sensitive-scrubber.cjs');

  const input = 'This is safe content with no sensitive data';
  const result = scrubSensitiveContent(input);

  assert.equal(result.scrubbed, input);
  assert.equal(result.redactionCount, 0);
});
