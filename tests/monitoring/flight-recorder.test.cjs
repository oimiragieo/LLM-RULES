#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  record,
  rotateIfNeeded,
  _logBuffer,
} = require('../../.claude/lib/monitoring/flight-recorder.cjs');

test('rotateIfNeeded debounces missing-file probes before rechecking', t => {
  const realExistsSync = fs.existsSync;
  const realDateNow = Date.now;
  const fakePath = path.join(
    os.tmpdir(),
    `flight-recorder-missing-${process.pid}-${Math.random().toString(16).slice(2)}.jsonl`
  );

  let now = 1_710_000_000_000;
  let existsCalls = 0;

  fs.existsSync = targetPath => {
    if (targetPath === fakePath) {
      existsCalls += 1;
      return false;
    }
    return realExistsSync(targetPath);
  };

  Date.now = () => now;

  t.after(() => {
    fs.existsSync = realExistsSync;
    Date.now = realDateNow;
  });

  assert.equal(rotateIfNeeded(fakePath), null);
  assert.equal(rotateIfNeeded(fakePath), null);
  assert.equal(existsCalls, 1);

  now += 251;

  assert.equal(rotateIfNeeded(fakePath), null);
  assert.equal(existsCalls, 2);
});

test('record skips rotation probes while writes are buffered for a missing file', t => {
  const realExistsSync = fs.existsSync;
  const realDateNow = Date.now;
  const fakePath = path.join(
    os.tmpdir(),
    `flight-recorder-buffered-${process.pid}-${Math.random().toString(16).slice(2)}.jsonl`
  );

  let now = 1_710_100_000_000;
  let existsCalls = 0;

  _logBuffer.close();

  fs.existsSync = targetPath => {
    if (targetPath === fakePath) {
      existsCalls += 1;
      return false;
    }
    return realExistsSync(targetPath);
  };

  Date.now = () => now;

  t.after(() => {
    _logBuffer.close();
    fs.existsSync = realExistsSync;
    Date.now = realDateNow;
    fs.rmSync(fakePath, { force: true });
  });

  record({ event: 'buffered-first' }, fakePath);
  assert.ok(_logBuffer.buffer.length > 0);
  assert.equal(_logBuffer.writeStream, null);

  now += 1000;

  record({ event: 'buffered-second' }, fakePath);

  assert.equal(existsCalls, 1);
});
