#!/usr/bin/env node
'use strict';

/**
 * Cross-Area Integration Tests — Phase 5 (Foundation & Performance)
 *
 * VAL-CROSS-001: SubagentStart hook imports tool whitelist from code module,
 *   not from .md rules files. Works correctly after rules compression.
 * VAL-CROSS-002: Consolidated hooks coexist with new event categories.
 *   All sub-functions still registered, deduplication intact.
 * VAL-CROSS-003: settings.json integrity after all milestones —
 *   10 categories, every hook has timeout_ms, no duplicates.
 * VAL-CROSS-004: denial-log.json is consumable by routing feedback reader.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..', '..');
const SETTINGS_PATH = path.join(ROOT, '.claude', 'settings.json');

// Load settings.json once
let settings;
try {
  settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
} catch (err) {
  throw new Error(`cross-area-phase5: Failed to parse settings.json: ${err.message}`);
}

/** Enumerate all hook objects across all event categories. */
function getAllHooks(s) {
  const src = s || settings;
  const out = [];
  for (const [eventName, groups] of Object.entries(src.hooks || {})) {
    for (const group of groups) {
      for (const hook of group.hooks || []) {
        out.push({ eventName, matcher: group.matcher || '', hook });
      }
    }
  }
  return out;
}

/** Get hooks for a specific event. */
function getEventHooks(eventName, s) {
  return ((s || settings).hooks || {})[eventName] || [];
}

/** Extract .cjs basename from a command string. */
function scriptName(cmd) {
  const m = (cmd || '').match(/([^/\\]+\.cjs)(?:\s|$)/);
  return m ? m[1] : null;
}

