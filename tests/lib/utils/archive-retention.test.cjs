/**
 * Tests for archive-retention.cjs
 * Archive cleanup with retention policy
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Module under test (will fail until implemented)
const { auditArchives } = require('../../../.claude/lib/utils/archive-retention.cjs');

describe('auditArchives', () => {
  let testDir;
  let archiveDir;

  beforeEach(() => {
    // Create temporary test directory with archive subdirectory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-test-'));
    archiveDir = path.join(testDir, '_archive');
    fs.mkdirSync(archiveDir);
  });

  afterEach(() => {
    // Cleanup test directory
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  /**
   * Helper to create file with specific age (days ago)
   */
  function createOldFile(name, daysAgo) {
    const filePath = path.join(archiveDir, name);
    fs.writeFileSync(filePath, `Test content: ${name}`, 'utf8');

    // Set modification time to N days ago
    const ageMs = daysAgo * 24 * 60 * 60 * 1000;
    const oldTime = new Date(Date.now() - ageMs);
    fs.utimesSync(filePath, oldTime, oldTime);

    return filePath;
  }

  it('identifies files older than retention period', () => {
    // Create files: 3 old (>90 days), 2 new (<90 days)
    createOldFile('old1.cjs', 100);
    createOldFile('old2.cjs', 95);
    createOldFile('old3.cjs', 91);
    createOldFile('new1.cjs', 50);
    createOldFile('new2.cjs', 10);

    const result = auditArchives({
      archiveDirs: [archiveDir],
      retentionDays: 90,
      minKeep: 0,
      dryRun: true,
    });

    assert.strictEqual(result.total, 5, 'Should find 5 total files');
    assert.strictEqual(result.stale, 3, 'Should identify 3 stale files');
    assert.strictEqual(result.kept, 2, 'Should keep 2 new files');
    assert.ok(result.summary.includes('3 stale'), 'Summary should mention 3 stale');
  });

  it('respects minimum keep count', () => {
    // Create 10 old files (all >90 days)
    for (let i = 1; i <= 10; i++) {
      createOldFile(`old${i}.cjs`, 100 + i);
    }

    const result = auditArchives({
      archiveDirs: [archiveDir],
      retentionDays: 90,
      minKeep: 5, // Keep at least 5 newest
      dryRun: true,
    });

    assert.strictEqual(result.total, 10, 'Should find 10 total files');
    assert.strictEqual(result.stale, 5, 'Should mark 5 as stale (oldest)');
    assert.strictEqual(result.kept, 5, 'Should keep 5 newest');
  });

  it('dry-run mode does not delete files', () => {
    createOldFile('old1.cjs', 100);
    createOldFile('old2.cjs', 95);

    const result = auditArchives({
      archiveDirs: [archiveDir],
      retentionDays: 90,
      minKeep: 0,
      dryRun: true,
    });

    // Files should still exist
    assert.strictEqual(result.stale, 2, 'Should identify 2 stale');
    assert.strictEqual(
      fs.existsSync(path.join(archiveDir, 'old1.cjs')),
      true,
      'old1.cjs should still exist'
    );
    assert.strictEqual(
      fs.existsSync(path.join(archiveDir, 'old2.cjs')),
      true,
      'old2.cjs should still exist'
    );
    assert.ok(result.summary.includes('DRY RUN'), 'Summary should indicate dry run');
  });

  it('reports cleanup summary', () => {
    createOldFile('old1.cjs', 100);
    createOldFile('old2.cjs', 95);
    createOldFile('new1.cjs', 50);

    const result = auditArchives({
      archiveDirs: [archiveDir],
      retentionDays: 90,
      minKeep: 0,
      dryRun: true,
    });

    assert.ok(result.summary, 'Should return summary string');
    assert.ok(typeof result.summary === 'string', 'Summary should be string');
    assert.ok(result.summary.includes('2 stale'), 'Should mention stale count');
    assert.ok(result.summary.includes('1 kept'), 'Should mention kept count');
  });

  it('handles empty archive directory', () => {
    const result = auditArchives({
      archiveDirs: [archiveDir],
      retentionDays: 90,
      minKeep: 0,
      dryRun: true,
    });

    assert.strictEqual(result.total, 0, 'Should find 0 files');
    assert.strictEqual(result.stale, 0, 'Should have 0 stale');
    assert.strictEqual(result.kept, 0, 'Should have 0 kept');
  });

  it('handles multiple archive directories', () => {
    const archiveDir2 = path.join(testDir, '_archive2');
    fs.mkdirSync(archiveDir2);

    createOldFile('old1.cjs', 100);
    fs.writeFileSync(path.join(archiveDir2, 'old2.cjs'), 'content', 'utf8');
    const oldTime = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    fs.utimesSync(path.join(archiveDir2, 'old2.cjs'), oldTime, oldTime);

    const result = auditArchives({
      archiveDirs: [archiveDir, archiveDir2],
      retentionDays: 90,
      minKeep: 0,
      dryRun: true,
    });

    assert.strictEqual(result.total, 2, 'Should find files from both directories');
    assert.strictEqual(result.stale, 2, 'Both should be stale');
  });

  it('actual deletion works when dryRun is false', () => {
    createOldFile('old1.cjs', 100);
    createOldFile('old2.cjs', 95);
    createOldFile('new1.cjs', 50);

    const result = auditArchives({
      archiveDirs: [archiveDir],
      retentionDays: 90,
      minKeep: 0,
      dryRun: false, // Actually delete
    });

    assert.strictEqual(result.stale, 2, 'Should identify 2 stale');
    assert.strictEqual(result.kept, 1, 'Should keep 1 new');

    // Old files should be deleted
    assert.strictEqual(
      fs.existsSync(path.join(archiveDir, 'old1.cjs')),
      false,
      'old1.cjs should be deleted'
    );
    assert.strictEqual(
      fs.existsSync(path.join(archiveDir, 'old2.cjs')),
      false,
      'old2.cjs should be deleted'
    );

    // New file should still exist
    assert.strictEqual(
      fs.existsSync(path.join(archiveDir, 'new1.cjs')),
      true,
      'new1.cjs should still exist'
    );
  });

  it('minKeep protects newest files even when old', () => {
    // All files >90 days, but minKeep=2 should protect 2 newest
    createOldFile('oldest.cjs', 120);
    createOldFile('older.cjs', 110);
    createOldFile('old.cjs', 100);
    createOldFile('newer.cjs', 95);
    createOldFile('newest.cjs', 91);

    const result = auditArchives({
      archiveDirs: [archiveDir],
      retentionDays: 90,
      minKeep: 2, // Keep 2 newest
      dryRun: false,
    });

    assert.strictEqual(result.stale, 3, 'Should delete 3 oldest');
    assert.strictEqual(result.kept, 2, 'Should keep 2 newest');

    // Oldest 3 should be deleted
    assert.strictEqual(fs.existsSync(path.join(archiveDir, 'oldest.cjs')), false);
    assert.strictEqual(fs.existsSync(path.join(archiveDir, 'older.cjs')), false);
    assert.strictEqual(fs.existsSync(path.join(archiveDir, 'old.cjs')), false);

    // Newest 2 should be kept
    assert.strictEqual(fs.existsSync(path.join(archiveDir, 'newer.cjs')), true);
    assert.strictEqual(fs.existsSync(path.join(archiveDir, 'newest.cjs')), true);
  });
});
