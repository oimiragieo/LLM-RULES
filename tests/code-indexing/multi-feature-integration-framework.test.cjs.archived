/**
 * SPEC-012: Multi-Feature Integration Test Framework
 *
 * Tests Phase 0-2 features working together end-to-end:
 * - Spec-Init (SPEC-001) + Git Notes Audit (SPEC-002)
 * - Track Metadata (SPEC-007) + Analytics (SPEC-008)
 * - Progressive Disclosure (SPEC-009) + Brownfield Detection (SPEC-005)
 * - Coordinator: All features in single workflow
 *
 * This file provides the TEST FRAMEWORK infrastructure. The actual integration
 * tests are in multi-feature-integration.test.cjs (staged from Phase 2).
 *
 * Framework Goals:
 * 1. Mock project environment for all Phase 0-2 features
 * 2. Test data generators for each feature type
 * 3. Cross-feature state verification
 * 4. Performance measurement utilities
 *
 * @module tests/code-indexing/multi-feature-integration-framework
 */

'use strict';

const { test, suite } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

/**
 * Multi-Feature Integration Test Framework
 *
 * Provides utilities for testing Phase 0-2 features working together:
 * - Mock git repository setup
 * - Feature state generators
 * - Cross-feature assertions
 * - Performance measurement
 */
class IntegrationTestFramework {
  /**
   * Create test framework instance
   * @param {Object} options
   * @param {string} options.testDir - Temporary test directory
   * @param {boolean} [options.enableGit=true] - Initialize git repo
   * @param {boolean} [options.enableGitNotes=true] - Enable git notes for SPEC-002
   * @param {boolean} [options.verbose=false] - Enable verbose logging
   */
  constructor(options = {}) {
    this.testDir = options.testDir || fs.mkdtempSync(path.join(os.tmpdir(), 'integration-test-'));
    this.enableGit = options.enableGit !== false;
    this.enableGitNotes = options.enableGitNotes !== false;
    this.verbose = options.verbose || false;
    this.features = new Map(); // Track feature states
    this.metrics = { operations: [], durations: {} }; // Performance tracking
    this.initialized = false;
  }

  /**
   * Initialize test environment
   * Sets up git repo, creates directory structure, initializes feature states
   */
  async initialize() {
    if (this.initialized) return;

    // Create directory structure
    this._createDirectoryStructure();

    // Initialize git repository
    if (this.enableGit) {
      this._initGitRepository();
    }

    // Initialize feature tracking
    this._initFeatureStates();

    this.initialized = true;
  }

  /**
   * Create standard project directory structure
   * @private
   */
  _createDirectoryStructure() {
    const dirs = [
      '.claude/context/specs',
      '.claude/context/memory',
      '.claude/context/artifacts',
      '.claude/lib/workflow',
      '.claude/schemas',
      'src',
      'tests',
    ];

    for (const dir of dirs) {
      const fullPath = path.join(this.testDir, dir);
      fs.mkdirSync(fullPath, { recursive: true });
    }
  }

  /**
   * Initialize git repository with git notes support
   * @private
   */
  _initGitRepository() {
    const originalDir = process.cwd();
    try {
      process.chdir(this.testDir);
      execSync('git init', { stdio: this.verbose ? 'inherit' : 'pipe' });
      execSync('git config user.email "test@example.com"', { stdio: 'pipe' });
      execSync('git config user.name "Test User"', { stdio: 'pipe' });

      if (this.enableGitNotes) {
        // Configure git notes ref for SPEC-002
        execSync('git config notes.rewriteRef refs/notes/agent-studio', { stdio: 'pipe' });
      }
    } finally {
      process.chdir(originalDir);
    }
  }

  /**
   * Initialize feature state tracking
   * @private
   */
  _initFeatureStates() {
    // SPEC-001: Spec-Init
    this.features.set('spec-init', { initialized: false, specs: [] });

    // SPEC-002: Git Notes Audit
    this.features.set('git-notes', { initialized: false, commits: [], notes: [] });

    // SPEC-005: Brownfield Detection
    this.features.set('brownfield', { initialized: false, assessment: null });

    // SPEC-007: Track Metadata
    this.features.set('track-metadata', { initialized: false, tracks: [] });

    // SPEC-008: Analytics
    this.features.set('analytics', { initialized: false, reports: [] });

    // SPEC-009: Progressive Disclosure
    this.features.set('progressive-disclosure', { initialized: false, sessions: [] });
  }

