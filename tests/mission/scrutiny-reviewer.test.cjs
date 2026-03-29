'use strict';

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  ScrutinyReviewer,
  createReviewer,
  spawnReviewer,
  executeVerificationStep,
  filterDestructiveCommands,
  createVerdictSchema,
} = require('../../.claude/lib/mission/scrutiny-reviewer.cjs');

// Test fixtures directory
let tempDir;

// Helper to create a temp directory
function createTempDir() {
  const baseDir = os.tmpdir();
  const testId = `sr-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  tempDir = path.join(baseDir, testId);
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

// Helper to create a features.json fixture
function createFeaturesJson(featuresPath, features = []) {
  const data = { features };
  fs.writeFileSync(featuresPath, JSON.stringify(data, null, 2));
}

// Helper to clean up temp directory
function cleanupTempDir() {
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

describe('Scrutiny Reviewer', () => {
  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir();
  });

  describe('VAL-SR-001: Auto-spawns after worker handoff', () => {
    it('spawnReviewer() is callable and returns a promise', async () => {
      const featuresPath = path.join(tempDir, 'features.json');
      createFeaturesJson(featuresPath, [
        {
          id: 'test-feature',
          verificationSteps: ['echo hello'],
        },
      ]);

      // spawnReviewer should be a function
      assert.equal(typeof spawnReviewer, 'function');

      // Calling it should return a promise
      const resultPromise = spawnReviewer({
        featureId: 'test-feature',
        featuresPath,
        verificationSteps: ['echo hello'],
        missionDir: tempDir,
      });

      assert.ok(resultPromise instanceof Promise);

      // Await the result
      const result = await resultPromise;
      assert.ok(result);
      assert.ok(result.verdict);
    });

    it('reviewer receives featureId and verificationSteps from features.json', async () => {
      const featuresPath = path.join(tempDir, 'features.json');
      createFeaturesJson(featuresPath, [
        {
          id: 'feature-abc',
          verificationSteps: ['echo step1', 'echo step2'],
        },
      ]);

      const reviewer = new ScrutinyReviewer({
        featureId: 'feature-abc',
        featuresPath,
        verificationSteps: ['echo step1', 'echo step2'],
        missionDir: tempDir,
      });

      assert.equal(reviewer.featureId, 'feature-abc');
      assert.deepEqual(reviewer.verificationSteps, ['echo step1', 'echo step2']);
    });

    it('spawn config includes permissionMode:read-only', async () => {
      const featuresPath = path.join(tempDir, 'features.json');
      createFeaturesJson(featuresPath, [
        {
          id: 'test-feature',
          verificationSteps: ['echo test'],
        },
      ]);

      const reviewer = new ScrutinyReviewer({
        featureId: 'test-feature',
        featuresPath,
        verificationSteps: ['echo test'],
        missionDir: tempDir,
      });

      const spawnConfig = reviewer.getSpawnConfig();

      assert.equal(spawnConfig.permissionMode, 'read-only');
    });
  });

  describe('VAL-SR-002: Outputs structured JSON verdict', () => {
    it('verdict has required fields: verdict, featureId, timestamp, steps, failures, summary', async () => {
      const featuresPath = path.join(tempDir, 'features.json');
      createFeaturesJson(featuresPath, [
        {
          id: 'test-feature',
          verificationSteps: ['echo test'],
        },
      ]);

      const verdict = await spawnReviewer({
        featureId: 'test-feature',
        featuresPath,
        verificationSteps: ['echo test'],
        missionDir: tempDir,
      });

      // Verify required fields
      assert.ok(verdict.verdict, 'verdict field required');
      assert.ok(['approved', 'rejected'].includes(verdict.verdict), 'verdict must be approved or rejected');
      assert.equal(verdict.featureId, 'test-feature');
      assert.ok(verdict.timestamp, 'timestamp required');
      assert.ok(Array.isArray(verdict.steps), 'steps array required');
      assert.ok(Array.isArray(verdict.failures), 'failures array required');
      assert.ok(typeof verdict.summary === 'string', 'summary string required');
    });

    it('verdict approved when all steps pass', async () => {
      const featuresPath = path.join(tempDir, 'features.json');
      createFeaturesJson(featuresPath, [
        {
          id: 'test-feature',
          verificationSteps: ['echo step1', 'echo step2'],
        },
      ]);

      const verdict = await spawnReviewer({
        featureId: 'test-feature',
        featuresPath,
        verificationSteps: ['echo step1', 'echo step2'],
        missionDir: tempDir,
      });

      assert.equal(verdict.verdict, 'approved');
      assert.deepEqual(verdict.failures, []);
    });

    it('verdict rejected when any step fails', async () => {
      const featuresPath = path.join(tempDir, 'features.json');
      createFeaturesJson(featuresPath, [
        {
          id: 'test-feature',
          verificationSteps: ['echo step1', 'exit 1'],
        },
      ]);

      const verdict = await spawnReviewer({
        featureId: 'test-feature',
        featuresPath,
        verificationSteps: ['echo step1', 'exit 1'],
        missionDir: tempDir,
      });

      assert.equal(verdict.verdict, 'rejected');
      assert.ok(verdict.failures.length > 0);
    });

    it('steps array contains exit code and output per step', async () => {
      const featuresPath = path.join(tempDir, 'features.json');
      createFeaturesJson(featuresPath, [
        {
          id: 'test-feature',
          verificationSteps: ['echo hello', 'exit 1'],
        },
      ]);

      const verdict = await spawnReviewer({
        featureId: 'test-feature',
        featuresPath,
        verificationSteps: ['echo hello', 'exit 1'],
        missionDir: tempDir,
      });

      assert.ok(Array.isArray(verdict.steps));
      assert.equal(verdict.steps.length, 2);

      // First step should have exitCode 0 and output 'hello'
      assert.equal(verdict.steps[0].exitCode, 0);
      assert.ok(verdict.steps[0].output.includes('hello'));

      // Second step should have exitCode 1
      assert.equal(verdict.steps[1].exitCode, 1);
    });

    it('verdict schema validated by AJV', () => {
      const schema = createVerdictSchema();

      // Schema should be a valid JSON schema object
      assert.ok(schema);
      assert.ok(schema.type === 'object');
      assert.ok(schema.required);
      assert.ok(schema.required.includes('verdict'));
      assert.ok(schema.required.includes('featureId'));
      assert.ok(schema.required.includes('timestamp'));
      assert.ok(schema.required.includes('steps'));
      assert.ok(schema.required.includes('failures'));
      assert.ok(schema.required.includes('summary'));

      // verdict enum should be approved/rejected
      assert.ok(schema.properties.verdict);
      assert.deepEqual(schema.properties.verdict.enum, ['approved', 'rejected']);
    });
  });

  describe('VAL-SR-003: Reviewer crash produces rejected verdict', () => {
    it('crash produces synthetic rejected verdict with crash:true', async () => {
      const featuresPath = path.join(tempDir, 'features.json');
      createFeaturesJson(featuresPath, [
        {
          id: 'test-feature',
          verificationSteps: ['exit 0'],
        },
      ]);

      const reviewer = new ScrutinyReviewer({
        featureId: 'test-feature',
        featuresPath,
        verificationSteps: ['exit 0'],
        missionDir: tempDir,
      });

      // Simulate crash
      const syntheticVerdict = reviewer.createCrashVerdict(new Error('Test crash'));

      assert.equal(syntheticVerdict.verdict, 'rejected');
      assert.equal(syntheticVerdict.crash, true);
      assert.ok(syntheticVerdict.error);
      assert.ok(syntheticVerdict.error.includes('Test crash'));
    });

    it('timeout produces rejected verdict with timeout:true', async () => {
      const featuresPath = path.join(tempDir, 'features.json');
      createFeaturesJson(featuresPath, [
        {
          id: 'test-feature',
          verificationSteps: ['echo test'],
        },
      ]);

      const reviewer = new ScrutinyReviewer({
        featureId: 'test-feature',
        featuresPath,
        verificationSteps: ['echo test'],
        missionDir: tempDir,
        stepTimeoutMs: 100, // Very short timeout
        overallTimeoutMs: 200,
      });

      // Create timeout verdict
      const timeoutVerdict = reviewer.createTimeoutVerdict();

      assert.equal(timeoutVerdict.verdict, 'rejected');
      assert.equal(timeoutVerdict.timeout, true);
    });

    it('crash verdict includes error message', async () => {
      const reviewer = new ScrutinyReviewer({
        featureId: 'test-feature',
        missionDir: tempDir,
        verificationSteps: [],
      });

      const error = new Error('Unhandled exception in reviewer');
      error.code = 'REVIEWER_CRASH';

      const verdict = reviewer.createCrashVerdict(error);

      assert.ok(verdict.error.includes('Unhandled exception'));
      assert.ok(verdict.error.includes('REVIEWER_CRASH'));
    });
  });

  describe('VAL-SR-004: Read-only enforcement', () => {
    it('spawn config includes permissionMode:read-only', () => {
      const reviewer = new ScrutinyReviewer({
        featureId: 'test-feature',
        missionDir: tempDir,
        verificationSteps: [],
      });

      const config = reviewer.getSpawnConfig();

      assert.equal(config.permissionMode, 'read-only');
    });

    it('destructive commands are filtered and recorded as skippedDestructive', () => {
      const verificationSteps = [
        'echo hello',
        'rm -rf /dangerous',
        'pnpm test',
        'rm -rf node_modules',
        'node --test',
      ];

      const { safeSteps, skippedDestructive } = filterDestructiveCommands(verificationSteps);

      // Safe steps should not include rm commands
      assert.ok(!safeSteps.some((s) => s.includes('rm -rf')));
      assert.equal(safeSteps.length, 3);

      // Skipped destructive should include rm commands
      assert.equal(skippedDestructive.length, 2);
      assert.ok(skippedDestructive.some((s) => s.includes('rm -rf /dangerous')));
      assert.ok(skippedDestructive.some((s) => s.includes('rm -rf node_modules')));
    });

    it('write attempts would be blocked (mock verification)', async () => {
      const featuresPath = path.join(tempDir, 'features.json');
      createFeaturesJson(featuresPath, [
        {
          id: 'test-feature',
          verificationSteps: ['echo read-only-check'],
        },
      ]);

      const reviewer = new ScrutinyReviewer({
        featureId: 'test-feature',
        featuresPath,
        verificationSteps: ['echo read-only-check'],
        missionDir: tempDir,
      });

      // The reviewer should have read-only enforcement flag
      assert.equal(reviewer.permissionMode, 'read-only');
    });
  });

  describe('executeVerificationStep', () => {
    it('captures exit code 0 for successful command', async () => {
      const result = await executeVerificationStep('exit 0', {
        timeoutMs: 5000,
      });

      assert.equal(result.exitCode, 0);
      assert.ok(typeof result.output === 'string');
    });

    it('captures exit code 1 for failed command', async () => {
      const result = await executeVerificationStep('exit 1', {
        timeoutMs: 5000,
      });

      assert.equal(result.exitCode, 1);
    });

    it('captures stdout output', async () => {
      const result = await executeVerificationStep('echo hello world', {
        timeoutMs: 5000,
      });

      assert.equal(result.exitCode, 0);
      assert.ok(result.output.includes('hello world'));
    });

    it('handles timeout for hung command', async () => {
      // Use a command that will hang - ping localhost multiple times
      // On Windows, use a command that will definitely take longer than timeout
      const isWindows = process.platform === 'win32';
      const hangCommand = isWindows ? 'ping -n 10 127.0.0.1' : 'sleep 10';

      // Short timeout to trigger timeout handling
      const result = await executeVerificationStep(hangCommand, {
        timeoutMs: 100,
      });

      // Should have timeout error
      assert.equal(result.exitCode, 'TIMEOUT');
      assert.ok(result.error);
    });

    it('handles non-existent command', async () => {
      const result = await executeVerificationStep('nonexistent-command-xyz', {
        timeoutMs: 5000,
      });

      // Should have error
      assert.ok(result.error || result.exitCode !== 0);
    });
  });

  describe('ScrutinyReviewer class', () => {
    it('constructor accepts options with defaults', () => {
      const reviewer = new ScrutinyReviewer({
        featureId: 'test-feature',
        missionDir: tempDir,
        verificationSteps: ['echo test'],
      });

      assert.equal(reviewer.featureId, 'test-feature');
      assert.equal(reviewer.stepTimeoutMs, 30000); // Default 30s
      assert.equal(reviewer.overallTimeoutMs, 300000); // Default 5 min
    });

    it('constructor accepts configurable timeouts', () => {
      const reviewer = new ScrutinyReviewer({
        featureId: 'test-feature',
        missionDir: tempDir,
        verificationSteps: [],
        stepTimeoutMs: 10000,
        overallTimeoutMs: 60000,
      });

      assert.equal(reviewer.stepTimeoutMs, 10000);
      assert.equal(reviewer.overallTimeoutMs, 60000);
    });

    it('run() executes all verification steps sequentially', async () => {
      const featuresPath = path.join(tempDir, 'features.json');
      createFeaturesJson(featuresPath, [
        {
          id: 'test-feature',
          verificationSteps: ['echo step1', 'echo step2', 'echo step3'],
        },
      ]);

      const reviewer = new ScrutinyReviewer({
        featureId: 'test-feature',
        featuresPath,
        verificationSteps: ['echo step1', 'echo step2', 'echo step3'],
        missionDir: tempDir,
      });

      const verdict = await reviewer.run();

      assert.equal(verdict.steps.length, 3);
      // All should pass
      assert.equal(verdict.verdict, 'approved');
    });

    it('run() stops on first failure when failFast is true', async () => {
      const featuresPath = path.join(tempDir, 'features.json');
      createFeaturesJson(featuresPath, [
        {
          id: 'test-feature',
          verificationSteps: ['echo step1', 'exit 1', 'echo step3'],
        },
      ]);

      const reviewer = new ScrutinyReviewer({
        featureId: 'test-feature',
        featuresPath,
        verificationSteps: ['echo step1', 'exit 1', 'echo step3'],
        missionDir: tempDir,
        failFast: true,
      });

      const verdict = await reviewer.run();

      assert.equal(verdict.verdict, 'rejected');
      // Should have exactly 2 steps (stopped after failure)
      assert.equal(verdict.steps.length, 2);
    });

    it('run() continues after failure when failFast is false', async () => {
      const featuresPath = path.join(tempDir, 'features.json');
      createFeaturesJson(featuresPath, [
        {
          id: 'test-feature',
          verificationSteps: ['echo step1', 'exit 1', 'echo step3'],
        },
      ]);

      const reviewer = new ScrutinyReviewer({
        featureId: 'test-feature',
        featuresPath,
        verificationSteps: ['echo step1', 'exit 1', 'echo step3'],
        missionDir: tempDir,
        failFast: false,
      });

      const verdict = await reviewer.run();

      assert.equal(verdict.verdict, 'rejected');
      // Should have all 3 steps
      assert.equal(verdict.steps.length, 3);
    });
  });

  describe('createReviewer convenience function', () => {
    it('creates ScrutinyReviewer instance', () => {
      const featuresPath = path.join(tempDir, 'features.json');
      createFeaturesJson(featuresPath, [
        {
          id: 'test-feature',
          verificationSteps: [],
        },
      ]);

      const reviewer = createReviewer({
        featureId: 'test-feature',
        featuresPath,
        missionDir: tempDir,
      });

      assert.ok(reviewer instanceof ScrutinyReviewer);
    });
  });

  describe('Verdict persistence', () => {
    it('verdict is written to missionDir/verdicts/', async () => {
      const featuresPath = path.join(tempDir, 'features.json');
      createFeaturesJson(featuresPath, [
        {
          id: 'test-feature',
          verificationSteps: ['echo test'],
        },
      ]);

      const result = await spawnReviewer({
        featureId: 'test-feature',
        featuresPath,
        verificationSteps: ['echo test'],
        missionDir: tempDir,
      });

      // Verify verdict was produced
      assert.ok(result.verdict, 'verdict should be produced');
      assert.equal(result.featureId, 'test-feature');

      // Check verdict file exists
      const verdictsDir = path.join(tempDir, 'verdicts');
      assert.ok(fs.existsSync(verdictsDir), 'verdicts directory should be created');

      const verdictFiles = fs.readdirSync(verdictsDir).filter((f) => f.includes('test-feature'));
      assert.ok(verdictFiles.length > 0, 'verdict file should be written');
    });
  });

  describe('Integration: full workflow', () => {
    it('complete workflow: spawn, execute steps, produce verdict', async () => {
      const featuresPath = path.join(tempDir, 'features.json');
      createFeaturesJson(featuresPath, [
        {
          id: 'integration-test',
          verificationSteps: [
            'echo Running step 1',
            'echo Running step 2',
            'echo All done',
          ],
        },
      ]);

      const verdict = await spawnReviewer({
        featureId: 'integration-test',
        featuresPath,
        verificationSteps: [
          'echo Running step 1',
          'echo Running step 2',
          'echo All done',
        ],
        missionDir: tempDir,
      });

      // Verify verdict structure
      assert.equal(verdict.featureId, 'integration-test');
      assert.equal(verdict.verdict, 'approved');
      assert.equal(verdict.steps.length, 3);
      assert.deepEqual(verdict.failures, []);
      assert.ok(verdict.summary);

      // Verify all steps captured
      assert.ok(verdict.steps[0].output.includes('Running step 1'));
      assert.ok(verdict.steps[1].output.includes('Running step 2'));
    });

    it('workflow handles mixed pass/fail steps', async () => {
      const featuresPath = path.join(tempDir, 'features.json');
      createFeaturesJson(featuresPath, [
        {
          id: 'mixed-test',
          verificationSteps: [
            'echo step1',
            'exit 1',
            'echo step3',
          ],
        },
      ]);

      const verdict = await spawnReviewer({
        featureId: 'mixed-test',
        featuresPath,
        verificationSteps: ['echo step1', 'exit 1', 'echo step3'],
        missionDir: tempDir,
        failFast: false,
      });

      assert.equal(verdict.verdict, 'rejected');
      assert.equal(verdict.failures.length, 1);
      assert.ok(verdict.failures[0].step.includes('exit 1'));
    });
  });
});
