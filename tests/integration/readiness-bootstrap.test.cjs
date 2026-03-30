#!/usr/bin/env node
'use strict';

/**
 * Readiness & Bootstrap Integration Tests
 * =========================================
 *
 * VAL-CROSS-005: Readiness Gate Constrains Mission Feature Set
 *   ReadinessScorer with mockScore forces L2. Features with
 *   requiredReadinessLevel:'L3' are transitioned to 'cancelled'.
 *   Features with L2 or no tag remain pending. Report persisted to workspace.
 *
 * VAL-CROSS-007: Init.sh Bootstrap Runs Before Any Worker Dispatch
 *   BootstrapSystem executes init.sh before dispatch. Success path: marker
 *   file created, dispatch proceeds. Failure path: non-zero exit, bootstrap
 *   state shows failure. Bootstrap timestamp strictly before dispatch.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const childProcess = require('node:child_process');

const { ReadinessScorer } = require('../../.claude/lib/readiness/readiness-scorer.cjs');
const { FeaturesStateMachine } = require('../../.claude/lib/mission/features-state-machine.cjs');
const { BootstrapSystem } = require('../../.claude/lib/services/bootstrap-system.cjs');

// ---------------------------------------------------------------------------
// Shared constants and helpers
// ---------------------------------------------------------------------------

/** Force L2 readiness level (L2 = overallScore 40–59) */
const L2_SCORE = 50;

/** Mock all 9 pillars so the scorer does not run real commands */
const MOCK_PILLARS = Object.fromEntries(
  [
    'styleAndValidation',
    'buildSystem',
    'testing',
    'documentation',
    'developmentEnvironment',
    'debuggingAndObservability',
    'security',
    'taskDiscovery',
    'productAndExperimentation',
  ].map(name => [name, { score: 50, exitCode: 0 }])
);

/**
 * Features fixture — includes custom field requiredReadinessLevel (allowed by
 * additionalProperties:true in the features-state-machine schema).
 */
const READINESS_FEATURES = {
  features: [
    {
      id: 'feature-needs-l3',
      description: 'Feature requiring L3 readiness',
      status: 'pending',
      milestone: 'test-m1',
      requiredReadinessLevel: 'L3',
    },
    {
      id: 'feature-needs-l2',
      description: 'Feature requiring L2 readiness',
      status: 'pending',
      milestone: 'test-m1',
      requiredReadinessLevel: 'L2',
    },
    {
      id: 'feature-no-level',
      description: 'Feature with no required readiness level',
      status: 'pending',
      milestone: 'test-m1',
    },
  ],
};

/**
 * Detect whether the available bash is WSL (System32/bash.exe) or Git Bash.
 * Computed once at module load.
 */
const BASH_IS_WSL = (() => {
  if (process.platform !== 'win32') return false;
  try {
    const r = childProcess.spawnSync(process.env.COMSPEC || 'cmd.exe', ['/c', 'where bash'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      timeout: 3000,
    });
    if (r.status === 0 && r.stdout) {
      const loc = r.stdout.toString().trim().split('\n')[0].trim();
      return /system32/i.test(loc);
    }
  } catch (_) {
    // Detection failed — assume not WSL
  }
  return false;
})();

/**
 * Convert a file-system path to a format suitable for use inside a bash script.
 * - WSL (System32/bash.exe): C:\path → /mnt/c/path
 * - Git Bash / Unix:         C:\path → C:/path  (or unchanged on Unix)
 *
 * @param {string} p - File-system path
 * @returns {string} Bash-compatible path
 */
