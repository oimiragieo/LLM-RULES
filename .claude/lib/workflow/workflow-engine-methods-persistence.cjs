'use strict';

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../utils/safe-json.cjs');

module.exports = {
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
  },

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

    const raw = await fs.promises.readFile(checkpointPath, 'utf-8');
    const checkpointData = safeParseJSON(raw, null);
    if (
      !checkpointData ||
      typeof checkpointData !== 'object' ||
      Array.isArray(checkpointData) ||
      !Object.prototype.hasOwnProperty.call(checkpointData, 'state')
    ) {
      throw new Error(`Invalid checkpoint payload: ${checkpointId}`);
    }

    // Restore state
    this.state = checkpointData.state;

    this.emit('checkpoint:restore', { checkpointId, state: this.state });
  },

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
  },
};