  /**
   * Generate test data for Spec-Init feature (SPEC-001)
   * @param {Object} specData - Spec configuration
   * @returns {Object} Generated spec metadata
   */
  generateSpecInitData(specData = {}) {
    const spec = {
      id: specData.id || `SPEC-${String(Math.floor(Math.random() * 100)).padStart(3, '0')}`,
      title: specData.title || 'Test Feature',
      description: specData.description || 'Generated test feature',
      complexity: specData.complexity || 'MEDIUM',
      status: specData.status || 'draft',
      createdAt: new Date().toISOString(),
      tracks: specData.tracks || [],
    };

    // Write spec file
    const specPath = path.join(this.testDir, '.claude/context/specs', `${spec.id}.md`);
    const content = [
      `# ${spec.title}`,
      '',
      `**ID**: ${spec.id}`,
      `**Complexity**: ${spec.complexity}`,
      `**Status**: ${spec.status}`,
      '',
      `## Description`,
      '',
      spec.description,
    ].join('\n');

    fs.writeFileSync(specPath, content, 'utf-8');

    // Update feature state
    const state = this.features.get('spec-init');
    state.specs.push(spec);
    state.initialized = true;

    return spec;
  }

  /**
   * Generate test data for Git Notes feature (SPEC-002)
   * @param {Object} commitData - Commit configuration
   * @returns {Object} Generated commit with git note
   */
  generateGitNotesData(commitData = {}) {
    const originalDir = process.cwd();
    try {
      process.chdir(this.testDir);

      // Create test file and commit
      const filename = commitData.filename || `test-${Date.now()}.txt`;
      const filePath = path.join(this.testDir, filename);
      fs.writeFileSync(filePath, commitData.content || 'Test content', 'utf-8');

      execSync(`git add ${filename}`, { stdio: 'pipe' });
      const commitMsg = commitData.message || 'test: add test file';
      execSync(`git commit -m "${commitMsg}"`, { stdio: 'pipe' });

      // Get commit hash
      const commitHash = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();

      // Add git note (SPEC-002)
      const noteData = {
        taskId: commitData.taskId || 'task-001',
        agent: commitData.agent || 'developer',
        timestamp: new Date().toISOString(),
        metadata: commitData.metadata || {},
      };

      const noteContent = JSON.stringify(noteData, null, 2);
      execSync(`git notes --ref=agent-studio add -m '${noteContent}' ${commitHash}`, {
        stdio: 'pipe',
      });

      // Update feature state
      const state = this.features.get('git-notes');
      state.commits.push({ hash: commitHash, message: commitMsg });
      state.notes.push({ commit: commitHash, data: noteData });
      state.initialized = true;

      return { commitHash, noteData };
    } finally {
      process.chdir(originalDir);
    }
  }

  /**
   * Generate test data for Brownfield Detection (SPEC-005)
   * @param {Object} options
   * @returns {Object} Generated brownfield assessment
   */
  generateBrownfieldData(options = {}) {
    const assessment = {
      detectedFrameworks: options.frameworks || ['express', 'react'],
      complexity: options.complexity || 'moderate',
      techStack: options.techStack || { backend: 'node', frontend: 'react' },
      recommendations: options.recommendations || ['Add tests', 'Update deps'],
      timestamp: new Date().toISOString(),
    };

    // Write assessment file
    const assessmentPath = path.join(
      this.testDir,
      '.claude/context/artifacts/brownfield-assessment.json'
    );
    fs.writeFileSync(assessmentPath, JSON.stringify(assessment, null, 2), 'utf-8');

    // Update feature state
    const state = this.features.get('brownfield');
    state.assessment = assessment;
    state.initialized = true;

    return assessment;
  }

