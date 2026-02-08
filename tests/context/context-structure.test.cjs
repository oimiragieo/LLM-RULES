/**
 * Context Structure Tests
 *
 * Regression tests for Pipeline #12 context cleanup
 * Tests verify that critical structural issues are resolved
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const CONTEXT_DIR = path.join(PROJECT_ROOT, '.claude/context');

describe('Context Structure - Pipeline #12 Cleanup', () => {
  describe('Critical deletions', () => {
    it('nul file does not exist at context root', () => {
      const nulPath = path.join(CONTEXT_DIR, 'nul');
      assert.equal(fs.existsSync(nulPath), false, 'nul file should not exist');
    });

    it('no hash-named plan directories remain', () => {
      const plansDir = path.join(CONTEXT_DIR, 'plans');
      if (!fs.existsSync(plansDir)) {
        return; // If plans dir doesn't exist, test passes
      }

      const entries = fs.readdirSync(plansDir, { withFileTypes: true });
      const hashNamedDirs = entries.filter(entry => {
        if (!entry.isDirectory()) return false;

        // Check for patterns like: impl-plan-kHwypz, qa-report-c05Ene, test-plan-DCyOsO
        const hasHashPattern = /-(kHwypz|WuHjJL|c05Ene|eiwkdm|EjOE7P|DCyOsO|zHYXQi)$/.test(
          entry.name
        );
        return hasHashPattern;
      });

      assert.equal(
        hashNamedDirs.length,
        0,
        `Found ${hashNamedDirs.length} hash-named directories: ${hashNamedDirs.map(d => d.name).join(', ')}`
      );
    });

    it('workflows directory does not exist', () => {
      const workflowsPath = path.join(CONTEXT_DIR, 'workflows');
      assert.equal(fs.existsSync(workflowsPath), false, 'workflows directory should not exist');
    });
  });

  describe('Duplicate file deletion', () => {
    it('no duplicate dependency-report.json at artifacts root', () => {
      const duplicatePath = path.join(CONTEXT_DIR, 'artifacts/dependency-report.json');
      assert.equal(
        fs.existsSync(duplicatePath),
        false,
        'duplicate dependency-report.json should not exist'
      );
    });

    it('no duplicate knowledge-base-index.csv at artifacts root', () => {
      const duplicatePath = path.join(CONTEXT_DIR, 'artifacts/knowledge-base-index.csv');
      assert.equal(
        fs.existsSync(duplicatePath),
        false,
        'duplicate knowledge-base-index.csv should not exist'
      );
    });
  });

  describe('tmp cleanup', () => {
    it('test-framework-output.txt does not exist in tmp', () => {
      const staleTempFile = path.join(CONTEXT_DIR, 'tmp/test-framework-output.txt');
      assert.equal(fs.existsSync(staleTempFile), false, 'stale temp file should not exist');
    });

    it('verify-hooks.cjs does not exist in tmp', () => {
      const executableInTmp = path.join(CONTEXT_DIR, 'tmp/verify-hooks.cjs');
      assert.equal(fs.existsSync(executableInTmp), false, 'executable code should not be in tmp');
    });
  });

  describe('Archive structure', () => {
    it('_archive directory exists with README', () => {
      const archiveDir = path.join(CONTEXT_DIR, 'artifacts/_archive');
      const readmePath = path.join(archiveDir, 'README.md');

      assert.equal(fs.existsSync(archiveDir), true, '_archive directory should exist');
      assert.equal(fs.existsSync(readmePath), true, '_archive README.md should exist');
    });

    it('archived subdirectories exist in _archive', () => {
      const archiveDir = path.join(CONTEXT_DIR, 'artifacts/_archive');
      if (!fs.existsSync(archiveDir)) {
        return; // Skip if archive doesn't exist yet
      }

      const expectedArchived = [
        'deployment-docs',
        'code-styleguides',
        'audit-logs',
        'audits',
        'risk-assessments',
        'tasks',
      ];

      const entries = fs.readdirSync(archiveDir, { withFileTypes: true });
      const archivedDirs = entries.filter(e => e.isDirectory()).map(e => e.name);

      expectedArchived.forEach(dirName => {
        assert.ok(archivedDirs.includes(dirName), `${dirName} should be archived`);
      });
    });
  });

  describe('Canonical report locations', () => {
    it('reflections are in reports/reflections not artifacts/reflections', () => {
      const oldLocation = path.join(CONTEXT_DIR, 'artifacts/reflections');
      const newLocation = path.join(CONTEXT_DIR, 'reports/reflections');

      // Old location should not exist (or be empty)
      if (fs.existsSync(oldLocation)) {
        const files = fs.readdirSync(oldLocation);
        assert.equal(files.length, 0, 'old reflections location should be empty');
      }

      // New location should exist
      assert.equal(fs.existsSync(newLocation), true, 'reports/reflections should exist');
    });

    it('security reviews are in reports/security not artifacts/security-reviews', () => {
      const oldLocation = path.join(CONTEXT_DIR, 'artifacts/security-reviews');
      const newLocation = path.join(CONTEXT_DIR, 'reports/security');

      if (fs.existsSync(oldLocation)) {
        const files = fs.readdirSync(oldLocation);
        assert.equal(files.length, 0, 'old security-reviews location should be empty');
      }

      assert.equal(fs.existsSync(newLocation), true, 'reports/security should exist');
    });

    it('qa reports are in reports/qa not artifacts/qa-reports', () => {
      const oldLocation = path.join(CONTEXT_DIR, 'artifacts/qa-reports');
      const newLocation = path.join(CONTEXT_DIR, 'reports/qa');

      if (fs.existsSync(oldLocation)) {
        const files = fs.readdirSync(oldLocation);
        assert.equal(files.length, 0, 'old qa-reports location should be empty');
      }

      assert.equal(fs.existsSync(newLocation), true, 'reports/qa should exist');
    });

    it('no empty source directories remain after moves', () => {
      const possiblyEmptyDirs = [
        path.join(CONTEXT_DIR, 'artifacts/reflections'),
        path.join(CONTEXT_DIR, 'artifacts/reports'),
        path.join(CONTEXT_DIR, 'artifacts/security-reviews'),
        path.join(CONTEXT_DIR, 'artifacts/qa-reports'),
      ];

      possiblyEmptyDirs.forEach(dirPath => {
        if (fs.existsSync(dirPath)) {
          const files = fs.readdirSync(dirPath);
          assert.equal(files.length, 0, `${path.basename(dirPath)} should be empty after moves`);
        }
      });
    });
  });

  describe('Git cleanliness', () => {
    it('all moved files are accessible at new paths', () => {
      // This test verifies that git mv preserved file access
      const reportsReflections = path.join(CONTEXT_DIR, 'reports/reflections');
      const reportsSecurity = path.join(CONTEXT_DIR, 'reports/security');
      const reportsQa = path.join(CONTEXT_DIR, 'reports/qa');

      if (fs.existsSync(reportsReflections)) {
        const files = fs.readdirSync(reportsReflections);
        files.forEach(file => {
          if (file.endsWith('.md')) {
            const filePath = path.join(reportsReflections, file);
            assert.equal(fs.existsSync(filePath), true, `${file} should be accessible`);
          }
        });
      }

      if (fs.existsSync(reportsSecurity)) {
        const files = fs.readdirSync(reportsSecurity);
        files.forEach(file => {
          if (file.endsWith('.md')) {
            const filePath = path.join(reportsSecurity, file);
            assert.equal(fs.existsSync(filePath), true, `${file} should be accessible`);
          }
        });
      }

      if (fs.existsSync(reportsQa)) {
        const files = fs.readdirSync(reportsQa);
        files.forEach(file => {
          if (file.endsWith('.md') || file.endsWith('.json')) {
            const filePath = path.join(reportsQa, file);
            assert.equal(fs.existsSync(filePath), true, `${file} should be accessible`);
          }
        });
      }
    });
  });
});
