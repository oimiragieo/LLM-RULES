'use strict';

const { handler } = require('../../.claude/hooks/safety/shell-injection-validator.cjs');
const assert = require('assert');
const test = require('node:test');

test('Shell Injection Validator', async t => {
  await t.test('should allow safe commands', () => {
    const result = handler({ command: 'ls -la' });
    assert.strictEqual(result.allowed, true);
  });

  await t.test('should block chained rm -rf', () => {
    const result = handler({ command: 'ls; rm -rf /' });
    assert.strictEqual(result.allowed, false);
    assert.match(result.reason, /rm -rf/);
  });

  await t.test('should block piped rm -rf', () => {
    const result = handler({ command: 'ls | rm -rf /' });
    assert.strictEqual(result.allowed, false);
  });

  await t.test('should block conditional rm -rf', () => {
    const result = handler({ command: 'ls && rm -rf /' });
    assert.strictEqual(result.allowed, false);
  });

  await t.test('should block eval', () => {
    const result = handler({ command: 'eval "ls"' });
    assert.strictEqual(result.allowed, false);
    assert.match(result.reason, /eval/);
  });

  await t.test('should block dangerous targets (root)', () => {
    const result = handler({ command: 'rm -rf /' });
    assert.strictEqual(result.allowed, false);
    assert.match(result.reason, /root deletion/);
  });

  await t.test('should block command substitution with rm', () => {
    const result = handler({ command: 'echo $(rm -rf /)' });
    assert.strictEqual(result.allowed, false);
    assert.match(result.reason, /rm/);
  });

  await t.test('should block backtick substitution with rm', () => {
    const result = handler({ command: 'echo `rm -rf /`' });
    assert.strictEqual(result.allowed, false);
  });

  await t.test('should block base64 decode piped to bash', () => {
    const result = handler({ command: 'echo cG93bmVkCg== | base64 -d | bash' });
    assert.strictEqual(result.allowed, false);
    assert.match(result.reason, /Encoded payload/);
  });

  await t.test('should block python inline decode piped to sh', () => {
    const result = handler({ command: 'python -c "print(\'616263\'.fromhex())" | sh' });
    assert.strictEqual(result.allowed, false);
    assert.match(result.reason, /interpreter decode/);
  });

  await t.test('should allow safe commands with quotes', () => {
    const result = handler({ command: 'echo "rm -rf /"' });
    assert.strictEqual(result.allowed, true);
  });

  await t.test('should allow safe commands with escaped semicolons', () => {
    const result = handler({ command: 'echo "hello; world"' });
    assert.strictEqual(result.allowed, true);
  });
});
