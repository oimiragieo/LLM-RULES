'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const ledgerModulePath = path.resolve(
  PROJECT_ROOT,
  '.claude',
  'lib',
  'routing',
  'task-claim-ledger.cjs'
);

describe('task-claim-ledger: Bug 1 — Read-Modify-Write atomicity', () => {
  let mod;

  beforeEach(() => {
    // Clear module cache and get fresh instance
    delete require.cache[ledgerModulePath];
    mod = require(ledgerModulePath);
    // Clean any leftover ledger file
    try {
      mod.clearLedger();
    } catch (_err) {
      // ignore if doesn't exist
    }
  });

  afterEach(() => {
    try {
      mod.clearLedger();
    } catch (_err) {
      // ignore
    }
    delete require.cache[ledgerModulePath];
  });

  it('upsertClaim writes ledger atomically (no partial writes visible)', () => {
    // This test verifies that after upsertClaim, the ledger is consistent.
    // A race condition would leave a corrupted or partial JSON file.
    mod.upsertClaim({
      taskId: 'task-rmw-1',
      agentType: 'developer',
      ownedPaths: ['src/foo.ts'],
    });

    const ledger = mod.readLedger();
    assert.ok(typeof ledger === 'object', 'ledger should be an object');
    assert.ok(typeof ledger.claims === 'object', 'ledger.claims should be an object');
    assert.ok(ledger.claims['task-rmw-1'], 'claim should exist');
    assert.equal(ledger.claims['task-rmw-1'].taskId, 'task-rmw-1');
  });

  it('two sequential upsertClaims both survive (no lost update)', () => {
    // Simulates what a RMW race would cause: the second write overwrites the first.
    // In a fixed implementation, both claims must persist.
    mod.upsertClaim({
      taskId: 'task-rmw-a',
      agentType: 'developer',
      ownedPaths: ['src/a.ts'],
    });
    mod.upsertClaim({
      taskId: 'task-rmw-b',
      agentType: 'qa',
      ownedPaths: ['src/b.ts'],
    });

    const ledger = mod.readLedger();
    assert.ok(ledger.claims['task-rmw-a'], 'first claim must survive');
    assert.ok(ledger.claims['task-rmw-b'], 'second claim must survive');
  });

  it('releaseClaim does not lose other claims (no lost update on release)', () => {
    mod.upsertClaim({ taskId: 'task-rmw-keep', ownedPaths: ['src/keep.ts'] });
    mod.upsertClaim({ taskId: 'task-rmw-release', ownedPaths: ['src/release.ts'] });

    mod.releaseClaim('task-rmw-release', 'completed');

    const ledger = mod.readLedger();
    assert.ok(ledger.claims['task-rmw-keep'], 'non-released claim must survive');
    assert.ok(!ledger.claims['task-rmw-release'], 'released claim must be gone');
  });

  it('upsertClaim uses atomicWriteJSONSync (temp-rename pattern, no partial file)', () => {
    // After upsertClaim, the ledger file must be valid JSON (not truncated).
    mod.upsertClaim({
      taskId: 'task-atomic-1',
      ownedPaths: ['src/atomic.ts'],
    });

    const { safeParseJSON } = require(
      path.resolve(PROJECT_ROOT, '.claude', 'lib', 'utils', 'safe-json.cjs')
    );

    const raw = fs.readFileSync(mod.LEDGER_FILE, 'utf8');
    const parsed = safeParseJSON(raw);
    assert.ok(
      parsed && typeof parsed === 'object',
      'file must contain valid JSON after upsertClaim'
    );
    assert.ok(typeof parsed.claims === 'object', 'parsed claims must be an object');
  });
});

