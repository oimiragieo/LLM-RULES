'use strict';

/**
 * Features State Machine
 *
 * Deterministic state machine for features.json processing.
 * Manages feature lifecycle through states with precondition DAG evaluation
 * and circular dependency detection.
 *
 * States: pending, in_progress, validating, completed, failed, cancelled
 *
 * Valid transitions:
 * - pending -> in_progress (requires all preconditions met)
 * - in_progress -> validating
 * - validating -> completed
 * - in_progress -> failed (increments retryCount)
 * - failed -> pending (preserves retryCount)
 *
 * Terminal states: completed, cancelled (no transitions allowed)
 */

const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');

// Schema for a single feature
const FEATURE_SCHEMA = {
  type: 'object',
  required: ['id', 'description', 'status'],
  properties: {
    id: { type: 'string', minLength: 1 },
    description: { type: 'string' },
    skillName: { type: 'string' },
    milestone: { type: 'string' },
    preconditions: { type: 'array', items: { type: 'string' } },
    expectedBehavior: { type: 'array', items: { type: 'string' } },
    verificationSteps: { type: 'array', items: { type: 'string' } },
    fulfills: { type: 'array', items: { type: 'string' } },
    status: {
      type: 'string',
      enum: ['pending', 'in_progress', 'validating', 'completed', 'failed', 'cancelled'],
    },
    retryCount: { type: 'integer', minimum: 0 },
    startedAt: { type: 'string', format: 'date-time', nullable: true },
    completedAt: { type: 'string', format: 'date-time', nullable: true },
    failedAt: { type: 'string', format: 'date-time', nullable: true },
    workerSessionIds: { type: 'array', items: { type: 'string' } },
    currentWorkerSessionId: { type: 'string', nullable: true },
    completedWorkerSessionId: { type: 'string', nullable: true },
  },
  additionalProperties: true,
};

// Schema for features.json file
const FEATURES_FILE_SCHEMA = {
  type: 'object',
  required: ['features'],
  properties: {
    features: {
      type: 'array',
      items: FEATURE_SCHEMA,
    },
  },
  additionalProperties: true,
};

// Valid state transitions (from -> [allowed to states])
const VALID_TRANSITIONS = {
  pending: ['in_progress', 'cancelled'],
  in_progress: ['validating', 'failed'],
  validating: ['completed', 'failed'],
  failed: ['pending'],
  completed: [], // Terminal
  cancelled: [], // Terminal
};

// Initialize AJV validator
const ajv = new Ajv({ allErrors: true, strict: false });
const validateFeatureFile = ajv.compile(FEATURES_FILE_SCHEMA);

/**
 * Atomic write: write to .tmp file then rename
 * Prevents corruption from mid-write crashes
 *
 * @param {string} filePath - Target file path
 * @param {Object} data - Data to write
 */
function atomicWriteJSON(filePath, data) {
  const tmpPath = filePath + '.tmp';
  const content = JSON.stringify(data, null, 2);

  // Write to temp file first
  fs.writeFileSync(tmpPath, content, 'utf8');

  // Rename is atomic on most filesystems
  fs.renameSync(tmpPath, filePath);
}

/**
 * Detect circular dependencies using DFS topological sort
 *
 * @param {Array} features - Array of feature objects
 * @returns {Object|null} - { cycle: [...] } if cycle found, null otherwise
 */
function detectCircularDependencies(features) {
  // Build adjacency list: feature -> its dependencies
  const featureIds = new Set(features.map(f => f.id));
  const adjacency = new Map();

  for (const feature of features) {
    const deps = feature.preconditions || [];
    // Only include dependencies that exist as features
    const validDeps = deps.filter(d => featureIds.has(d));
    adjacency.set(feature.id, validDeps);
  }

  // DFS cycle detection
  const WHITE = 0; // Not visited
  const GRAY = 1; // Currently visiting (in stack)
  const BLACK = 2; // Fully processed

  const colors = new Map();

  for (const featureId of featureIds) {
    colors.set(featureId, WHITE);
  }

  // DFS function that returns cycle if found
  function dfs(node, path) {
    colors.set(node, GRAY);

    const deps = adjacency.get(node) || [];
    for (const dep of deps) {
      const depColor = colors.get(dep);

      if (depColor === GRAY) {
        // Found cycle - reconstruct it
        const cycleStart = path.indexOf(dep);
        if (cycleStart !== -1) {
          return { cycle: [...path.slice(cycleStart), dep] };
        }
        return { cycle: [dep, node, dep] };
      }

      if (depColor === WHITE) {
        const result = dfs(dep, [...path, dep]);
        if (result) return result;
      }
    }

    colors.set(node, BLACK);
    return null;
  }

  // Run DFS from each unvisited node
  for (const featureId of featureIds) {
    if (colors.get(featureId) === WHITE) {
      const result = dfs(featureId, [featureId]);
      if (result) return result;
    }
  }

  return null;
}

