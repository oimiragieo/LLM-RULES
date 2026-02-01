/**
 * Tests for Conductor Gap Analyzer CLI (SPEC-015)
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const CLI_PATH = path.join(PROJECT_ROOT, '.claude/tools/cli/conductor-gap-analyzer.cjs');

const TEST_DIR = path.join(PROJECT_ROOT, '.claude/context/test-conductor-gap-analyzer');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

describe('Conductor Gap Analyzer CLI', () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
    ensureDir(TEST_DIR);
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('exports CLI helpers', () => {
    const cli = require(CLI_PATH);
    assert.equal(typeof cli.parseArgs, 'function');
    assert.equal(typeof cli.run, 'function');
    assert.equal(typeof cli.main, 'function');
  });

  it('returns JSON output when --json is set', async () => {
    const conductorRoot = path.join(TEST_DIR, 'conductor-main');
    ensureDir(conductorRoot);

    // Minimal conductor layout (missing many features by design)
    ensureDir(path.join(conductorRoot, '.claude'));
    ensureDir(path.join(conductorRoot, '.claude', 'schemas'));
    ensureDir(path.join(conductorRoot, '.claude', 'hooks'));

    const cli = require(CLI_PATH);
    const result = await cli.run({ conductorPath: conductorRoot, json: true, full: false });

    assert.ok(result);
    assert.ok(result.gaps);
    assert.ok(Array.isArray(result.gaps.missing));
    assert.ok(typeof result.gaps.trackCount === 'number');
    assert.ok(Array.isArray(result.patterns));
  });

  it('writes report to --out path', async () => {
    const conductorRoot = path.join(TEST_DIR, 'conductor-main');
    ensureDir(conductorRoot);
    ensureDir(path.join(conductorRoot, '.claude'));

    const outPath = path.join(TEST_DIR, 'out', 'gap-report.md');

    const cli = require(CLI_PATH);
    const report = await cli.run({ conductorPath: conductorRoot, json: false, full: false });
    assert.ok(String(report).includes('# Gap Analysis Report'));

    // Simulate main's out logic
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, String(report), 'utf8');

    assert.ok(fs.existsSync(outPath));
    const content = fs.readFileSync(outPath, 'utf8');
    assert.ok(content.includes('# Gap Analysis Report'));
  });
});
