'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  writeExtractedMemories,
} = require('../../../.claude/lib/memory/memory-extraction-writer.cjs');

test('writeExtractedMemories persists category files', async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-writer-'));
  const candidates = [
    {
      category: 'profile',
      abstract: 'User role: Staff engineer',
      overview: '## Background\n- Works on infra',
      content: 'User is a staff engineer focused on infrastructure.',
    },
    {
      category: 'events',
      abstract: 'Decided to switch DB',
      overview: '## Decision Content\nSwitch database\n',
      content: 'Team decided to move from MySQL to PostgreSQL.',
    },
  ];

  try {
    const result = await writeExtractedMemories(candidates, {
      projectRoot,
      deduplicate: false,
      indexToLanceDb: false,
    });

    assert.equal(result.written, 2);
    assert.equal(result.skipped, 0);
    assert.equal(result.created, 2);
    assert.equal(result.updated, 0);
    assert.equal(result.merged, 0);
    assert.equal(result.skippedByDedup, 0);
    assert.equal(result.files.length, 2);

    const profilePath = path.join(
      projectRoot,
      '.claude',
      'context',
      'memory',
      'memories',
      'profile.md'
    );
    assert.ok(result.files.includes(profilePath));
    assert.ok(fs.existsSync(profilePath));
    const profileContent = fs.readFileSync(profilePath, 'utf8');
    assert.ok(profileContent.includes('User role: Staff engineer'));

    const profileDir = path.join(
      projectRoot,
      '.claude',
      'context',
      'memory',
      'memories',
      'profile'
    );
    assert.ok(!fs.existsSync(profileDir));

    for (const filePath of result.files) {
      assert.ok(fs.existsSync(filePath));
      const content = fs.readFileSync(filePath, 'utf8');
      assert.ok(content.includes('# '));
    }
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('writeExtractedMemories overwrites existing file on update', async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-writer-'));
  const existingPath = path.join(
    projectRoot,
    '.claude',
    'context',
    'memory',
    'memories',
    'events',
    'existing.md'
  );
  const candidates = [
    {
      category: 'events',
      abstract: 'Updated decision',
      overview: '## Overview\nUpdated\n',
      content: 'Updated content',
    },
  ];

  try {
    fs.mkdirSync(path.dirname(existingPath), { recursive: true });
    fs.writeFileSync(existingPath, '# Old\n\nOld content');

    const result = await writeExtractedMemories(candidates, {
      projectRoot,
      deduplicate: true,
      indexToLanceDb: false,
      deduplicateFn: async candidate => ({
        decision: 'update',
        candidate,
        mergedContent: null,
        reason: 'test update',
        similarMemories: [{ metadata: { filePath: existingPath } }],
      }),
    });

    assert.equal(result.written, 1);
    assert.equal(result.updated, 1);
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0], existingPath);

    const updated = fs.readFileSync(existingPath, 'utf8');
    assert.ok(updated.includes('Updated decision'));
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});
