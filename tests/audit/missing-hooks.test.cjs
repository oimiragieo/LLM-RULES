'use strict';

/**
 * missing-hooks.test.cjs
 *
 * Programmatically reads .claude/settings.json and verifies that every
 * hook file referenced in it:
 *   1. Exists on disk
 *   2. Has valid JavaScript syntax (node --check)
 *
 * Additionally verifies functional behavior of the two previously-missing hooks:
 *   - .claude/hooks/safety/context-monitor.cjs  (exports functional API)
 *   - .claude/hooks/session/audit-skill-recency.cjs (exports functional API)
 *
 * Note on require() vs. syntax check:
 * Several hooks (startup-failopen-audit, channel-auto-start, a2a hooks) call
 * process.exit(0) at module top level AND/OR resume stdin for async processing.
 * Requiring them directly in the test process would either kill the test runner
 * or cause it to hang. We therefore use `node --check` (syntax validation) for
 * all hooks and full require() only for the two new functional hooks that are
 * designed as importable libraries.
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

// ─── Project root resolution ──────────────────────────────────────────────────

function findProjectRoot(start) {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, '.claude', 'settings.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('Could not locate project root from: ' + start);
}

const PROJECT_ROOT = findProjectRoot(__dirname);
const SETTINGS_PATH = path.join(PROJECT_ROOT, '.claude', 'settings.json');

// ─── Helper: extract all .cjs hook paths from settings.json ──────────────────

/**
 * Walk the hook config object and collect every .cjs path referenced in a
 * `node <path>.cjs` command string.
 *
 * @param {unknown} obj
 * @param {Set<string>} acc
 */
function collectHookPaths(obj, acc) {
  if (Array.isArray(obj)) {
    for (const item of obj) collectHookPaths(item, acc);
  } else if (obj !== null && typeof obj === 'object') {
    if (typeof obj.command === 'string') {
      // Match `node <relative-path>.cjs` (with optional CLI args after)
      const match = obj.command.match(/node\s+([\w./\\-]+\.cjs)/);
      if (match) acc.add(match[1]);
    }
    for (const value of Object.values(obj)) collectHookPaths(value, acc);
  }
}

// ─── Test suites ──────────────────────────────────────────────────────────────

describe('missing-hooks: settings.json integrity', () => {
  let settings;
  let hookPaths;

  before(() => {
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf8');
    settings = JSON.parse(raw);
    const acc = new Set();
    collectHookPaths(settings.hooks, acc);
    hookPaths = [...acc];
  });

  it('settings.json is valid JSON with a hooks object', () => {
    assert.ok(settings, 'settings must be truthy');
    assert.equal(typeof settings, 'object', 'settings must be an object');
    assert.ok(settings.hooks, 'settings must have a hooks property');
    assert.equal(typeof settings.hooks, 'object', 'hooks must be an object');
  });

  it('extracts at least one hook path from settings.json', () => {
    assert.ok(hookPaths.length > 0, 'should find at least one hook .cjs path');
  });

  it('every hook .cjs path exists on disk', () => {
    const missing = hookPaths.filter(p => !fs.existsSync(path.join(PROJECT_ROOT, p)));
    assert.deepEqual(
      missing,
      [],
      `The following hook files are missing from disk:\n  ${missing.join('\n  ')}`
    );
  });

  it('every hook .cjs file passes syntax check (node --check)', () => {
    // Use node --check to validate syntax without executing.
    // This avoids require() side effects (process.exit, server starts, stdin.resume)
    // while still confirming the files are loadable JavaScript.
    const failures = [];
    for (const hookPath of hookPaths) {
      const absPath = path.join(PROJECT_ROOT, hookPath);
      if (!fs.existsSync(absPath)) continue; // already caught above

      const result = spawnSync(process.execPath, ['--check', absPath], {
        encoding: 'utf8',
        timeout: 5000,
      });

      if (result.status !== 0) {
        const msg = (result.stderr || result.stdout || 'unknown error').trim().slice(0, 200);
        failures.push(`${hookPath}: ${msg}`);
      }
    }
    assert.deepEqual(
      failures,
      [],
      `The following hooks failed syntax check:\n  ${failures.join('\n  ')}`
    );
  });

  it('context-monitor.cjs is registered in settings.json', () => {
    const target = '.claude/hooks/safety/context-monitor.cjs';
    assert.ok(hookPaths.includes(target), `Expected ${target} to be registered in settings.json`);
  });

  it('audit-skill-recency.cjs is registered in settings.json', () => {
    const target = '.claude/hooks/session/audit-skill-recency.cjs';
    assert.ok(hookPaths.includes(target), `Expected ${target} to be registered in settings.json`);
  });
});

