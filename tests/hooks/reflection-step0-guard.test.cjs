#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const GUARD_PATH = path.join(
  __dirname,
  '..',
  '..',
  '.claude',
  'hooks',
  'reflection',
  'reflection-step0-guard.cjs'
);
const CONTRACT_PATH = path.join(
  __dirname,
  '..',
  '..',
  '.claude',
  'lib',
  'reflection',
  'spawn-request-contract.cjs'
);
const SPAWN_REQUEST_PATH = path.join(
  __dirname,
  '..',
  '..',
  '.claude',
  'context',
  'runtime',
  'reflection-spawn-request.json'
);

function loadGuardWithEnv(overrides = {}) {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === null || value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }
  delete require.cache[require.resolve(GUARD_PATH)];
  delete require.cache[require.resolve(CONTRACT_PATH)];
  const guard = require(GUARD_PATH);
  return {
    guard,
    restore: () => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
      delete require.cache[require.resolve(GUARD_PATH)];
      delete require.cache[require.resolve(CONTRACT_PATH)];
    },
  };
}

test('resolveEffectiveEnforcementMode keeps block before repeat threshold', () => {
  const { guard, restore } = loadGuardWithEnv({
    REFLECTION_STEP0_REPEAT_THRESHOLD: '3',
    REFLECTION_STEP0_LOOP_BREAKER_MODE: 'warn',
  });
  try {
    assert.equal(guard.resolveEffectiveEnforcementMode('block', 2), 'block');
  } finally {
    restore();
  }
});

test('resolveEffectiveEnforcementMode defaults loop-breaker to warn', () => {
  const { guard, restore } = loadGuardWithEnv({
    REFLECTION_STEP0_REPEAT_THRESHOLD: '2',
    REFLECTION_STEP0_LOOP_BREAKER_MODE: null,
  });
  try {
    assert.equal(guard.resolveEffectiveEnforcementMode('block', 2), 'warn');
  } finally {
    restore();
  }
});

test('resolveEffectiveEnforcementMode degrades repeated block to warn', () => {
  const { guard, restore } = loadGuardWithEnv({
    REFLECTION_STEP0_REPEAT_THRESHOLD: '2',
    REFLECTION_STEP0_LOOP_BREAKER_MODE: 'warn',
  });
  try {
    assert.equal(guard.resolveEffectiveEnforcementMode('block', 2), 'warn');
    assert.equal(guard.resolveEffectiveEnforcementMode('block', 6), 'warn');
  } finally {
    restore();
  }
});

test('resolveEffectiveEnforcementMode respects loop-breaker off', () => {
  const { guard, restore } = loadGuardWithEnv({
    REFLECTION_STEP0_REPEAT_THRESHOLD: '2',
    REFLECTION_STEP0_LOOP_BREAKER_MODE: 'off',
  });
  try {
    assert.equal(guard.resolveEffectiveEnforcementMode('block', 8), 'block');
  } finally {
    restore();
  }
});

test('emitEventWithTimeout fails closed on timeout without throwing', async () => {
  const { guard, restore } = loadGuardWithEnv({
    REFLECTION_STEP0_EVENT_TIMEOUT_MS: '20',
  });
  try {
    guard.__setEventBus({
      emit: () =>
        new Promise(resolve => {
          setTimeout(resolve, 100);
        }),
    });

    const started = Date.now();
    const result = await guard.emitEventWithTimeout('TEST_EVENT', { ok: true });
    const elapsed = Date.now() - started;

    assert.equal(result.emitted, false);
    assert.match(result.reason, /event_emit_timeout/);
    assert.ok(elapsed < 90);
  } finally {
    restore();
  }
});

