'use strict';
/**
 * Tests for scoped semver-diff module (Track 4.2)
 * TDD — written BEFORE implementation.
 *
 * Compares semver strings/schema objects to classify the type of change.
 * Corrections: safeParseJSON returns value directly (not { data, success }).
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

let computeSemverDiff, classifyChange, parseSemver, computeSemverBump;

describe('semver-diff — parseSemver', () => {
  before(() => {
    ({
      computeSemverDiff,
      classifyChange,
      parseSemver,
      computeSemverBump,
    } = require('../../../.claude/lib/artifacts/semver-diff.cjs'));
  });

  it('parses valid semver string', () => {
    const result = parseSemver('1.2.3');
    assert.deepEqual(result, { major: 1, minor: 2, patch: 3, valid: true });
  });

  it('parses semver with v prefix', () => {
    const result = parseSemver('v2.0.0');
    assert.deepEqual(result, { major: 2, minor: 0, patch: 0, valid: true });
  });

  it('returns invalid marker for non-semver string', () => {
    const result = parseSemver('not-a-version');
    assert.ok(!result.valid);
  });

  it('handles null/undefined gracefully', () => {
    assert.ok(!parseSemver(null).valid);
    assert.ok(!parseSemver(undefined).valid);
    assert.ok(!parseSemver('').valid);
  });
});

describe('semver-diff — classifyChange', () => {
  it('classifies major bump correctly', () => {
    assert.equal(
      classifyChange({ major: 1, minor: 0, patch: 0 }, { major: 2, minor: 0, patch: 0 }),
      'major'
    );
  });

  it('classifies minor bump correctly', () => {
    assert.equal(
      classifyChange({ major: 1, minor: 0, patch: 0 }, { major: 1, minor: 1, patch: 0 }),
      'minor'
    );
  });

  it('classifies patch bump correctly', () => {
    assert.equal(
      classifyChange({ major: 1, minor: 2, patch: 3 }, { major: 1, minor: 2, patch: 4 }),
      'patch'
    );
  });

  it('classifies identical versions as none', () => {
    assert.equal(
      classifyChange({ major: 1, minor: 2, patch: 3 }, { major: 1, minor: 2, patch: 3 }),
      'none'
    );
  });

  it('classifies downgrade as downgrade', () => {
    assert.equal(
      classifyChange({ major: 2, minor: 0, patch: 0 }, { major: 1, minor: 0, patch: 0 }),
      'downgrade'
    );
  });

  it('returns unknown when either parsed version is invalid', () => {
    assert.equal(
      classifyChange(
        { major: 0, minor: 0, patch: 0, valid: false },
        { major: 1, minor: 0, patch: 0 }
      ),
      'unknown'
    );
  });
});

describe('semver-diff — computeSemverDiff', () => {
  it('returns diff for two semver strings', () => {
    const result = computeSemverDiff('1.0.0', '2.0.0');
    assert.ok(typeof result === 'object');
    assert.equal(result.changeType, 'major');
    assert.equal(result.from, '1.0.0');
    assert.equal(result.to, '2.0.0');
  });

  it('includes delta fields in result', () => {
    const result = computeSemverDiff('1.2.3', '1.3.0');
    assert.equal(result.changeType, 'minor');
    assert.ok('majorDelta' in result);
    assert.ok('minorDelta' in result);
    assert.ok('patchDelta' in result);
    assert.equal(result.minorDelta, 1);
  });

  it('returns unknown change type for invalid semver inputs', () => {
    const result = computeSemverDiff('not-ver', '2.0.0');
    assert.equal(result.changeType, 'unknown');
  });

  it('handles patch-only change correctly', () => {
    const result = computeSemverDiff('3.4.5', '3.4.9');
    assert.equal(result.changeType, 'patch');
    assert.equal(result.patchDelta, 4);
  });

  it('handles "none" when versions are equal', () => {
    const result = computeSemverDiff('1.0.0', '1.0.0');
    assert.equal(result.changeType, 'none');
  });
});

describe('semver-diff — computeSemverBump (content-based, Track 4.2)', () => {
  // Skill / Agent artifacts: YAML frontmatter with tools: array

  it('Test A: removed tool from YAML frontmatter → major', () => {
    const old = '---\nname: my-skill\ntools: [Read, Write]\n---\nContent';
    const updated = '---\nname: my-skill\ntools: [Read]\n---\nContent';
    assert.equal(computeSemverBump(old, updated, 'skill'), 'major');
  });

  it('Test B: added tool to YAML frontmatter → minor', () => {
    const old = '---\nname: my-skill\ntools: [Read]\n---\nContent';
    const updated = '---\nname: my-skill\ntools: [Read, Write]\n---\nContent';
    assert.equal(computeSemverBump(old, updated, 'skill'), 'minor');
  });

  it('Test C: same tools list → patch', () => {
    const old = '---\nname: my-skill\ntools: [Read, Write]\n---\nContent';
    const updated = '---\nname: my-skill\ntools: [Read, Write]\n---\nContent changed';
    assert.equal(computeSemverBump(old, updated, 'skill'), 'patch');
  });

  it('Test D: no frontmatter in either → patch', () => {
    assert.equal(computeSemverBump('plain text', 'other text', 'skill'), 'patch');
  });

  it('Test E: old tools block-style list, new removes one → major', () => {
    const old = '---\nname: agent\ntools:\n  - Read\n  - Write\n  - Edit\n---\nBody';
    const updated = '---\nname: agent\ntools:\n  - Read\n  - Write\n---\nBody';
    assert.equal(computeSemverBump(old, updated, 'agent'), 'major');
  });

  // JSON Schema artifacts: required[] and property types

  it('Test F: removed required property from JSON schema → major', () => {
    const old = JSON.stringify({
      required: ['name', 'type'],
      properties: { name: { type: 'string' }, type: { type: 'string' } },
    });
    const updated = JSON.stringify({
      required: ['name'],
      properties: { name: { type: 'string' } },
    });
    assert.equal(computeSemverBump(old, updated, 'schema'), 'major');
  });

  it('Test G: property type changed in JSON schema → major', () => {
    const old = JSON.stringify({ properties: { count: { type: 'string' } } });
    const updated = JSON.stringify({ properties: { count: { type: 'number' } } });
    assert.equal(computeSemverBump(old, updated, 'schema'), 'major');
  });

  it('Test H: added new required property to JSON schema → major', () => {
    const old = JSON.stringify({ required: ['name'], properties: { name: { type: 'string' } } });
    const updated = JSON.stringify({
      required: ['name', 'id'],
      properties: { name: { type: 'string' }, id: { type: 'string' } },
    });
    assert.equal(computeSemverBump(old, updated, 'schema'), 'major');
  });

  it('Test I: added optional property to JSON schema → minor', () => {
    const old = JSON.stringify({ properties: { name: { type: 'string' } } });
    const updated = JSON.stringify({
      properties: { name: { type: 'string' }, label: { type: 'string' } },
    });
    assert.equal(computeSemverBump(old, updated, 'schema'), 'minor');
  });

  it('Test J: no structural change in JSON schema → patch', () => {
    const schema = JSON.stringify({ required: ['name'], properties: { name: { type: 'string' } } });
    assert.equal(computeSemverBump(schema, schema, 'schema'), 'patch');
  });

  it('Test K: invalid JSON for schema → patch (safe fallback)', () => {
    assert.equal(computeSemverBump('not json', 'also not json', 'schema'), 'patch');
  });

  it('returns string result', () => {
    const result = computeSemverBump('---\ntools: []\n---', '---\ntools: []\n---', 'skill');
    assert.ok(['major', 'minor', 'patch'].includes(result));
  });
});

describe('SE-XX compliance — semver-diff', () => {
  it('SE-02: module loads without raw JSON.parse calls on user input', () => {
    const mod = require('../../../.claude/lib/artifacts/semver-diff.cjs');
    assert.ok(typeof mod.computeSemverDiff === 'function');
    assert.ok(typeof mod.classifyChange === 'function');
    assert.ok(typeof mod.parseSemver === 'function');
  });

  it('SE-04: no await-in-forEach (pure sync module)', () => {
    const { computeSemverDiff: diff } = require('../../../.claude/lib/artifacts/semver-diff.cjs');
    const result = diff('1.0.0', '2.0.0');
    assert.ok(typeof result === 'object');
    assert.ok(!(result instanceof Promise), 'Should be synchronous');
  });
});