/**
 * Topological sort of features by dependencies
 * Used internally for dependency ordering
 *
 * @param {Array} features - Array of feature objects
 * @returns {Array} - Features in topological order
 * @private
 */
function _topologicalSort(features) {
  const featureIds = new Set(features.map(f => f.id));
  const inDegree = new Map();
  const adjacency = new Map();

  // Initialize
  for (const feature of features) {
    inDegree.set(feature.id, 0);
    adjacency.set(feature.id, []);
  }

  // Build graph edges (dep -> feature)
  for (const feature of features) {
    const deps = feature.preconditions || [];
    for (const dep of deps) {
      if (featureIds.has(dep)) {
        adjacency.get(dep).push(feature.id);
        inDegree.set(feature.id, inDegree.get(feature.id) + 1);
      }
    }
  }

  // Kahn's algorithm
  const queue = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  const sorted = [];
  while (queue.length > 0) {
    const id = queue.shift();
    sorted.push(id);

    for (const dependent of adjacency.get(id)) {
      inDegree.set(dependent, inDegree.get(dependent) - 1);
      if (inDegree.get(dependent) === 0) {
        queue.push(dependent);
      }
    }
  }

  return sorted;
}

/**
 * Features State Machine class
 */
class FeaturesStateMachine {
  /**
   * @param {string} featuresPath - Path to features.json file
   */
  constructor(featuresPath) {
    this.featuresPath = path.normalize(featuresPath);
    this.features = [];
    this.featureMap = new Map();
    this.loaded = false;
  }

  /**
   * Load and validate features.json
   * @throws {Error} With code for various validation failures
   */
  load() {
    // Check file exists
    if (!fs.existsSync(this.featuresPath)) {
      const error = new Error(`features.json not found: ${this.featuresPath}`);
      error.code = 'FILE_NOT_FOUND';
      error.details = { path: this.featuresPath };
      throw error;
    }

    // Read file content
    let content;
    try {
      content = fs.readFileSync(this.featuresPath, 'utf8');
    } catch (readErr) {
      const error = new Error(`Failed to read features.json: ${readErr.message}`);
      error.code = 'READ_ERROR';
      error.details = { path: this.featuresPath };
      throw error;
    }

    // Handle empty file
    if (!content || content.trim() === '') {
      const error = new Error('features.json is empty');
      error.code = 'INVALID_JSON';
      error.details = { path: this.featuresPath };
      throw error;
    }

    // Parse JSON
    let data;
    try {
      data = JSON.parse(content);
    } catch (parseErr) {
      const error = new Error(`Invalid JSON in features.json: ${parseErr.message}`);
      error.code = 'INVALID_JSON';
      error.details = { path: this.featuresPath, parseError: parseErr.message };
      throw error;
    }

    // Validate schema
    if (!validateFeatureFile(data)) {
      const error = new Error('features.json schema validation failed');
      error.code = 'SCHEMA_VALIDATION_ERROR';
      error.details = {
        path: this.featuresPath,
        errors: validateFeatureFile.errors,
      };
      throw error;
    }

    // Store features with defaults
    this.features = data.features.map(f => ({
      retryCount: 0,
      preconditions: [],
      expectedBehavior: [],
      verificationSteps: [],
      fulfills: [],
      ...f,
    }));

    // Check for circular dependencies
    const cycleInfo = detectCircularDependencies(this.features);
    if (cycleInfo) {
      const error = new Error(
        `Circular dependency detected in features: ${cycleInfo.cycle.join(' -> ')}`
      );
      error.code = 'CIRCULAR_DEPENDENCY';
      error.details = { cycle: cycleInfo.cycle };
      throw error;
    }

    // Build feature map for O(1) lookup
    this.featureMap = new Map(this.features.map(f => [f.id, f]));

    this.loaded = true;
  }

  /**
   * Check if a feature's preconditions are met
   * @param {string} featureId - Feature ID to check
   * @returns {Object} - { met: boolean, unmetDeps: [...] }
   */
  checkPreconditions(featureId) {
    const feature = this.featureMap.get(featureId);
    if (!feature) {
      return { met: false, unmetDeps: [], reason: 'FEATURE_NOT_FOUND' };
    }

    const preconditions = feature.preconditions || [];
    const unmetDeps = [];

    for (const depId of preconditions) {
      const dep = this.featureMap.get(depId);
      if (!dep) {
        // Dependency doesn't exist as a feature - treat as unmet (safer)
        unmetDeps.push(depId);
        continue;
      }
      if (dep.status !== 'completed') {
        unmetDeps.push(depId);
      }
    }

    return {
      met: unmetDeps.length === 0,
      unmetDeps,
    };
  }