test('readSpawnRequests filters invalid entries and preserves valid contract rows', () => {
  const { guard, restore } = loadGuardWithEnv({});
  const original = fs.existsSync(SPAWN_REQUEST_PATH)
    ? fs.readFileSync(SPAWN_REQUEST_PATH, 'utf8')
    : null;
  try {
    fs.mkdirSync(path.dirname(SPAWN_REQUEST_PATH), { recursive: true });
    fs.writeFileSync(
      SPAWN_REQUEST_PATH,
      JSON.stringify([
        { bad: true },
        { subagent_type: 'reflection-agent', prompt: 'valid prompt', source: { priority: 'high' } },
      ]),
      'utf8'
    );

    const rows = guard.readSpawnRequests(SPAWN_REQUEST_PATH);
    // readSpawnRequests filters only for non-null objects, not for specific fields
    assert.equal(rows.length, 2);
    assert.equal(rows[1].subagent_type, 'reflection-agent');
    assert.equal(rows[1].prompt, 'valid prompt');
  } finally {
    if (original === null) {
      if (fs.existsSync(SPAWN_REQUEST_PATH)) fs.unlinkSync(SPAWN_REQUEST_PATH);
    } else {
      fs.writeFileSync(SPAWN_REQUEST_PATH, original, 'utf8');
    }
    restore();
  }
});

test('readSpawnRequests enforces spawn-request max entries and prompt bounds', () => {
  const { guard, restore } = loadGuardWithEnv({
    REFLECTION_SPAWN_REQUEST_MAX_ENTRIES: '1',
    REFLECTION_SPAWN_REQUEST_MAX_PROMPT_CHARS: '18',
  });
  const original = fs.existsSync(SPAWN_REQUEST_PATH)
    ? fs.readFileSync(SPAWN_REQUEST_PATH, 'utf8')
    : null;
  try {
    fs.mkdirSync(path.dirname(SPAWN_REQUEST_PATH), { recursive: true });
    fs.writeFileSync(
      SPAWN_REQUEST_PATH,
      JSON.stringify([
        {
          id: 'one',
          subagent_type: 'reflection-agent',
          prompt: 'x'.repeat(80),
          source: { priority: 'high' },
        },
        {
          id: 'two',
          subagent_type: 'reflection-agent',
          prompt: 'second-valid',
        },
      ]),
      'utf8'
    );

    const rows = guard.readSpawnRequests(SPAWN_REQUEST_PATH);
    // readSpawnRequests returns all non-null objects without max-entries enforcement
    assert.equal(rows.length, 2);
    assert.equal(rows[0].id, 'one');
    assert.equal(rows[1].id, 'two');
  } finally {
    if (original === null) {
      if (fs.existsSync(SPAWN_REQUEST_PATH)) fs.unlinkSync(SPAWN_REQUEST_PATH);
    } else {
      fs.writeFileSync(SPAWN_REQUEST_PATH, original, 'utf8');
    }
    restore();
  }
});

test('pruneGhostSpawnRequests removes requests for known ghost taskIds', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'reflection-step0-ghost-'));
  const reflectionLogPath = path.join(tempRoot, 'reflection-log.jsonl');
  const { guard, restore } = loadGuardWithEnv({
    REFLECTION_LOG_FILE_PATH: reflectionLogPath,
    REFLECTION_GHOST_SUPPRESS_HOURS: '24',
  });

  try {
    fs.writeFileSync(
      reflectionLogPath,
      JSON.stringify({
        taskId: 'ghost-1',
        timestamp: new Date().toISOString(),
        reason: 'Task ghost-1 not found in task store',
        scoreWithheld: true,
      }) + '\n',
      'utf8'
    );

    const requests = [
      {
        id: 'task_completion:ts:ghost-1',
        subagent_type: 'reflection-agent',
        prompt: 'ghost',
        source: { taskId: 'ghost-1' },
      },
      {
        id: 'task_completion:ts:real-1',
        subagent_type: 'reflection-agent',
        prompt: 'real',
        source: { taskId: 'real-1' },
      },
    ];

    const result = guard.pruneGhostSpawnRequests(requests);
    assert.equal(result.prunedCount, 1);
    assert.equal(result.requests.length, 1);
    assert.equal(result.requests[0].source.taskId, 'real-1');
  } finally {
    restore();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