describe('task-claim-ledger: Bug 2 — Read has side-effect', () => {
  let mod;

  beforeEach(() => {
    delete require.cache[ledgerModulePath];
    mod = require(ledgerModulePath);
    try {
      mod.clearLedger();
    } catch (_err) {
      // ignore
    }
  });

  afterEach(() => {
    try {
      mod.clearLedger();
    } catch (_err) {
      // ignore
    }
    delete require.cache[ledgerModulePath];
  });

  it('findOwnershipConflicts (pure query) does NOT write the ledger file when no claims exist', () => {
    // With Bug 2: getActiveClaims -> pruneExpiredClaims -> writeLedger even when no-op
    // Fix: the query path should never write unless it explicitly modifies state.

    // Ensure file doesn't exist yet
    if (fs.existsSync(mod.LEDGER_FILE)) {
      fs.unlinkSync(mod.LEDGER_FILE);
    }

    const existedBefore = fs.existsSync(mod.LEDGER_FILE);

    // Call findOwnershipConflicts, which is a read-only query
    const conflicts = mod.findOwnershipConflicts({
      taskId: 'task-query-1',
      ownedPaths: ['src/x.ts'],
    });

    assert.deepEqual(conflicts, [], 'no conflicts expected on empty ledger');

    // A pure read should NOT create the ledger file if it didn't exist
    // (the current Bug 2 causes pruneExpiredClaims to call writeLedger)
    const existedAfter = fs.existsSync(mod.LEDGER_FILE);
    assert.equal(
      existedBefore,
      existedAfter,
      'findOwnershipConflicts must not create ledger file as side-effect of a read'
    );
  });

  it('getActiveClaims does not write to ledger when no expired claims exist', () => {
    // Seed a fresh, non-expired claim
    mod.upsertClaim({
      taskId: 'task-fresh',
      ownedPaths: ['src/fresh.ts'],
    });

    // Capture mtime before read
    const statBefore = fs.statSync(mod.LEDGER_FILE);

    // Synchronous test — check mtime after getActiveClaims
    mod.getActiveClaims();

    const statAfter = fs.statSync(mod.LEDGER_FILE);

    // mtime should NOT change if no expired claims were pruned
    // Note: mtime precision on some filesystems is 1s; we rely on this being a
    // very fast operation (sub-millisecond) so mtimeMs should be identical.
    assert.equal(
      statBefore.mtimeMs,
      statAfter.mtimeMs,
      'getActiveClaims must not write ledger when no expired claims exist'
    );
  });

  it('readLedger is always a pure read (never writes)', () => {
    // readLedger should never call writeLedger under any circumstances
    if (fs.existsSync(mod.LEDGER_FILE)) {
      fs.unlinkSync(mod.LEDGER_FILE);
    }
    const existedBefore = fs.existsSync(mod.LEDGER_FILE);

    mod.readLedger();

    const existedAfter = fs.existsSync(mod.LEDGER_FILE);
    assert.equal(existedBefore, existedAfter, 'readLedger must not create or modify ledger file');
  });
});

describe('task-claim-ledger: Bug 3 — TOCTOU on claim check', () => {
  let mod;

  beforeEach(() => {
    delete require.cache[ledgerModulePath];
    mod = require(ledgerModulePath);
    try {
      mod.clearLedger();
    } catch (_err) {
      // ignore
    }
  });

  afterEach(() => {
    try {
      mod.clearLedger();
    } catch (_err) {
      // ignore
    }
    delete require.cache[ledgerModulePath];
  });

  it('claimWithConflictCheck is exported (atomic check-and-claim API)', () => {
    // The fix introduces an atomic claimWithConflictCheck function that
    // combines findOwnershipConflicts + upsertClaim under a single lock.
    assert.equal(
      typeof mod.claimWithConflictCheck,
      'function',
      'claimWithConflictCheck must be exported as the atomic claim API'
    );
  });

  it('claimWithConflictCheck returns { ok: true } when no conflicts', () => {
    const result = mod.claimWithConflictCheck({
      taskId: 'task-cas-1',
      agentType: 'developer',
      ownedPaths: ['src/cas-a.ts'],
    });

    assert.ok(result && typeof result === 'object', 'result must be an object');
    assert.equal(result.ok, true, 'should succeed with no conflicts');
    assert.equal(result.conflicts?.length ?? 0, 0, 'should have no conflicts');
  });

  it('claimWithConflictCheck returns { ok: false, conflicts } when paths overlap', () => {
    // Seed an existing claim
    mod.upsertClaim({
      taskId: 'task-existing',
      ownedPaths: ['src/shared/utils.ts'],
    });

    // Try to claim the same path atomically
    const result = mod.claimWithConflictCheck({
      taskId: 'task-new-claimer',
      ownedPaths: ['src/shared/utils.ts'],
    });

    assert.equal(result.ok, false, 'should detect conflict');
    assert.ok(Array.isArray(result.conflicts), 'conflicts must be an array');
    assert.ok(result.conflicts.length > 0, 'must have at least one conflict');
    assert.equal(result.conflicts[0].taskId, 'task-existing');
  });

  it('claimWithConflictCheck does NOT insert claim when conflict detected', () => {
    // Seed existing claim
    mod.upsertClaim({
      taskId: 'task-blocker',
      ownedPaths: ['src/blocked-path.ts'],
    });

    // Attempt to claim with conflict
    mod.claimWithConflictCheck({
      taskId: 'task-would-conflict',
      ownedPaths: ['src/blocked-path.ts'],
    });

    // The new task should NOT have been inserted
    const ledger = mod.readLedger();
    assert.ok(
      !ledger.claims['task-would-conflict'],
      'conflicting claim must not be inserted into ledger'
    );
  });

  it('claimWithConflictCheck inserts claim when no conflict (compare-and-swap success)', () => {
    const result = mod.claimWithConflictCheck({
      taskId: 'task-cas-success',
      agentType: 'developer',
      ownedPaths: ['src/unique-file.ts'],
    });

    assert.equal(result.ok, true);

    const ledger = mod.readLedger();
    assert.ok(ledger.claims['task-cas-success'], 'claim must be inserted on success');
    assert.equal(ledger.claims['task-cas-success'].taskId, 'task-cas-success');
  });

  it('claimWithConflictCheck allows non-overlapping paths from different tasks', () => {
    const r1 = mod.claimWithConflictCheck({
      taskId: 'task-path-a',
      ownedPaths: ['src/module-a.ts'],
    });
    const r2 = mod.claimWithConflictCheck({
      taskId: 'task-path-b',
      ownedPaths: ['src/module-b.ts'],
    });

    assert.equal(r1.ok, true, 'first claim should succeed');
    assert.equal(r2.ok, true, 'second non-overlapping claim should succeed');

    const ledger = mod.readLedger();
    assert.ok(ledger.claims['task-path-a'], 'claim a must exist');
    assert.ok(ledger.claims['task-path-b'], 'claim b must exist');
  });
});

