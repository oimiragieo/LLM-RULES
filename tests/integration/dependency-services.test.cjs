#!/usr/bin/env node
'use strict';

/**
 * Dependency & Services Integration Tests
 * =========================================
 *
 * VAL-CROSS-002: Feature Dependency Chain — Sequential Unblock
 *   Feature-A (no preconditions) and Feature-B (preconditions:['Feature-A']).
 *   Only Feature-A eligible initially. After Feature-A completes via the full
 *   transition chain, Feature-B becomes eligible and also completes.
 *   Feature-B startedAt >= Feature-A completedAt.
 *
 * VAL-CROSS-006: Services.yaml Canonical Command Resolution in Worker Context
 *   Load ServicesRegistry with fixture services.yaml containing 'test: pnpm test'.
 *   resolveCommand('test') returns 'pnpm test'. Worker prompt built via
 *   persona-injector contains the resolved command string.
 *
 * VAL-CROSS-008: State Recovery After Interruption
 *   Pre-crafted features.json with Feature-A completed and Feature-B in_progress.
 *   Detect Feature-B as orphaned, transition in_progress->failed->pending.
 *   Feature-A unchanged; Feature-B eligible for re-dispatch after recovery.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { FeaturesStateMachine } = require('../../.claude/lib/mission/features-state-machine.cjs');
const { ServicesRegistry } = require('../../.claude/lib/services/services-registry.cjs');
const { composePersona } = require('../../.claude/lib/mission/persona-injector.cjs');

// ---------------------------------------------------------------------------
// VAL-CROSS-002: Feature Dependency Chain — Sequential Unblock
// ---------------------------------------------------------------------------

describe('VAL-CROSS-002: Feature Dependency Chain — Sequential Unblock', () => {
  let workspacePath;
  let featuresPath;
  let fsm;

  /** Eligible feature IDs captured before any transitions */
  let initialEligibleIds;
  /** Eligible feature IDs captured after Feature-A completes */
  let eligibleAfterFeatureAIds;
  /** Snapshot of Feature-A after its full transition chain */
  let featureASnapshot;
  /** Snapshot of Feature-B after its full transition chain */
  let featureBSnapshot;

  before(() => {
    workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'dep-chain-'));
    featuresPath = path.join(workspacePath, 'features.json');

    const featuresData = {
      features: [
        {
          id: 'Feature-A',
          description: 'First feature with no dependencies',
          status: 'pending',
          milestone: 'test-milestone',
          preconditions: [],
        },
        {
          id: 'Feature-B',
          description: 'Second feature that depends on Feature-A',
          status: 'pending',
          milestone: 'test-milestone',
          preconditions: ['Feature-A'],
        },
      ],
    };

    fs.writeFileSync(featuresPath, JSON.stringify(featuresData, null, 2), 'utf8');

    // Load FSM from the pre-crafted features.json
    fsm = new FeaturesStateMachine(featuresPath);
    fsm.load();

    // Capture initial eligible features (before any transitions)
    initialEligibleIds = fsm.getEligibleFeatures().map(f => f.id);

    // Transition Feature-A through the full valid chain
    fsm.transition('Feature-A', 'in_progress');
    fsm.transition('Feature-A', 'validating');
    fsm.transition('Feature-A', 'completed');

    // Snapshot Feature-A state after completion
    featureASnapshot = { ...fsm.getFeature('Feature-A') };

    // Capture eligible features after Feature-A completes
    eligibleAfterFeatureAIds = fsm.getEligibleFeatures().map(f => f.id);

    // Transition Feature-B through the full valid chain
    fsm.transition('Feature-B', 'in_progress');
    fsm.transition('Feature-B', 'validating');
    fsm.transition('Feature-B', 'completed');

    // Snapshot Feature-B state after completion
    featureBSnapshot = { ...fsm.getFeature('Feature-B') };
  });

  after(() => {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it('initially only Feature-A is eligible (Feature-B has unmet preconditions)', () => {
    assert.ok(
      initialEligibleIds.includes('Feature-A'),
      'Feature-A should be eligible initially (no preconditions)'
    );
    assert.ok(
      !initialEligibleIds.includes('Feature-B'),
      'Feature-B should NOT be eligible initially (precondition Feature-A not completed)'
    );
    assert.equal(initialEligibleIds.length, 1, 'Exactly 1 feature should be eligible initially');
  });

  it('Feature-B is blocked while Feature-A is non-completed (PRECONDITION_NOT_MET)', () => {
    // Create a fresh FSM to test the blocking behavior explicitly
    const blockTestPath = path.join(workspacePath, 'block-test.json');
    const blockData = {
      features: [
        {
          id: 'Block-A',
          description: 'Dependency',
          status: 'pending',
          milestone: 'm',
          preconditions: [],
        },
        {
          id: 'Block-B',
          description: 'Dependent feature',
          status: 'pending',
          milestone: 'm',
          preconditions: ['Block-A'],
        },
      ],
    };
    fs.writeFileSync(blockTestPath, JSON.stringify(blockData, null, 2), 'utf8');
    const blockFsm = new FeaturesStateMachine(blockTestPath);
    blockFsm.load();

    // Attempting to start Block-B before Block-A completes must throw
    assert.throws(
      () => blockFsm.transition('Block-B', 'in_progress'),
      err => err.code === 'PRECONDITION_NOT_MET',
      'Transitioning dependent feature before dependency completes must throw PRECONDITION_NOT_MET'
    );
  });

  it('Feature-A transitions through pending->in_progress->validating->completed', () => {
    assert.equal(featureASnapshot.status, 'completed', 'Feature-A should be completed');
    assert.ok(featureASnapshot.startedAt, 'Feature-A should have a startedAt timestamp');
    assert.ok(featureASnapshot.completedAt, 'Feature-A should have a completedAt timestamp');
  });

  it('Feature-B becomes eligible only after Feature-A completes', () => {
    assert.ok(
      eligibleAfterFeatureAIds.includes('Feature-B'),
      'Feature-B should be eligible after Feature-A completes'
    );
    assert.ok(
      !eligibleAfterFeatureAIds.includes('Feature-A'),
      'Feature-A should NOT be eligible (completed is terminal)'
    );
    assert.equal(
      eligibleAfterFeatureAIds.length,
      1,
      'Exactly 1 feature should be eligible after Feature-A completes'
    );
  });

  it('Feature-B transitions through pending->in_progress->validating->completed', () => {
    assert.equal(featureBSnapshot.status, 'completed', 'Feature-B should be completed');
    assert.ok(featureBSnapshot.startedAt, 'Feature-B should have a startedAt timestamp');
    assert.ok(featureBSnapshot.completedAt, 'Feature-B should have a completedAt timestamp');
  });

  it('Feature-B startedAt is >= Feature-A completedAt (sequential ordering)', () => {
    const aCompletedAt = new Date(featureASnapshot.completedAt).getTime();
    const bStartedAt = new Date(featureBSnapshot.startedAt).getTime();

    assert.ok(
      bStartedAt >= aCompletedAt,
      `Feature-B startedAt (${featureBSnapshot.startedAt}) must be >= Feature-A completedAt ` +
        `(${featureASnapshot.completedAt}) — Feature-B cannot start before Feature-A finishes`
    );
  });

  it('both features are in completed status after the full chain', () => {
    assert.equal(fsm.getFeature('Feature-A').status, 'completed', 'Feature-A should be completed');
    assert.equal(fsm.getFeature('Feature-B').status, 'completed', 'Feature-B should be completed');
  });
});

