'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const TOOL_PATH = path.join(ROOT, '.claude/tools/cuj-smoke-matrix.mjs');

describe('CUJ smoke matrix contract', () => {
  test('restores the workflow tool at the expected path', () => {
    assert.ok(fs.existsSync(TOOL_PATH), `Missing workflow tool at ${TOOL_PATH}`);
  });

  test('simulation-only run writes json and markdown outputs', () => {
    assert.ok(fs.existsSync(TOOL_PATH), `Missing workflow tool at ${TOOL_PATH}`);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cuj-smoke-contract-'));
    const jsonPath = path.join(tempDir, 'smoke-results.json');
    const mdPath = path.join(tempDir, 'smoke-report.md');

    const result = spawnSync(
      process.execPath,
      [
        TOOL_PATH,
        '--simulation-only',
        '--output-json',
        jsonPath,
        '--output-md',
        mdPath,
        '--cujs',
        'CUJ-001',
      ],
      {
        cwd: ROOT,
        encoding: 'utf8',
      }
    );

    assert.equal(
      result.status,
      0,
      `Expected smoke CLI to exit 0.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
    assert.ok(fs.existsSync(jsonPath), `Missing JSON output at ${jsonPath}`);
    assert.ok(fs.existsSync(mdPath), `Missing Markdown output at ${mdPath}`);

    const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    assert.equal(typeof json.total, 'number');
    assert.equal(typeof json.passed, 'number');
    assert.equal(typeof json.failed, 'number');
    assert.equal(typeof json.duration_ms, 'number');
    assert.ok(Array.isArray(json.cujs), 'Expected cujs to be an array');
    assert.equal(json.total, json.cujs.length);
    assert.ok(json.cujs.length > 0, 'Expected at least one CUJ result');

    for (const cuj of json.cujs) {
      assert.equal(typeof cuj.cujId, 'string');
      assert.equal(typeof cuj.execution_mode, 'string');
      assert.ok(Array.isArray(cuj.errors), 'Expected CUJ errors to be an array');
    }
  });
});
