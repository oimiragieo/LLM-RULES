#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawnSync } = require('child_process');

describe('setup-package-manager CLI', () => {
  it('prints help and exits 0', () => {
    const scriptPath = path.join(
      __dirname,
      '..',
      '..',
      '.claude',
      'scripts',
      'setup-package-manager.cjs'
    );
    const result = spawnSync(process.execPath, [scriptPath, '--help'], {
      encoding: 'utf8',
    });

    assert.strictEqual(result.status, 0);
    assert.ok((result.stdout || '').includes('Usage:'));
  });
});