// ---------------------------------------------------------------------------
// VAL-CROSS-006: Services.yaml Canonical Command Resolution in Worker Context
// ---------------------------------------------------------------------------

describe('VAL-CROSS-006: Services.yaml Canonical Command Resolution in Worker Context', () => {
  let workspacePath;
  let servicesYamlPath;
  let registry;
  let loadResult;

  before(() => {
    workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'services-ctx-'));
    servicesYamlPath = path.join(workspacePath, 'services.yaml');

    // Write fixture services.yaml with canonical 'test' command
    const fixtureYaml = 'commands:\n  test: pnpm test\n';
    fs.writeFileSync(servicesYamlPath, fixtureYaml, 'utf8');

    // Write minimal mission.md for persona-injector
    const missionMd =
      '# Integration Test Mission\n\n## Goals\n- Test services registry integration\n';
    fs.writeFileSync(path.join(workspacePath, 'mission.md'), missionMd, 'utf8');

    registry = new ServicesRegistry(servicesYamlPath);
    loadResult = registry.load();
  });

  after(() => {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it('ServicesRegistry.load() loads fixture services.yaml exactly once and marks it valid', () => {
    assert.equal(loadResult.exists, true, 'services.yaml should exist');
    assert.equal(
      loadResult.valid,
      true,
      `services.yaml should be valid — errors: ${JSON.stringify(loadResult.errors)}`
    );
    assert.ok(
      registry.hasCommand('test'),
      'Registry should recognise the "test" canonical command'
    );
  });

  it('resolveCommand("test") returns "pnpm test"', () => {
    const resolved = registry.resolveCommand('test');
    assert.equal(resolved, 'pnpm test', 'resolveCommand("test") should return "pnpm test"');
  });

  it('resolving an unknown command returns undefined', () => {
    const resolved = registry.resolveCommand('nonexistent-command-xyz');
    assert.equal(
      resolved,
      undefined,
      'Resolving an unknown command should return undefined (appropriate error sentinel)'
    );
  });

  it('worker prompt built via persona-injector contains the resolved command string', () => {
    // Resolve the command via ServicesRegistry
    const resolvedTestCommand = registry.resolveCommand('test');
    assert.equal(resolvedTestCommand, 'pnpm test');

    // Build a feature object with the resolved command injected into verificationSteps.
    // This simulates the engine injecting resolved commands into the worker context.
    const feature = {
      id: 'test-worker-feature',
      description: 'Worker feature with resolved command in context',
      status: 'pending',
      milestone: 'test',
      expectedBehavior: ['ServicesRegistry resolves canonical commands to actual strings'],
      verificationSteps: [`Run: ${resolvedTestCommand}`],
    };

    const missionPath = path.join(workspacePath, 'mission.md');

    const persona = composePersona({
      skillName: 'test-skill',
      skillSearchPaths: [],
      missionPath,
      feature,
    });

    // The resolved command string 'pnpm test' must appear in the prompt
    assert.ok(
      persona.prompt.includes('pnpm test'),
      `Worker prompt should contain resolved command 'pnpm test'.\n` +
        `Prompt excerpt: ${persona.prompt.slice(0, 600)}`
    );
  });

  it('worker prompt does not execute the literal canonical name "test" as the command', () => {
    // Confirm that the worker receives the resolved string, not just the bare canonical key.
    // The 'pnpm test' string contains 'test' as a suffix — we verify the full resolved
    // command is present rather than just a bare 'test' label.
    const resolvedTestCommand = registry.resolveCommand('test');
    assert.equal(
      resolvedTestCommand,
      'pnpm test',
      'Must be the resolved string, not canonical key'
    );

    const feature = {
      id: 'test-worker-feature-2',
      description: 'Worker feature for command resolution check',
      status: 'pending',
      verificationSteps: [`Run: ${resolvedTestCommand}`],
    };

    const persona = composePersona({
      skillName: 'test-skill',
      skillSearchPaths: [],
      missionPath: path.join(workspacePath, 'mission.md'),
      feature,
    });

    // The full resolved string is present in the worker context
    assert.ok(
      persona.prompt.includes('pnpm test'),
      'Worker prompt must include the resolved command string "pnpm test"'
    );
  });
});