  /**
   * Generate test data for Track Metadata (SPEC-007)
   * @param {Object} trackData
   * @returns {Object} Generated track metadata
   */
  generateTrackMetadata(trackData = {}) {
    const track = {
      id: trackData.id || `track-${Date.now()}`,
      spec: trackData.spec || 'SPEC-001',
      phase: trackData.phase || 'implementation',
      effort: trackData.effort || { estimated: '2d', actual: null },
      dependencies: trackData.dependencies || [],
      status: trackData.status || 'pending',
      createdAt: new Date().toISOString(),
      metadata: trackData.metadata || {},
    };

    // Update feature state
    const state = this.features.get('track-metadata');
    state.tracks.push(track);
    state.initialized = true;

    return track;
  }

  /**
   * Generate test data for Analytics (SPEC-008)
   * @param {Object} reportData
   * @returns {Object} Generated analytics report
   */
  generateAnalyticsData(reportData = {}) {
    const report = {
      id: reportData.id || `report-${Date.now()}`,
      type: reportData.type || 'track-completion',
      metrics: reportData.metrics || {
        totalTracks: 5,
        completedTracks: 3,
        avgCompletionTime: '1.5d',
      },
      timestamp: new Date().toISOString(),
    };

    // Update feature state
    const state = this.features.get('analytics');
    state.reports.push(report);
    state.initialized = true;

    return report;
  }

  /**
   * Generate test data for Progressive Disclosure (SPEC-009)
   * @param {Object} sessionData
   * @returns {Object} Generated disclosure session
   */
  generateProgressiveDisclosureData(sessionData = {}) {
    const session = {
      id: sessionData.id || `session-${Date.now()}`,
      questions: sessionData.questions || ['What is the goal?', 'What are constraints?'],
      answers: sessionData.answers || [],
      iteration: sessionData.iteration || 1,
      maxIterations: sessionData.maxIterations || 5,
      completed: sessionData.completed || false,
      timestamp: new Date().toISOString(),
    };

    // Update feature state
    const state = this.features.get('progressive-disclosure');
    state.sessions.push(session);
    state.initialized = true;

    return session;
  }

  /**
   * Verify cross-feature state consistency
   * Tests that features correctly share and synchronize state
   * @param {string[]} featureNames - Features to verify
   * @returns {Object} Verification result
   */
  verifyCrossFeatureState(featureNames) {
    const results = {
      valid: true,
      features: {},
      errors: [],
    };

    for (const name of featureNames) {
      const state = this.features.get(name);
      if (!state) {
        results.valid = false;
        results.errors.push(`Feature '${name}' not found in state`);
        continue;
      }

      if (!state.initialized) {
        results.valid = false;
        results.errors.push(`Feature '${name}' not initialized`);
      }

      results.features[name] = {
        initialized: state.initialized,
        dataCount: this._countFeatureData(state),
      };
    }

    return results;
  }

  /**
   * Count data items in feature state
   * @private
   */
  _countFeatureData(state) {
    if (state.specs) return state.specs.length;
    if (state.commits) return state.commits.length;
    if (state.tracks) return state.tracks.length;
    if (state.reports) return state.reports.length;
    if (state.sessions) return state.sessions.length;
    if (state.assessment) return 1;
    return 0;
  }

  /**
   * Measure operation performance
   * @param {string} operationName
   * @param {Function} operation - Async function to measure
   * @returns {Object} Operation result with timing
   */
  async measurePerformance(operationName, operation) {
    const start = Date.now();
    const result = await operation();
    const duration = Date.now() - start;

    this.metrics.operations.push({
      name: operationName,
      duration,
      timestamp: new Date().toISOString(),
    });

    if (!this.metrics.durations[operationName]) {
      this.metrics.durations[operationName] = [];
    }
    this.metrics.durations[operationName].push(duration);

    return { result, duration };
  }

  /**
   * Get performance statistics
   * @param {string} [operationName] - Specific operation to query
   * @returns {Object} Performance stats
   */
  getPerformanceStats(operationName) {
    if (operationName) {
      const durations = this.metrics.durations[operationName] || [];
      if (durations.length === 0) return null;

      return {
        operation: operationName,
        count: durations.length,
        min: Math.min(...durations),
        max: Math.max(...durations),
        avg: durations.reduce((sum, d) => sum + d, 0) / durations.length,
        total: durations.reduce((sum, d) => sum + d, 0),
      };
    }

    // All operations
    const allStats = {};
    for (const [name, durations] of Object.entries(this.metrics.durations)) {
      allStats[name] = {
        count: durations.length,
        min: Math.min(...durations),
        max: Math.max(...durations),
        avg: durations.reduce((sum, d) => sum + d, 0) / durations.length,
        total: durations.reduce((sum, d) => sum + d, 0),
      };
    }
    return allStats;
  }

