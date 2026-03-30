#!/usr/bin/env node
'use strict';

/**
 * Integration Test Pipeline Helper
 *
 * Provides createTestPipeline(options) that provisions a temporary workspace
 * with fixture files and a wired FeaturesStateMachine instance.
 *
 * Usage:
 *   const { createTestPipeline } = require('./test-pipeline.cjs');
 *   const pipeline = createTestPipeline();
 *   // pipeline.workspacePath  – absolute path to temp workspace
 *   // pipeline.featuresPath   – absolute path to features.json in workspace
 *   // pipeline.fsm            – loaded FeaturesStateMachine instance
 *   // pipeline.teardown()     – removes the workspace directory recursively
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { FeaturesStateMachine } = require('../../../.claude/lib/mission/features-state-machine.cjs');

// ---------------------------------------------------------------------------
// Default fixtures
// ---------------------------------------------------------------------------

/**
 * Default 1-milestone / 1-feature fixture used when no options.features provided.
 */
const DEFAULT_FEATURES = {
  features: [
    {
      id: 'feature-1',
      description: 'Default test feature',
      status: 'pending',
      milestone: 'milestone-1',
      preconditions: [],
      skillName: 'test-worker',
      expectedBehavior: [],
      verificationSteps: [],
    },
  ],
};

/** Minimal mission.md fixture */
const DEFAULT_MISSION_MD = '# Test Mission\n\nMinimal fixture for integration tests.\n';

// ---------------------------------------------------------------------------
// createTestPipeline
// ---------------------------------------------------------------------------

/**
 * Provisions a temporary workspace with fixture files and a loaded
 * FeaturesStateMachine instance.
 *
 * @param {object} [options]
 * @param {object} [options.features]
 *   Features data object ({ features: [...] }).
 *   Defaults to a single-feature, single-milestone fixture.
 * @param {string} [options.missionMd]
 *   Content for mission.md. Defaults to a minimal fixture string.
 * @param {string} [options.servicesYaml]
 *   If provided, written as services.yaml in the workspace.
 * @param {string} [options.initSh]
 *   If provided, written as init.sh in the workspace.
 *
 * @returns {{ workspacePath: string, featuresPath: string, fsm: FeaturesStateMachine, teardown: function }}
 */
function createTestPipeline(options) {
  const opts = options || {};

  // 1. Create temp directory
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'test-pipeline-'));

  // 2. Write fixture files

  // features.json
  const featuresData = opts.features || DEFAULT_FEATURES;
  const featuresPath = path.join(workspacePath, 'features.json');
  fs.writeFileSync(featuresPath, JSON.stringify(featuresData, null, 2), 'utf8');

  // mission.md
  const missionMd = opts.missionMd !== undefined ? opts.missionMd : DEFAULT_MISSION_MD;
  fs.writeFileSync(path.join(workspacePath, 'mission.md'), missionMd, 'utf8');

  // services.yaml (optional)
  if (opts.servicesYaml !== undefined) {
    fs.writeFileSync(path.join(workspacePath, 'services.yaml'), opts.servicesYaml, 'utf8');
  }

  // init.sh (optional)
  if (opts.initSh !== undefined) {
    fs.writeFileSync(path.join(workspacePath, 'init.sh'), opts.initSh, 'utf8');
  }

  // 3. Instantiate and load FeaturesStateMachine
  const fsm = new FeaturesStateMachine(featuresPath);
  fsm.load();

  // 4. Return pipeline object
  return {
    workspacePath,
    featuresPath,
    fsm,

    /**
     * Remove the temp workspace directory and all its contents.
     * Safe to call multiple times.
     */
    teardown() {
      fs.rmSync(workspacePath, { recursive: true, force: true });
    },
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  createTestPipeline,
  DEFAULT_FEATURES,
  DEFAULT_MISSION_MD,
};
