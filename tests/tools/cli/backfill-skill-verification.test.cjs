#!/usr/bin/env node
'use strict';

const { describe, test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  backfillSkills,
} = require('../../../.claude/tools/cli/backfill-skill-verification.cjs');

/** Create a temp directory that mimics a project root with .claude/skills/ */
function makeTempProject() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-test-'));
  const skillsDir = path.join(tmpDir, '.claude', 'skills');
  fs.mkdirSync(skillsDir, { recursive: true });
  return tmpDir;
}

/** Create a SKILL.md inside a skill subdirectory */
function writeSkill(projectRoot, skillName, content) {
  const skillDir = path.join(projectRoot, '.claude', 'skills', skillName);
  fs.mkdirSync(skillDir, { recursive: true });
  const filePath = path.join(skillDir, 'SKILL.md');
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

/** Read a SKILL.md back */
function readSkill(projectRoot, skillName) {
  const filePath = path.join(projectRoot, '.claude', 'skills', skillName, 'SKILL.md');
  return fs.readFileSync(filePath, 'utf8');
}

/** Recursively remove a directory */
function rmTemp(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('backfill-skill-verification', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTempProject();
  });

  afterEach(() => {
    if (tmpDir) rmTemp(tmpDir);
  });

  test('adds lastVerifiedAt and verified to skills without them', () => {
    const content = `---
name: my-skill
description: A test skill
version: 1.0
---

# My Skill

Some content here.
`;
    writeSkill(tmpDir, 'my-skill', content);

    const result = backfillSkills(tmpDir, {
      timestamp: '2026-02-19T00:00:00.000Z',
    });

    const updated = readSkill(tmpDir, 'my-skill');
    assert.match(updated, /verified: false/);
    assert.match(updated, /lastVerifiedAt: 2026-02-19T00:00:00\.000Z/);
    assert.equal(result.updated, 1);
  });

  test('does not overwrite existing lastVerifiedAt values', () => {
    const content = `---
name: existing-skill
description: Already verified
lastVerifiedAt: 2025-01-01T00:00:00Z
verified: true
---

# Existing Skill
`;
    writeSkill(tmpDir, 'existing-skill', content);

    const result = backfillSkills(tmpDir, {
      timestamp: '2026-02-19T00:00:00.000Z',
    });

    const updated = readSkill(tmpDir, 'existing-skill');
    assert.match(updated, /lastVerifiedAt: 2025-01-01T00:00:00Z/);
    assert.doesNotMatch(updated, /lastVerifiedAt: 2026-02-19/);
    assert.equal(result.skipped, 1);
    assert.equal(result.updated, 0);
  });

  test('skips archived skills (_archive/)', () => {
    const archiveDir = path.join(
      tmpDir,
      '.claude',
      'skills',
      '_archive',
      'old-skill'
    );
    fs.mkdirSync(archiveDir, { recursive: true });
    const content = `---
name: old-skill
description: Archived
---

# Old Skill
`;
    fs.writeFileSync(path.join(archiveDir, 'SKILL.md'), content, 'utf8');

    const result = backfillSkills(tmpDir, {
      timestamp: '2026-02-19T00:00:00.000Z',
    });

    // File should be unchanged
    const unchanged = fs.readFileSync(
      path.join(archiveDir, 'SKILL.md'),
      'utf8'
    );
    assert.equal(unchanged, content);
    assert.equal(result.total, 0);
    assert.equal(result.updated, 0);
  });

  test('handles malformed frontmatter gracefully', () => {
    const content = `---
name: broken-skill
description: [unclosed bracket
  - this is bad yaml
: missing key
---

# Broken Skill
`;
    const filePath = writeSkill(tmpDir, 'broken-skill', content);

    const result = backfillSkills(tmpDir, {
      timestamp: '2026-02-19T00:00:00.000Z',
    });

    // File should be unchanged (no crash)
    const unchanged = readSkill(tmpDir, 'broken-skill');
    assert.equal(unchanged, content);
    assert.equal(result.errors, 1);
  });

  test('dry-run mode shows what would change without writing', () => {
    const content = `---
name: dry-run-skill
description: Test dry run
version: 1.0
---

# Dry Run Skill
`;
    writeSkill(tmpDir, 'dry-run-skill', content);

    const result = backfillSkills(tmpDir, {
      dryRun: true,
      timestamp: '2026-02-19T00:00:00.000Z',
    });

    // File should be unchanged
    const unchanged = readSkill(tmpDir, 'dry-run-skill');
    assert.equal(unchanged, content);
    // But report should show it would have been updated
    assert.equal(result.updated, 1);
  });

  test('reports count: total, updated, skipped, errors', () => {
    // Skill 1: needs backfill
    writeSkill(
      tmpDir,
      'needs-backfill',
      `---
name: needs-backfill
description: Needs backfill
---

# Needs Backfill
`
    );

    // Skill 2: already has lastVerifiedAt (should be skipped)
    writeSkill(
      tmpDir,
      'already-verified',
      `---
name: already-verified
description: Already verified
lastVerifiedAt: 2025-06-01T00:00:00Z
verified: true
---

# Already Verified
`
    );

    // Skill 3: malformed (should count as error)
    writeSkill(
      tmpDir,
      'malformed',
      `---
name: malformed
: bad
---

# Malformed
`
    );

    const result = backfillSkills(tmpDir, {
      timestamp: '2026-02-19T00:00:00.000Z',
    });

    assert.equal(typeof result.total, 'number');
    assert.equal(typeof result.updated, 'number');
    assert.equal(typeof result.skipped, 'number');
    assert.equal(typeof result.errors, 'number');
    assert.equal(result.total, 3);
    assert.equal(result.updated, 1);
    assert.equal(result.skipped, 1);
    assert.equal(result.errors, 1);
  });
});
