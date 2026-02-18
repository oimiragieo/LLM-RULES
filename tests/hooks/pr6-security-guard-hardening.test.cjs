#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = process.cwd();
const CREATOR_GUARD_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'routing',
  'unified-creator-guard.cjs'
);
const ROUTING_GUARD_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'routing',
  'routing-guard-core.impl.cjs'
);

function withEnv(overrides, fn) {
  const prev = {};
  for (const [key, value] of Object.entries(overrides)) {
    prev[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('creator guard no longer trusts CLAUDE_AGENT_ID self-assertion alone', () => {
  const statePath = path.join(
    PROJECT_ROOT,
    '.claude',
    'context',
    'runtime',
    'active-creators.json'
  );
  if (fs.existsSync(statePath)) {
    fs.unlinkSync(statePath);
  }

  withEnv({ CLAUDE_AGENT_ID: 'skill-creator' }, () => {
    delete require.cache[require.resolve(CREATOR_GUARD_PATH)];
    const mod = require(CREATOR_GUARD_PATH);
    const active = mod.isCreatorActive('skill-creator');
    assert.equal(active.active, false, 'self-asserted agent id should not bypass creator state');
    delete require.cache[require.resolve(CREATOR_GUARD_PATH)];
  });
});

test('fail-open override requires explicit acknowledgement and scope', () => {
  delete require.cache[require.resolve(CREATOR_GUARD_PATH)];
  delete require.cache[require.resolve(ROUTING_GUARD_PATH)];
  const creator = require(CREATOR_GUARD_PATH);
  const routing = require(ROUTING_GUARD_PATH);

  withEnv(
    { HOOK_FAIL_OPEN: 'true', HOOK_FAIL_OPEN_ACK: undefined, HOOK_FAIL_OPEN_SCOPE: undefined },
    () => {
      assert.equal(creator.isFailOpenOverrideAuthorized(), false);
      assert.equal(routing.isFailOpenOverrideAuthorized(), false);
    }
  );

  withEnv(
    {
      HOOK_FAIL_OPEN: 'true',
      HOOK_FAIL_OPEN_ACK: 'ALLOW_HOOK_FAIL_OPEN',
      HOOK_FAIL_OPEN_SCOPE: 'all',
    },
    () => {
      assert.equal(creator.isFailOpenOverrideAuthorized(), true);
      assert.equal(routing.isFailOpenOverrideAuthorized(), true);
    }
  );
});

test('routing guard forced crash is fail-closed unless override is fully authorized', () => {
  const denied = spawnSync(process.execPath, [ROUTING_GUARD_PATH], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ROUTING_GUARD_TEST_FORCE_THROW: '1',
      HOOK_FAIL_OPEN: 'true',
    },
    windowsHide: true,
  });
  assert.equal(denied.status, 2, `expected fail-closed exit=2, got ${denied.status}`);

  const allowed = spawnSync(process.execPath, [ROUTING_GUARD_PATH], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ROUTING_GUARD_TEST_FORCE_THROW: '1',
      HOOK_FAIL_OPEN: 'true',
      HOOK_FAIL_OPEN_ACK: 'ALLOW_HOOK_FAIL_OPEN',
      HOOK_FAIL_OPEN_SCOPE: 'routing-guard',
    },
    windowsHide: true,
  });
  assert.equal(allowed.status, 0, `expected authorized fail-open exit=0, got ${allowed.status}`);
});

test('creator guard forced crash is fail-closed unless override is fully authorized', () => {
  const denied = spawnSync(process.execPath, [CREATOR_GUARD_PATH], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CREATOR_GUARD_TEST_FORCE_THROW: '1',
      HOOK_FAIL_OPEN: 'true',
    },
    windowsHide: true,
  });
  assert.equal(denied.status, 2, `expected fail-closed exit=2, got ${denied.status}`);

  const allowed = spawnSync(process.execPath, [CREATOR_GUARD_PATH], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CREATOR_GUARD_TEST_FORCE_THROW: '1',
      HOOK_FAIL_OPEN: 'true',
      HOOK_FAIL_OPEN_ACK: 'ALLOW_HOOK_FAIL_OPEN',
      HOOK_FAIL_OPEN_SCOPE: 'creator-guard',
    },
    windowsHide: true,
  });
  assert.equal(allowed.status, 0, `expected authorized fail-open exit=0, got ${allowed.status}`);
});
