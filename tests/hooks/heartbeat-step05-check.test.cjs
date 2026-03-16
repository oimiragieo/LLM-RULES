'use strict';
/**
 * Tests for heartbeat-step05-check.cjs advisory hook.
 * Verifies Step 0.5 ping expiry detection — always exits 0 (advisory).
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const HOOK = path.join(ROOT, '.claude/hooks/routing/heartbeat-step05-check.cjs');
const PING_FILE = path.join(ROOT, '.claude/context/runtime/heartbeat-session-ping.json');
const PING_BACKUP = PING_FILE + '.bak';

/** Run the hook with a given stdin payload, return { stdout, stderr, status } */
function runHook(input) {
  const result = spawnSync('node', [HOOK], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    timeout: 5000,
    cwd: ROOT,
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
  };
}

describe('heartbeat-step05-check hook', () => {
  before(() => {
    // Back up real ping file so tests don't corrupt it
    if (fs.existsSync(PING_FILE)) {
      fs.copyFileSync(PING_FILE, PING_BACKUP);
    }
  });

  after(() => {
    // Restore real ping file
    if (fs.existsSync(PING_BACKUP)) {
      fs.copyFileSync(PING_BACKUP, PING_FILE);
      fs.unlinkSync(PING_BACKUP);
    }
  });

  it('exits 0 with {"allow":true} when ping is valid', () => {
    // Write a valid future-dated ping
    fs.writeFileSync(
      PING_FILE,
      JSON.stringify({
        written_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
        loop_count: 8,
        ttl_minutes: 40,
      })
    );

    const { stdout, stderr, status } = runHook({ tool_name: 'TaskList', tool_input: {} });
    assert.equal(status, 0, 'hook must exit 0 (advisory)');
    assert.ok(stdout.includes('"allow":true'), `stdout must contain {"allow":true}, got: ${stdout}`);
    assert.equal(stderr, '', 'no stderr warning expected for valid ping');
  });

  it('exits 0 with {"allow":true} when ping file is missing', () => {
    // Remove the ping file
    if (fs.existsSync(PING_FILE)) fs.unlinkSync(PING_FILE);

    const { stdout, stderr, status } = runHook({ tool_name: 'TaskList', tool_input: {} });
    assert.equal(status, 0, 'hook must exit 0 even when ping missing');
    assert.ok(stdout.includes('"allow":true'), `stdout must contain {"allow":true}, got: ${stdout}`);
    assert.ok(stderr.includes('[Step 0.5]'), `stderr should warn about missing ping, got: ${stderr}`);
  });

  it('exits 0 and warns on stderr when ping is expired', () => {
    // Write an expired ping
    fs.writeFileSync(
      PING_FILE,
      JSON.stringify({
        written_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        expires_at: new Date(Date.now() - 1000).toISOString(), // 1 second ago
        loop_count: 8,
        ttl_minutes: 40,
      })
    );

    const { stdout, stderr, status } = runHook({ tool_name: 'TaskList', tool_input: {} });
    assert.equal(status, 0, 'hook must exit 0 even for expired ping');
    assert.ok(stdout.includes('"allow":true'), `stdout must contain {"allow":true}, got: ${stdout}`);
    assert.ok(
      stderr.includes('[Step 0.5]'),
      `stderr should warn about expired ping, got: ${stderr}`
    );
    assert.ok(
      stderr.includes('heartbeat-orchestrator'),
      `stderr should mention heartbeat-orchestrator, got: ${stderr}`
    );
  });

  it('exits 0 silently for non-TaskList tool calls', () => {
    // Write a valid ping to ensure silence is about tool_name, not ping state
    fs.writeFileSync(
      PING_FILE,
      JSON.stringify({
        written_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        loop_count: 8,
        ttl_minutes: 40,
      })
    );

    const { stdout, stderr, status } = runHook({ tool_name: 'Read', tool_input: {} });
    assert.equal(status, 0);
    assert.ok(stdout.includes('"allow":true'));
    assert.equal(stderr, '', 'non-TaskList calls must never warn');
  });

  it('exits 0 on malformed JSON input (fail-open)', () => {
    const { stdout, status } = runHook('not valid json {{{{');
    assert.equal(status, 0, 'hook must fail-open on bad stdin JSON');
    assert.ok(stdout.includes('"allow":true'));
  });
});
