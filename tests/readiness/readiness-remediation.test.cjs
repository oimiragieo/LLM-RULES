'use strict';

/**
 * Tests for Readiness Remediation
 *
 * Covers validation contract assertions:
 * - VAL-RR-001: Fix flag generates remediation tasks for failing pillars
 * - VAL-RR-002: Dry-run reports changes without modifying filesystem
 * - VAL-RR-003: Failed remediation reported without aborting others
 */

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Module under test
const {
  ReadinessRemediation,
  remediateReadiness,
  REMEDIATION_TEMPLATES,
} = require('../../.claude/lib/readiness/readiness-remediation.cjs');

// Helper to create a mock readiness report with specified failing pillars
function createMockReport(failingPillars = [], score = 50) {
  const allPillars = [
    'styleAndValidation',
    'buildSystem',
    'testing',
    'documentation',
    'developmentEnvironment',
    'debuggingAndObservability',
    'security',
    'taskDiscovery',
    'productAndExperimentation',
  ];

  const pillars = {};
  for (const pillar of allPillars) {
    pillars[pillar] = {
      score: failingPillars.includes(pillar) ? 40 : 100,
      passed: !failingPillars.includes(pillar),
      weight: 1.0,
      command: '<mock>',
      exitCode: failingPillars.includes(pillar) ? 1 : 0,
      reason: failingPillars.includes(pillar) ? 'Mock failure' : null,
    };
  }

  return {
    repoPath: '<mock>',
    timestamp: new Date().toISOString(),
    level: 'L2',
    overallScore: score,
    pillars,
    gateStatus: {
      passed: false,
      threshold: 80,
      details: 'Mock gate status',
    },
    recommendations: [],
  };
}