// ---------------------------------------------------------------------------
// VAL-CROSS-008: State Recovery After Interruption
// ---------------------------------------------------------------------------

describe('VAL-CROSS-008: State Recovery After Interruption', () => {
  let workspacePath;
  let featuresPath;
  let fsm;

  /** Snapshot of Feature-A from the pre-crafted state */
  let featureAOriginalCompletedAt;
  /** Orphaned features detected on load */
  let orphanedFeatureIds;

  before(() => {
    workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'state-recovery-'));
    featuresPath = path.join(workspacePath, 'features.json');

    // Pre-crafted features.json simulating an interrupted mission:
    //   Feature-A: completed normally before the crash
    //   Feature-B: orphaned in in_progress at the moment of interruption
    const interruptedState = {
      features: [
        {
          id: 'Feature-A',
          description: 'Completed feature from before the interruption',
          status: 'completed',
          milestone: 'test-milestone',
          preconditions: [],
          startedAt: new Date(Date.now() - 10000).toISOString(),
          completedAt: new Date(Date.now() - 5000).toISOString(),
        },
        {
          id: 'Feature-B',
          description: 'Orphaned feature stuck in in_progress at interruption',
          status: 'in_progress',
          milestone: 'test-milestone',
          preconditions: [],
          startedAt: new Date(Date.now() - 3000).toISOString(),
        },
      ],
    };

    fs.writeFileSync(featuresPath, JSON.stringify(interruptedState, null, 2), 'utf8');

    // Simulate engine restart: load existing features.json from disk
    fsm = new FeaturesStateMachine(featuresPath);
    fsm.load();

    // Record Feature-A's original completedAt before any recovery transitions
    featureAOriginalCompletedAt = fsm.getFeature('Feature-A').completedAt;

    // Detect orphaned in_progress features (recovery step 1)
    orphanedFeatureIds = fsm
      .getAllFeatures()
      .filter(f => f.status === 'in_progress')
      .map(f => f.id);

    // Recover Feature-B: in_progress -> failed -> pending
    fsm.transition('Feature-B', 'failed');
    fsm.transition('Feature-B', 'pending');
  });

  after(() => {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it('FeaturesStateMachine loads pre-crafted interrupted state correctly', () => {
    // Verify initial state was loaded — these are the post-recovery statuses
    // Feature-A should still be completed; Feature-B recovered to pending
    const featureA = fsm.getFeature('Feature-A');
    const featureB = fsm.getFeature('Feature-B');

    assert.ok(featureA, 'Feature-A should exist in the loaded state');
    assert.ok(featureB, 'Feature-B should exist in the loaded state');
  });

  it('detects exactly one orphaned in_progress feature (Feature-B) on restart', () => {
    assert.equal(
      orphanedFeatureIds.length,
      1,
      'Should detect exactly 1 orphaned in_progress feature'
    );
    assert.equal(orphanedFeatureIds[0], 'Feature-B', 'The orphaned feature should be Feature-B');
  });

  it('Feature-A is not re-dispatched after recovery (remains completed)', () => {
    const featureA = fsm.getFeature('Feature-A');
    assert.equal(featureA.status, 'completed', 'Feature-A should remain completed after recovery');
    assert.equal(
      featureA.completedAt,
      featureAOriginalCompletedAt,
      'Feature-A completedAt must be unchanged — no data corruption'
    );
  });

  it('Feature-B transitions through in_progress->failed->pending for recovery', () => {
    const featureB = fsm.getFeature('Feature-B');
    assert.equal(
      featureB.status,
      'pending',
      'Feature-B should be pending after in_progress->failed->pending recovery'
    );
  });

  it('Feature-B is eligible for re-dispatch after recovery', () => {
    const eligibleIds = fsm.getEligibleFeatures().map(f => f.id);
    assert.ok(
      eligibleIds.includes('Feature-B'),
      'Feature-B should be eligible for re-dispatch after recovery to pending'
    );
  });

  it('Feature-A is not eligible for re-dispatch (completed is terminal)', () => {
    const eligibleIds = fsm.getEligibleFeatures().map(f => f.id);
    assert.ok(
      !eligibleIds.includes('Feature-A'),
      'Feature-A should NOT be eligible — completed is a terminal state'
    );
  });

  it('features.json persists recovered state without data corruption', () => {
    const persisted = JSON.parse(fs.readFileSync(featuresPath, 'utf8'));
    const featureA = persisted.features.find(f => f.id === 'Feature-A');
    const featureB = persisted.features.find(f => f.id === 'Feature-B');

    assert.ok(featureA, 'Feature-A should exist in persisted state');
    assert.ok(featureB, 'Feature-B should exist in persisted state');
    assert.equal(
      featureA.status,
      'completed',
      'Feature-A status should be completed in persisted state'
    );
    assert.equal(
      featureA.completedAt,
      featureAOriginalCompletedAt,
      'Feature-A completedAt should be preserved in persisted state'
    );
    assert.equal(
      featureB.status,
      'pending',
      'Feature-B status should be pending in persisted state'
    );
  });
});