describe('task-claim-ledger: Regression — existing behavior preserved', () => {
  let mod;

  beforeEach(() => {
    delete require.cache[ledgerModulePath];
    mod = require(ledgerModulePath);
    try {
      mod.clearLedger();
    } catch (_err) {
      // ignore
    }
  });

  afterEach(() => {
    try {
      mod.clearLedger();
    } catch (_err) {
      // ignore
    }
    delete require.cache[ledgerModulePath];
  });

  it('normalizePathToken lowercases on win32, preserves on other platforms', () => {
    const { normalizePathToken } = mod;
    const result = normalizePathToken('src/Foo/Bar.ts');
    if (process.platform === 'win32') {
      assert.equal(result, 'src/foo/bar.ts');
    } else {
      assert.equal(result, 'src/Foo/Bar.ts');
    }
  });

  it('hasPathOverlap detects parent-child overlap', () => {
    const { hasPathOverlap } = mod;
    assert.equal(hasPathOverlap(['src/auth'], ['src/auth/login.ts']), true);
    assert.equal(hasPathOverlap(['src/auth/login.ts'], ['src/auth']), true);
    assert.equal(hasPathOverlap(['src/auth'], ['src/other']), false);
  });

  it('releaseClaim with terminal status removes claim', () => {
    mod.upsertClaim({ taskId: 'task-del', ownedPaths: ['src/del.ts'] });
    mod.releaseClaim('task-del', 'completed');
    const ledger = mod.readLedger();
    assert.ok(!ledger.claims['task-del'], 'completed claim must be removed');
  });

  it('releaseClaim with non-terminal status keeps claim active', () => {
    mod.upsertClaim({ taskId: 'task-active', ownedPaths: ['src/active.ts'] });
    mod.releaseClaim('task-active', 'in_progress');
    const ledger = mod.readLedger();
    assert.ok(ledger.claims['task-active'], 'non-terminal releaseClaim must keep claim');
    assert.equal(ledger.claims['task-active'].active, true);
  });

  it('findOwnershipConflicts returns empty when no claims', () => {
    const conflicts = mod.findOwnershipConflicts({ taskId: 'task-x', ownedPaths: ['src/x.ts'] });
    assert.deepEqual(conflicts, []);
  });

  it('findOwnershipConflicts returns conflict when path overlaps', () => {
    mod.upsertClaim({ taskId: 'task-existing-2', ownedPaths: ['src/shared.ts'] });
    const conflicts = mod.findOwnershipConflicts({
      taskId: 'task-new-2',
      ownedPaths: ['src/shared.ts'],
    });
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].taskId, 'task-existing-2');
  });

  it('extractClaimMetadataFromTaskInput parses prompt fields', () => {
    const { extractClaimMetadataFromTaskInput } = mod;
    const result = extractClaimMetadataFromTaskInput({
      prompt: 'OWNED_PATHS: src/foo.ts, src/bar.ts\nDEPENDS_ON: task-1',
    });
    assert.ok(result.ownedPaths.length >= 2, 'should parse owned paths');
    assert.ok(result.dependsOn.includes('task-1'), 'should parse depends_on');
  });
});