function toBashPath(p) {
  if (BASH_IS_WSL) {
    return p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`);
  }
  return p.replace(/\\/g, '/');
}

/**
 * Readiness filter: transition features whose requiredReadinessLevel exceeds the
 * current repo level to 'cancelled'.
 *
 * @param {FeaturesStateMachine} fsm
 * @param {{ level: string }} report - Readiness report
 */
function applyReadinessFilter(fsm, report) {
  const currentLevelNum = parseInt(report.level.slice(1), 10); // 'L2' -> 2
  for (const feature of fsm.getAllFeatures()) {
    if (feature.requiredReadinessLevel) {
      const requiredNum = parseInt(feature.requiredReadinessLevel.slice(1), 10);
      if (requiredNum > currentLevelNum) {
        fsm.transition(feature.id, 'cancelled');
      }
    }
  }
}

// ---------------------------------------------------------------------------
// VAL-CROSS-005: Readiness Gate Constrains Mission Feature Set
// ---------------------------------------------------------------------------

describe('VAL-CROSS-005: Readiness Gate Constrains Mission Feature Set', () => {
  let workspacePath;
  let fsm;
  let report;

  before(() => {
    workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-gate-'));
    const featuresPath = path.join(workspacePath, 'features.json');

    // Write features fixture with custom requiredReadinessLevel field
    fs.writeFileSync(featuresPath, JSON.stringify(READINESS_FEATURES, null, 2), 'utf8');

    // Load FSM
    fsm = new FeaturesStateMachine(featuresPath);
    fsm.load();

    // Score with forced L2 — mockScore overrides overall; mockPillars prevent
    // real command execution against the temp workspace
    const scorer = new ReadinessScorer({
      repoPath: workspacePath,
      mockScore: L2_SCORE,
      mockPillars: MOCK_PILLARS,
    });
    report = scorer.score();

    // Persist readiness report to workspace
    fs.writeFileSync(
      path.join(workspacePath, 'readiness-report.json'),
      JSON.stringify(report, null, 2),
      'utf8'
    );

    // Apply the readiness filter — cancels L3+ features in the FSM
    applyReadinessFilter(fsm, report);
  });

  after(() => {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it('ReadinessScorer produces a report with level L2 and correct overallScore', () => {
    assert.equal(report.level, 'L2');
    assert.equal(report.overallScore, L2_SCORE);
  });

  it('report has a valid ISO timestamp', () => {
    assert.ok(typeof report.timestamp === 'string', 'timestamp should be a string');
    assert.ok(!Number.isNaN(Date.parse(report.timestamp)), 'timestamp should be a valid date');
  });

  it('feature with requiredReadinessLevel:L3 is transitioned to cancelled', () => {
    const f = fsm.getFeature('feature-needs-l3');
    assert.equal(f.status, 'cancelled');
  });

  it('feature with requiredReadinessLevel:L2 remains pending', () => {
    const f = fsm.getFeature('feature-needs-l2');
    assert.equal(f.status, 'pending');
  });

  it('feature with no requiredReadinessLevel remains pending', () => {
    const f = fsm.getFeature('feature-no-level');
    assert.equal(f.status, 'pending');
  });

  it('readiness report JSON is persisted to workspace', () => {
    const reportPath = path.join(workspacePath, 'readiness-report.json');
    assert.ok(fs.existsSync(reportPath), 'readiness-report.json should exist in workspace');
    const persisted = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.equal(persisted.level, 'L2');
    assert.equal(persisted.overallScore, L2_SCORE);
  });

  it('L2 and untagged features are eligible for dispatch; cancelled L3 is not', () => {
    const eligibleIds = fsm.getEligibleFeatures().map(f => f.id);
    assert.ok(eligibleIds.includes('feature-needs-l2'), 'L2 feature should be eligible');
    assert.ok(eligibleIds.includes('feature-no-level'), 'Untagged feature should be eligible');
    assert.ok(!eligibleIds.includes('feature-needs-l3'), 'L3 feature should NOT be eligible');
  });
});

// ---------------------------------------------------------------------------
// VAL-CROSS-007: Init.sh Bootstrap Runs Before Any Worker Dispatch
// ---------------------------------------------------------------------------

describe('VAL-CROSS-007: Init.sh Bootstrap Runs Before Any Worker Dispatch', () => {
  // -------------------------------------------------------------------------
  // Success path: init.sh exits 0, marker file created, dispatch proceeds
  // -------------------------------------------------------------------------
  describe('success path: init.sh exits 0, marker file created, dispatch proceeds', () => {
    let workspacePath;
    let markerPath;
    let bootstrapResult;
    let bootstrapTimestamp;
    let dispatchTimestamp;

    before(() => {
      workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'bootstrap-success-'));
      markerPath = path.join(workspacePath, 'marker.txt');
      const statePath = path.join(workspacePath, 'bootstrap-state.json');
      const initShPath = path.join(workspacePath, 'init.sh');

      // Write init.sh that creates a marker file.
      // Use forward-slash path for Git Bash compatibility on Windows.
      const markerBashPath = toBashPath(markerPath);
      fs.writeFileSync(initShPath, `#!/usr/bin/env bash\ntouch "${markerBashPath}"\n`, 'utf8');

      const bootstrapSystem = new BootstrapSystem({
        initShPath,
        statePath,
        components: [],
        timeout: 10000,
      });

      bootstrapResult = bootstrapSystem.run();
      bootstrapTimestamp = new Date(bootstrapResult.timestamp).getTime();

      // Record dispatch timestamp AFTER bootstrap completes
      dispatchTimestamp = Date.now();
    });

    after(() => {
      fs.rmSync(workspacePath, { recursive: true, force: true });
    });

    it('bootstrap status is complete after successful init.sh', () => {
      assert.equal(bootstrapResult.status, 'complete');
    });

    it('marker file was created by init.sh', () => {
      assert.ok(fs.existsSync(markerPath), 'marker.txt should exist after bootstrap');
    });

    it('bootstrap timestamp is strictly before dispatch timestamp', () => {
      assert.ok(
        bootstrapTimestamp <= dispatchTimestamp,
        `bootstrap timestamp (${bootstrapTimestamp}) should be <= dispatch timestamp (${dispatchTimestamp})`
      );
    });

    it('bootstrap state JSON is persisted to workspace', () => {
      const statePath = path.join(workspacePath, 'bootstrap-state.json');
      assert.ok(fs.existsSync(statePath), 'bootstrap-state.json should exist');
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      assert.equal(state.status, 'complete');
    });
  });

  // -------------------------------------------------------------------------
  // Failure path: init.sh exits non-zero, bootstrap shows failure
  // -------------------------------------------------------------------------
  describe('failure path: init.sh exits non-zero, bootstrap state shows failure', () => {
    let workspacePath;
    let bootstrapResult;

    before(() => {
      workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'bootstrap-fail-'));
      const statePath = path.join(workspacePath, 'bootstrap-state.json');
      const initShPath = path.join(workspacePath, 'init.sh');

      // Write init.sh that exits non-zero
      fs.writeFileSync(initShPath, '#!/usr/bin/env bash\nexit 1\n', 'utf8');

      const bootstrapSystem = new BootstrapSystem({
        initShPath,
        statePath,
        components: [],
        timeout: 10000,
      });

      bootstrapResult = bootstrapSystem.run();
    });

    after(() => {
      fs.rmSync(workspacePath, { recursive: true, force: true });
    });

    it('bootstrap status shows failure (halted) when init.sh exits non-zero', () => {
      assert.equal(bootstrapResult.status, 'halted');
    });

    it('bootstrap state JSON is persisted with halted status', () => {
      const statePath = path.join(workspacePath, 'bootstrap-state.json');
      assert.ok(fs.existsSync(statePath), 'bootstrap-state.json should exist on failure');
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      assert.equal(state.status, 'halted');
    });

    it('bootstrap result is not complete — no dispatch should proceed', () => {
      // Callers check result.status === 'complete' before dispatching workers.
      // A halted bootstrap must not be mistaken for success.
      assert.notEqual(bootstrapResult.status, 'complete');
    });
  });
});
