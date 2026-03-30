#!/usr/bin/env node
'use strict';

/**
 * Tests for test-pipeline.cjs
 *
 * Verifies VAL-INFRA-002: Integration Test Helper Wires Modules into
 * Configurable Pipeline with Temp Workspace Isolation
 *
 * Covers:
 * - createTestPipeline() provisions temp workspace with fixture files
 * - FeaturesStateMachine loads from the fixture features.json
 * - pipeline.teardown() removes all temp files
 * - Two concurrent pipelines have isolated workspaces
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createTestPipeline } = require('./test-pipeline.cjs');

// ---------------------------------------------------------------------------
// Test: pipeline structure
// ---------------------------------------------------------------------------

describe('createTestPipeline — structure', () => {
  it('returns an object with workspacePath, featuresPath, fsm, and teardown', () => {
    const pipeline = createTestPipeline();
    try {
      assert.strictEqual(typeof pipeline, 'object');
      assert.notStrictEqual(pipeline, null);
      assert.strictEqual(typeof pipeline.workspacePath, 'string');
      assert.strictEqual(typeof pipeline.featuresPath, 'string');
      assert.strictEqual(typeof pipeline.fsm, 'object');
      assert.strictEqual(typeof pipeline.teardown, 'function');
    } finally {
      pipeline.teardown();
    }
  });

  it('workspacePath is an absolute path', () => {
    const pipeline = createTestPipeline();
    try {
      assert.ok(path.isAbsolute(pipeline.workspacePath), 'workspacePath must be absolute');
    } finally {
      pipeline.teardown();
    }
  });

  it('featuresPath is inside workspacePath', () => {
    const pipeline = createTestPipeline();
    try {
      assert.ok(
        pipeline.featuresPath.startsWith(pipeline.workspacePath),
        'featuresPath must be inside workspacePath'
      );
    } finally {
      pipeline.teardown();
    }
  });
});

// ---------------------------------------------------------------------------
// Test: workspace provisioning
// ---------------------------------------------------------------------------

describe('createTestPipeline — workspace provisioning', () => {
  it('creates the workspace directory on disk', () => {
    const pipeline = createTestPipeline();
    try {
      assert.ok(fs.existsSync(pipeline.workspacePath), 'workspace directory must exist on disk');
    } finally {
      pipeline.teardown();
    }
  });

  it('writes features.json to workspace', () => {
    const pipeline = createTestPipeline();
    try {
      assert.ok(fs.existsSync(pipeline.featuresPath), 'features.json must exist in workspace');
      assert.strictEqual(pipeline.featuresPath, path.join(pipeline.workspacePath, 'features.json'));
    } finally {
      pipeline.teardown();
    }
  });

  it('writes mission.md to workspace', () => {
    const pipeline = createTestPipeline();
    try {
      const missionPath = path.join(pipeline.workspacePath, 'mission.md');
      assert.ok(fs.existsSync(missionPath), 'mission.md must exist in workspace');
      const content = fs.readFileSync(missionPath, 'utf8');
      assert.ok(content.length > 0, 'mission.md must not be empty');
    } finally {
      pipeline.teardown();
    }
  });

  it('uses default 1-milestone/1-feature fixture when no options provided', () => {
    const pipeline = createTestPipeline();
    try {
      const data = JSON.parse(fs.readFileSync(pipeline.featuresPath, 'utf8'));
      assert.ok(Array.isArray(data.features), 'features must be an array');
      assert.strictEqual(data.features.length, 1, 'default fixture must have exactly 1 feature');
      assert.strictEqual(typeof data.features[0].milestone, 'string');
      assert.ok(data.features[0].milestone.length > 0, 'milestone must be non-empty');
      assert.strictEqual(data.features[0].status, 'pending');
    } finally {
      pipeline.teardown();
    }
  });

  it('uses custom features when options.features is provided', () => {
    const customFeatures = {
      features: [
        {
          id: 'custom-1',
          description: 'Custom feature 1',
          status: 'pending',
          milestone: 'alpha',
          preconditions: [],
        },
        {
          id: 'custom-2',
          description: 'Custom feature 2',
          status: 'pending',
          milestone: 'alpha',
          preconditions: [],
        },
      ],
    };
    const pipeline = createTestPipeline({ features: customFeatures });
    try {
      const data = JSON.parse(fs.readFileSync(pipeline.featuresPath, 'utf8'));
      assert.strictEqual(data.features.length, 2);
      assert.strictEqual(data.features[0].id, 'custom-1');
      assert.strictEqual(data.features[1].id, 'custom-2');
    } finally {
      pipeline.teardown();
    }
  });

  it('uses custom missionMd when options.missionMd is provided', () => {
    const customMd = '# Custom Mission\n\nCustom content.\n';
    const pipeline = createTestPipeline({ missionMd: customMd });
    try {
      const missionPath = path.join(pipeline.workspacePath, 'mission.md');
      const content = fs.readFileSync(missionPath, 'utf8');
      assert.strictEqual(content, customMd);
    } finally {
      pipeline.teardown();
    }
  });

  it('writes services.yaml when options.servicesYaml is provided', () => {
    const yamlContent = 'commands:\n  test: pnpm test\n';
    const pipeline = createTestPipeline({ servicesYaml: yamlContent });
    try {
      const servicesPath = path.join(pipeline.workspacePath, 'services.yaml');
      assert.ok(fs.existsSync(servicesPath), 'services.yaml must exist when option provided');
      const content = fs.readFileSync(servicesPath, 'utf8');
      assert.strictEqual(content, yamlContent);
    } finally {
      pipeline.teardown();
    }
  });

  it('does NOT write services.yaml by default', () => {
    const pipeline = createTestPipeline();
    try {
      const servicesPath = path.join(pipeline.workspacePath, 'services.yaml');
      assert.ok(!fs.existsSync(servicesPath), 'services.yaml must NOT exist when not in options');
    } finally {
      pipeline.teardown();
    }
  });

  it('writes init.sh when options.initSh is provided', () => {
    const initContent = '#!/bin/sh\necho "init"\n';
    const pipeline = createTestPipeline({ initSh: initContent });
    try {
      const initPath = path.join(pipeline.workspacePath, 'init.sh');
      assert.ok(fs.existsSync(initPath), 'init.sh must exist when option provided');
      const content = fs.readFileSync(initPath, 'utf8');
      assert.strictEqual(content, initContent);
    } finally {
      pipeline.teardown();
    }
  });

  it('does NOT write init.sh by default', () => {
    const pipeline = createTestPipeline();
    try {
      const initPath = path.join(pipeline.workspacePath, 'init.sh');
      assert.ok(!fs.existsSync(initPath), 'init.sh must NOT exist when not in options');
    } finally {
      pipeline.teardown();
    }
  });
});

// ---------------------------------------------------------------------------
// Test: FeaturesStateMachine integration
// ---------------------------------------------------------------------------

describe('createTestPipeline — FeaturesStateMachine', () => {
  it('fsm is loaded (fsm.loaded is true)', () => {
    const pipeline = createTestPipeline();
    try {
      assert.strictEqual(pipeline.fsm.loaded, true, 'FSM must be loaded');
    } finally {
      pipeline.teardown();
    }
  });

  it('fsm.getAllFeatures() returns features from the fixture', () => {
    const pipeline = createTestPipeline();
    try {
      const features = pipeline.fsm.getAllFeatures();
      assert.ok(Array.isArray(features), 'getAllFeatures must return an array');
      assert.strictEqual(features.length, 1, 'default fixture has 1 feature');
    } finally {
      pipeline.teardown();
    }
  });

  it('fsm.getEligibleFeatures() returns pending features with no dependencies', () => {
    const pipeline = createTestPipeline();
    try {
      const eligible = pipeline.fsm.getEligibleFeatures();
      assert.strictEqual(eligible.length, 1, 'default feature should be eligible');
      assert.strictEqual(eligible[0].status, 'pending');
    } finally {
      pipeline.teardown();
    }
  });

  it('fsm.featuresPath matches pipeline.featuresPath', () => {
    const pipeline = createTestPipeline();
    try {
      assert.strictEqual(
        path.normalize(pipeline.fsm.featuresPath),
        path.normalize(pipeline.featuresPath)
      );
    } finally {
      pipeline.teardown();
    }
  });

  it('fsm can transition default feature from pending to in_progress', () => {
    const pipeline = createTestPipeline();
    try {
      const featureId = pipeline.fsm.getAllFeatures()[0].id;
      pipeline.fsm.transition(featureId, 'in_progress');
      const updated = pipeline.fsm.getFeature(featureId);
      assert.strictEqual(updated.status, 'in_progress');
    } finally {
      pipeline.teardown();
    }
  });

  it('fsm loads custom features correctly', () => {
    const customFeatures = {
      features: [
        {
          id: 'feat-a',
          description: 'A',
          status: 'pending',
          milestone: 'm1',
          preconditions: [],
        },
        {
          id: 'feat-b',
          description: 'B',
          status: 'pending',
          milestone: 'm1',
          preconditions: ['feat-a'],
        },
      ],
    };
    const pipeline = createTestPipeline({ features: customFeatures });
    try {
      const features = pipeline.fsm.getAllFeatures();
      assert.strictEqual(features.length, 2);
      // Only feat-a should be eligible (feat-b depends on feat-a)
      const eligible = pipeline.fsm.getEligibleFeatures();
      assert.strictEqual(eligible.length, 1);
      assert.strictEqual(eligible[0].id, 'feat-a');
    } finally {
      pipeline.teardown();
    }
  });
});

// ---------------------------------------------------------------------------
// Test: teardown
// ---------------------------------------------------------------------------

describe('createTestPipeline — teardown', () => {
  it('teardown removes the workspace directory', () => {
    const pipeline = createTestPipeline();
    const workspacePath = pipeline.workspacePath;
    assert.ok(fs.existsSync(workspacePath), 'workspace must exist before teardown');
    pipeline.teardown();
    assert.ok(!fs.existsSync(workspacePath), 'workspace must NOT exist after teardown');
  });

  it('teardown removes features.json', () => {
    const pipeline = createTestPipeline();
    const featuresPath = pipeline.featuresPath;
    assert.ok(fs.existsSync(featuresPath), 'features.json must exist before teardown');
    pipeline.teardown();
    assert.ok(!fs.existsSync(featuresPath), 'features.json must NOT exist after teardown');
  });

  it('teardown can be called safely multiple times', () => {
    const pipeline = createTestPipeline();
    pipeline.teardown();
    assert.doesNotThrow(() => pipeline.teardown(), 'teardown must not throw when called again');
  });
});

// ---------------------------------------------------------------------------
// Test: workspace isolation (concurrent pipelines)
// ---------------------------------------------------------------------------

describe('createTestPipeline — workspace isolation', () => {
  it('two concurrent pipelines have distinct workspace paths', () => {
    const p1 = createTestPipeline();
    const p2 = createTestPipeline();
    try {
      assert.notStrictEqual(
        p1.workspacePath,
        p2.workspacePath,
        'concurrent pipelines must use distinct workspaces'
      );
    } finally {
      p1.teardown();
      p2.teardown();
    }
  });

  it('two concurrent pipelines both exist on disk simultaneously', () => {
    const p1 = createTestPipeline();
    const p2 = createTestPipeline();
    try {
      assert.ok(fs.existsSync(p1.workspacePath), 'p1 workspace must exist');
      assert.ok(fs.existsSync(p2.workspacePath), 'p2 workspace must exist');
    } finally {
      p1.teardown();
      p2.teardown();
    }
  });

  it('tearing down p1 does not affect p2 workspace', () => {
    const p1 = createTestPipeline();
    const p2 = createTestPipeline();
    p1.teardown();
    try {
      assert.ok(fs.existsSync(p2.workspacePath), 'p2 workspace must still exist after p1 teardown');
      assert.ok(
        fs.existsSync(p2.featuresPath),
        'p2 features.json must still exist after p1 teardown'
      );
    } finally {
      p2.teardown();
    }
  });

  it('two concurrent pipelines have independent FSM instances', () => {
    const p1 = createTestPipeline();
    const p2 = createTestPipeline();
    try {
      assert.notStrictEqual(p1.fsm, p2.fsm, 'each pipeline must have its own FSM instance');
      // Transitioning p1's feature does not affect p2
      const p1FeatureId = p1.fsm.getAllFeatures()[0].id;
      p1.fsm.transition(p1FeatureId, 'in_progress');
      const p2Features = p2.fsm.getAllFeatures();
      assert.strictEqual(p2Features[0].status, 'pending', 'p2 FSM state must be unaffected');
    } finally {
      p1.teardown();
      p2.teardown();
    }
  });

  it('ten concurrent pipelines all have unique workspace paths', () => {
    const pipelines = [];
    try {
      for (let i = 0; i < 10; i++) {
        pipelines.push(createTestPipeline());
      }
      const paths = pipelines.map(p => p.workspacePath);
      const unique = new Set(paths);
      assert.strictEqual(unique.size, 10, 'all 10 pipelines must have unique workspace paths');
    } finally {
      for (const p of pipelines) {
        p.teardown();
      }
    }
  });
});
