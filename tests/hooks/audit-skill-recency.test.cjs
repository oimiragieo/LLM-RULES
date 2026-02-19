#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const audit = require('../../.claude/hooks/session/audit-skill-recency.cjs');

function setupTempProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-skill-recency-'));
  fs.mkdirSync(path.join(root, '.claude', 'skills', 'sample'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude', 'agents', 'core'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude', 'agents', '_archive', 'dead'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude', 'context', 'runtime'), { recursive: true });
  return root;
}

test('audit excludes archived and non-agent markdown files', () => {
  const root = setupTempProject();
  try {
    fs.writeFileSync(
      path.join(root, '.claude', 'skills', 'sample', 'SKILL.md'),
      ['---', 'verified: true', 'lastVerifiedAt: 2026-01-01T00:00:00.000Z', '---'].join('\n'),
      'utf8'
    );
    fs.writeFileSync(
      path.join(root, '.claude', 'agents', 'core', 'reflection-agent.md'),
      ['---', 'verified: true', 'lastVerifiedAt: 2026-01-01T00:00:00.000Z', '---'].join('\n'),
      'utf8'
    );
    fs.writeFileSync(
      path.join(root, '.claude', 'agents', '_archive', 'dead', 'old.md'),
      ['---', 'verified: false', '---'].join('\n'),
      'utf8'
    );
    fs.writeFileSync(path.join(root, '.claude', 'agents', 'README.md'), '# readme', 'utf8');

    const result = audit.auditArtifacts({ projectRoot: root, json: true });
    const labels = [
      ...result.unverified.map(item => item.label),
      ...result.stale.map(item => item.label),
    ].join('\n');
    assert.doesNotMatch(labels, /README|old/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('audit validates ISO date and marks invalid values stale', () => {
  const root = setupTempProject();
  try {
    fs.writeFileSync(
      path.join(root, '.claude', 'skills', 'sample', 'SKILL.md'),
      ['---', 'verified: true', 'lastVerifiedAt: last-week', '---'].join('\n'),
      'utf8'
    );

    const result = audit.auditArtifacts({ projectRoot: root, json: true });
    assert.equal(result.stale.length, 1);
    assert.match(result.stale[0].label, /\[SKILL\] sample/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('audit writes stale-artifacts.json with machine-readable shape', () => {
  const root = setupTempProject();
  try {
    fs.writeFileSync(
      path.join(root, '.claude', 'skills', 'sample', 'SKILL.md'),
      ['---', 'verified: false', '---'].join('\n'),
      'utf8'
    );

    const result = audit.auditArtifacts({ projectRoot: root, json: true, writeRuntimeFile: true });
    assert.equal(result.unverified.length, 1);

    const runtimePath = path.join(root, '.claude', 'context', 'runtime', 'stale-artifacts.json');
    assert.equal(fs.existsSync(runtimePath), true);
    const parsed = JSON.parse(fs.readFileSync(runtimePath, 'utf8'));
    assert.equal(typeof parsed.timestamp, 'string');
    assert.ok(Array.isArray(parsed.unverified));
    assert.ok(Array.isArray(parsed.stale));
    assert.equal(parsed.unverified[0].type, 'skill');
    assert.equal(parsed.unverified[0].status, 'unverified');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
