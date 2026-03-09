'use strict';

const { describe, it, before, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// ── helpers ────────────────────────────────────────────────────────────────

// We test the public API by using real paths and cleaning up afterwards.

const SENTINEL_MODULE = path.resolve(
  __dirname,
  '../../../.claude/lib/heartbeat/heartbeat-sentinel.cjs'
);

function freshSentinel() {
  // Delete from require cache to get a fresh module if needed.
  delete require.cache[require.resolve(SENTINEL_MODULE)];
  return require(SENTINEL_MODULE);
}

// ── fixtures ───────────────────────────────────────────────────────────────

const LOOPS_8 = Array.from({ length: 8 }, (_, i) => ({
  id: `cron-${i}`,
  name: `loop-${i}`,
  schedule: `0 */${i + 1} * * *`,
  registered_at: new Date().toISOString(),
}));

const LOOPS_5 = LOOPS_8.slice(0, 5);

// ── setup ─────────────────────────────────────────────────────────────────

describe('heartbeat-sentinel', () => {
  let mod;

  before(() => {
    mod = freshSentinel();
  });

  afterEach(() => {
    // Clean up the sentinel file after each test so tests are isolated.
    const p = mod.getSentinelPath();
    if (fs.existsSync(p)) fs.unlinkSync(p);
    // Clean up any lingering .tmp files.
    const dir = path.dirname(p);
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        if (f.startsWith('heartbeat-active.json.tmp')) {
          fs.unlinkSync(path.join(dir, f));
        }
      }
    }
  });

  // ── getSentinelPath ──────────────────────────────────────────────────────

  describe('getSentinelPath()', () => {
    it('returns an absolute path ending in heartbeat-active.json', () => {
      const p = mod.getSentinelPath();
      assert.ok(path.isAbsolute(p), 'path must be absolute');
      assert.ok(p.endsWith('heartbeat-active.json'), `expected heartbeat-active.json, got ${p}`);
    });

    it('path includes .claude/context/runtime/', () => {
      const p = mod.getSentinelPath().replace(/\\/g, '/');
      assert.ok(
        p.includes('.claude/context/runtime/'),
        `expected .claude/context/runtime/ in path, got ${p}`
      );
    });
  });

  // ── writeSentinel ────────────────────────────────────────────────────────

  describe('writeSentinel()', () => {
    it('writes a JSON file at the sentinel path', () => {
      const writtenPath = mod.writeSentinel(LOOPS_8);
      assert.ok(fs.existsSync(writtenPath), 'sentinel file should exist after write');
    });

    it('returns the sentinel path', () => {
      const writtenPath = mod.writeSentinel(LOOPS_8);
      assert.equal(writtenPath, mod.getSentinelPath());
    });

    it('written file contains valid JSON', () => {
      mod.writeSentinel(LOOPS_8);
      const raw = fs.readFileSync(mod.getSentinelPath(), 'utf8');
      assert.doesNotThrow(() => JSON.parse(raw), 'should be valid JSON');
    });

    it('written data has correct schema fields', () => {
      mod.writeSentinel(LOOPS_8);
      const data = JSON.parse(fs.readFileSync(mod.getSentinelPath(), 'utf8'));

      assert.ok(typeof data.written_at === 'string', 'written_at must be a string');
      assert.ok(typeof data.expires_at === 'string', 'expires_at must be a string');
      assert.ok(typeof data.session_id === 'string', 'session_id must be a string');
      assert.equal(data.loop_count, 8, 'loop_count must equal loops.length');
      assert.ok(Array.isArray(data.loops), 'loops must be an array');
      assert.equal(data.bot_name, 'Agent_studio_bot');
      assert.equal(data.version, '1.0.0');
    });

    it('expires_at is ~46 hours after written_at', () => {
      mod.writeSentinel(LOOPS_8);
      const data = JSON.parse(fs.readFileSync(mod.getSentinelPath(), 'utf8'));
      const writtenAt = new Date(data.written_at).getTime();
      const expiresAt = new Date(data.expires_at).getTime();
      const diffMs = expiresAt - writtenAt;
      const expectedMs = 46 * 60 * 60 * 1000;
      // Allow ±5 seconds of clock drift.
      assert.ok(
        Math.abs(diffMs - expectedMs) < 5000,
        `expiry diff should be ~46h, got ${diffMs}ms`
      );
    });

    it('loop entries have expected fields', () => {
      mod.writeSentinel(LOOPS_8);
      const data = JSON.parse(fs.readFileSync(mod.getSentinelPath(), 'utf8'));
      const first = data.loops[0];
      assert.ok('id' in first, 'loop entry must have id');
      assert.ok('name' in first, 'loop entry must have name');
      assert.ok('schedule' in first, 'loop entry must have schedule');
      assert.ok('registered_at' in first, 'loop entry must have registered_at');
    });

    it('throws TypeError when loops is not an array', () => {
      assert.throws(() => mod.writeSentinel(null), TypeError);
      assert.throws(() => mod.writeSentinel('bad'), TypeError);
      assert.throws(() => mod.writeSentinel(42), TypeError);
    });

    it('handles empty loop array (loop_count = 0)', () => {
      mod.writeSentinel([]);
      const data = JSON.parse(fs.readFileSync(mod.getSentinelPath(), 'utf8'));
      assert.equal(data.loop_count, 0);
    });

    it('overwrites an existing sentinel file', () => {
      mod.writeSentinel(LOOPS_8);
      const first = JSON.parse(fs.readFileSync(mod.getSentinelPath(), 'utf8'));
      // Small delay to ensure different session_id.
      mod.writeSentinel(LOOPS_5);
      const second = JSON.parse(fs.readFileSync(mod.getSentinelPath(), 'utf8'));
      assert.equal(second.loop_count, 5, 'second write should have loop_count 5');
      assert.notEqual(
        first.session_id,
        second.session_id,
        'session_id should differ between writes'
      );
    });
  });

  // ── checkSentinel ────────────────────────────────────────────────────────

  describe('checkSentinel()', () => {
    it('returns { valid: false, reason: "missing" } when file does not exist', () => {
      const result = mod.checkSentinel();
      assert.equal(result.valid, false);
      assert.equal(result.reason, 'missing');
      assert.equal(result.data, null);
    });

    it('returns { valid: true } for a freshly written 8-loop sentinel', () => {
      mod.writeSentinel(LOOPS_8);
      const result = mod.checkSentinel(8);
      assert.equal(result.valid, true, `expected valid, got: ${JSON.stringify(result)}`);
      assert.equal(result.reason, 'ok');
      assert.ok(result.data !== null, 'data should be populated');
    });

    it('returns { valid: false, reason: "incomplete" } when loop_count < expectedLoops', () => {
      mod.writeSentinel(LOOPS_5);
      const result = mod.checkSentinel(8);
      assert.equal(result.valid, false);
      assert.equal(result.reason, 'incomplete');
      assert.equal(result.loop_count, 5);
    });

    it('returns { valid: true } when loop_count equals expectedLoops exactly', () => {
      mod.writeSentinel(LOOPS_5);
      const result = mod.checkSentinel(5);
      assert.equal(result.valid, true);
    });

    it('returns { valid: false, reason: "expired" } for an expired sentinel', () => {
      // Write a sentinel then manually backdate its expires_at.
      mod.writeSentinel(LOOPS_8);
      const p = mod.getSentinelPath();
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      data.expires_at = new Date(Date.now() - 1000).toISOString(); // 1 second in the past
      fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');

      const result = mod.checkSentinel(8);
      assert.equal(result.valid, false);
      assert.equal(result.reason, 'expired');
    });

    it('returns { valid: false, reason: "corrupt" } for non-JSON content', () => {
      const p = mod.getSentinelPath();
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(p, 'NOT JSON }{', 'utf8');
      const result = mod.checkSentinel();
      assert.equal(result.valid, false);
      assert.equal(result.reason, 'corrupt');
    });

    it('returns { valid: false, reason: "no_expiry" } when expires_at field is missing', () => {
      mod.writeSentinel(LOOPS_8);
      const p = mod.getSentinelPath();
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      delete data.expires_at;
      fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');

      const result = mod.checkSentinel(8);
      assert.equal(result.valid, false);
      assert.equal(result.reason, 'no_expiry');
    });

    it('defaults expectedLoops to 8 when called with no arguments', () => {
      // 7 loops → incomplete for default of 8.
      mod.writeSentinel(LOOPS_8.slice(0, 7));
      const result = mod.checkSentinel(); // no argument → defaults to 8
      assert.equal(result.valid, false);
      assert.equal(result.reason, 'incomplete');
    });

    it('returns data object on valid sentinel', () => {
      mod.writeSentinel(LOOPS_8);
      const result = mod.checkSentinel(8);
      assert.ok(result.data, 'data should be populated');
      assert.equal(result.data.loop_count, 8);
    });
  });

  // ── session ping ─────────────────────────────────────────────────────────

  describe('session ping', () => {
    afterEach(() => {
      const p = mod.getSessionPingPath();
      if (fs.existsSync(p)) fs.unlinkSync(p);
    });

    it('getSessionPingPath() returns absolute path ending in heartbeat-session-ping.json', () => {
      const p = mod.getSessionPingPath();
      assert.ok(path.isAbsolute(p));
      assert.ok(p.endsWith('heartbeat-session-ping.json'));
    });

    it('writeSessionPing() writes a file and returns the path', () => {
      const p = mod.writeSessionPing(LOOPS_8);
      assert.ok(fs.existsSync(p));
      assert.equal(p, mod.getSessionPingPath());
    });

    it('writeSessionPing() writes valid JSON with expected fields', () => {
      mod.writeSessionPing(LOOPS_8);
      const data = JSON.parse(fs.readFileSync(mod.getSessionPingPath(), 'utf8'));
      assert.ok(typeof data.written_at === 'string');
      assert.ok(typeof data.expires_at === 'string');
      assert.equal(data.loop_count, 8);
      assert.equal(data.ttl_minutes, 15);
    });

    it('writeSessionPing() expires_at is ~15 minutes after written_at', () => {
      mod.writeSessionPing(LOOPS_8);
      const data = JSON.parse(fs.readFileSync(mod.getSessionPingPath(), 'utf8'));
      const diffMs = new Date(data.expires_at).getTime() - new Date(data.written_at).getTime();
      assert.ok(Math.abs(diffMs - 15 * 60 * 1000) < 5000);
    });

    it('checkSessionPing() returns missing when file does not exist', () => {
      const result = mod.checkSessionPing();
      assert.equal(result.valid, false);
      assert.equal(result.reason, 'missing');
    });

    it('checkSessionPing() returns valid: true for a fresh ping', () => {
      mod.writeSessionPing(LOOPS_8);
      const result = mod.checkSessionPing();
      assert.equal(result.valid, true);
      assert.equal(result.reason, 'ok');
    });

    it('checkSessionPing() returns expired for an expired ping', () => {
      mod.writeSessionPing(LOOPS_8);
      const p = mod.getSessionPingPath();
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      data.expires_at = new Date(Date.now() - 1000).toISOString();
      fs.writeFileSync(p, JSON.stringify(data, null, 2));
      const result = mod.checkSessionPing();
      assert.equal(result.valid, false);
      assert.equal(result.reason, 'expired');
    });

    it('checkSessionPing() returns corrupt for non-JSON content', () => {
      const p = mod.getSessionPingPath();
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, 'NOT JSON', 'utf8');
      const result = mod.checkSessionPing();
      assert.equal(result.valid, false);
      assert.equal(result.reason, 'corrupt');
    });
  });
});
