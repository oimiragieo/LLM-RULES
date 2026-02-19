'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function setupTempProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-freshness-'));
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  return root;
}

function createSkill(root, name, frontmatter) {
  const skillDir = path.join(root, '.claude', 'skills', name);
  fs.mkdirSync(skillDir, { recursive: true });
  const lines = ['---'];
  for (const [key, value] of Object.entries(frontmatter)) {
    lines.push(`${key}: ${value}`);
  }
  lines.push('---');
  lines.push('', `# ${name}`, '', 'Skill description.');
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), lines.join('\n'), 'utf8');
}

function daysAgo(days) {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

test('counts verified vs unverified skills', () => {
  const root = setupTempProject();
  try {
    createSkill(root, 'alpha', { verified: 'true', lastVerifiedAt: daysAgo(5) });
    createSkill(root, 'beta', { verified: 'false' });
    createSkill(root, 'gamma', { verified: 'false' });

    const {
      generateFreshnessReport,
    } = require('../../../.claude/tools/cli/skill-freshness-report.cjs');
    const report = generateFreshnessReport(root);

    assert.equal(report.summary.verified, 1);
    assert.equal(report.summary.unverified, 2);
    assert.equal(report.summary.total, 3);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('groups skills by age bucket', () => {
  const root = setupTempProject();
  try {
    createSkill(root, 'recent', { verified: 'true', lastVerifiedAt: daysAgo(14) });
    createSkill(root, 'medium', { verified: 'true', lastVerifiedAt: daysAgo(60) });
    createSkill(root, 'old', { verified: 'true', lastVerifiedAt: daysAgo(150) });

    const {
      generateFreshnessReport,
    } = require('../../../.claude/tools/cli/skill-freshness-report.cjs');
    const report = generateFreshnessReport(root);

    assert.equal(report.buckets['<1mo'], 1);
    assert.equal(report.buckets['1-3mo'], 1);
    assert.equal(report.buckets['3-6mo'], 1);
    assert.equal(report.buckets['>6mo'], 0);
    assert.equal(report.buckets['no-date'], 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('identifies stale skills (>6 months)', () => {
  const root = setupTempProject();
  try {
    createSkill(root, 'ancient', { verified: 'true', lastVerifiedAt: daysAgo(210) });

    const {
      generateFreshnessReport,
    } = require('../../../.claude/tools/cli/skill-freshness-report.cjs');
    const report = generateFreshnessReport(root);

    assert.equal(report.buckets['>6mo'], 1);
    assert.equal(report.staleSkills.length, 1);
    assert.equal(report.staleSkills[0].name, 'ancient');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('lists top oldest skills', () => {
  const root = setupTempProject();
  try {
    createSkill(root, 'newest', { verified: 'true', lastVerifiedAt: daysAgo(10) });
    createSkill(root, 'older', { verified: 'true', lastVerifiedAt: daysAgo(100) });
    createSkill(root, 'oldest', { verified: 'true', lastVerifiedAt: daysAgo(300) });
    createSkill(root, 'middle', { verified: 'true', lastVerifiedAt: daysAgo(50) });
    createSkill(root, 'old', { verified: 'true', lastVerifiedAt: daysAgo(200) });

    const {
      generateFreshnessReport,
    } = require('../../../.claude/tools/cli/skill-freshness-report.cjs');
    const report = generateFreshnessReport(root);

    assert.ok(report.topOldest.length <= 5);
    // Sorted by age descending (oldest first)
    assert.equal(report.topOldest[0].name, 'oldest');
    assert.equal(report.topOldest[1].name, 'old');
    assert.equal(report.topOldest[2].name, 'older');
    assert.equal(report.topOldest[3].name, 'middle');
    assert.equal(report.topOldest[4].name, 'newest');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('handles skills with no date', () => {
  const root = setupTempProject();
  try {
    createSkill(root, 'dated', { verified: 'true', lastVerifiedAt: daysAgo(5) });
    createSkill(root, 'undated', { verified: 'true' });

    const {
      generateFreshnessReport,
    } = require('../../../.claude/tools/cli/skill-freshness-report.cjs');
    const report = generateFreshnessReport(root);

    assert.equal(report.buckets['no-date'], 1);
    assert.equal(report.summary.total, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
