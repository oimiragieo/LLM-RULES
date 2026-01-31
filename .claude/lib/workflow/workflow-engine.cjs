#!/usr/bin/env node
/**
 * Workflow Engine
 * ===============
 *
 * Production-grade workflow engine for the EVOLVE self-evolution system.
 * Based on research patterns from workflow-engine-implementations.md
 *
 * Features:
 * - State machine for EVOLVE phases (E->V->O->L->V->E)
 * - YAML workflow definition parsing
 * - Step execution with before/after hooks
 * - Gate validation for phase transitions
 * - Checkpoint/resume for durability
 * - Rollback via compensating actions
 * - Event-driven architecture
 *
 * Usage:
 *   const { WorkflowEngine, PHASES, TRANSITIONS } = require('./workflow-engine.cjs');
 *
 *   const engine = new WorkflowEngine('/path/to/workflow.yaml', {
 *     checkpointDir: '/tmp/checkpoints'
 *   });
 *
 *   await engine.load();
 *   engine.registerHandler('myHandler', async (ctx) => ({ result: 'done' }));
 *   const result = await engine.execute({ input: 'data' });
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { safeEvaluateCondition } = require('./step-validators.cjs');

// Phase 5 ML Features Integration
const {
  getPatternDetector,
  getCostPredictor,
  getAdaptiveExecutor,
  getOptimizationEngine,
  isMLEnabled,
  ML_FEATURES,
} = require('../ml/index.cjs');

// =============================================================================
// Constants
// =============================================================================

/**
 * Maximum handlers allowed per event type to prevent memory exhaustion
 * SEC-IMPL-003: Memory Exhaustion Risk (CWE-770)
 */
const MAX_HANDLERS = 100;

/**
 * EVOLVE workflow phases
 * E -> V -> O -> L -> V -> E
 */
const PHASES = {
  EVALUATE: 'evaluate',
  VALIDATE: 'validate',
  OBTAIN: 'obtain',
  LOCK: 'lock',
  VERIFY: 'verify',
  ENABLE: 'enable',
};

/**
 * Valid phase transitions
 */
const TRANSITIONS = {
  evaluate: ['validate'],
  validate: ['obtain'],
  obtain: ['lock'],
  lock: ['verify'],
  verify: ['enable', 'lock'], // Can retry lock if verify fails
  enable: ['complete'],
};

/**
 * Phase execution order
 */
const PHASE_ORDER = ['evaluate', 'validate', 'obtain', 'lock', 'verify', 'enable'];

// =============================================================================
// YAML Parser (Simple implementation without dependencies)
// =============================================================================

/**
 * Simple YAML parser for workflow definitions
 * Handles basic YAML structures: objects, arrays, strings, numbers, booleans
 *
 * @param {string} yamlString - YAML content to parse
 * @returns {Object} Parsed workflow definition
 */
