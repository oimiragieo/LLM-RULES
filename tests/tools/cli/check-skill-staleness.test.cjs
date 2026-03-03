// Tests for check-skill-staleness.cjs
'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {
  checkStaleness,
  markAsStale,
  evaluateAllSkills,
  parseArgs,
  isArchivedSkillPath,
} = require('../../../.claude/tools/cli/check-skill-staleness.cjs');

const TEST_DIR = path.join(__dirname, '_test_skill_staleness');

function createTestSkillDir(name, manifestContent) {
  const skillDir = path.join(TEST_DIR, '.claude', 'skills', name);
  fs.mkdirSync(skillDir, { recursive: true });

  // Create SKILL.md
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Test Skill');

  // Create manifest.json if provided
  if (manifestContent) {
    fs.writeFileSync(
      path.join(skillDir, 'manifest.json'),
      JSON.stringify(manifestContent, null, 2)
    );
  }

  return skillDir;
}

function cleanupTestDir() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

describe('check-skill-staleness', () => {
  before(() => {
    cleanupTestDir();
  });

  after(() => {
    cleanupTestDir();
  });

  describe('isArchivedSkillPath', () => {
    it('identifies archived skills with _archive prefix', () => {
      assert.strictEqual(isArchivedSkillPath('_archive/old-skill'), true);
      assert.strictEqual(isArchivedSkillPath('archive/old-skill'), true);
      assert.strictEqual(isArchivedSkillPath('dead/old-skill'), true);
    });

    it('identifies nested archived skills', () => {
      assert.strictEqual(isArchivedSkillPath('path/_archive/skill'), true);
      assert.strictEqual(isArchivedSkillPath('path/skill/_archive/sub'), true);
    });

    it('identifies non-archived skills', () => {
      assert.strictEqual(isArchivedSkillPath('active-skill'), false);
      assert.strictEqual(isArchivedSkillPath('path/to/skill'), false);
    });
  });

  describe('checkStaleness', () => {
    it('returns no_manifest when manifest is missing', () => {
      const skillDir = createTestSkillDir('test-no-manifest');
      const result = checkStaleness(skillDir);

      assert.strictEqual(result.isStale, false);
      assert.strictEqual(result.reason, 'no_manifest');
      assert.strictEqual(result.lastResearchDate, null);
      assert.strictEqual(result.staleAfterDays, null);
    });

    it('returns missing_staleness_fields when fields are absent', () => {
      const skillDir = createTestSkillDir('test-missing-fields', {
        name: 'test',
        version: '1.0.0',
        skillType: 'cognitive',
      });
      const result = checkStaleness(skillDir);

      assert.strictEqual(result.isStale, false);
      assert.strictEqual(result.reason, 'missing_staleness_fields');
    });

    it('detects fresh skills within stale threshold', () => {
      const now = new Date();
      const pastDays = 30;
      const pastDate = new Date(now - pastDays * 24 * 60 * 60 * 1000);
      const dateStr = pastDate.toISOString().slice(0, 10);

      const skillDir = createTestSkillDir('test-fresh', {
        name: 'test',
        version: '1.0.0',
        skillType: 'cognitive',
        lastResearchDate: dateStr,
        staleAfterDays: 90,
      });

      const result = checkStaleness(skillDir);
      assert.strictEqual(result.isStale, false);
      assert.strictEqual(result.reason, 'fresh');
      assert.ok(result.ageInDays >= 29 && result.ageInDays <= 31);
      assert.strictEqual(result.staleAfterDays, 90);
    });

    it('detects stale skills beyond threshold', () => {
      const now = new Date();
      const pastDays = 200;
      const pastDate = new Date(now - pastDays * 24 * 60 * 60 * 1000);
      const dateStr = pastDate.toISOString().slice(0, 10);

      const skillDir = createTestSkillDir('test-stale', {
        name: 'test',
        version: '1.0.0',
        skillType: 'cognitive',
        lastResearchDate: dateStr,
        staleAfterDays: 90,
      });

      const result = checkStaleness(skillDir);
      assert.strictEqual(result.isStale, true);
      assert.strictEqual(result.reason, 'stale');
      assert.ok(result.ageInDays >= 199 && result.ageInDays <= 201);
      assert.strictEqual(result.staleAfterDays, 90);
    });

    it('returns invalid_date_format for malformed dates', () => {
      const skillDir = createTestSkillDir('test-bad-date', {
        name: 'test',
        version: '1.0.0',
        skillType: 'cognitive',
        lastResearchDate: '2024-13-45',
        staleAfterDays: 90,
      });

      const result = checkStaleness(skillDir);
      assert.strictEqual(result.isStale, false);
      assert.strictEqual(result.reason, 'invalid_date_format');
    });
  });

  describe('markAsStale', () => {
    it('marks a skill as stale in its manifest', () => {
      const skillDir = createTestSkillDir('test-mark', {
        name: 'test',
        version: '1.0.0',
        skillType: 'cognitive',
      });

      const result = markAsStale(skillDir);
      assert.strictEqual(result.success, true);

      const manifest = JSON.parse(fs.readFileSync(path.join(skillDir, 'manifest.json'), 'utf8'));
      assert.strictEqual(manifest.stale, true);
      assert.ok(manifest.markedStaleAt);
    });

    it('returns error when manifest is missing', () => {
      const skillDir = createTestSkillDir('test-no-mark');
      const result = markAsStale(skillDir);

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });
  });

  describe('parseArgs', () => {
    it('parses --mark-stale flag', () => {
      const args = parseArgs(['--mark-stale']);
      assert.strictEqual(args.markStale, true);
    });

    it('parses --json flag', () => {
      const args = parseArgs(['--json']);
      assert.strictEqual(args.jsonMode, true);
    });

    it('parses --output-json file path', () => {
      const args = parseArgs(['--output-json', '/path/to/file.json']);
      assert.strictEqual(args.outputJson, '/path/to/file.json');
    });

    it('parses --output-md file path', () => {
      const args = parseArgs(['--output-md', '/path/to/file.md']);
      assert.strictEqual(args.outputMd, '/path/to/file.md');
    });

    it('combines multiple arguments', () => {
      const args = parseArgs(['--mark-stale', '--json', '--output-json', 'out.json']);
      assert.strictEqual(args.markStale, true);
      assert.strictEqual(args.jsonMode, true);
      assert.strictEqual(args.outputJson, 'out.json');
    });
  });

  describe('evaluateAllSkills', () => {
    it('evaluates multiple skills', () => {
      // Create fresh skill
      const now = new Date();
      const pastDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
      const dateStr = pastDate.toISOString().slice(0, 10);

      createTestSkillDir('fresh-skill', {
        name: 'fresh',
        version: '1.0.0',
        skillType: 'cognitive',
        lastResearchDate: dateStr,
        staleAfterDays: 90,
      });

      // Create stale skill
      const stalePastDate = new Date(now - 200 * 24 * 60 * 60 * 1000);
      const staleDateStr = stalePastDate.toISOString().slice(0, 10);

      createTestSkillDir('stale-skill', {
        name: 'stale',
        version: '1.0.0',
        skillType: 'cognitive',
        lastResearchDate: staleDateStr,
        staleAfterDays: 90,
      });

      // Create skill without manifest
      createTestSkillDir('no-manifest-skill');

      const { results, summary } = evaluateAllSkills(TEST_DIR);

      assert.strictEqual(results.length, 3);
      assert.strictEqual(summary.totalSkills, 3);
      assert.strictEqual(summary.staleCount, 1);
      assert.strictEqual(summary.freshCount, 1);
      assert.strictEqual(summary.noManifestCount, 1);
    });

    it('marks stale skills when requested', () => {
      const now = new Date();
      const stalePastDate = new Date(now - 200 * 24 * 60 * 60 * 1000);
      const staleDateStr = stalePastDate.toISOString().slice(0, 10);

      createTestSkillDir('mark-test', {
        name: 'mark',
        version: '1.0.0',
        skillType: 'cognitive',
        lastResearchDate: staleDateStr,
        staleAfterDays: 90,
      });

      const { results } = evaluateAllSkills(TEST_DIR, true);
      const staleResult = results.find(r => r.isStale);

      assert.ok(staleResult);
      assert.strictEqual(staleResult.marked, true);

      // Verify manifest was updated
      const skillDir = path.join(TEST_DIR, '.claude', 'skills', 'mark-test');
      const manifest = JSON.parse(fs.readFileSync(path.join(skillDir, 'manifest.json'), 'utf8'));
      assert.strictEqual(manifest.stale, true);
    });
  });
});