/** Strip JS block and line comments. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, m => ' '.repeat(m.length));
}

// =============================================================================
// VAL-CROSS-001: SubagentStart hook uses code module for tool whitelist
// =============================================================================

describe('VAL-CROSS-001: SubagentStart hook uses code module (not .md files) for tool whitelist', () => {
  const IRON_LAW_PATH = path.join(
    ROOT,
    '.claude',
    'hooks',
    'lifecycle',
    'subagent-start-iron-law.cjs'
  );
  const LOCKDOWN_PATH = path.join(ROOT, '.claude', 'hooks', 'routing', 'router-tool-lockdown.cjs');

  let hook;
  let lockdown;
  let srcStripped;

  before(() => {
    const src = fs.readFileSync(IRON_LAW_PATH, 'utf8');
    srcStripped = stripComments(src);
    delete require.cache[require.resolve(LOCKDOWN_PATH)];
    delete require.cache[require.resolve(IRON_LAW_PATH)];
    lockdown = require(LOCKDOWN_PATH);
    hook = require(IRON_LAW_PATH);
  });

  it('router-tool-lockdown.cjs exports ROUTER_BANNED_TOOLS with known banned tools', () => {
    assert.ok(Array.isArray(lockdown.ROUTER_BANNED_TOOLS), 'Must export ROUTER_BANNED_TOOLS[]');
    for (const tool of ['Bash', 'Edit', 'Write', 'Glob', 'Grep', 'WebSearch']) {
      assert.ok(lockdown.ROUTER_BANNED_TOOLS.includes(tool), `Must include "${tool}"`);
    }
  });

  it('hook source requires router-tool-lockdown.cjs and does NOT read .md files at runtime', () => {
    const rawSrc = fs.readFileSync(IRON_LAW_PATH, 'utf8');
    assert.ok(rawSrc.includes('router-tool-lockdown.cjs'), 'Must import router-tool-lockdown.cjs');
    // No fs.readFileSync/readFile calls on .md files in executable code
    const hasMdRead =
      /readFileSync\s*\([^)]*\.md/.test(srcStripped) || /readFile\s*\([^)]*\.md/.test(srcStripped);
    assert.ok(!hasMdRead, 'Hook must not use fs to read .md files for the tool whitelist');
  });

  it('checkIronLaw: clean prompt → allow:true, no warning', () => {
    const r = hook.checkIronLaw({ prompt: 'List the pending tasks' });
    assert.strictEqual(r.allow, true);
    assert.strictEqual(r.warning, undefined);
  });

  it('checkIronLaw: router context + banned tool → allow:true with warning', () => {
    const saved = process.env.CLAUDE_AGENT_ID;
    process.env.CLAUDE_AGENT_ID = 'router';
    try {
      const r = hook.checkIronLaw({ prompt: 'Use Edit to modify the config' });
      assert.strictEqual(r.allow, true);
      assert.ok(typeof r.warning === 'string' && r.warning.includes('Edit'));
    } finally {
      if (saved === undefined) delete process.env.CLAUDE_AGENT_ID;
      else process.env.CLAUDE_AGENT_ID = saved;
    }
  });

  it('checkIronLaw: worker context + tools → allow:true, no warning (Iron Law is router-only)', () => {
    const saved = process.env.CLAUDE_AGENT_ID;
    process.env.CLAUDE_AGENT_ID = 'developer-worker';
    try {
      const r = hook.checkIronLaw({ prompt: 'Use Bash to run tests and Edit to fix failures' });
      assert.strictEqual(r.allow, true);
      assert.strictEqual(r.warning, undefined);
    } finally {
      if (saved === undefined) delete process.env.CLAUDE_AGENT_ID;
      else process.env.CLAUDE_AGENT_ID = saved;
    }
  });

  it('checkIronLaw: null/undefined input → allow:true, no crash (fail-open)', () => {
    assert.doesNotThrow(() => hook.checkIronLaw(null));
    assert.doesNotThrow(() => hook.checkIronLaw(undefined));
    assert.strictEqual(hook.checkIronLaw(null).allow, true);
  });

  it('CLAUDE.md + rules total under 40,000 chars (compression verified)', () => {
    let total = fs.readFileSync(path.join(ROOT, '.claude', 'CLAUDE.md'), 'utf8').length;
    const rulesDir = path.join(ROOT, '.claude', 'rules');
    for (const f of fs.readdirSync(rulesDir).filter(n => n.endsWith('.md'))) {
      total += fs.readFileSync(path.join(rulesDir, f), 'utf8').length;
    }
    assert.ok(total < 40000, `Rules total (${total} chars) must be under 40,000`);
  });
});

// =============================================================================
// VAL-CROSS-002: Hook overhaul coexists with new events
// =============================================================================

describe('VAL-CROSS-002: Consolidated hooks coexist with new event categories', () => {
  const MON_DIR = path.join(ROOT, '.claude', 'hooks', 'monitoring');
  const SES_DIR = path.join(ROOT, '.claude', 'hooks', 'session');

  it('PostToolUse: exactly 1 wildcard registration for post-tool-advisory-bundle.cjs', () => {
    const found = getAllHooks().filter(
      ({ eventName, matcher, hook }) =>
        eventName === 'PostToolUse' &&
        matcher === '' &&
        (hook.command || '').includes('post-tool-advisory-bundle.cjs')
    );
    assert.strictEqual(found.length, 1, 'Must have exactly 1 PostToolUse wildcard bundle');
  });

  it('post-tool-advisory-bundle.cjs imports all 4 consolidated sub-modules', () => {
    const src = fs.readFileSync(path.join(MON_DIR, 'post-tool-advisory-bundle.cjs'), 'utf8');
    for (const m of [
      'post-tool-metrics-unified.cjs',
      'context-window-monitor.cjs',
      'hook-error-detector.cjs',
      'recurring-issue-detector.cjs',
    ]) {
      assert.ok(src.includes(m), `Bundle must import "${m}"`);
    }
  });

  it('UserPromptSubmit: exactly 1 advisory bundle registration for user-prompt-advisory-bundle.cjs', () => {
    const found = getAllHooks().filter(
      ({ eventName, hook }) =>
        eventName === 'UserPromptSubmit' &&
        (hook.command || '').includes('user-prompt-advisory-bundle.cjs')
    );
    assert.strictEqual(found.length, 1, 'Must have exactly 1 UserPromptSubmit advisory bundle');
  });

  it('user-prompt-advisory-bundle.cjs imports all 6 consolidated sub-modules', () => {
    const src = fs.readFileSync(path.join(SES_DIR, 'user-prompt-advisory-bundle.cjs'), 'utf8');
    for (const m of [
      'ccusage-statusline.cjs',
      'startup-failopen-audit.cjs',
      'worktree-prune-on-start.cjs',
      'session-budget-watchdog.cjs',
      'drift-detector.cjs',
      'stale-task-detector.cjs',
    ]) {
      assert.ok(src.includes(m), `Bundle must import "${m}"`);
    }
  });

  it('new hook scripts do NOT appear inside the original 7 event category arrays', () => {
    const original7 = [
      'UserPromptSubmit',
      'PreToolUse',
      'PostToolUse',
      'PostToolUseFailure',
      'SessionEnd',
      'PreCompact',
      'Stop',
    ];
    const newScripts = [
      'subagent-start-iron-law.cjs',
      'permission-denied-logger.cjs',
      'session-start-watchpaths.cjs',
    ];
    for (const cat of original7) {
      for (const group of getEventHooks(cat)) {
        for (const hook of group.hooks || []) {
          for (const ns of newScripts) {
            assert.ok(!(hook.command || '').includes(ns), `"${ns}" must not appear in ${cat}`);
          }
        }
      }
    }
  });

  it('critical security hooks still present in original event categories', () => {
    const critical = [
      { event: 'PreToolUse', script: 'router-tool-lockdown.cjs' },
      { event: 'PreToolUse', script: 'dlp-pretool.cjs' },
      { event: 'PreToolUse', script: 'routing-guard.cjs' },
      { event: 'PostToolUse', script: 'sync-memory-index.cjs' },
    ];
    const all = getAllHooks();
    for (const { event, script } of critical) {
      const found = all.some(
        ({ eventName, hook }) => eventName === event && (hook.command || '').includes(script)
      );
      assert.ok(found, `Critical hook "${script}" must still be in ${event}`);
    }
  });

  it('routing-guard.cjs: exactly 1 PreToolUse registration covering all 5 tools', () => {
    const regs = getAllHooks().filter(
      ({ eventName, hook }) =>
        eventName === 'PreToolUse' && (hook.command || '').includes('routing-guard.cjs')
    );
    assert.strictEqual(
      regs.length,
      1,
      'routing-guard.cjs must have exactly 1 PreToolUse registration'
    );
    const matcher = regs[0].matcher;
    for (const t of ['Glob', 'Grep', 'WebSearch', 'TaskCreate', 'TaskOutput']) {
      assert.ok(matcher.includes(t), `routing-guard matcher must include "${t}"`);
    }
  });

  it('write-pretool-bundle.cjs: exactly 1 PreToolUse registration (deduplication)', () => {
    const regs = getAllHooks().filter(
      ({ eventName, hook }) =>
        eventName === 'PreToolUse' && (hook.command || '').includes('write-pretool-bundle.cjs')
    );
    assert.strictEqual(
      regs.length,
      1,
      'write-pretool-bundle.cjs must have exactly 1 PreToolUse registration'
    );
  });

  it('sync-memory-index.cjs: exactly 1 PostToolUse registration (deduplication)', () => {
    const regs = getAllHooks().filter(
      ({ eventName, hook }) =>
        eventName === 'PostToolUse' && (hook.command || '').includes('sync-memory-index.cjs')
    );
    assert.strictEqual(
      regs.length,
      1,
      'sync-memory-index.cjs must have exactly 1 PostToolUse registration'
    );
  });
});

// =============================================================================
// VAL-CROSS-003: settings.json integrity after all milestones
// =============================================================================

describe('VAL-CROSS-003: settings.json integrity after all milestones', () => {
  const ALL10 = [
    'UserPromptSubmit',
    'PreToolUse',
    'PostToolUse',
    'PostToolUseFailure',
    'SessionEnd',
    'PreCompact',
    'Stop',
    'SubagentStart',
    'PermissionDenied',
    'SessionStart',
  ];

  it('settings.json parses and has exactly 10 event categories', () => {
    assert.ok(settings !== null && typeof settings === 'object');
    const cats = Object.keys(settings.hooks || {});
    assert.strictEqual(cats.length, 10, `Expected 10 categories, got: ${cats.join(', ')}`);
  });

  it('all 10 expected event categories are present', () => {
    const actual = new Set(Object.keys(settings.hooks || {}));
    for (const cat of ALL10) {
      assert.ok(actual.has(cat), `Missing event category: "${cat}"`);
    }
  });

  it('every hook registration has timeout_ms set (100% coverage)', () => {
    const missing = getAllHooks()
      .filter(({ hook }) => hook.timeout_ms === undefined || hook.timeout_ms === null)
      .map(
        ({ eventName, matcher, hook }) => `${eventName}[${matcher}] → ${scriptName(hook.command)}`
      );
    assert.deepStrictEqual(missing, [], `Hooks missing timeout_ms: ${missing.join(', ')}`);
  });

  it('all timeout_ms values are in bounds (2000–60000ms)', () => {
    const bad = getAllHooks()
      .filter(
        ({ hook }) =>
          hook.timeout_ms !== undefined && (hook.timeout_ms < 2000 || hook.timeout_ms > 60000)
      )
      .map(
        ({ eventName, hook }) => `${eventName}: ${scriptName(hook.command)}=${hook.timeout_ms}ms`
      );
    assert.deepStrictEqual(bad, [], `Timeouts out of 2000–60000 range: ${bad.join(', ')}`);
  });

  it('no duplicate script registrations within the same event category', () => {
    const counts = new Map();
    for (const { eventName, hook } of getAllHooks()) {
      const sn = scriptName(hook.command);
      if (!sn) continue;
      const key = `${eventName}:${sn}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const dups = [...counts.entries()].filter(([, n]) => n > 1).map(([k, n]) => `${k}(×${n})`);
    assert.deepStrictEqual(dups, [], `Duplicate registrations: ${dups.join(', ')}`);
  });

  it('total hook count is between 40 and 80', () => {
    const n = getAllHooks().length;
    assert.ok(n >= 40 && n <= 80, `Hook count ${n} is outside expected range 40–80`);
  });

  it('all 10 hook script files referenced in settings.json exist on disk', () => {
    const missing = [];
    for (const { eventName, matcher, hook } of getAllHooks()) {
      if (!hook.command) continue;
      const m = hook.command.match(/node\s+([^\s"]+\.cjs)/);
      if (!m) continue;
      const full = path.join(ROOT, m[1]);
      if (!fs.existsSync(full)) {
        missing.push(`${eventName}[${matcher}] → ${m[1]}`);
      }
    }
    assert.deepStrictEqual(missing, [], `Missing script files: ${missing.join(', ')}`);
  });
});

// =============================================================================
// VAL-CROSS-004: Denial log feeds routing feedback
// =============================================================================

describe('VAL-CROSS-004: denial-log.json is consumable by routing feedback reader', () => {
  const READER_PATH = path.join(ROOT, '.claude', 'lib', 'routing', 'denial-feedback-reader.cjs');
  let tmpDir;
  let reader;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-p5-denial-'));
    delete require.cache[require.resolve(READER_PATH)];
    reader = require(READER_PATH);
  });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {
      /* EBUSY on Windows */
    }
  });

  it('denial-feedback-reader.cjs exists and exports getDenialFeedback, readDenialLog, buildSummary', () => {
    assert.ok(fs.existsSync(READER_PATH), `Must exist at ${READER_PATH}`);
    assert.strictEqual(typeof reader.getDenialFeedback, 'function');
    assert.strictEqual(typeof reader.readDenialLog, 'function');
    assert.strictEqual(typeof reader.buildSummary, 'function');
  });

  it('getDenialFeedback: missing file → empty summary, no crash', () => {
    const s = reader.getDenialFeedback(path.join(tmpDir, 'nonexistent', 'denial-log.json'));
    assert.strictEqual(s.totalDenials, 0);
    assert.deepStrictEqual(s.deniedTools, []);
    assert.strictEqual(s.mostRecentEntry, null);
    assert.strictEqual(s.fileExists, false);
  });

  it('getDenialFeedback: empty file → empty summary, no crash', () => {
    const p = path.join(tmpDir, 'empty.json');
    fs.writeFileSync(p, '', 'utf8');
    assert.doesNotThrow(() => reader.getDenialFeedback(p));
    assert.strictEqual(reader.getDenialFeedback(p).totalDenials, 0);
  });

  it('getDenialFeedback: corrupted JSON → empty summary, no crash', () => {
    const p = path.join(tmpDir, 'corrupt.json');
    fs.writeFileSync(p, 'NOT_VALID_JSON{{{', 'utf8');
    assert.doesNotThrow(() => reader.getDenialFeedback(p));
    assert.strictEqual(reader.getDenialFeedback(p).totalDenials, 0);
  });

  it('getDenialFeedback: non-array JSON → empty summary, no crash', () => {
    const p = path.join(tmpDir, 'notarray.json');
    fs.writeFileSync(p, '{"key":"value"}', 'utf8');
    assert.doesNotThrow(() => reader.getDenialFeedback(p));
    assert.strictEqual(reader.getDenialFeedback(p).totalDenials, 0);
  });

  it('getDenialFeedback: populated log → correct summary (totalDenials, deniedTools, toolCounts)', () => {
    const p = path.join(tmpDir, 'populated.json');
    const entries = [
      {
        tool: 'Edit',
        reason: 'router violation',
        timestamp: '2026-01-01T00:00:00.000Z',
        session_id: 'a',
      },
      {
        tool: 'Bash',
        reason: 'router violation',
        timestamp: '2026-01-01T00:01:00.000Z',
        session_id: 'a',
      },
      {
        tool: 'Edit',
        reason: 'router violation',
        timestamp: '2026-01-01T00:02:00.000Z',
        session_id: 'b',
      },
      {
        tool: 'WebSearch',
        reason: 'router violation',
        timestamp: '2026-01-01T00:03:00.000Z',
        session_id: 'b',
      },
    ];
    fs.writeFileSync(p, JSON.stringify(entries), 'utf8');
    const s = reader.getDenialFeedback(p);
    assert.strictEqual(s.totalDenials, 4);
    assert.deepStrictEqual(s.deniedTools.sort(), ['Bash', 'Edit', 'WebSearch']);
    assert.strictEqual(s.toolCounts['Edit'], 2);
    assert.strictEqual(s.toolCounts['Bash'], 1);
    assert.strictEqual(s.fileExists, true);
  });

  it('mostRecentEntry is the last entry; schema has required fields', () => {
    const p = path.join(tmpDir, 'schema.json');
    const entries = [
      { tool: 'Edit', reason: 'r1', timestamp: '2026-01-01T00:00:00.000Z', session_id: 'x' },
      { tool: 'Glob', reason: 'r2', timestamp: '2026-01-01T00:05:00.000Z', session_id: 'y' },
    ];
    fs.writeFileSync(p, JSON.stringify(entries), 'utf8');
    const s = reader.getDenialFeedback(p);
    assert.strictEqual(s.mostRecentEntry.tool, 'Glob', 'mostRecentEntry must be last entry');
    assert.ok(
      'tool' in s.mostRecentEntry &&
        'reason' in s.mostRecentEntry &&
        'timestamp' in s.mostRecentEntry &&
        'session_id' in s.mostRecentEntry,
      'Entry must have all 4 schema fields'
    );
  });

  it('getDenialFeedback does not throw on the real denial-log.json (if it exists)', () => {
    assert.doesNotThrow(() => reader.getDenialFeedback());
  });
});
