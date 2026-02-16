'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const CONTRACT_PATH = path.join(
  process.cwd(),
  '.claude',
  'lib',
  'reflection',
  'spawn-request-contract.cjs'
);

function loadContractWithEnv(overrides = {}) {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === null || value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }

  delete require.cache[require.resolve(CONTRACT_PATH)];
  const contract = require(CONTRACT_PATH);

  return {
    contract,
    restore: () => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      delete require.cache[require.resolve(CONTRACT_PATH)];
    },
  };
}

test('parseSpawnRequests caps entries at REFLECTION_SPAWN_REQUEST_MAX_ENTRIES', () => {
  const { contract, restore } = loadContractWithEnv({
    REFLECTION_SPAWN_REQUEST_MAX_ENTRIES: '2',
  });

  try {
    const input = JSON.stringify([
      { id: 'a', subagent_type: 'reflection-agent', prompt: 'p1' },
      { id: 'b', subagent_type: 'reflection-agent', prompt: 'p2' },
      { id: 'c', subagent_type: 'reflection-agent', prompt: 'p3' },
    ]);

    const rows = contract.parseSpawnRequests(input);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].id, 'a');
    assert.equal(rows[1].id, 'b');
  } finally {
    restore();
  }
});

test('parseSpawnRequests truncates prompt to REFLECTION_SPAWN_REQUEST_MAX_PROMPT_CHARS', () => {
  const { contract, restore } = loadContractWithEnv({
    REFLECTION_SPAWN_REQUEST_MAX_PROMPT_CHARS: '24',
  });

  try {
    const longPrompt = 'x'.repeat(200);
    const input = JSON.stringify([
      { id: 'p-long', subagent_type: 'reflection-agent', prompt: longPrompt },
    ]);

    const rows = contract.parseSpawnRequests(input);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].prompt.length, 24);
  } finally {
    restore();
  }
});

test('parseSpawnRequests rejects entries missing required fields', () => {
  const { contract, restore } = loadContractWithEnv();
  try {
    const input = JSON.stringify([
      { id: 'bad-1' },
      { id: 'good-1', subagent_type: 'reflection-agent', prompt: 'ok prompt' },
      null,
      'junk',
    ]);
    const rows = contract.parseSpawnRequests(input);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 'good-1');
  } finally {
    restore();
  }
});
