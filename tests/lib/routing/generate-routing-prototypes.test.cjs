#!/usr/bin/env node
'use strict';

const assert = require('node:assert');
const { describe, it } = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const semanticRouter = require('../../../.claude/lib/routing/semantic-router.cjs');
const { DOMAIN_SUB_ROUTERS } = require('../../../.claude/lib/routing/sub-router-selection.cjs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const ROUTING_PROTOTYPES_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'config',
  'routing-prototypes.json'
);

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

  it('regenerates prototypes for the full agent graph including all sub-routers', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'routing-proto-full-'));
    const outputPath = path.join(tmpDir, 'routing-prototypes.json');

    const result = spawnSync(
      process.execPath,
      ['.claude/tools/cli/generate-routing-prototypes.cjs', '--output', outputPath],
      {
        cwd: PROJECT_ROOT,
        env: { ...process.env, CODE_INDEX_EMBEDDER: 'mock' },
        encoding: 'utf8',
      }
    );

    assert.strictEqual(result.status, 0, result.stderr || result.stdout);

    const payload = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    const prototypeIds = Object.keys(payload.prototypes);

    assert.ok(
      prototypeIds.length >= 115,
      `expected at least 115 prototypes, got ${prototypeIds.length}`
    );

    for (const subRouter of DOMAIN_SUB_ROUTERS) {
      assert.ok(Array.isArray(payload.prototypes[subRouter]), `missing prototype for ${subRouter}`);
      assert.strictEqual(
        payload.prototypes[subRouter].length,
        payload.dimensions,
        `dimension mismatch for ${subRouter}`
      );
    }

    for (let i = 0; i < DOMAIN_SUB_ROUTERS.length; i++) {
      for (let j = i + 1; j < DOMAIN_SUB_ROUTERS.length; j++) {
        const left = DOMAIN_SUB_ROUTERS[i];
        const right = DOMAIN_SUB_ROUTERS[j];
        const similarity = semanticRouter.cosineSimilarity(
          payload.prototypes[left],
          payload.prototypes[right]
        );

        assert.ok(
          similarity < 0.85,
          `expected ${left} and ${right} similarity < 0.85, got ${similarity}`
        );
      }
    }
  });

  it('checked-in routing-prototypes.json contains all domain sub-router entries', () => {
    const payload = JSON.parse(fs.readFileSync(ROUTING_PROTOTYPES_PATH, 'utf8'));

    assert.strictEqual(typeof payload.dimensions, 'number');

    for (const subRouter of DOMAIN_SUB_ROUTERS) {
      assert.ok(
        Array.isArray(payload.prototypes?.[subRouter]),
        `missing ${subRouter} in repo file`
      );
      assert.strictEqual(
        payload.prototypes[subRouter].length,
        payload.dimensions,
        `invalid embedding length for ${subRouter}`
      );
    }
  });
});
