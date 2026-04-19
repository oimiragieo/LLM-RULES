'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { makeViolation } = require('../../helpers/violation-tracker-test-utils.cjs');

// Module under test
const {
  recordViolation,
  getViolationStats,
  checkThreshold,
  _resetForTesting,
} = require('../../../.claude/lib/monitoring/violation-tracker.cjs');

function createMetricsFixture(prefix) {
  let tempDir;
  let metricsFile;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    metricsFile = path.join(tempDir, 'router-violations.jsonl');
  });

  beforeEach(() => {
    if (fs.existsSync(metricsFile)) {
      fs.unlinkSync(metricsFile);
    }
    _resetForTesting();
  });

  after(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  return {
    getTempDir: () => tempDir,
    getMetricsFile: () => metricsFile,
  };
}

describe('recordViolation', () => {
  const fixture = createMetricsFixture('violation-tracker-test-');

  it('writes a JSONL entry to router-violations.jsonl', () => {
    const metricsFile = fixture.getMetricsFile();
    const violation = makeViolation({ sessionId: 'test-session' });

    recordViolation(violation, metricsFile);

    assert.ok(fs.existsSync(metricsFile));
    const content = fs.readFileSync(metricsFile, 'utf8');
    const lines = content.trim().split('\n');

    assert.equal(lines.length, 1);
    const entry = JSON.parse(lines[0]);
    assert.equal(entry.tool, 'Grep');
    assert.equal(entry.action, 'warn');
  });

  it('creates metrics directory if it does not exist', () => {
    const nestedDir = path.join(fixture.getTempDir(), 'nested', 'metrics');
    const nestedFile = path.join(nestedDir, 'router-violations.jsonl');
    const violation = makeViolation({ tool: 'Glob', action: 'block' });

    recordViolation(violation, nestedFile);

    assert.ok(fs.existsSync(nestedDir));
    assert.ok(fs.existsSync(nestedFile));
  });

  it('appends multiple violations as separate lines', () => {
    const metricsFile = fixture.getMetricsFile();
    const violations = [
      makeViolation(),
      makeViolation({ tool: 'Glob' }),
      makeViolation({ tool: 'Write', action: 'block' }),
    ];

    violations.forEach(v => recordViolation(v, metricsFile));

    const content = fs.readFileSync(metricsFile, 'utf8');
    const lines = content.trim().split('\n');

    assert.equal(lines.length, 3);
  });

  it('never throws (best-effort pattern)', () => {
    const tempDir = fixture.getTempDir();
    // Create read-only directory (platform-specific)
    const readonlyDir = path.join(tempDir, 'readonly');
    fs.mkdirSync(readonlyDir, { recursive: true });

    if (process.platform !== 'win32') {
      fs.chmodSync(readonlyDir, 0o444);
    }

    const readonlyFile = path.join(readonlyDir, 'violations.jsonl');

    const violation = makeViolation();

    // Should not throw even with permission error
    assert.doesNotThrow(() => {
      recordViolation(violation, readonlyFile);
    });

    // Restore permissions
    if (process.platform !== 'win32') {
      fs.chmodSync(readonlyDir, 0o755);
    }
  });

  it('[SEC-MON-001] validates tool name against known whitelist', () => {
    const metricsFile = fixture.getMetricsFile();
    const violation = makeViolation({ tool: 'UnknownMaliciousTool' });

    recordViolation(violation, metricsFile);

    const content = fs.readFileSync(metricsFile, 'utf8');
    const entry = JSON.parse(content.trim());

    // Tool name should be replaced with 'UNKNOWN' or entry rejected
    assert.notEqual(entry.tool, 'UnknownMaliciousTool');
  });

  it('[SEC-MON-001] truncates all string fields to 500 characters', () => {
    const metricsFile = fixture.getMetricsFile();
    const violation = makeViolation({ tool: 'A'.repeat(1000) });

    recordViolation(violation, metricsFile);

    const content = fs.readFileSync(metricsFile, 'utf8');
    const entry = JSON.parse(content.trim());

    // Tool name should be truncated
    assert.ok(entry.tool.length <= 500);
  });

  it('[SEC-MON-002] scrubs secret patterns from command field', () => {
    const metricsFile = fixture.getMetricsFile();
    const violation = makeViolation({
      tool: 'Bash',
      action: 'block',
      checkName: 'routerBash',
      command: 'curl -H "Bearer sk-abc123" https://api.example.com',
    });

    recordViolation(violation, metricsFile);

    const content = fs.readFileSync(metricsFile, 'utf8');
    const entry = JSON.parse(content.trim());

    // Secret should be redacted
    assert.ok(!entry.command.includes('sk-abc123'));
    assert.ok(entry.command.includes('[REDACTED]'));
  });

  it('[SEC-MON-002] scrubs ghp_ tokens from command field', () => {
    const metricsFile = fixture.getMetricsFile();
    const violation = makeViolation({
      tool: 'Bash',
      action: 'block',
      checkName: 'routerBash',
      command: 'git push https://ghp_abcdef123@github.com/repo',
    });

    recordViolation(violation, metricsFile);

    const content = fs.readFileSync(metricsFile, 'utf8');
    const entry = JSON.parse(content.trim());

    assert.ok(!entry.command.includes('ghp_abcdef123'));
    assert.ok(entry.command.includes('[REDACTED]'));
  });

  it('[SEC-MON-002] scrubs password= patterns from command field', () => {
    const metricsFile = fixture.getMetricsFile();
    const violation = makeViolation({
      tool: 'Bash',
      action: 'block',
      checkName: 'routerBash',
      command: 'login password=mysecret123',
    });

    recordViolation(violation, metricsFile);

    const content = fs.readFileSync(metricsFile, 'utf8');
    const entry = JSON.parse(content.trim());

    assert.ok(!entry.command.includes('mysecret123'));
    assert.ok(entry.command.includes('[REDACTED]'));
  });

  it('[SEC-MON-002] never includes raw prompt content', () => {
    const metricsFile = fixture.getMetricsFile();
    const violation = makeViolation({ prompt: 'This should not be logged' });

    recordViolation(violation, metricsFile);

    const content = fs.readFileSync(metricsFile, 'utf8');
    const entry = JSON.parse(content.trim());

    // Prompt field should not exist
    assert.ok(!entry.prompt);
  });

  it('includes required fields: timestamp, tool, action, checkName, routerMode, sessionId', () => {
    const metricsFile = fixture.getMetricsFile();
    const violation = makeViolation({ sessionId: 'test-session-123' });

    recordViolation(violation, metricsFile);

    const content = fs.readFileSync(metricsFile, 'utf8');
    const entry = JSON.parse(content.trim());

    assert.ok(entry.timestamp);
    assert.ok(entry.tool);
    assert.ok(entry.action);
    assert.ok(entry.checkName);
    assert.ok(entry.routerMode);
    assert.ok(entry.sessionId);
  });
});

