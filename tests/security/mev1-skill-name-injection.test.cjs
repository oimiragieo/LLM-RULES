'use strict';

/**
 * MEv1 B3 — SKILL_ALLOWLIST + skillName fuzz (CWE-78)
 *
 * Threat: feature.skillName flowed unvalidated into worker dispatch enqueue.
 * A skillName like "../../etc/passwd" or "tdd; rm -rf /" could later reach a
 * spawn() or path.join() and cause path traversal / command injection.
 *
 * Mitigation:
 * - Hard regex `^[a-z0-9][a-z0-9_-]*$` (no path separators, no shell metachars)
 * - SKILL_ALLOWLIST membership check before enqueueMessage
 *
 * Source: .claude/context/reports/security/mev1-phase0-threat-model-2026-04-19.md (B3)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const dispatcherPath = path.resolve(
  __dirname,
  '..',
  '..',
  '.claude',
  'lib',
  'mission',
  'worker-features-dispatcher.cjs'
);
const allowlistPath = path.resolve(
  __dirname,
  '..',
  '..',
  '.claude',
  'lib',
  'mission',
  'skill-allowlist.json'
);

const {
  dispatchFeature,
  validateSkillName,
  SKILL_NAME_REGEX,
  SKILL_ALLOWLIST,
} = require(dispatcherPath);

test('B3-source: SKILL_ALLOWLIST is exported and non-empty', () => {
  assert.ok(Array.isArray(SKILL_ALLOWLIST), 'SKILL_ALLOWLIST must be an array');
  assert.ok(SKILL_ALLOWLIST.length > 0, 'SKILL_ALLOWLIST must be non-empty');
  // Common skills expected
  assert.ok(SKILL_ALLOWLIST.includes('tdd'), 'tdd must be allowlisted');
});

test('B3-source: skill-allowlist.json file exists and parses to a list', () => {
  assert.ok(fs.existsSync(allowlistPath), 'skill-allowlist.json must exist');
  const raw = fs.readFileSync(allowlistPath, 'utf8');
  const data = JSON.parse(raw);
  assert.ok(Array.isArray(data.allowlist), 'allowlist key must be an array');
  assert.ok(data.allowlist.length > 0, 'allowlist must be non-empty');
});

test('B3-regex: SKILL_NAME_REGEX rejects shell metachars and path traversal', () => {
  const malicious = [
    '../../etc/passwd',
    '..\\..\\windows\\system32',
    'tdd; rm -rf /',
    'tdd | cat',
    'tdd && evil',
    'tdd $(whoami)',
    'tdd `whoami`',
    'tdd\nrm',
    '/abs/path/skill',
    'UPPER',
    'has space',
    '-leadingdash',
    '.hidden',
    '',
    'a/b',
    'a\\b',
  ];
  for (const name of malicious) {
    assert.equal(SKILL_NAME_REGEX.test(name), false, `regex must reject: ${JSON.stringify(name)}`);
  }
});

test('B3-regex: SKILL_NAME_REGEX accepts valid skill names', () => {
  const ok = ['tdd', 'a', 'a1', 'foo-bar', 'foo_bar', 'foo-bar_baz123'];
  for (const name of ok) {
    assert.equal(SKILL_NAME_REGEX.test(name), true, `regex must accept: ${JSON.stringify(name)}`);
  }
});

test('B3-validate: validateSkillName throws ValidationError on traversal', () => {
  assert.throws(
    () => validateSkillName('../../etc/passwd'),
    err => err && err.code === 'SKILL_NAME_INVALID'
  );
});

test('B3-validate: validateSkillName throws ValidationError on shell metachars', () => {
  assert.throws(
    () => validateSkillName('tdd; rm -rf /'),
    err => err && err.code === 'SKILL_NAME_INVALID'
  );
});

test('B3-validate: validateSkillName throws SKILL_NOT_ALLOWLISTED for valid format but unknown name', () => {
  assert.throws(
    () => validateSkillName('zzz-not-in-allowlist-xyz'),
    err => err && err.code === 'SKILL_NOT_ALLOWLISTED'
  );
});

test('B3-validate: validateSkillName accepts allowlisted skill', () => {
  assert.doesNotThrow(() => validateSkillName('tdd'));
});

test('B3-dispatch: dispatchFeature rejects malicious skillName before enqueue', () => {
  // Build minimal fixture with a malicious skillName
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mev1-b3-'));
  const featuresPath = path.join(tmpDir, 'features.json');
  const missionPath = path.join(tmpDir, 'mission.md');
  fs.writeFileSync(missionPath, '# Mission\n\n## Objectives\n- test\n');
  fs.writeFileSync(
    featuresPath,
    JSON.stringify({
      version: '1.0.0',
      features: [
        {
          id: 'f1',
          description: 'malicious skill test',
          skillName: '../../etc/passwd',
          status: 'pending',
          preconditions: [],
        },
      ],
    })
  );

  // Stub db + budget — they should never be called because validation fails first
  let enqueueCalled = false;
  const fakeDb = {
    prepare: () => ({
      run: () => {
        enqueueCalled = true;
        return { changes: 1 };
      },
    }),
  };
  const fakeBudget = {
    acquireWorkerSlot: () => ({
      allowed: true,
      release: () => {},
    }),
  };

  const result = dispatchFeature({
    db: fakeDb,
    budget: fakeBudget,
    featuresPath,
    missionPath,
  });

  assert.equal(result.dispatched, false, 'must not dispatch malicious skillName');
  assert.equal(result.reason, 'skill_name_invalid');
  assert.equal(enqueueCalled, false, 'enqueue must NOT be called for malicious skillName');

  // cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('B3-dispatch: dispatchFeature rejects skillName not in SKILL_ALLOWLIST', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mev1-b3-'));
  const featuresPath = path.join(tmpDir, 'features.json');
  const missionPath = path.join(tmpDir, 'mission.md');
  fs.writeFileSync(missionPath, '# Mission\n\n## Objectives\n- test\n');
  fs.writeFileSync(
    featuresPath,
    JSON.stringify({
      version: '1.0.0',
      features: [
        {
          id: 'f1',
          description: 'unknown skill',
          skillName: 'zzz-not-in-allowlist-xyz',
          status: 'pending',
          preconditions: [],
        },
      ],
    })
  );

  let enqueueCalled = false;
  const fakeDb = {
    prepare: () => ({
      run: () => {
        enqueueCalled = true;
        return { changes: 1 };
      },
    }),
  };
  const fakeBudget = {
    acquireWorkerSlot: () => ({
      allowed: true,
      release: () => {},
    }),
  };

  const result = dispatchFeature({
    db: fakeDb,
    budget: fakeBudget,
    featuresPath,
    missionPath,
  });

  assert.equal(result.dispatched, false);
  assert.equal(result.reason, 'skill_not_allowlisted');
  assert.equal(enqueueCalled, false);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('B3-dispatch: dispatchFeature accepts allowlisted skillName (tdd)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mev1-b3-'));
  const featuresPath = path.join(tmpDir, 'features.json');
  const missionPath = path.join(tmpDir, 'mission.md');
  fs.writeFileSync(missionPath, '# Mission\n\n## Objectives\n- test\n');
  fs.writeFileSync(
    featuresPath,
    JSON.stringify({
      version: '1.0.0',
      features: [
        {
          id: 'f1',
          description: 'allowlisted skill',
          skillName: 'tdd',
          status: 'pending',
          preconditions: [],
        },
      ],
    })
  );

  let enqueueCalled = false;
  const fakeDb = {
    prepare: () => ({
      run: () => {
        enqueueCalled = true;
        return { changes: 1 };
      },
    }),
  };
  const fakeBudget = {
    acquireWorkerSlot: () => ({
      allowed: true,
      release: () => {},
    }),
  };

  const result = dispatchFeature({
    db: fakeDb,
    budget: fakeBudget,
    featuresPath,
    missionPath,
  });

  assert.equal(result.dispatched, true, `expected dispatched, got: ${JSON.stringify(result)}`);
  assert.equal(result.featureId, 'f1');
  assert.equal(enqueueCalled, true, 'enqueue must be called for allowlisted skill');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