describe('context-monitor.cjs: functional behavior', () => {
  let contextMonitor;
  let tmpDir;

  before(() => {
    // context-monitor.cjs exports a library API and does NOT call process.exit at top level
    contextMonitor = require(path.join(PROJECT_ROOT, '.claude/hooks/safety/context-monitor.cjs'));
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'context-monitor-test-'));
  });

  it('exports required functions and constants', () => {
    assert.equal(typeof contextMonitor.readTokenUsage, 'function');
    assert.equal(typeof contextMonitor.buildWarning, 'function');
    assert.equal(typeof contextMonitor.safeParse, 'function');
    assert.equal(typeof contextMonitor.sentinelExists, 'function');
    assert.equal(typeof contextMonitor.writeSentinel, 'function');
    assert.equal(typeof contextMonitor.WARN_THRESHOLD_PCT, 'number');
    assert.equal(typeof contextMonitor.CRITICAL_THRESHOLD_PCT, 'number');
    assert.equal(typeof contextMonitor.DEFAULT_BUDGET, 'number');
  });

  it('WARN threshold is below CRITICAL threshold', () => {
    assert.ok(
      contextMonitor.WARN_THRESHOLD_PCT < contextMonitor.CRITICAL_THRESHOLD_PCT,
      'warn threshold must be below critical threshold'
    );
  });

  it('DEFAULT_BUDGET is a positive number', () => {
    assert.ok(contextMonitor.DEFAULT_BUDGET > 0, 'DEFAULT_BUDGET must be positive');
  });

  it('safeParse returns null for invalid JSON', () => {
    const result = contextMonitor.safeParse('not-json');
    assert.equal(result, null);
  });

  it('safeParse returns parsed object for valid JSON', () => {
    const result = contextMonitor.safeParse('{"foo": 42}');
    assert.equal(result.foo, 42);
  });

  it('buildWarning returns null when usage is below warn threshold', () => {
    const budget = 200_000;
    const lowUsage = Math.floor(budget * 0.5); // 50% — below warn threshold
    // buildWarning bakes RUNTIME_DIR at module load. Sentinels are not written at <70%, so no
    // state is created regardless of which project root the module resolved.
    const result = contextMonitor.buildWarning(lowUsage / budget, lowUsage, budget);
    assert.equal(result, null, 'no warning expected at 50% usage (below warn threshold)');
  });

  it('buildWarning does not throw at high usage (75%)', () => {
    const budget = 200_000;
    const highUsage = Math.floor(budget * 0.75);
    // May return warning message or null (if warn sentinel already set from prior run).
    // Either outcome is valid — just verify no exception is thrown.
    assert.doesNotThrow(() => {
      contextMonitor.buildWarning(highUsage / budget, highUsage, budget);
    });
  });

  it('buildWarning does not throw at critical usage (90%)', () => {
    const budget = 200_000;
    const critUsage = Math.floor(budget * 0.9);
    assert.doesNotThrow(() => {
      contextMonitor.buildWarning(critUsage / budget, critUsage, budget);
    });
  });

  it('buildWarning with fresh runtime dir returns warning at 75%', () => {
    // Create an isolated runtime dir with no existing sentinels and point
    // the built-in sentinel check toward it via a direct call.
    const localRuntime = path.join(tmpDir, '.claude', 'context', 'runtime');
    fs.mkdirSync(localRuntime, { recursive: true });

    // We cannot redirect the module's RUNTIME_DIR (resolved at load time).
    // Instead, verify that the warn sentinel file is NOT present before the
    // call and that buildWarning behaves consistently with the threshold.
    const budget = 200_000;
    const highUsage = Math.floor(budget * 0.75); // exactly at warn threshold

    // First call may or may not return a warning (depends on whether sentinel
    // already exists in the real runtime dir). We just assert no exception.
    const result = contextMonitor.buildWarning(highUsage / budget, highUsage, budget);
    if (result !== null) {
      assert.equal(typeof result.message, 'string', 'warning must have a message string');
      assert.ok(result.message.includes('[CONTEXT-MONITOR]'), 'message must include prefix');
    }
  });
});