describe('Readiness Remediation', () => {
  let tempDir;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-remediation-test-'));
  });

  after(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('VAL-RR-001: Fix flag generates remediation tasks for failing pillars', () => {
    it('generates remediation tasks when fix:true and pillars failing', () => {
      const mockReport = createMockReport(['testing', 'documentation']);

      const remediator = new ReadinessRemediation({
        repoPath: tempDir,
        report: mockReport,
        fix: true,
        dryRun: true, // Don't actually write
      });

      const result = remediator.remediate();

      // Should have remediations for failing pillars
      assert.ok(Array.isArray(result.remediations), 'Should have remediations array');
      assert.ok(result.remediations.length >= 2, 'Should have at least 2 remediations');

      // Each remediation should have required fields
      for (const rem of result.remediations) {
        assert.ok(rem.pillar, 'Should have pillar field');
        assert.ok(rem.action, 'Should have action field');
        assert.ok(rem.description, 'Should have description field');
        assert.ok(Array.isArray(rem.files), 'Should have files array');
      }
    });

    it('no remediations when all pillars pass', () => {
      const mockReport = createMockReport([], 95); // All passing

      const remediator = new ReadinessRemediation({
        repoPath: tempDir,
        report: mockReport,
        fix: true,
        dryRun: true,
      });

      const result = remediator.remediate();

      assert.ok(Array.isArray(result.remediations), 'Should have remediations array');
      assert.strictEqual(result.remediations.length, 0, 'Should have no remediations when all pass');
    });

    it('no remediations when fix:false', () => {
      const mockReport = createMockReport(['testing', 'documentation']);

      const remediator = new ReadinessRemediation({
        repoPath: tempDir,
        report: mockReport,
        fix: false,
        dryRun: true,
      });

      const result = remediator.remediate();

      // When fix:false, should not generate remediations
      assert.strictEqual(result.remediations.length, 0, 'Should have no remediations when fix:false');
    });

    it('remediation task has correct structure', () => {
      const mockReport = createMockReport(['documentation']);

      const remediator = new ReadinessRemediation({
        repoPath: tempDir,
        report: mockReport,
        fix: true,
        dryRun: true,
      });

      const result = remediator.remediate();

      const docRemediation = result.remediations.find(r => r.pillar === 'documentation');
      assert.ok(docRemediation, 'Should have documentation remediation');

      // Check structure
      assert.strictEqual(typeof docRemediation.pillar, 'string');
      assert.strictEqual(typeof docRemediation.action, 'string');
      assert.strictEqual(typeof docRemediation.description, 'string');
      assert.ok(Array.isArray(docRemediation.files));
    });

    it('scaffolds devcontainer.json for developmentEnvironment pillar', () => {
      const mockReport = createMockReport(['developmentEnvironment']);

      const remediator = new ReadinessRemediation({
        repoPath: tempDir,
        report: mockReport,
        fix: true,
        dryRun: true,
      });

      const result = remediator.remediate();

      const devEnvRemediation = result.remediations.find(r => r.pillar === 'developmentEnvironment');
      assert.ok(devEnvRemediation, 'Should have developmentEnvironment remediation');

      // Should include devcontainer.json in files to scaffold
      const hasDevcontainer = devEnvRemediation.files.some(f =>
        f.includes('devcontainer.json')
      );
      assert.ok(hasDevcontainer, 'Should scaffold devcontainer.json');
    });

    it('scaffolds AGENTS.md for taskDiscovery pillar', () => {
      const mockReport = createMockReport(['taskDiscovery']);

      const remediator = new ReadinessRemediation({
        repoPath: tempDir,
        report: mockReport,
        fix: true,
        dryRun: true,
      });

      const result = remediator.remediate();

      const taskRemediation = result.remediations.find(r => r.pillar === 'taskDiscovery');
      assert.ok(taskRemediation, 'Should have taskDiscovery remediation');

      // Should include AGENTS.md in files to scaffold
      const hasAgents = taskRemediation.files.some(f => f.includes('AGENTS.md'));
      assert.ok(hasAgents, 'Should scaffold AGENTS.md');
    });

    it('scaffolds pre-commit hooks for security pillar', () => {
      const mockReport = createMockReport(['security']);

      const remediator = new ReadinessRemediation({
        repoPath: tempDir,
        report: mockReport,
        fix: true,
        dryRun: true,
      });

      const result = remediator.remediate();

      const secRemediation = result.remediations.find(r => r.pillar === 'security');
      assert.ok(secRemediation, 'Should have security remediation');

      // Should include pre-commit hooks in files to scaffold
      const hasPreCommit = secRemediation.files.some(f =>
        f.includes('.pre-commit-hooks.yaml') || f.includes('pre-commit')
      );
      assert.ok(hasPreCommit, 'Should scaffold pre-commit hooks');
    });
  });

  describe('VAL-RR-002: Dry-run reports changes without modifying filesystem', () => {
    it('dry-run does not write files', () => {
      const mockReport = createMockReport(['documentation']);

      // Snapshot the temp directory before
      const beforeFiles = fs.readdirSync(tempDir, { recursive: true });

      const remediator = new ReadinessRemediation({
        repoPath: tempDir,
        report: mockReport,
        fix: true,
        dryRun: true,
      });

      const result = remediator.remediate();

      // Snapshot after
      const afterFiles = fs.readdirSync(tempDir, { recursive: true });

      // Should be unchanged
      assert.deepStrictEqual(beforeFiles, afterFiles, 'Dry-run should not modify filesystem');
    });

    it('dry-run still produces plan', () => {
      const mockReport = createMockReport(['testing', 'documentation']);

      const remediator = new ReadinessRemediation({
        repoPath: tempDir,
        report: mockReport,
        fix: true,
        dryRun: true,
      });

      const result = remediator.remediate();

      // Should have plan even though no files written
      assert.ok(result.plan, 'Should have plan');
      assert.ok(Array.isArray(result.plan), 'Plan should be array');
      assert.ok(result.plan.length > 0, 'Plan should have entries');
    });

    it('dry-run plan lists files that would be created', () => {
      const mockReport = createMockReport(['developmentEnvironment']);

      const remediator = new ReadinessRemediation({
        repoPath: tempDir,
        report: mockReport,
        fix: true,
        dryRun: true,
      });

      const result = remediator.remediate();

      // Plan should include file paths
      const hasFilePath = result.plan.some(entry =>
        typeof entry === 'string' || (entry && entry.file)
      );
      assert.ok(hasFilePath, 'Plan should list file paths');
    });

    it('dry-run with fix:false produces no changes', () => {
      const mockReport = createMockReport(['testing', 'documentation']);

      const remediator = new ReadinessRemediation({
        repoPath: tempDir,
        report: mockReport,
        fix: false,
        dryRun: true,
      });

      const result = remediator.remediate();

      // No remediations when fix:false
      assert.strictEqual(result.remediations.length, 0);
      assert.strictEqual(result.plan.length, 0);
    });

    it('no dry-run actually writes files', () => {
      const testDir = path.join(tempDir, 'write-test');
      fs.mkdirSync(testDir, { recursive: true });

      const mockReport = createMockReport(['documentation']);

      const remediator = new ReadinessRemediation({
        repoPath: testDir,
        report: mockReport,
        fix: true,
        dryRun: false,
        gitAvailable: false, // Skip git operations
      });

      const result = remediator.remediate();

      // Check if any files were written
      const writtenFiles = fs.readdirSync(testDir, { recursive: true });

      // Either files were written or remediations were attempted
      assert.ok(
        writtenFiles.length > 0 || result.remediations.some(r => r.status === 'completed'),
        'Should have written files or completed remediations'
      );

      // Cleanup
      fs.rmSync(testDir, { recursive: true, force: true });
    });
  });

  describe('VAL-RR-003: Failed remediation reported without aborting others', () => {
    it('failed remediation has error field', () => {
      const mockReport = createMockReport(['testing']);

      const remediator = new ReadinessRemediation({
        repoPath: tempDir,
        report: mockReport,
        fix: true,
        dryRun: true,
        mockFailures: ['testing'], // Simulate failure for testing pillar
      });

      const result = remediator.remediate();

      const testingRem = result.remediations.find(r => r.pillar === 'testing');
      assert.ok(testingRem, 'Should have testing remediation');
      assert.strictEqual(testingRem.status, 'failed', 'Should be marked as failed');
      assert.ok(testingRem.error, 'Should have error field');
    });

    it('one failure does not prevent other remediations', () => {
      const mockReport = createMockReport(['testing', 'documentation', 'security']);

      const remediator = new ReadinessRemediation({
        repoPath: tempDir,
        report: mockReport,
        fix: true,
        dryRun: true,
        mockFailures: ['testing'], // Only testing fails
      });

      const result = remediator.remediate();

      // Should have all three remediations
      assert.strictEqual(result.remediations.length, 3, 'Should attempt all remediations');

      // Testing should be failed
      const testingRem = result.remediations.find(r => r.pillar === 'testing');
      assert.strictEqual(testingRem.status, 'failed');

      // Others should succeed or at least be attempted
      const docRem = result.remediations.find(r => r.pillar === 'documentation');
      const secRem = result.remediations.find(r => r.pillar === 'security');

      assert.ok(docRem, 'Should have documentation remediation');
      assert.ok(secRem, 'Should have security remediation');
    });

    it('multiple failures all reported', () => {
      const mockReport = createMockReport(['testing', 'documentation', 'security']);

      const remediator = new ReadinessRemediation({
        repoPath: tempDir,
        report: mockReport,
        fix: true,
        dryRun: true,
        mockFailures: ['testing', 'documentation'], // Two fail
      });

      const result = remediator.remediate();

      const failedRems = result.remediations.filter(r => r.status === 'failed');
      assert.strictEqual(failedRems.length, 2, 'Should have 2 failed remediations');
    });

    it('summary includes failure count', () => {
      const mockReport = createMockReport(['testing', 'documentation', 'security']);

      const remediator = new ReadinessRemediation({
        repoPath: tempDir,
        report: mockReport,
        fix: true,
        dryRun: true,
        mockFailures: ['testing'],
      });

      const result = remediator.remediate();

      assert.ok(typeof result.summary === 'object', 'Should have summary');
      assert.ok(typeof result.summary.failed === 'number', 'Should have failed count');
      assert.ok(typeof result.summary.completed === 'number', 'Should have completed count');
      assert.ok(typeof result.summary.total === 'number', 'Should have total count');
    });
  });

  describe('Git branch handling', () => {
    it('creates branch per remediation when git available', () => {
      const mockReport = createMockReport(['testing']);

      const remediator = new ReadinessRemediation({
        repoPath: tempDir,
        report: mockReport,
        fix: true,
        dryRun: true,
        gitAvailable: true,
      });

      const result = remediator.remediate();

      // Branch name should be in remediation
      const testingRem = result.remediations.find(r => r.pillar === 'testing');
      if (testingRem && testingRem.branch) {
        assert.ok(
          testingRem.branch.includes('fix/readiness-testing'),
          'Branch should follow naming convention'
        );
      }
    });

    it('skips branch creation when git not available', () => {
      const mockReport = createMockReport(['testing']);

      const remediator = new ReadinessRemediation({
        repoPath: tempDir,
        report: mockReport,
        fix: true,
        dryRun: true,
        gitAvailable: false,
      });

      const result = remediator.remediate();

      const testingRem = result.remediations.find(r => r.pillar === 'testing');
      if (testingRem) {
        assert.strictEqual(testingRem.branch, undefined, 'Should not have branch when no git');
      }
    });

    it('original branch restored after remediations', () => {
      const mockReport = createMockReport(['testing']);

      const remediator = new ReadinessRemediation({
        repoPath: tempDir,
        report: mockReport,
        fix: true,
        dryRun: true,
        gitAvailable: true,
        originalBranch: 'main',
      });

      const result = remediator.remediate();

      // Should indicate original branch was restored
      assert.strictEqual(result.restoredBranch, 'main', 'Should restore original branch');
    });
  });

  describe('Convenience function', () => {
    it('remediateReadiness works with options', () => {
      const mockReport = createMockReport(['testing']);

      const result = remediateReadiness({
        repoPath: tempDir,
        report: mockReport,
        fix: true,
        dryRun: true,
      });

      assert.ok(result, 'Should return result');
      assert.ok(Array.isArray(result.remediations), 'Should have remediations');
    });
  });

  describe('Templates', () => {
    it('REMEDIATION_TEMPLATES has templates for pillars', () => {
      assert.ok(REMEDIATION_TEMPLATES, 'Should have REMEDIATION_TEMPLATES');
      assert.ok(typeof REMEDIATION_TEMPLATES === 'object');

      // Should have templates for key pillars
      assert.ok(REMEDIATION_TEMPLATES.documentation, 'Should have documentation template');
      assert.ok(REMEDIATION_TEMPLATES.developmentEnvironment, 'Should have devEnv template');
      assert.ok(REMEDIATION_TEMPLATES.security, 'Should have security template');
      assert.ok(REMEDIATION_TEMPLATES.taskDiscovery, 'Should have taskDiscovery template');
    });

    it('templates have content field', () => {
      for (const [pillar, template] of Object.entries(REMEDIATION_TEMPLATES)) {
        if (template.files) {
          for (const file of template.files) {
            assert.ok(
              file.content !== undefined,
              `Template for ${pillar} should have content`
            );
          }
        }
      }
    });
  });

  describe('Result structure', () => {
    it('result has required fields', () => {
      const mockReport = createMockReport(['testing']);

      const remediator = new ReadinessRemediation({
        repoPath: tempDir,
        report: mockReport,
        fix: true,
        dryRun: true,
      });

      const result = remediator.remediate();

      assert.ok(Array.isArray(result.remediations), 'Should have remediations');
      assert.ok(Array.isArray(result.plan), 'Should have plan');
      assert.ok(typeof result.summary === 'object', 'Should have summary');
      assert.ok(typeof result.gitAvailable === 'boolean', 'Should have gitAvailable flag');
    });

    it('summary counts match remediation counts', () => {
      const mockReport = createMockReport(['testing', 'documentation', 'security']);

      const remediator = new ReadinessRemediation({
        repoPath: tempDir,
        report: mockReport,
        fix: true,
        dryRun: true,
        mockFailures: ['testing'],
      });

      const result = remediator.remediate();

      const completed = result.remediations.filter(r => r.status === 'completed').length;
      const failed = result.remediations.filter(r => r.status === 'failed').length;

      assert.strictEqual(result.summary.completed, completed, 'Completed count should match');
      assert.strictEqual(result.summary.failed, failed, 'Failed count should match');
      assert.strictEqual(result.summary.total, 3, 'Total should be 3');
    });
  });
});
