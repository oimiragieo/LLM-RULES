#!/usr/bin/env node
/**
 * Workflow Engine
 * ===============
 *
 * Production-grade workflow engine for the EVOLVE self-evolution system.
 */

'use strict';

const { isMLEnabled } = require('../ml/index.cjs');
const { MAX_HANDLERS, PHASES, TRANSITIONS } = require('./workflow-engine-constants.cjs');
const { parseWorkflow, validateWorkflow } = require('./workflow-parser.cjs');
const eventAndStateMethods = require('./workflow-engine-methods-events.cjs');
const executionMethods = require('./workflow-engine-methods-execution.cjs');
const mlMethods = require('./workflow-engine-methods-ml.cjs');
const persistenceMethods = require('./workflow-engine-methods-persistence.cjs');

/**
 * Production-grade workflow engine
 */
class WorkflowEngine {
  /**
   * Create a new WorkflowEngine instance
   *
   * @param {string} workflowPath - Path to workflow YAML file
   * @param {Object} options - Engine options
   * @param {string} options.checkpointDir - Directory for checkpoints
   * @param {Object} options.hooks - Lifecycle hooks
   */
  constructor(workflowPath, options = {}) {
    this.workflowPath = workflowPath;
    this.options = options;
    this.workflow = null;
    this.isValid = false;

    // State
    this.state = {
      runId: null,
      status: 'pending',
      currentPhase: null,
      completedPhases: [],
      completedSteps: [],
      stepResults: {},
      errors: [],
      startedAt: null,
      endedAt: null,
    };

    // Handlers registry
    this.handlers = new Map();

    // Event emitter
    this.eventHandlers = new Map();

    // Handler registry for deduplication (event -> Set of handler IDs)
    // SEC-IMPL-003: Prevents memory exhaustion from duplicate handlers
    this.handlerRegistry = new Map();

    // Reverse mapping: handler function -> { event, id } for off() cleanup
    this.handlerIdMap = new Map();

    // Phase 5 ML Features (lazy-loaded if enabled)
    this.ml = {
      patternDetector: null,
      costPredictor: null,
      adaptiveExecutor: null,
      optimizationEngine: null,
      enabled: isMLEnabled(),
    };

    // Initialize ML modules if enabled
    if (isMLEnabled()) {
      this._initializeMLModules();
    }
  }
}

Object.assign(
  WorkflowEngine.prototype,
  eventAndStateMethods,
  executionMethods,
  mlMethods,
  persistenceMethods
);

module.exports = {
  WorkflowEngine,
  PHASES,
  TRANSITIONS,
  MAX_HANDLERS,
  parseWorkflow,
  validateWorkflow,
};
