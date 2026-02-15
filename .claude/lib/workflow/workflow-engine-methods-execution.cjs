'use strict';

const fs = require('fs');
const { safeEvaluateCondition } = require('./step-validators.cjs');
const { parseWorkflow, validateWorkflow } = require('./workflow-parser.cjs');
const { PHASE_ORDER } = require('./workflow-engine-constants.cjs');

module.exports = {
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
  },

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
  },

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
  },

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
  },

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
  },

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
  },
};
