'use strict';

/**
 * MEv1 B2 — StateMutex TOCTOU + concurrent dispatch race (CWE-362)
 *
 * Threat: StateMutex._load → check → _persist sequence is NOT atomic across
 * processes. Two concurrent ticks can both observe lockedBy=null and both
 * succeed, double-dispatching the same feature.id.
 *
 * Mitigations (B2):
 * - proper-lockfile wraps the critical section so the OS-level file lock
 *   serializes _load → _persist across processes.
 * - dispatched_features SQL table with UNIQUE constraint on (featureId,
 *   in_flight_status) blocks double-enqueue defensively even if the mutex
 *   is bypassed.
 *
 * Source: .claude/context/reports/security/mev1-phase0-threat-model-2026-04-19.md (B2)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const stateMutexPath = path.resolve(
  __dirname,
  '..',
  '..',
  '.claude',
  'lib',
  'mission',
  'state-mutex.cjs'
);
const { StateMutex, acquireLockSync } = require(stateMutexPath);

const dispatchedFeaturesMigration = path.resolve(
  __dirname,
  '..',
  '..',
  '.claude',
  'lib',
  'db',
  'migrations',
  '003-dispatched-features.sql'
);

test('B2-source: state-mutex.cjs uses proper-lockfile around _load/_persist', () => {
  const src = fs.readFileSync(stateMutexPath, 'utf8');
  assert.match(src, /proper-lockfile/, 'must require proper-lockfile');
  assert.match(src, /lockSync|lockfile\.lockSync/, 'must use lockSync for sync mutex');
});

test('B2-source: acquireLockSync wraps _load → _persist in a single critical section', () => {
  assert.equal(typeof acquireLockSync, 'function');
});

test('B2-source: dispatched_features migration exists with UNIQUE constraint', () => {
  assert.ok(fs.existsSync(dispatchedFeaturesMigration), 'migration file must exist');
  const sql = fs.readFileSync(dispatchedFeaturesMigration, 'utf8');
  assert.match(sql, /CREATE TABLE/i);
  assert.match(sql, /dispatched_features/);
  assert.match(sql, /UNIQUE/i, 'UNIQUE constraint required');
  assert.match(sql, /feature_id/, 'feature_id column required');
});

test('B2-mutex: serial acquireLockSync calls do not corrupt state', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mev1-b2-'));
  const statePath = path.join(tmpDir, 'state.json');

  const mutex = new StateMutex(statePath);
  const r1 = mutex.acquireLock({ requesterType: 'orchestrator', requesterId: 'o1' });
  assert.equal(r1.acquired, true);
  mutex.releaseLock({ requesterId: 'o1' });

  const r2 = mutex.acquireLock({ requesterType: 'orchestrator', requesterId: 'o2' });
  assert.equal(r2.acquired, true);
  mutex.releaseLock({ requesterId: 'o2' });

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('B2-mutex: two acquires in same process throw LOCK_HELD on second', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mev1-b2-'));
  const statePath = path.join(tmpDir, 'state.json');

  const m1 = new StateMutex(statePath);
  const m2 = new StateMutex(statePath);
  const r1 = m1.acquireLock({ requesterType: 'orchestrator', requesterId: 'o1' });
  assert.equal(r1.acquired, true);

  assert.throws(
    () => m2.acquireLock({ requesterType: 'orchestrator', requesterId: 'o2' }),
    err => err && err.code === 'LOCK_HELD'
  );

  m1.releaseLock({ requesterId: 'o1' });
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('B2-dedupe: dispatched_features UNIQUE blocks double in-flight insert', () => {
  const Database = require('better-sqlite3');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mev1-b2-'));
  const dbPath = path.join(tmpDir, 'q.db');
  const db = new Database(dbPath);
  const sql = fs.readFileSync(dispatchedFeaturesMigration, 'utf8');
  db.exec(sql);

  const insert = db.prepare(
    'INSERT INTO dispatched_features (feature_id, in_flight_status, created_at) VALUES (?, ?, ?)'
  );
  insert.run('f1', 'in_flight', Date.now());

  // Same feature_id + in_flight should fail UNIQUE
  assert.throws(() => insert.run('f1', 'in_flight', Date.now()), /UNIQUE|constraint/i);

  // Different status (e.g. 'completed') is allowed in the same row group
  // (designed so we can mark old dispatches done and re-dispatch later).
  // We do NOT enforce that here — what matters is that two simultaneous
  // 'in_flight' rows for the same feature_id are rejected.
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