  /**
   * Assert performance target met
   * @param {string} operationName
   * @param {number} maxDuration - Max duration in milliseconds
   * @throws {Error} If performance target not met
   */
  assertPerformanceTarget(operationName, maxDuration) {
    const stats = this.getPerformanceStats(operationName);
    if (!stats) {
      throw new Error(`No performance data for operation '${operationName}'`);
    }

    if (stats.avg > maxDuration) {
      throw new Error(
        `Performance target failed for '${operationName}': avg=${stats.avg}ms, max=${maxDuration}ms`
      );
    }
  }

  /**
   * Cleanup test environment
   */
  cleanup() {
    if (fs.existsSync(this.testDir)) {
      fs.rmSync(this.testDir, { recursive: true, force: true });
    }
  }
}

/**
 * Feature Bridge - Connects features for integration testing
 * Simulates cross-feature communication and state sharing
 */
class FeatureBridge {
  constructor(framework) {
    this.framework = framework;
    this.connections = new Map(); // Feature-to-feature connections
  }

  /**
   * Connect two features for state sharing
   * @param {string} feature1
   * @param {string} feature2
   * @param {Function} stateMapper - Maps state from feature1 to feature2
   */
  connect(feature1, feature2, stateMapper) {
    const key = `${feature1}->${feature2}`;
    this.connections.set(key, stateMapper);
  }

  /**
   * Propagate state from one feature to another
   * @param {string} sourceFeature
   * @param {string} targetFeature
   * @returns {Object} Propagated state
   */
  propagateState(sourceFeature, targetFeature) {
    const key = `${sourceFeature}->${targetFeature}`;
    const mapper = this.connections.get(key);

    if (!mapper) {
      throw new Error(`No bridge connection from '${sourceFeature}' to '${targetFeature}'`);
    }

    const sourceState = this.framework.features.get(sourceFeature);
    const targetState = this.framework.features.get(targetFeature);

    if (!sourceState || !targetState) {
      throw new Error(`Feature not found: ${sourceFeature} or ${targetFeature}`);
    }

    const mappedState = mapper(sourceState, targetState);
    return mappedState;
  }
}

// ===========================
// FRAMEWORK TESTS (RED PHASE)
// ===========================

