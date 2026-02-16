#!/usr/bin/env node
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const persistenceMethods = require('../../../.claude/lib/workflow/workflow-engine-methods-persistence.cjs');

test('resume fails with explicit error when checkpoint JSON is malformed', async () => {
  const checkpointDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-engine-persist-'));
  const checkpointId = 'checkpoint-run1-bad';
  const checkpointPath = path.join(checkpointDir, `${checkpointId}.json`);
  fs.writeFileSync(checkpointPath, '{bad json', 'utf8');

  const fakeEngine = {
    options: { checkpointDir },
    state: { runId: 'run1' },
    emit() {},
  };

  await assert.rejects(async () => {
    await persistenceMethods.resume.call(fakeEngine, checkpointId);
  }, /Invalid checkpoint/i);

  fs.rmSync(checkpointDir, { recursive: true, force: true });
});