describe('rotation', () => {
  const fixture = createMetricsFixture('violation-rotation-test-');

  it('trims JSONL file when it exceeds maxLines (default 2000)', () => {
    const metricsFile = fixture.getMetricsFile();
    const originalEnv = process.env.VIOLATION_METRICS_MAX_LINES;
    process.env.VIOLATION_METRICS_MAX_LINES = '20';

    try {
      for (let i = 0; i < 25; i++) {
        recordViolation(makeViolation(), metricsFile);
      }

      const content = fs.readFileSync(metricsFile, 'utf8');
      const lines = content.trim().split('\n');

      assert.ok(lines.length <= 20);
    } finally {
      if (originalEnv) {
        process.env.VIOLATION_METRICS_MAX_LINES = originalEnv;
      } else {
        delete process.env.VIOLATION_METRICS_MAX_LINES;
      }
    }
  });

  it('respects VIOLATION_METRICS_MAX_LINES env override', () => {
    const metricsFile = fixture.getMetricsFile();
    const originalEnv = process.env.VIOLATION_METRICS_MAX_LINES;
    process.env.VIOLATION_METRICS_MAX_LINES = '50';

    // Write 60 violations
    for (let i = 0; i < 60; i++) {
      recordViolation(makeViolation(), metricsFile);
    }

    const content = fs.readFileSync(metricsFile, 'utf8');
    const lines = content.trim().split('\n');

    // Should be <= 50 lines
    assert.ok(lines.length <= 50);

    // Restore env
    if (originalEnv) {
      process.env.VIOLATION_METRICS_MAX_LINES = originalEnv;
    } else {
      delete process.env.VIOLATION_METRICS_MAX_LINES;
    }
  });
});

describe('rate limiting', () => {
  let tempDir;
  let metricsFile;
  let originalMaxLines;
  let originalRateLimit;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'violation-rate-test-'));
    metricsFile = path.join(tempDir, 'router-violations.jsonl');
  });

  beforeEach(() => {
    originalMaxLines = process.env.VIOLATION_METRICS_MAX_LINES;
    originalRateLimit = process.env.VIOLATION_METRICS_RATE_LIMIT;
    process.env.VIOLATION_METRICS_MAX_LINES = '6000';
    process.env.VIOLATION_METRICS_RATE_LIMIT = '50';
    // Clean up file before each test
    if (fs.existsSync(metricsFile)) {
      fs.unlinkSync(metricsFile);
    }
    // Reset rate limiter
    _resetForTesting();
  });

  after(() => {
    if (originalMaxLines === undefined) {
      delete process.env.VIOLATION_METRICS_MAX_LINES;
    } else {
      process.env.VIOLATION_METRICS_MAX_LINES = originalMaxLines;
    }
    if (originalRateLimit === undefined) {
      delete process.env.VIOLATION_METRICS_RATE_LIMIT;
    } else {
      process.env.VIOLATION_METRICS_RATE_LIMIT = originalRateLimit;
    }
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('enforces 5000 violations per hour maximum', () => {
    // Reset rate limiter first
    _resetForTesting();

    // Lower the configured limit in-test so we verify rate limiting behavior
    // without turning this suite into a long-running I/O benchmark.
    for (let i = 0; i < 60; i++) {
      recordViolation(
        {
          timestamp: new Date().toISOString(),
          tool: 'Grep',
          action: 'warn',
          checkName: 'routerSelfCheck',
          routerMode: 'router',
          taskSpawned: false,
          sessionId: 'test',
        },
        metricsFile
      );
    }

    const content = fs.readFileSync(metricsFile, 'utf8');
    const lines = content.trim().split('\n');

    assert.ok(lines.length <= 50);
  });
});