  /**
   * Transition a feature to a new status
   * @param {string} featureId - Feature ID to transition
   * @param {string} newStatus - Target status
   * @throws {Error} With code for invalid transitions
   */
  transition(featureId, newStatus) {
    if (!this.loaded) {
      throw new Error('Features not loaded. Call load() first.');
    }

    const feature = this.featureMap.get(featureId);
    if (!feature) {
      const error = new Error(`Feature not found: ${featureId}`);
      error.code = 'FEATURE_NOT_FOUND';
      error.details = { featureId };
      throw error;
    }

    const currentStatus = feature.status;

    // Check if current state is terminal
    if (VALID_TRANSITIONS[currentStatus].length === 0) {
      const error = new Error(
        `Invalid transition: ${currentStatus} is a terminal state, cannot transition to ${newStatus}`
      );
      error.code = 'INVALID_TRANSITION';
      error.details = { featureId, from: currentStatus, to: newStatus, reason: 'terminal' };
      throw error;
    }

    // Check if transition is valid
    if (!VALID_TRANSITIONS[currentStatus].includes(newStatus)) {
      const error = new Error(
        `Invalid transition: cannot go from ${currentStatus} to ${newStatus}`
      );
      error.code = 'INVALID_TRANSITION';
      error.details = { featureId, from: currentStatus, to: newStatus };
      throw error;
    }

    // Special case: pending -> in_progress requires preconditions check
    if (currentStatus === 'pending' && newStatus === 'in_progress') {
      const precondResult = this.checkPreconditions(featureId);
      if (!precondResult.met) {
        const error = new Error(
          `Preconditions not met for feature ${featureId}: ${precondResult.unmetDeps.join(', ')}`
        );
        error.code = 'PRECONDITION_NOT_MET';
        error.details = { featureId, unmetDeps: precondResult.unmetDeps };
        throw error;
      }
    }

    // Update feature state
    const now = new Date().toISOString();

    // Find and update the feature in the array
    const featureIndex = this.features.findIndex(f => f.id === featureId);
    const updatedFeature = { ...this.features[featureIndex] };
    updatedFeature.status = newStatus;

    // Set timestamps based on transition
    if (newStatus === 'in_progress') {
      updatedFeature.startedAt = now;
    } else if (newStatus === 'completed') {
      updatedFeature.completedAt = now;
    } else if (newStatus === 'failed') {
      updatedFeature.failedAt = now;
      updatedFeature.retryCount = (updatedFeature.retryCount || 0) + 1;
    }

    // Update in-memory state
    this.features[featureIndex] = updatedFeature;
    this.featureMap.set(featureId, updatedFeature);

    // Persist with atomic write
    this._persist();
  }

  /**
   * Persist current state to features.json using atomic write
   */
  _persist() {
    const data = { features: this.features };
    atomicWriteJSON(this.featuresPath, data);
  }

  /**
   * Get all features eligible to be started (pending with met preconditions)
   * @returns {Array} - Eligible features in array order
   */
  getEligibleFeatures() {
    if (!this.loaded) {
      throw new Error('Features not loaded. Call load() first.');
    }

    return this.features.filter(feature => {
      if (feature.status !== 'pending') {
        return false;
      }

      const precondResult = this.checkPreconditions(feature.id);
      return precondResult.met;
    });
  }

  /**
   * Get a feature by ID
   * @param {string} featureId - Feature ID
   * @returns {Object|null} - Feature object or null
   */
  getFeature(featureId) {
    return this.featureMap.get(featureId) || null;
  }

  /**
   * Get all features
   * @returns {Array} - All features
   */
  getAllFeatures() {
    return [...this.features];
  }
}

/**
 * Convenience function to load features.json
 * @param {string} featuresPath - Path to features.json
 * @returns {FeaturesStateMachine} - Loaded state machine
 */
function loadFeatures(featuresPath) {
  const machine = new FeaturesStateMachine(featuresPath);
  machine.load();
  return machine;
}

/**
 * Convenience function to transition a feature
 * @param {string} featuresPath - Path to features.json
 * @param {string} featureId - Feature ID
 * @param {string} newStatus - Target status
 * @returns {Object} - Updated feature
 */
function transitionFeature(featuresPath, featureId, newStatus) {
  const machine = loadFeatures(featuresPath);
  machine.transition(featureId, newStatus);
  return machine.getFeature(featureId);
}

/**
 * Convenience function to get eligible features
 * @param {string} featuresPath - Path to features.json
 * @returns {Array} - Eligible features
 */
function getEligibleFeatures(featuresPath) {
  const machine = loadFeatures(featuresPath);
  return machine.getEligibleFeatures();
}

/**
 * Validate features.json without creating a state machine
 * @param {string} featuresPath - Path to features.json
 * @returns {Object} - { valid: boolean, errors: [...] }
 */
function validateFeatures(featuresPath) {
  try {
    const machine = new FeaturesStateMachine(featuresPath);
    machine.load();
    return { valid: true, errors: [], features: machine.getAllFeatures() };
  } catch (err) {
    return {
      valid: false,
      errors: [
        {
          code: err.code,
          message: err.message,
          details: err.details,
        },
      ],
      features: [],
    };
  }
}

module.exports = {
  FeaturesStateMachine,
  loadFeatures,
  transitionFeature,
  getEligibleFeatures,
  validateFeatures,
  detectCircularDependencies,
  atomicWriteJSON,
  VALID_TRANSITIONS,
};