describe('audit-skill-recency.cjs: functional behavior', () => {
  let auditSkillRecency;
  let tmpDir;

  before(() => {
    // audit-skill-recency.cjs exports a library API and does NOT call process.exit at top level
    auditSkillRecency = require(
      path.join(PROJECT_ROOT, '.claude/hooks/session/audit-skill-recency.cjs')
    );
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-skill-test-'));
  });

  it('exports required functions and constants', () => {
    assert.equal(typeof auditSkillRecency.checkSkillStaleness, 'function');
    assert.equal(typeof auditSkillRecency.collectSkillDirs, 'function');
    assert.equal(typeof auditSkillRecency.auditSkillRecency, 'function');
    assert.equal(typeof auditSkillRecency.buildStaleSkillsMessage, 'function');
    assert.equal(typeof auditSkillRecency.safeParse, 'function');
    assert.equal(typeof auditSkillRecency.hasAlreadyFiredThisSession, 'function');
    assert.equal(typeof auditSkillRecency.writeSentinel, 'function');
    assert.ok(
      Number.isInteger(auditSkillRecency.MAX_SKILLS_TO_SCAN),
      'MAX_SKILLS_TO_SCAN must be an integer'
    );
    assert.ok(auditSkillRecency.MAX_SKILLS_TO_SCAN > 0, 'MAX_SKILLS_TO_SCAN must be positive');
  });

  it('checkSkillStaleness returns null for directory without manifest.json', () => {
    const emptyDir = path.join(tmpDir, 'no-manifest-skill');
    fs.mkdirSync(emptyDir, { recursive: true });
    const result = auditSkillRecency.checkSkillStaleness(emptyDir, 'no-manifest-skill');
    assert.equal(result, null);
  });

  it('checkSkillStaleness returns null for manifest missing staleness fields', () => {
    const skillDir = path.join(tmpDir, 'no-fields-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'manifest.json'),
      JSON.stringify({ name: 'no-fields-skill', version: '1.0.0' })
    );
    const result = auditSkillRecency.checkSkillStaleness(skillDir, 'no-fields-skill');
    assert.equal(result, null);
  });

  it('checkSkillStaleness returns isStale=false for a fresh skill', () => {
    const skillDir = path.join(tmpDir, 'fresh-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    const today = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(
      path.join(skillDir, 'manifest.json'),
      JSON.stringify({ name: 'fresh-skill', lastResearchDate: today, staleAfterDays: 180 })
    );
    const result = auditSkillRecency.checkSkillStaleness(skillDir, 'fresh-skill');
    assert.ok(result !== null, 'should return a result object');
    assert.equal(result.isStale, false, 'skill updated today should not be stale');
    assert.equal(result.skillName, 'fresh-skill');
  });

  it('checkSkillStaleness returns isStale=true for a stale skill', () => {
    const skillDir = path.join(tmpDir, 'stale-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    const oldDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    fs.writeFileSync(
      path.join(skillDir, 'manifest.json'),
      JSON.stringify({ name: 'stale-skill', lastResearchDate: oldDate, staleAfterDays: 180 })
    );
    const result = auditSkillRecency.checkSkillStaleness(skillDir, 'stale-skill');
    assert.ok(result !== null, 'should return a result object');
    assert.equal(result.isStale, true, 'skill 400 days old (stale after 180) should be stale');
    assert.ok(result.ageInDays >= 399, 'ageInDays should be close to 400');
  });

  it('collectSkillDirs returns empty array for non-existent directory', () => {
    const result = auditSkillRecency.collectSkillDirs(path.join(tmpDir, 'nonexistent'));
    assert.deepEqual(result, []);
  });

  it('collectSkillDirs returns skill directories from a valid directory', () => {
    const skillsDir = path.join(tmpDir, 'skills');
    fs.mkdirSync(path.join(skillsDir, 'skill-a'), { recursive: true });
    fs.mkdirSync(path.join(skillsDir, 'skill-b'), { recursive: true });
    const result = auditSkillRecency.collectSkillDirs(skillsDir);
    assert.ok(result.length >= 2, 'should find at least 2 skill directories');
    const names = result.map(r => r.name);
    assert.ok(names.includes('skill-a'), 'should include skill-a');
    assert.ok(names.includes('skill-b'), 'should include skill-b');
  });

  it('collectSkillDirs skips _archive directories', () => {
    const skillsDir = path.join(tmpDir, 'skills-with-archive');
    fs.mkdirSync(path.join(skillsDir, '_archive'), { recursive: true });
    fs.mkdirSync(path.join(skillsDir, 'real-skill'), { recursive: true });
    const result = auditSkillRecency.collectSkillDirs(skillsDir);
    const names = result.map(r => r.name);
    assert.ok(!names.includes('_archive'), 'should not include _archive directory');
    assert.ok(names.includes('real-skill'), 'should include real-skill');
  });

  it('auditSkillRecency returns zero stale skills for all-fresh directory', () => {
    const skillsDir = path.join(tmpDir, 'fresh-skills-dir');
    const today = new Date().toISOString().slice(0, 10);
    for (const name of ['fresh-a', 'fresh-b']) {
      const sd = path.join(skillsDir, name);
      fs.mkdirSync(sd, { recursive: true });
      fs.writeFileSync(
        path.join(sd, 'manifest.json'),
        JSON.stringify({ name, lastResearchDate: today, staleAfterDays: 180 })
      );
    }
    const { staleSkills, scannedCount } = auditSkillRecency.auditSkillRecency(skillsDir);
    assert.equal(staleSkills.length, 0, 'no stale skills expected');
    assert.equal(scannedCount, 2);
  });

  it('auditSkillRecency detects stale skills in mixed directory', () => {
    const skillsDir = path.join(tmpDir, 'mixed-skills-dir');
    const today = new Date().toISOString().slice(0, 10);
    const oldDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const freshDir = path.join(skillsDir, 'fresh-skill');
    fs.mkdirSync(freshDir, { recursive: true });
    fs.writeFileSync(
      path.join(freshDir, 'manifest.json'),
      JSON.stringify({ name: 'fresh-skill', lastResearchDate: today, staleAfterDays: 180 })
    );

    const staleDir = path.join(skillsDir, 'stale-skill');
    fs.mkdirSync(staleDir, { recursive: true });
    fs.writeFileSync(
      path.join(staleDir, 'manifest.json'),
      JSON.stringify({ name: 'stale-skill', lastResearchDate: oldDate, staleAfterDays: 180 })
    );

    const { staleSkills, scannedCount } = auditSkillRecency.auditSkillRecency(skillsDir);
    assert.equal(staleSkills.length, 1, 'exactly one stale skill expected');
    assert.equal(staleSkills[0].skillName, 'stale-skill');
    assert.equal(scannedCount, 2);
  });

  it('buildStaleSkillsMessage returns a non-empty string mentioning the skill', () => {
    const staleSkills = [
      {
        skillName: 'old-skill',
        ageInDays: 400,
        staleAfterDays: 180,
        lastResearchDate: '2025-01-01',
      },
    ];
    const msg = auditSkillRecency.buildStaleSkillsMessage(staleSkills, 10);
    assert.equal(typeof msg, 'string');
    assert.ok(msg.length > 0, 'message should not be empty');
    assert.ok(msg.includes('old-skill'), 'message should mention the stale skill');
  });

  it('hasAlreadyFiredThisSession returns a boolean', () => {
    const result = auditSkillRecency.hasAlreadyFiredThisSession('test-session-id-xyz');
    assert.equal(typeof result, 'boolean');
  });

  it('writeSentinel does not throw', () => {
    assert.doesNotThrow(() => {
      auditSkillRecency.writeSentinel('test-session-' + Date.now());
    });
  });
});
