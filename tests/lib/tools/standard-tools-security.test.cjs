'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { StandardTools } = require('../../../.claude/lib/tools/standard-tools.cjs');

test('Bash blocks commands outside allowlist', async () => {
  await assert.rejects(
    async () => StandardTools.Bash({ command: 'rm -rf /tmp/agent-studio-test' }),
    /Command blocked by allowlist/
  );
});

test('Grep treats query as data and does not execute shell payload', async () => {
  const markerPath = path.join(os.tmpdir(), `agent-studio-grep-injection-${Date.now()}.txt`);
  const escapedPath = markerPath.replace(/\\/g, '\\\\');
  const payload =
    process.platform === 'win32'
      ? `x" & node -e "require('fs').writeFileSync('${escapedPath}','pwned')" & "`
      : `x" ; node -e "require('fs').writeFileSync('${escapedPath}','pwned')" ; echo "`;

  try {
    await StandardTools.Grep({ query: payload, path: '.' });
    assert.equal(fs.existsSync(markerPath), false);
  } finally {
    if (fs.existsSync(markerPath)) {
      fs.unlinkSync(markerPath);
    }
  }
});

test('exec wrapper blocks commands outside allowlist', async () => {
  const result = await StandardTools.exec({ command: 'rm -rf /tmp/agent-studio-test' });
  assert.equal(result.exitCode, 126);
  assert.match(result.stderr, /Command blocked by allowlist/);
});

test('exec wrapper allows allowlisted commands', async () => {
  const result = await StandardTools.exec({ command: 'node --version' });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /v\d+\./);
});
