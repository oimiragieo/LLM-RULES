#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MODULE_PATH = path.join(
  __dirname,
  '..',
  '..',
  '.claude',
  'hooks',
  'routing',
  'pre-tool-unified.cjs'
);

function loadWithEnv(env) {
  const previous = {};
  for (const [key, value] of Object.entries(env)) {
    previous[key] = process.env[key];
    process.env[key] = String(value);
  }
  delete require.cache[require.resolve(MODULE_PATH)];
  const mod = require(MODULE_PATH);
  return {
    mod,
    restore() {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      delete require.cache[require.resolve(MODULE_PATH)];
    },
  };
}

test('circuit breaker escalates repeated identical Bash guardrail blocks', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pretool-circuit-'));
  const stateFile = path.join(tempDir, 'pretool-circuit-state.json');
  const { mod, restore } = loadWithEnv({
    PRETOOL_CIRCUIT_STATE_FILE: stateFile,
    PRETOOL_CIRCUIT_BREAKER_THRESHOLD: '2',
    PRETOOL_CIRCUIT_BREAKER_WINDOW_MS: '60000',
  });
  try {
    const hookInput = { session_id: 'session-circuit-test' };
    const original =
      '[ROUTER-FIRST PROTOCOL VIOLATION][AGENT-GUARDRAIL] Windows-incompatible Bash heredoc/tmp command blocked.';

    const first = mod.applyCircuitBreakerMessage('Bash', original, hookInput);
    assert.equal(first, original);

    const second = mod.applyCircuitBreakerMessage('Bash', original, hookInput);
    assert.match(second, /\[CIRCUIT-BREAKER\]/);
    assert.match(second, /Stop retrying the same command/);
  } finally {
    restore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