suite('IntegrationTestFramework Tests', () => {
  let framework;
  let tempDir;

  suite('Constructor and Initialization', () => {
    test('should create framework instance with default options', () => {
      framework = new IntegrationTestFramework();
      assert.ok(framework.testDir);
      assert.equal(framework.enableGit, true);
      assert.equal(framework.enableGitNotes, true);
      assert.equal(framework.verbose, false);
      assert.equal(framework.initialized, false);
      framework.cleanup();
    });

    test('should create framework with custom options', () => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'custom-test-'));
      framework = new IntegrationTestFramework({
        testDir: tempDir,
        enableGit: false,
        verbose: true,
      });
      assert.equal(framework.testDir, tempDir);
      assert.equal(framework.enableGit, false);
      assert.equal(framework.verbose, true);
      framework.cleanup();
    });

    test('should initialize directory structure on initialize()', async () => {
      framework = new IntegrationTestFramework();
      await framework.initialize();

      const dirs = [
        '.claude/context/specs',
        '.claude/context/memory',
        '.claude/lib/workflow',
        'src',
        'tests',
      ];

      for (const dir of dirs) {
        const fullPath = path.join(framework.testDir, dir);
        assert.ok(fs.existsSync(fullPath), `Directory ${dir} should exist`);
      }

      framework.cleanup();
    });

    test('should initialize git repository if enableGit=true', async () => {
      framework = new IntegrationTestFramework({ enableGit: true });
      await framework.initialize();

      const gitDir = path.join(framework.testDir, '.git');
      assert.ok(fs.existsSync(gitDir), 'Git directory should exist');

      framework.cleanup();
    });

    test('should skip git init if enableGit=false', async () => {
      framework = new IntegrationTestFramework({ enableGit: false });
      await framework.initialize();

      const gitDir = path.join(framework.testDir, '.git');
      assert.ok(!fs.existsSync(gitDir), 'Git directory should not exist');

      framework.cleanup();
    });

    test('should initialize feature states on initialize()', async () => {
      framework = new IntegrationTestFramework();
      await framework.initialize();

      assert.ok(framework.features.has('spec-init'));
      assert.ok(framework.features.has('git-notes'));
      assert.ok(framework.features.has('brownfield'));
      assert.ok(framework.features.has('track-metadata'));
      assert.ok(framework.features.has('analytics'));
      assert.ok(framework.features.has('progressive-disclosure'));

      framework.cleanup();
    });
  });

  suite('Test Data Generators', () => {
    test('should generate spec-init data (SPEC-001)', async () => {
      framework = new IntegrationTestFramework();
      await framework.initialize();

      const spec = framework.generateSpecInitData({
        id: 'SPEC-TEST-001',
        title: 'Test Feature',
        complexity: 'HIGH',
      });

      assert.equal(spec.id, 'SPEC-TEST-001');
      assert.equal(spec.title, 'Test Feature');
      assert.equal(spec.complexity, 'HIGH');

      const state = framework.features.get('spec-init');
      assert.equal(state.initialized, true);
      assert.equal(state.specs.length, 1);

      framework.cleanup();
    });

    test('should generate git-notes data (SPEC-002)', async () => {
      framework = new IntegrationTestFramework({ enableGit: true, enableGitNotes: true });
      await framework.initialize();

      const { commitHash, noteData } = framework.generateGitNotesData({
        filename: 'test.txt',
        message: 'test: add feature',
        taskId: 'task-123',
      });

      assert.ok(commitHash);
      assert.equal(noteData.taskId, 'task-123');

      const state = framework.features.get('git-notes');
      assert.equal(state.initialized, true);
      assert.equal(state.commits.length, 1);
      assert.equal(state.notes.length, 1);

      framework.cleanup();
    });

    test('should generate brownfield data (SPEC-005)', async () => {
      framework = new IntegrationTestFramework();
      await framework.initialize();

      const assessment = framework.generateBrownfieldData({
        frameworks: ['react', 'express'],
        complexity: 'high',
      });

      assert.deepEqual(assessment.detectedFrameworks, ['react', 'express']);
      assert.equal(assessment.complexity, 'high');

      const state = framework.features.get('brownfield');
      assert.equal(state.initialized, true);
      assert.ok(state.assessment);

      framework.cleanup();
    });

    test('should generate track-metadata data (SPEC-007)', async () => {
      framework = new IntegrationTestFramework();
      await framework.initialize();

      const track = framework.generateTrackMetadata({
        id: 'track-001',
        spec: 'SPEC-001',
        phase: 'implementation',
      });

      assert.equal(track.id, 'track-001');
      assert.equal(track.spec, 'SPEC-001');
      assert.equal(track.phase, 'implementation');

      const state = framework.features.get('track-metadata');
      assert.equal(state.initialized, true);
      assert.equal(state.tracks.length, 1);

      framework.cleanup();
    });

    test('should generate analytics data (SPEC-008)', async () => {
      framework = new IntegrationTestFramework();
      await framework.initialize();

      const report = framework.generateAnalyticsData({
        type: 'track-completion',
        metrics: { totalTracks: 10, completedTracks: 7 },
      });

      assert.equal(report.type, 'track-completion');
      assert.equal(report.metrics.totalTracks, 10);
      assert.equal(report.metrics.completedTracks, 7);

      const state = framework.features.get('analytics');
      assert.equal(state.initialized, true);
      assert.equal(state.reports.length, 1);

      framework.cleanup();
    });

    test('should generate progressive-disclosure data (SPEC-009)', async () => {
      framework = new IntegrationTestFramework();
      await framework.initialize();

      const session = framework.generateProgressiveDisclosureData({
        questions: ['What is the goal?'],
        maxIterations: 3,
      });

      assert.deepEqual(session.questions, ['What is the goal?']);
      assert.equal(session.maxIterations, 3);

      const state = framework.features.get('progressive-disclosure');
      assert.equal(state.initialized, true);
      assert.equal(state.sessions.length, 1);

      framework.cleanup();
    });
  });

  suite('Cross-Feature State Verification', () => {
    test('should verify initialized features', async () => {
      framework = new IntegrationTestFramework();
      await framework.initialize();

      framework.generateSpecInitData();
      framework.generateTrackMetadata();

      const result = framework.verifyCrossFeatureState(['spec-init', 'track-metadata']);

      assert.equal(result.valid, true);
      assert.equal(result.errors.length, 0);
      assert.equal(result.features['spec-init'].initialized, true);
      assert.equal(result.features['track-metadata'].initialized, true);

      framework.cleanup();
    });

    test('should detect uninitialized features', async () => {
      framework = new IntegrationTestFramework();
      await framework.initialize();

      // Don't generate data - features remain uninitialized
      const result = framework.verifyCrossFeatureState(['spec-init', 'brownfield']);

      assert.equal(result.valid, false);
      assert.ok(result.errors.length > 0);

      framework.cleanup();
    });

    test('should detect missing features', async () => {
      framework = new IntegrationTestFramework();
      await framework.initialize();

      const result = framework.verifyCrossFeatureState(['nonexistent-feature']);

      assert.equal(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('not found')));

      framework.cleanup();
    });
  });

  suite('Performance Measurement', () => {
    test('should measure operation performance', async () => {
      framework = new IntegrationTestFramework();
      await framework.initialize();

      const { result, duration } = await framework.measurePerformance('test-op', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'success';
      });

      assert.equal(result, 'success');
      assert.ok(duration >= 10);

      const stats = framework.getPerformanceStats('test-op');
      assert.equal(stats.count, 1);
      assert.ok(stats.avg >= 10);

      framework.cleanup();
    });

    test('should track multiple operations', async () => {
      framework = new IntegrationTestFramework();
      await framework.initialize();

      await framework.measurePerformance('op1', async () => 'result1');
      await framework.measurePerformance('op1', async () => 'result2');
      await framework.measurePerformance('op2', async () => 'result3');

      const op1Stats = framework.getPerformanceStats('op1');
      const op2Stats = framework.getPerformanceStats('op2');

      assert.equal(op1Stats.count, 2);
      assert.equal(op2Stats.count, 1);

      framework.cleanup();
    });

    test('should assert performance targets', async () => {
      framework = new IntegrationTestFramework();
      await framework.initialize();

      await framework.measurePerformance('fast-op', async () => 'done');

      assert.doesNotThrow(() => {
        framework.assertPerformanceTarget('fast-op', 100); // Should pass
      });

      framework.cleanup();
    });

    test('should throw on performance target failure', async () => {
      framework = new IntegrationTestFramework();
      await framework.initialize();

      await framework.measurePerformance('slow-op', async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'done';
      });

      assert.throws(() => {
        framework.assertPerformanceTarget('slow-op', 10); // Should fail
      });

      framework.cleanup();
    });
  });

  suite('FeatureBridge Tests', () => {
    test('should create bridge connections', async () => {
      framework = new IntegrationTestFramework();
      await framework.initialize();
      const bridge = new FeatureBridge(framework);

      bridge.connect('spec-init', 'track-metadata', (sourceState, _targetState) => {
        return { spec: sourceState.specs[0] };
      });

      assert.ok(bridge.connections.has('spec-init->track-metadata'));

      framework.cleanup();
    });

    test('should propagate state between features', async () => {
      framework = new IntegrationTestFramework();
      await framework.initialize();
      const bridge = new FeatureBridge(framework);

      framework.generateSpecInitData({ id: 'SPEC-001', title: 'Test' });

      bridge.connect('spec-init', 'track-metadata', sourceState => {
        return { specId: sourceState.specs[0].id };
      });

      const propagated = bridge.propagateState('spec-init', 'track-metadata');
      assert.equal(propagated.specId, 'SPEC-001');

      framework.cleanup();
    });

    test('should throw on invalid bridge connection', async () => {
      framework = new IntegrationTestFramework();
      await framework.initialize();
      const bridge = new FeatureBridge(framework);

      assert.throws(() => {
        bridge.propagateState('nonexistent', 'target');
      });

      framework.cleanup();
    });
  });
});

module.exports = { IntegrationTestFramework, FeatureBridge };
