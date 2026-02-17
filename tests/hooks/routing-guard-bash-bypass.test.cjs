'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const routingGuard = require('../../.claude/hooks/routing/routing-guard.cjs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function cleanupState() {
  const dedupeStateFile = path.join(
    PROJECT_ROOT,
    '.claude',
    'context',
    'runtime',
    'routing-block-dedupe.json'
  );
  if (fs.existsSync(dedupeStateFile)) {
    fs.unlinkSync(dedupeStateFile);
  }
}

describe('routing-guard.cjs - Router Bash bypassPermissions enforcement', () => {
  afterEach(() => {
    cleanupState();
    delete process.env.ROUTER_BASH_GUARD;
  });

  it('blocks non-whitelisted bash commands in bypassPermissions router mode', () => {
    process.env.ROUTER_BASH_GUARD = 'block';
    const result = routingGuard.checkRouterBash(
      'Bash',
      {
        command:
          'cd /c/dev/projects/agent-studio && node --test tests/hooks/pre-task-unified-loop-breakers.test.cjs',
      },
      { permission_mode: 'bypassPermissions' }
    );
    assert.equal(result.pass, false);
    assert.equal(result.result, 'block');
    assert.match(result.message, /ROUTER-FIRST PROTOCOL VIOLATION/i);
  });

  it('allows whitelisted bash commands in bypassPermissions router mode (warn)', () => {
    process.env.ROUTER_BASH_GUARD = 'block';
    const result = routingGuard.checkRouterBash(
      'Bash',
      { command: 'git status -s' },
      { permission_mode: 'bypassPermissions' }
    );
    assert.equal(result.pass, true);
    assert.equal(result.result, 'warn');
  });

  it('blocks destructive git checkout reset commands in bypassPermissions router mode', () => {
    process.env.ROUTER_BASH_GUARD = 'block';
    const result = routingGuard.checkRouterBash(
      'Bash',
      { command: 'git checkout HEAD -- tests/fixtures/' },
      { permission_mode: 'bypassPermissions' }
    );
    assert.equal(result.pass, false);
    assert.equal(result.result, 'block');
    assert.match(result.message, /Direct Bash is not allowed/i);
  });
});
