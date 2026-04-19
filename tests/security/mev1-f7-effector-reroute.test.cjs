'use strict';

/**
 * MEv1 M-F7 — F7 effector reroute (proposer-only refactor)
 *
 * ADR (decisions.md, 2026-04-19): F7 skill-auto-creator archived.
 * "Roadmap: proposer-only refactor routing through skill-creator as effector."
 *
 * Acceptance:
 * - Dispatcher MUST NOT directly construct .claude/skills/<skillName>/SKILL.md
 *   paths from attacker-controlled input without going through path.basename
 *   AND the SKILL_ALLOWLIST gate (B3).
 * - When a skill is missing, dispatcher MUST surface a `skill_proposed` reason
 *   (proposer pattern) carrying the skill-creator request, NOT a silent fail
 *   nor a hard "skill_not_found" — that is the effector handoff.
 * - Direct skill-auto-creator references in the dispatcher are FORBIDDEN
 *   (F7 archived).
 *
 * Source: .claude/context/memory/decisions.md ADR 2026-04-19,
 *         .claude/context/reports/security/mev1-phase0-threat-model-2026-04-19.md (T-04)
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

const dispatcher = require(dispatcherPath);
const { dispatchFeature, resolveSkillViaCreator } = dispatcher;

test('M-F7: dispatcher source contains zero references to archived skill-auto-creator', () => {
  const src = fs.readFileSync(dispatcherPath, 'utf8');
  assert.doesNotMatch(src, /skill-auto-creator/, 'F7 archived — no callsites permitted');
});

test('M-F7: dispatcher uses path.basename to sanitize skillName at every join', () => {
  const src = fs.readFileSync(dispatcherPath, 'utf8');
  // Every path.join that incorporates feature.skillName must wrap it with path.basename.
  // Find every path.join call referring to skillName and assert basename is present nearby.
  const joinLines = src.split('\n').filter(l => /path\.join\(.*skillName/.test(l));
  for (const line of joinLines) {
    assert.match(
      line,
      /path\.basename\(/,
      `path.join with skillName must use path.basename: ${line.trim()}`
    );
  }
});

test('M-F7: resolveSkillViaCreator is exported (proposer-pattern effector)', () => {
  assert.equal(typeof resolveSkillViaCreator, 'function');
});

test('M-F7: resolveSkillViaCreator returns { found: true } for existing skill', () => {
  // tdd is allowlisted and present in .claude/skills/tdd
  const result = resolveSkillViaCreator('tdd', {
    cwd: path.resolve(__dirname, '..', '..'),
  });
  assert.equal(result.found, true, `expected found, got ${JSON.stringify(result)}`);
});

test('M-F7: resolveSkillViaCreator returns { found: false, proposerRequest } for missing skill', () => {
  // Use an allowlisted name that is NOT actually present on disk for this test.
  // We use a temp cwd with no .claude/skills dir to guarantee miss.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mev1-mf7-'));
  const result = resolveSkillViaCreator('tdd', { cwd: tmpDir });
  assert.equal(result.found, false);
  assert.ok(result.proposerRequest, 'must include proposerRequest');
  assert.equal(result.proposerRequest.targetSkill, 'tdd');
  assert.equal(result.proposerRequest.effector, 'skill-creator');
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('M-F7: dispatchFeature surfaces skill_proposed reason when skill missing (proposer pattern)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mev1-mf7-'));
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
          description: 'allowlisted but missing on disk',
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
    acquireWorkerSlot: () => ({ allowed: true, release: () => {} }),
  };

  const result = dispatchFeature({
    db: fakeDb,
    budget: fakeBudget,
    featuresPath,
    missionPath,
    validateSkills: true,
    cwd: tmpDir, // empty cwd — skill missing
  });

  assert.equal(result.dispatched, false);
  assert.equal(result.reason, 'skill_proposed');
  assert.ok(result.proposerRequest, 'must surface proposerRequest for skill-creator');
  assert.equal(result.proposerRequest.effector, 'skill-creator');
  assert.equal(enqueueCalled, false);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