describe('getViolationStats', () => {
  const fixture = createMetricsFixture('violation-stats-test-');

  it('returns count and breakdown by tool', () => {
    const metricsFile = fixture.getMetricsFile();
    // Write 5 violations (3 Grep, 2 Glob)
    recordViolation(makeViolation(), metricsFile);
    recordViolation(makeViolation(), metricsFile);
    recordViolation(makeViolation(), metricsFile);
    recordViolation(makeViolation({ tool: 'Glob' }), metricsFile);
    recordViolation(makeViolation({ tool: 'Glob' }), metricsFile);

    const stats = getViolationStats({ metricsFile });

    assert.equal(stats.count, 5);
    assert.equal(stats.byTool.Grep, 3);
    assert.equal(stats.byTool.Glob, 2);
  });

  it('filters by time window', () => {
    const metricsFile = fixture.getMetricsFile();
    const now = new Date();
    const old = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours ago

    // Write old violation
    recordViolation(makeViolation({ timestamp: old.toISOString() }), metricsFile);

    // Write recent violation
    recordViolation(makeViolation({ timestamp: now.toISOString(), tool: 'Glob' }), metricsFile);

    const stats = getViolationStats({ metricsFile, windowMinutes: 60 });

    // Should only count recent violation
    assert.equal(stats.count, 1);
  });

  it('handles malformed JSONL lines gracefully', () => {
    const metricsFile = fixture.getMetricsFile();
    // Write mix of valid and invalid lines
    fs.writeFileSync(metricsFile, '{"valid": true}\n');
    fs.appendFileSync(metricsFile, 'invalid json line\n');
    fs.appendFileSync(metricsFile, '{"another": "valid"}\n');

    const stats = getViolationStats({ metricsFile });

    // Should skip malformed line, count only valid ones
    assert.ok(stats.count >= 0);
  });

  it('returns empty stats for missing file', () => {
    const nonexistentFile = path.join(fixture.getTempDir(), 'nonexistent.jsonl');

    const stats = getViolationStats({ metricsFile: nonexistentFile });

    assert.equal(stats.count, 0);
    assert.deepEqual(stats.byTool, {});
    assert.deepEqual(stats.byAction, {});
    assert.equal(stats.threshold.exceeded, false);
  });
});

describe('checkThreshold', () => {
  const fixture = createMetricsFixture('violation-threshold-test-');

  it('returns exceeded: false when under threshold', () => {
    const metricsFile = fixture.getMetricsFile();
    // Write 3 violations
    for (let i = 0; i < 3; i++) {
      recordViolation(makeViolation(), metricsFile);
    }

    const result = checkThreshold({ metricsFile, threshold: 5 });

    assert.equal(result.exceeded, false);
    assert.equal(result.count, 3);
    assert.equal(result.threshold, 5);
  });

  it('returns exceeded: true when over threshold', () => {
    const metricsFile = fixture.getMetricsFile();
    // Write 7 violations
    for (let i = 0; i < 7; i++) {
      recordViolation(makeViolation(), metricsFile);
    }

    const result = checkThreshold({ metricsFile, threshold: 5 });

    assert.equal(result.exceeded, true);
    assert.equal(result.count, 7);
    assert.equal(result.threshold, 5);
  });

  it('uses configurable threshold and window', () => {
    const metricsFile = fixture.getMetricsFile();
    const now = new Date();
    const old = new Date(now.getTime() - 40 * 60 * 1000); // 40 minutes ago

    // Write old violation (outside 30-min window)
    recordViolation(makeViolation({ timestamp: old.toISOString() }), metricsFile);

    // Write 2 recent violations
    recordViolation(makeViolation({ timestamp: now.toISOString() }), metricsFile);
    recordViolation(makeViolation({ timestamp: now.toISOString(), tool: 'Glob' }), metricsFile);

    const result = checkThreshold({ metricsFile, threshold: 2, windowMs: 30 * 60 * 1000 });

    // Should not exceed (only 2 violations in 30-min window)
    assert.equal(result.exceeded, false);
    assert.equal(result.count, 2);
  });
});
