'use strict';

/**
 * Mission Orchestrator — facade
 *
 * Thin re-export facade. Implementation is split across three sub-modules:
 *   mission-orchestrator/state-io.cjs          — atomic load/save helpers
 *   mission-orchestrator/feature-selection.cjs — DAG eligibility + milestone validators
 *   mission-orchestrator/orchestrator-factory.cjs — createMissionOrchestrator + 12 methods
 */

const {
  loadMissionState,
  saveMissionState,
  saveFeaturesDoc,
} = require('./mission-orchestrator/state-io.cjs');
const {
  findNextEligibleFeature,
  isMilestoneComplete,
  getMilestones,
  injectMilestoneValidators,
} = require('./mission-orchestrator/feature-selection.cjs');
const { createMissionOrchestrator } = require('./mission-orchestrator/orchestrator-factory.cjs');

module.exports = {
  createMissionOrchestrator,
  findNextEligibleFeature,
  isMilestoneComplete,
  getMilestones,
  loadMissionState,
  saveMissionState,
  saveFeaturesDoc,
  injectMilestoneValidators,
};
