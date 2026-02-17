'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const sarifFixture = fs.readFileSync(path.join(FIXTURES_DIR, 'sample-sarif.json'), 'utf-8');

// Module under test
const cliWrapper = require(
  path.join(
    __dirname,
    '..',
    '..',
    '..',
    '.claude',
    'skills',
    'medusa-security',
    'scripts',
    'cli-wrapper.cjs'
  )
);

const { buildScanArgs, checkInstallation, runMedusaScan } = cliWrapper;

describe('cli-wrapper', () => {
  describe('buildScanArgs', () => {
    test('S10: basic target returns scan with sarif format', () => {
      const args = buildScanArgs({ target: '.' });
      assert.deepStrictEqual(args, ['scan', '.', '--format', 'sarif']);
    });

    test('S11: aiOnly option includes --ai-only flag', () => {
      const args = buildScanArgs({ target: '.', aiOnly: true });
      assert.ok(args.includes('--ai-only'), 'should include --ai-only');
      assert.deepStrictEqual(args, ['scan', '.', '--format', 'sarif', '--ai-only']);
    });

    test('S12: quick option includes --quick flag', () => {
      const args = buildScanArgs({ target: '.', quick: true });
      assert.ok(args.includes('--quick'), 'should include --quick');
    });

    test('S13: scanners option builds correctly', () => {
      const args = buildScanArgs({ target: '.', scanners: ['prompt-injection', 'mcp'] });
      assert.ok(args.includes('--scanners'), 'should include --scanners flag');
      const scannerIdx = args.indexOf('--scanners');
      assert.strictEqual(args[scannerIdx + 1], 'prompt-injection,mcp');
    });

    test('S14: failOn option includes --fail-on flag', () => {
      const args = buildScanArgs({ target: '.', failOn: 'high' });
      assert.ok(args.includes('--fail-on'), 'should include --fail-on');
      const idx = args.indexOf('--fail-on');
      assert.strictEqual(args[idx + 1], 'high');
    });

    test('S15: exclude option includes -e flags', () => {
      const args = buildScanArgs({ target: '.', exclude: ['node_modules', '.git'] });
      const eIndices = args.reduce((acc, val, idx) => {
        if (val === '-e') acc.push(idx);
        return acc;
      }, []);
      assert.strictEqual(eIndices.length, 2, 'should have 2 -e flags');
      assert.strictEqual(args[eIndices[0] + 1], 'node_modules');
      assert.strictEqual(args[eIndices[1] + 1], '.git');
    });

    test('S16: default format is sarif when no format specified', () => {
      const args = buildScanArgs({ target: '.' });
      assert.ok(args.includes('--format'), 'should include --format');
      const idx = args.indexOf('--format');
      assert.strictEqual(args[idx + 1], 'sarif');
    });
  });

  describe('checkInstallation', () => {
    let originalSpawnSync;

    beforeEach(() => {
      originalSpawnSync = cliWrapper._spawnSync;
    });

    afterEach(() => {
      cliWrapper._spawnSync = originalSpawnSync;
    });

    test('S17: returns installed true with version when medusa is found', () => {
      cliWrapper._spawnSync = () => ({
        status: 0,
        stdout: Buffer.from('medusa-security 2026.3.0\n'),
        stderr: Buffer.from(''),
      });

      const result = checkInstallation();
      assert.strictEqual(result.installed, true);
      assert.strictEqual(result.version, '2026.3.0');
    });

    test('S18: returns installed false when medusa is not found', () => {
      cliWrapper._spawnSync = () => ({
        status: 1,
        stdout: Buffer.from(''),
        stderr: Buffer.from('No module named medusa'),
        error: null,
      });

      const result = checkInstallation();
      assert.strictEqual(result.installed, false);
      assert.strictEqual(result.version, null);
      assert.ok(result.error, 'should have error string');
    });
  });

  describe('runMedusaScan', () => {
    let originalSpawnSync;

    beforeEach(() => {
      originalSpawnSync = cliWrapper._spawnSync;
    });

    afterEach(() => {
      cliWrapper._spawnSync = originalSpawnSync;
    });

    test('S19: calls spawnSync with correct args', () => {
      let capturedArgs = null;
      let capturedOpts = null;

      cliWrapper._spawnSync = (cmd, args, opts) => {
        capturedArgs = { cmd, args };
        capturedOpts = opts;
        return {
          status: 0,
          stdout: Buffer.from(sarifFixture),
          stderr: Buffer.from(''),
        };
      };

      runMedusaScan('.', { aiOnly: true });

      assert.ok(capturedArgs, 'spawnSync should have been called');
      assert.strictEqual(capturedArgs.cmd, 'python');
      assert.deepStrictEqual(capturedArgs.args[0], '-m');
      assert.deepStrictEqual(capturedArgs.args[1], 'medusa');
      assert.ok(capturedArgs.args.includes('--ai-only'), 'should include --ai-only');
      assert.strictEqual(capturedOpts.shell, false, 'must use shell: false');
    });

    test('S20: returns exitCode 1 with findings when scan finds issues above threshold', () => {
      cliWrapper._spawnSync = () => ({
        status: 1,
        stdout: Buffer.from(sarifFixture),
        stderr: Buffer.from(''),
      });

      const result = runMedusaScan('.', { failOn: 'high' });
      assert.strictEqual(result.exitCode, 1);
      assert.ok(Array.isArray(result.findings), 'should have findings array');
      assert.ok(result.findings.length > 0, 'should have findings');
    });
  });
});
