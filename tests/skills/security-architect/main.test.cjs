'use strict';

/**
 * Tests for security-architect dispatcher (main.cjs)
 * Task: task-20 (M8)
 */

const assert = require('assert');
const { describe, it, before } = require('node:test');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawnSync } = require('child_process');

const MAIN_PATH = path.resolve(
  __dirname,
  '../../../.claude/skills/security-architect/scripts/main.cjs'
);

// Load the dispatcher module
const dispatcher = require(MAIN_PATH);
const { parseArgs, runAudit, generateReport, ACTIONS } = dispatcher;

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------

describe('parseArgs', () => {
  it('returns empty object for no args', () => {
    const opts = parseArgs(['node', 'main.cjs']);
    assert.deepStrictEqual(opts, {});
  });

  it('parses --action audit', () => {
    const opts = parseArgs(['node', 'main.cjs', '--action', 'audit']);
    assert.strictEqual(opts.action, 'audit');
  });

  it('parses boolean flag --help', () => {
    const opts = parseArgs(['node', 'main.cjs', '--help']);
    assert.strictEqual(opts.help, true);
  });

  it('parses --output /tmp/report.md', () => {
    const opts = parseArgs(['node', 'main.cjs', '--output', '/tmp/report.md']);
    assert.strictEqual(opts.output, '/tmp/report.md');
  });

  it('parses multiple flags', () => {
    const opts = parseArgs(['node', 'main.cjs', '--action', 'scan', '--config', 'p/owasp-top-ten']);
    assert.strictEqual(opts.action, 'scan');
    assert.strictEqual(opts.config, 'p/owasp-top-ten');
  });
});

// ---------------------------------------------------------------------------
// ACTIONS map
// ---------------------------------------------------------------------------

describe('ACTIONS map', () => {
  it('contains audit, scan, report actions', () => {
    assert.ok(typeof ACTIONS.audit === 'function', 'ACTIONS.audit should be a function');
    assert.ok(typeof ACTIONS.scan === 'function', 'ACTIONS.scan should be a function');
    assert.ok(typeof ACTIONS.report === 'function', 'ACTIONS.report should be a function');
  });
});

// ---------------------------------------------------------------------------
// generateReport
// ---------------------------------------------------------------------------

describe('generateReport', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sec-test-'));
  });

  it('writes a markdown file and returns reportPath', () => {
    const findings = [
      { severity: 'high', package: 'lodash', message: 'Prototype Pollution' },
      { severity: 'low', package: 'debug', message: 'ReDoS' },
    ];
    const { reportPath } = generateReport({
      findings,
      tool: 'pnpm-audit',
      projectRoot: tmpDir,
    });

    assert.ok(fs.existsSync(reportPath), `Report file should exist at ${reportPath}`);
    const content = fs.readFileSync(reportPath, 'utf8');
    assert.ok(content.includes('# Security Scan Report'), 'Report should have header');
    assert.ok(content.includes('pnpm-audit'), 'Report should include tool name');
    assert.ok(content.includes('lodash'), 'Report should include package name');
    assert.ok(
      content.includes('Total findings:** 2') || content.includes('Total findings: 2'),
      'Report should include finding count'
    );
  });

  it('handles empty findings gracefully', () => {
    const { reportPath } = generateReport({
      findings: [],
      tool: 'test',
      projectRoot: tmpDir,
    });
    assert.ok(fs.existsSync(reportPath), 'Report file should exist for empty findings');
    const content = fs.readFileSync(reportPath, 'utf8');
    assert.ok(content.includes('No findings reported'), 'Should indicate no findings');
  });

  it('creates reports directory if missing', () => {
    const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sec-isolated-'));
    const { reportPath } = generateReport({
      findings: [],
      tool: 'test',
      projectRoot: isolatedRoot,
    });
    assert.ok(fs.existsSync(reportPath), 'Should create nested dirs and write file');
    fs.rmSync(isolatedRoot, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// runAudit (integration — requires pnpm)
// ---------------------------------------------------------------------------

describe('runAudit', () => {
  it('returns structured result with vulnerabilities array', function () {
    // Skip if pnpm not available
    const pnpmCheck = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['pnpm'], {
      shell: false,
      encoding: 'utf8',
    });
    if (pnpmCheck.status !== 0) {
      // pnpm not available in test environment — skip
      return;
    }

    const result = runAudit({ cwd: path.resolve(__dirname, '../../..') });
    assert.ok(Array.isArray(result.vulnerabilities), 'vulnerabilities should be an array');
    // Each entry should have the expected shape
    for (const v of result.vulnerabilities) {
      assert.ok(typeof v.severity === 'string', 'severity should be string');
      assert.ok(typeof v.package === 'string', 'package should be string');
      assert.ok(typeof v.advisory === 'string', 'advisory should be string');
    }
  });
});

// ---------------------------------------------------------------------------
// CLI smoke test: --help exits 0
// ---------------------------------------------------------------------------

describe('CLI --help', () => {
  it('exits 0 and includes usage text', () => {
    const result = spawnSync('node', [MAIN_PATH, '--help'], {
      shell: false,
      encoding: 'utf8',
    });
    assert.strictEqual(result.status, 0, `Expected exit 0, got ${result.status}`);
    assert.ok(result.stdout.includes('security-architect'), 'stdout should include skill name');
    assert.ok(result.stdout.includes('--action'), 'stdout should include --action flag docs');
  });
});

// ---------------------------------------------------------------------------
// CLI smoke test: --list exits 0
// ---------------------------------------------------------------------------

describe('CLI --list', () => {
  it('exits 0 and lists available actions', () => {
    const result = spawnSync('node', [MAIN_PATH, '--list'], {
      shell: false,
      encoding: 'utf8',
    });
    assert.strictEqual(result.status, 0, `Expected exit 0, got ${result.status}`);
    assert.ok(result.stdout.includes('audit'), 'stdout should list audit action');
    assert.ok(result.stdout.includes('scan'), 'stdout should list scan action');
    assert.ok(result.stdout.includes('report'), 'stdout should list report action');
  });
});

// ---------------------------------------------------------------------------
// CLI smoke test: missing --action exits 1
// ---------------------------------------------------------------------------

describe('CLI missing --action', () => {
  it('exits 1 with error message', () => {
    const result = spawnSync('node', [MAIN_PATH], {
      shell: false,
      encoding: 'utf8',
    });
    assert.strictEqual(result.status, 1, `Expected exit 1, got ${result.status}`);
    assert.ok(result.stderr.includes('--action'), 'stderr should mention --action');
  });
});

// ---------------------------------------------------------------------------
// CLI smoke test: unknown --action exits 1
// ---------------------------------------------------------------------------

describe('CLI unknown --action', () => {
  it('exits 1 with error message', () => {
    const result = spawnSync('node', [MAIN_PATH, '--action', 'nonexistent-action-xyz'], {
      shell: false,
      encoding: 'utf8',
    });
    assert.strictEqual(result.status, 1, `Expected exit 1, got ${result.status}`);
    assert.ok(result.stderr.includes('unknown action'), 'stderr should mention unknown action');
  });
});
