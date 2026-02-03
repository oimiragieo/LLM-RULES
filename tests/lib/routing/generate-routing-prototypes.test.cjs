#!/usr/bin/env node
'use strict';

const assert = require('node:assert');
const { describe, it } = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

describe('generate-routing-prototypes CLI', () => {
  it('creates a routing-prototypes.json file', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'routing-proto-cli-'));
    const outputPath = path.join(tmpDir, 'routing-prototypes.json');

    const result = spawnSync(
      process.execPath,
      ['.claude/tools/cli/generate-routing-prototypes.cjs', '--output', outputPath],
      {
        cwd: path.resolve(__dirname, '..', '..', '..'),
        env: { ...process.env, CODE_INDEX_EMBEDDER: 'mock' },
        encoding: 'utf8',
      }
    );

    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
    assert.ok(fs.existsSync(outputPath), 'routing-prototypes.json should exist');

    const payload = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.strictEqual(typeof payload.version, 'string');
    assert.strictEqual(typeof payload.dimensions, 'number');
    assert.ok(payload.prototypes && typeof payload.prototypes === 'object');
    assert.ok(Object.keys(payload.prototypes).length > 0, 'should contain prototypes');
  });
});
