'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const sarifFixture = fs.readFileSync(path.join(FIXTURES_DIR, 'sample-sarif.json'), 'utf-8');

// CLI wrapper module (for mock injection)
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

// Module under test
const main = require(
  path.join(
    __dirname,
    '..',
    '..',
    '..',
    '.claude',
    'skills',
    'medusa-security',
    'scripts',
    'main.cjs'
  )
);

describe('main', () => {
  let originalSpawnSync;

  beforeEach(() => {
    originalSpawnSync = cliWrapper._spawnSync;
    // Default mock: return SARIF fixture with exit code 0
    cliWrapper._spawnSync = () => ({
      status: 0,
      stdout: Buffer.from(sarifFixture),
      stderr: Buffer.from(''),
    });
  });

  afterEach(() => {
    cliWrapper._spawnSync = originalSpawnSync;
  });

  test('S27: main.cjs exports runScan function', () => {
    assert.ok(typeof main.runScan === 'function', 'should export runScan');
  });

  test('S28: runScan with mode full builds full scan args', () => {
    let capturedArgs = null;
    cliWrapper._spawnSync = (cmd, args) => {
      capturedArgs = args;
      return { status: 0, stdout: Buffer.from(sarifFixture), stderr: Buffer.from('') };
    };

    main.runScan({ mode: 'full', target: '.' });

    assert.ok(capturedArgs, 'spawnSync should have been called');
    assert.ok(capturedArgs.includes('scan'), 'should include scan command');
    assert.ok(capturedArgs.includes('.'), 'should include target');
    // full mode should NOT include --ai-only or --quick
    assert.ok(!capturedArgs.includes('--ai-only'), 'full mode should not include --ai-only');
    assert.ok(!capturedArgs.includes('--quick'), 'full mode should not include --quick');
  });

  test('S29: runScan with mode ai-only passes --ai-only', () => {
    let capturedArgs = null;
    cliWrapper._spawnSync = (cmd, args) => {
      capturedArgs = args;
      return { status: 0, stdout: Buffer.from(sarifFixture), stderr: Buffer.from('') };
    };

    main.runScan({ mode: 'ai-only', target: '.' });

    assert.ok(capturedArgs, 'spawnSync should have been called');
    assert.ok(capturedArgs.includes('--ai-only'), 'should include --ai-only flag');
  });

  test('S30: runScan with mode quick passes --quick', () => {
    let capturedArgs = null;
    cliWrapper._spawnSync = (cmd, args) => {
      capturedArgs = args;
      return { status: 0, stdout: Buffer.from(sarifFixture), stderr: Buffer.from('') };
    };

    main.runScan({ mode: 'quick', target: '.' });

    assert.ok(capturedArgs, 'spawnSync should have been called');
    assert.ok(capturedArgs.includes('--quick'), 'should include --quick flag');
  });

  test('S31: runScan with mode targeted passes scanner list', () => {
    let capturedArgs = null;
    cliWrapper._spawnSync = (cmd, args) => {
      capturedArgs = args;
      return { status: 0, stdout: Buffer.from(sarifFixture), stderr: Buffer.from('') };
    };

    main.runScan({ mode: 'targeted', target: '.', scanners: ['mcp'] });

    assert.ok(capturedArgs, 'spawnSync should have been called');
    assert.ok(capturedArgs.includes('--scanners'), 'should include --scanners flag');
    const scannerIdx = capturedArgs.indexOf('--scanners');
    assert.strictEqual(capturedArgs[scannerIdx + 1], 'mcp', 'should pass mcp scanner');
  });

  test('S32: runScan returns findings, summary, report, exitCode', () => {
    const result = main.runScan({ mode: 'full', target: '.' });

    assert.ok(Array.isArray(result.findings), 'should have findings array');
    assert.ok(result.findings.length > 0, 'should have findings');
    assert.ok(result.summary, 'should have summary object');
    assert.ok(typeof result.summary.total === 'number', 'summary should have total');
    assert.ok(typeof result.summary.critical === 'number', 'summary should have critical');
    assert.ok(
      typeof result.summary.securityScore === 'number',
      'summary should have securityScore'
    );
    assert.ok(typeof result.report === 'string', 'should have report string');
    assert.ok(result.report.includes('# '), 'report should be markdown');
    assert.ok(typeof result.exitCode === 'number', 'should have exitCode');
  });

  test('S33: runScan with failOn returns correct exit status based on findings', () => {
    // Mock returns findings above threshold (exit code 1)
    cliWrapper._spawnSync = () => ({
      status: 1,
      stdout: Buffer.from(sarifFixture),
      stderr: Buffer.from(''),
    });

    const result = main.runScan({ mode: 'full', target: '.', failOn: 'high' });
    assert.strictEqual(
      result.exitCode,
      1,
      'should return exit code 1 when findings exceed threshold'
    );
    assert.ok(result.findings.length > 0, 'should still have findings');

    // Mock returns clean scan (exit code 0, empty SARIF)
    const emptySarif = fs.readFileSync(path.join(FIXTURES_DIR, 'empty-sarif.json'), 'utf-8');
    cliWrapper._spawnSync = () => ({
      status: 0,
      stdout: Buffer.from(emptySarif),
      stderr: Buffer.from(''),
    });

    const cleanResult = main.runScan({ mode: 'full', target: '.', failOn: 'high' });
    assert.strictEqual(cleanResult.exitCode, 0, 'should return exit code 0 when no findings');
    assert.strictEqual(cleanResult.findings.length, 0, 'should have 0 findings');
  });
});