function parseWorkflow(yamlString) {
  if (!yamlString || typeof yamlString !== 'string' || yamlString.trim() === '') {
    throw new Error('Workflow definition is empty or invalid');
  }

  try {
    // Remove comments and normalize line endings
    const lines = yamlString
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map(line => {
        const commentIndex = line.indexOf('#');
        if (commentIndex >= 0) {
          // Don't remove # in quoted strings
          const beforeComment = line.substring(0, commentIndex);
          const quoteCount = (beforeComment.match(/"/g) || []).length;
          if (quoteCount % 2 === 0) {
            return beforeComment;
          }
        }
        return line;
      });

    return parseYamlLines(lines, 0).result;
  } catch (e) {
    if (e.message.includes('empty')) throw e;
    throw new Error(`Invalid YAML: ${e.message}`);
  }
}

/**
 * Parse YAML lines recursively
 */
function parseYamlLines(lines, startIndent) {
  const result = {};
  let i = 0;
  let isArray = false;
  const arrayResult = [];

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trimStart();

    // Skip empty lines
    if (trimmed === '') {
      i++;
      continue;
    }

    // Calculate indent
    const indent = line.length - trimmed.length;

    // If less indented, return to parent
    if (indent < startIndent && trimmed !== '') {
      break;
    }

    // Check for array item
    if (trimmed.startsWith('- ')) {
      isArray = true;
      const afterDash = trimmed.substring(2);
      const value = afterDash.trim();

      // Check if it's a key-value pair in array (e.g., "- id: step1")
      const colonMatch = value.match(/^([^:]+):\s*(.*)/);
      if (colonMatch) {
        const key = colonMatch[1].trim();
        const val = colonMatch[2].trim();

        // Build the item object
        const item = {};
        if (val !== '') {
          item[key] = parseValue(val);
        }

        // Check for nested content under this array item
        // Nested content is indented more than the "- " (indent + 2)
        let j = i + 1;
        const itemIndent = indent + 2;
        while (j < lines.length) {
          const nextLine = lines[j];
          const nextTrimmed = nextLine.trimStart();
          if (nextTrimmed === '') {
            j++;
            continue;
          }
          const nextIndent = nextLine.length - nextTrimmed.length;
          if (nextIndent < itemIndent) {
            break;
          }

          // Parse this nested line
          if (nextTrimmed.includes(':')) {
            const nestedColon = nextTrimmed.indexOf(':');
            const nestedKey = nextTrimmed.substring(0, nestedColon).trim();
            const nestedVal = nextTrimmed.substring(nestedColon + 1).trim();

            if (nestedVal === '' || nestedVal === '|' || nestedVal === '>') {
              // Has deeper nested content
              const deepLines = lines.slice(j + 1);
              let deepIndent = -1;
              for (const dl of deepLines) {
                const dt = dl.trimStart();
                if (dt !== '') {
                  deepIndent = dl.length - dt.length;
                  break;
                }
              }
              if (deepIndent > nextIndent) {
                const nested = parseYamlLines(deepLines, deepIndent);
                item[nestedKey] = nested.isArray ? nested.arrayResult : nested.result;
                j += nested.linesConsumed + 1;
              } else {
                item[nestedKey] = null;
                j++;
              }
            } else {
              item[nestedKey] = parseValue(nestedVal);
              j++;
            }
          } else {
            j++;
          }
        }

        // If val was empty but we had nested content under that key
        if (val === '' && !item[key]) {
          // Check if there's nested content for this key
          const nestedLines = lines.slice(i + 1);
          let nestedIndent = -1;
          for (const nl of nestedLines) {
            const nt = nl.trimStart();
            if (nt !== '') {
              nestedIndent = nl.length - nt.length;
              break;
            }
          }
          if (nestedIndent > indent + 2) {
            const nested = parseYamlLines(nestedLines, nestedIndent);
            item[key] = nested.isArray ? nested.arrayResult : nested.result;
          }
        }

        arrayResult.push(item);
        i = j;
      } else if (value === '') {
        // Array item with nested object (e.g., "- \n    key: value")
        const nextLine = lines[i + 1];
        if (nextLine) {
          const nextTrimmed = nextLine.trimStart();
          const nextIndent = nextLine.length - nextTrimmed.length;
          if (nextIndent > indent) {
            const nested = parseYamlLines(lines.slice(i + 1), nextIndent);
            arrayResult.push(nested.isArray ? nested.arrayResult : nested.result);
            i += nested.linesConsumed + 1;
          } else {
            i++;
          }
        } else {
          i++;
        }
      } else {
        // Simple array value (e.g., "- value")
        arrayResult.push(parseValue(value));
        i++;
      }
      continue;
    }

    // Check for key-value pair
    if (trimmed.includes(':')) {
      const colonIndex = trimmed.indexOf(':');
      const key = trimmed.substring(0, colonIndex).trim();
      const afterColon = trimmed.substring(colonIndex + 1);
      const value = afterColon.trim();

      if (value === '' || value === '|' || value === '>') {
        // Nested object or multiline string
        // Find next non-empty line to determine indent
        let nextIndent = -1;
        for (let k = i + 1; k < lines.length; k++) {
          const nextTrimmed = lines[k].trimStart();
          if (nextTrimmed !== '') {
            nextIndent = lines[k].length - nextTrimmed.length;
            break;
          }
        }

        if (nextIndent > indent) {
          const nested = parseYamlLines(lines.slice(i + 1), nextIndent);
          result[key] = nested.isArray ? nested.arrayResult : nested.result;
          i += nested.linesConsumed + 1;
        } else {
          result[key] = null;
          i++;
        }
      } else {
        result[key] = parseValue(value);
        i++;
      }
    } else if (trimmed.endsWith(':')) {
      // Just a key without value (e.g., "key:")
      const key = trimmed.slice(0, -1).trim();
      // Find next non-empty line to determine indent
      let nextIndent = -1;
      for (let k = i + 1; k < lines.length; k++) {
        const nextTrimmed = lines[k].trimStart();
        if (nextTrimmed !== '') {
          nextIndent = lines[k].length - nextTrimmed.length;
          break;
        }
      }

      if (nextIndent > indent) {
        const nested = parseYamlLines(lines.slice(i + 1), nextIndent);
        result[key] = nested.isArray ? nested.arrayResult : nested.result;
        i += nested.linesConsumed + 1;
      } else {
        result[key] = null;
        i++;
      }
    } else {
      i++;
    }
  }

  return {
    result: isArray ? arrayResult : result,
    isArray,
    arrayResult,
    linesConsumed: i,
  };
}

/**
 * Parse a YAML value
 */
function parseValue(value) {
  if (value === '' || value === 'null' || value === '~') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d*\.\d+$/.test(value)) return parseFloat(value);
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

// =============================================================================
// Workflow Validator
// =============================================================================

/**
 * Validate a workflow definition
 *
 * @param {Object} workflow - Parsed workflow definition
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateWorkflow(workflow) {
  const errors = [];

  // Required fields
  if (!workflow.name) {
    errors.push('Missing required field: name');
  }

  if (!workflow.phases) {
    errors.push('Missing required field: phases');
  }

  // Validate step IDs are unique
  if (workflow.phases) {
    const stepIds = new Set();

    for (const [phaseName, phaseConfig] of Object.entries(workflow.phases)) {
      if (phaseConfig && phaseConfig.steps) {
        for (const step of phaseConfig.steps) {
          if (step.id) {
            if (stepIds.has(step.id)) {
              errors.push(`Duplicate step ID: ${step.id} in phase ${phaseName}`);
            }
            stepIds.add(step.id);
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// =============================================================================
// WorkflowEngine Class
// =============================================================================

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

  /**
   * Initialize Phase 5 ML modules (lazy-loaded)
   * @private
   */
  _initializeMLModules() {
    try {
      if (ML_FEATURES.PATTERN_DETECTION) {
        this.ml.patternDetector = getPatternDetector();
      }
      if (ML_FEATURES.COST_PREDICTION) {
        this.ml.costPredictor = getCostPredictor();
      }
      if (ML_FEATURES.ADAPTIVE_EXECUTION) {
        this.ml.adaptiveExecutor = getAdaptiveExecutor();
      }
      if (ML_FEATURES.PERFORMANCE_PROFILING) {
        this.ml.optimizationEngine = getOptimizationEngine();
      }

      console.log('[workflow-engine] Phase 5 ML modules initialized:', {
        patternDetection: !!this.ml.patternDetector,
        costPrediction: !!this.ml.costPredictor,
        adaptiveExecution: !!this.ml.adaptiveExecutor,
        performanceProfiling: !!this.ml.optimizationEngine,
      });
    } catch (error) {
      console.warn('[workflow-engine] Failed to initialize ML modules:', error.message);
      // Continue without ML features (graceful degradation)
      this.ml.enabled = false;
    }
  }

  // ===========================================================================
  // Event System
  // ===========================================================================

  /**
   * Register an event handler
   *
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
  }

  /**
   * Register an event handler with deduplication
   * SEC-IMPL-003: Prevents memory exhaustion from duplicate handlers
   *
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   * @param {string} id - Unique handler ID for deduplication
   * @returns {boolean} - true if handler was registered, false if duplicate or limit reached
   */
  onWithId(event, handler, id) {
    // Initialize registry for this event type if needed
    if (!this.handlerRegistry.has(event)) {
      this.handlerRegistry.set(event, new Set());
    }
    const registry = this.handlerRegistry.get(event);

    // Check for handler limit (SEC-IMPL-003)
    if (registry.size >= MAX_HANDLERS) {
      console.warn(
        `[workflow-engine] Handler limit (${MAX_HANDLERS}) reached for event "${event}". ` +
          `Handler "${id}" not registered.`
      );
      return false;
    }

    // Check for duplicate
    if (registry.has(id)) {
      return false; // Silently reject duplicate
    }

    // Register the handler
    registry.add(id);
    this.on(event, handler);

    // Store reverse mapping for off() cleanup
    this.handlerIdMap.set(handler, { event, id });

    return true;
  }

  /**
   * Remove an event handler
   *
   * @param {string} event - Event name
   * @param {Function} handler - Event handler to remove
   * @param {string} [id] - Optional handler ID to also remove from registry
   */
  off(event, handler, id) {
    if (this.eventHandlers.has(event)) {
      const handlers = this.eventHandlers.get(event);
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }

    // Look up ID from reverse mapping if not provided
    let handlerId = id;
    if (!handlerId && this.handlerIdMap.has(handler)) {
      const mapping = this.handlerIdMap.get(handler);
      if (mapping.event === event) {
        handlerId = mapping.id;
      }
    }

    // Remove from handlerRegistry if ID found
    if (handlerId && this.handlerRegistry.has(event)) {
      this.handlerRegistry.get(event).delete(handlerId);
    }

    // Clean up reverse mapping
    this.handlerIdMap.delete(handler);
  }

  /**
   * Clear all handlers for an event type, or all handlers if no event specified
   * SEC-IMPL-003: Essential for preventing memory leaks on workflow completion
   *
   * @param {string} [event] - Optional event type to clear (clears all if not provided)
   */
  clearHandlers(event) {
    if (event) {
      // Clear specific event type
      this.eventHandlers.delete(event);
      this.handlerRegistry.delete(event);
      // Clean up reverse mappings for this event
      for (const [handler, mapping] of this.handlerIdMap.entries()) {
        if (mapping.event === event) {
          this.handlerIdMap.delete(handler);
        }
      }
    } else {
      // Clear all handlers
      this.eventHandlers.clear();
      this.handlerRegistry.clear();
      this.handlerIdMap.clear();
    }
  }

  /**
   * Get the number of registered handlers for an event type
   *
   * @param {string} event - Event name
   * @returns {number} - Number of handlers registered for this event
   */
  getHandlerCount(event) {
    if (!this.handlerRegistry.has(event)) {
      return 0;
    }
    return this.handlerRegistry.get(event).size;
  }

  /**
   * Emit an event
   *
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data) {
    if (this.eventHandlers.has(event)) {
      for (const handler of this.eventHandlers.get(event)) {
        try {
          handler(data);
        } catch (e) {
          console.error(`[workflow-engine] Event handler error for ${event}:`, e.message);
        }
      }
    }
  }

  // ===========================================================================
  // Handler Registration
  // ===========================================================================

  /**
   * Register a step handler
   *
   * @param {string} name - Handler name
   * @param {Function} handler - Async handler function
   */
  registerHandler(name, handler) {
    this.handlers.set(name, handler);
  }

  /**
   * Check if handler exists
   *
   * @param {string} name - Handler name
   * @returns {boolean}
   */
  hasHandler(name) {
    return this.handlers.has(name);
  }

  /**
   * Get a handler by name
   *
   * @param {string} name - Handler name
   * @returns {Function}
   * @throws {Error} If handler not found
   */
  getHandler(name) {
    if (!this.handlers.has(name)) {
      throw new Error(`Handler not found: ${name}`);
    }
    return this.handlers.get(name);
  }

  // ===========================================================================
  // State Management
  // ===========================================================================

  /**
   * Get current state (immutable copy)
   *
   * @returns {Object} Current state
   */
  getState() {
    return {
      ...this.state,
      completedPhases: [...(this.state.completedPhases || [])],
      completedSteps: [...(this.state.completedSteps || [])],
      stepResults: { ...(this.state.stepResults || {}) },
      errors: [...(this.state.errors || [])],
    };
  }

  /**
   * Generate a unique run ID
   *
   * @returns {string}
   */
  generateRunId() {
    return `run-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  // ===========================================================================
  // Workflow Loading
  // ===========================================================================

  /**
   * Load and validate workflow from file
   */
  async load() {
    const content = await fs.promises.readFile(this.workflowPath, 'utf-8');
    this.workflow = parseWorkflow(content);

    const validation = validateWorkflow(this.workflow);
    this.isValid = validation.valid;

    if (!validation.valid) {
      throw new Error(`Invalid workflow: ${validation.errors.join(', ')}`);
    }
  }

  // ===========================================================================
  // Gate Evaluation
  // ===========================================================================

  /**
   * Evaluate a gate condition
   *
   * SEC-005 FIX: Now uses safeEvaluateCondition with predefined conditions
   * instead of new Function() to prevent code injection.
   *
   * @param {Object} gate - Gate configuration
   * @returns {{ passed: boolean, error?: string, blocked?: boolean }}
   */
  async evaluateGate(gate) {
    // Build evaluation context
    const steps = this.state.stepResults;
    const context = { steps };

    // Use safe evaluator instead of new Function()
    const result = safeEvaluateCondition(gate.condition, context);

    if (result.passed) {
      this.emit('gate:pass', { gate, context });
    } else {
      this.emit('gate:fail', { gate, context, error: result.error, blocked: result.blocked });
    }

    return result;
  }

  // ===========================================================================
  // Step Execution
  // ===========================================================================

  /**
   * Find a step by ID across all phases
   *
   * @param {string} stepId - Step ID
   * @returns {{ step: Object, phase: string } | null}
   */
  findStep(stepId) {
    for (const [phaseName, phaseConfig] of Object.entries(this.workflow.phases)) {
      if (phaseConfig && phaseConfig.steps) {
        const step = phaseConfig.steps.find(s => s.id === stepId);
        if (step) {
          return { step, phase: phaseName };
        }
      }
    }
    return null;
  }

  /**
   * Execute a single step by ID
   *
   * @param {string} stepId - Step ID to execute
   * @param {Object} context - Execution context
   * @returns {*} Step result
   */
  async executeStep(stepId, context = {}) {
    const found = this.findStep(stepId);
    if (!found) {
      throw new Error(`Step not found: ${stepId}`);
    }

    const { step } = found;

    this.emit('step:start', { stepId, step });

    try {
      let result;

      if (step.action === 'function' && step.handler) {
        // Execute registered handler
        if (this.handlers.has(step.handler)) {
          const handler = this.handlers.get(step.handler);
          result = await handler(context, this.state);
        } else if (this.handlers.has(stepId)) {
          const handler = this.handlers.get(stepId);
          result = await handler(context, this.state);
        } else {
          throw new Error(`Handler not found: ${step.handler}`);
        }
      } else if (step.action === 'prompt' || step.action === 'write') {
        // For prompt/write actions, check if there's a handler registered by stepId
        if (this.handlers.has(stepId)) {
          const handler = this.handlers.get(stepId);
          result = await handler(context, this.state);
        } else {
          // Default: return empty result for non-function steps
          result = {};
        }
      } else {
        result = {};
      }

      // Store result
      this.state.stepResults[stepId] = result;
      this.state.completedSteps.push(stepId);

      this.emit('step:end', { stepId, step, result });

      return result;
    } catch (e) {
      this.emit('step:error', { stepId, step, error: e });
      throw e;
    }
  }

  // ===========================================================================
  // Phase Execution
  // ===========================================================================

  /**
   * Validate phase transition
   *
   * @param {string} targetPhase - Target phase
   * @returns {boolean}
   */
  isValidTransition(targetPhase) {
    const currentPhase = this.state.currentPhase;
    const completedPhases = this.state.completedPhases;

    // First phase (evaluate) is always valid if nothing started
    if (targetPhase === 'evaluate' && currentPhase === null && completedPhases.length === 0) {
      return true;
    }

    // Check if prior phases are completed
    const targetIndex = PHASE_ORDER.indexOf(targetPhase);
    if (targetIndex === -1) return false;

    // All prior phases must be completed
    for (let i = 0; i < targetIndex; i++) {
      if (!completedPhases.includes(PHASE_ORDER[i])) {
        return false;
      }
    }

    return true;
  }

  /**
   * Execute a phase
   *
   * @param {string} phaseName - Phase to execute
   * @param {Object} context - Execution context with pre-populated results
   */
  async executePhase(phaseName, context = {}) {
    // Ensure state arrays exist
    if (!this.state.completedPhases) this.state.completedPhases = [];
    if (!this.state.completedSteps) this.state.completedSteps = [];
    if (!this.state.stepResults) this.state.stepResults = {};
    if (!this.state.errors) this.state.errors = [];

    // Validate transition
    if (!this.isValidTransition(phaseName)) {
      throw new Error(
        `Invalid transition: cannot execute phase '${phaseName}' without completing prior phases`
      );
    }

    const phaseConfig = this.workflow.phases[phaseName];
    if (!phaseConfig) {
      throw new Error(`Phase not found: ${phaseName}`);
    }

    this.state.currentPhase = phaseName;
    this.emit('phase:start', { phase: phaseName });

    try {
      // Merge pre-populated results into state
      if (context) {
        for (const [stepId, result] of Object.entries(context)) {
          this.state.stepResults[stepId] = result;
        }
      }

      // Execute steps
      if (phaseConfig.steps) {
        for (const step of phaseConfig.steps) {
          // Skip if already has result in context
          if (!this.state.stepResults[step.id]) {
            await this.executeStep(step.id, context);
          }
        }
      }

      // Evaluate gates
      if (phaseConfig.gates) {
        for (const gate of phaseConfig.gates) {
          const result = await this.evaluateGate(gate);
          if (!result.passed) {
            throw new Error(`Gate failed: ${gate.condition}`);
          }
        }
      }

      // Mark phase as completed
      this.state.completedPhases.push(phaseName);
      this.emit('phase:end', { phase: phaseName, status: 'completed' });
    } catch (e) {
      this.emit('phase:error', { phase: phaseName, error: e });
      throw e;
    }
  }

  // ===========================================================================
  // Full Workflow Execution
  // ===========================================================================

  /**
   * Execute the full workflow
   *
   * @param {Object} context - Initial context
   * @returns {Object} Final state
   */
  async execute(context = {}) {
    // Initialize
    this.state.runId = this.generateRunId();
    this.state.status = 'running';
    this.state.startedAt = Date.now();
    this.state.completedPhases = [];
    this.state.completedSteps = [];
    this.state.stepResults = {};
    this.state.errors = [];

    // Phase 5 ML: Initialize cost tracking
    if (this.ml.costPredictor) {
      const estimatedCost = this._estimateWorkflowCost(context);
      console.log(`[workflow-engine] Estimated workflow cost: $${estimatedCost.toFixed(4)}`);
    }

    try {
      // Execute each phase in order
      for (const phaseName of PHASE_ORDER) {
        await this.executePhase(phaseName, context);
      }

      this.state.status = 'completed';
      this.state.endedAt = Date.now();

      // Phase 5 ML: Record execution pattern
      if (this.ml.patternDetector) {
        this._recordExecutionPattern();
      }

      // Phase 5 ML: Generate optimization recommendations
      if (this.ml.optimizationEngine) {
        this._generateOptimizations();
      }

      return this.getState();
    } catch (e) {
      this.state.status = 'failed';
      this.state.errors.push(e.message);
      this.state.endedAt = Date.now();
      throw e;
    }
  }

  /**
   * Estimate workflow cost using ML cost predictor
   * @param {Object} context - Execution context
   * @returns {number} - Estimated cost in USD
   * @private
   */
  _estimateWorkflowCost(context) {
    if (!this.ml.costPredictor || !this.workflow) {
      return 0;
    }

    try {
      // Estimate based on workflow complexity
      const phaseCount = Object.keys(this.workflow.phases || {}).length;
      const avgStepsPerPhase = 3; // Rough estimate
      const avgPromptLength = 500; // Characters per step

      const totalChars = phaseCount * avgStepsPerPhase * avgPromptLength;
      const tokens = this.ml.costPredictor.estimateTokens(totalChars, {
        includeSystemOverhead: true,
      });

      // Assume sonnet model for estimation
      const cost = this.ml.costPredictor.estimateCost(
        tokens,
        tokens * 0.5, // Assume 50% response ratio
        'claude-sonnet-4-20250514'
      );

      return cost;
    } catch (error) {
      console.warn('[workflow-engine] Cost estimation failed:', error.message);
      return 0;
    }
  }

  /**
   * Record execution pattern for ML analysis
   * @private
   */
  _recordExecutionPattern() {
    if (!this.ml.patternDetector) {
      return;
    }

    try {
      const pattern = {
        workflowId: this.workflow?.name || 'unknown',
        phases: this.state.completedPhases,
        steps: this.state.completedSteps,
        duration: this.state.endedAt - this.state.startedAt,
        errors: this.state.errors,
        timestamp: new Date().toISOString(),
      };

      // Note: Pattern storage would be implemented in pattern library module
      console.log('[workflow-engine] Execution pattern recorded:', {
        phases: pattern.phases.length,
        steps: pattern.steps.length,
        duration: `${pattern.duration}ms`,
      });
    } catch (error) {
      console.warn('[workflow-engine] Pattern recording failed:', error.message);
    }
  }

  /**
   * Generate optimization recommendations based on execution
   * @private
   */
  _generateOptimizations() {
    if (!this.ml.optimizationEngine) {
      return;
    }

    try {
      const executionMetrics = {
        duration: this.state.endedAt - this.state.startedAt,
        phaseCount: this.state.completedPhases.length,
        stepCount: this.state.completedSteps.length,
        errorCount: this.state.errors.length,
      };

      console.log('[workflow-engine] Execution metrics:', executionMetrics);

      // Note: Optimization recommendations would be generated by optimization-engine module
      // This is a placeholder for future enhancement
    } catch (error) {
      console.warn('[workflow-engine] Optimization generation failed:', error.message);
    }
  }

  // ===========================================================================
  // Checkpoint and Resume
  // ===========================================================================

  /**
   * Save a checkpoint
   *
   * @returns {string} Checkpoint ID
   */
  async checkpoint() {
    const checkpointDir = this.options.checkpointDir;
    if (!checkpointDir) {
      throw new Error('Checkpoint directory not configured');
    }

    // Ensure directory exists
    if (!fs.existsSync(checkpointDir)) {
      fs.mkdirSync(checkpointDir, { recursive: true });
    }

    const checkpointId = `checkpoint-${this.state.runId}-${Date.now()}`;
    const checkpointPath = path.join(checkpointDir, `${checkpointId}.json`);

    const checkpointData = {
      id: checkpointId,
      timestamp: Date.now(),
      workflowPath: this.workflowPath,
      state: this.getState(),
    };

    await fs.promises.writeFile(checkpointPath, JSON.stringify(checkpointData, null, 2));

    this.emit('checkpoint:save', { checkpointId, runId: this.state.runId, path: checkpointPath });

    return checkpointId;
  }

  /**
   * Resume from a checkpoint
   *
   * @param {string} checkpointId - Checkpoint ID to resume from
   */
  async resume(checkpointId) {
    const checkpointDir = this.options.checkpointDir;
    if (!checkpointDir) {
      throw new Error('Checkpoint directory not configured');
    }

    const checkpointPath = path.join(checkpointDir, `${checkpointId}.json`);

    if (!fs.existsSync(checkpointPath)) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    const checkpointData = JSON.parse(await fs.promises.readFile(checkpointPath, 'utf-8'));

    // Restore state
    this.state = checkpointData.state;

    this.emit('checkpoint:restore', { checkpointId, state: this.state });
  }

  // ===========================================================================
  // Rollback
  // ===========================================================================

  /**
   * Execute compensating actions in reverse order
   */
  async rollback() {
    // Get completed phases in reverse order
    const phasesToRollback = [...(this.state.completedPhases || [])].reverse();

    for (const phaseName of phasesToRollback) {
      const phaseConfig = this.workflow.phases[phaseName];

      if (phaseConfig && phaseConfig.compensate) {
        // Execute compensating actions in reverse
        const compensateActions = [...phaseConfig.compensate].reverse();

        for (const action of compensateActions) {
          if (action.handler && this.handlers.has(action.handler)) {
            const handler = this.handlers.get(action.handler);
            await handler(this.state);
          }
        }
      }
    }

    // Reset state
    this.state.completedPhases = [];
    this.state.completedSteps = [];
    this.state.stepResults = {};
    this.state.errors = [];
    this.state.currentPhase = null;
    this.state.status = 'pending';
  }
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  WorkflowEngine,
  PHASES,
  TRANSITIONS,
  MAX_HANDLERS,
  parseWorkflow,
  validateWorkflow,
};
