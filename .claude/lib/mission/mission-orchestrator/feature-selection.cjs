'use strict';

/**
 * Mission Orchestrator — Feature selection and milestone helpers
 *
 * DAG-aware eligible feature lookup, milestone completion checks,
 * and milestone validator injection.
 */

const fs = require('node:fs');
const path = require('node:path');
const { safeParseJSON } = require('../../utils/safe-json.cjs');
const { saveFeaturesDoc } = require('./state-io.cjs');

/**
 * Find the next eligible feature: pending status with all preconditions met.
 * @param {object[]} features - All features
 * @returns {object|null} Next eligible feature or null
 */
function findNextEligibleFeature(features) {
  const completedIds = new Set(features.filter(f => f.status === 'completed').map(f => f.id));

  for (const feature of features) {
    if (feature.status !== 'pending') continue;

    const preconditionsMet = (feature.preconditions || []).every(precond => {
      // Check if precondition matches "<feature-id> completed" pattern
      const match = precond.match(/^([a-z0-9][a-z0-9_-]*)\s+completed$/);
      if (match) {
        return completedIds.has(match[1]);
      }
      // Check "compiles" predicates — assume met if any feature with that milestone completed
      if (precond.endsWith('compiles')) return true;
      // Check milestone gate
      if (precond.startsWith('All implementation features for milestone')) {
        const msMatch = precond.match(/"([^"]+)"/);
        if (msMatch) {
          const ms = msMatch[1];
          const msFeatures = features.filter(
            f => f.milestone === ms && !f.id.includes('validator')
          );
          return msFeatures.every(f => f.status === 'completed');
        }
      }
      // Unknown precondition format — assume met to avoid blocking
      return true;
    });

    if (preconditionsMet) return feature;
  }

  return null;
}

/**
 * Check if all features in a milestone are completed.
 * @param {object[]} features - All features
 * @param {string} milestone - Milestone name
 * @returns {boolean}
 */
function isMilestoneComplete(features, milestone) {
  const msFeatures = features.filter(f => f.milestone === milestone && !f.id.includes('validator'));
  return msFeatures.length > 0 && msFeatures.every(f => f.status === 'completed');
}

/**
 * Get all unique milestones from features.
 * @param {object[]} features - All features
 * @returns {string[]}
 */
function getMilestones(features) {
  return [...new Set(features.map(f => f.milestone).filter(Boolean))];
}

/**
 * Load milestone validator templates and inject them into features.json
 * when a milestone's implementation features are all completed.
 *
 * @param {string} missionDir - Mission bundle directory
 * @param {object[]} features - Current features array
 * @param {string} milestone - Milestone that just completed
 * @returns {{ injected: boolean, scrutinyId: string|null, userTestingId: string|null }}
 */
function injectMilestoneValidators(missionDir, features, milestone) {
  const templatePath = path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    'schemas',
    'mission',
    'milestone-validator-templates.json'
  );

  if (!fs.existsSync(templatePath)) {
    return { injected: false, scrutinyId: null, userTestingId: null };
  }

  let templates;
  try {
    templates = safeParseJSON(fs.readFileSync(templatePath, 'utf8'), {});
  } catch {
    return { injected: false, scrutinyId: null, userTestingId: null };
  }

  const scrutinyId = `scrutiny-validator-${milestone}`;
  const userTestingId = `user-testing-validator-${milestone}`;

  // Already injected?
  const existingIds = new Set(features.map(f => f.id));
  if (existingIds.has(scrutinyId) || existingIds.has(userTestingId)) {
    return { injected: false, scrutinyId, userTestingId };
  }

  // Collect fulfills from milestone features
  const msFulfills = [];
  for (const f of features) {
    if (f.milestone === milestone && f.fulfills) {
      msFulfills.push(...f.fulfills);
    }
  }

  // Expand templates
  const expand = str => str.replace(/\{\{milestone\}\}/g, milestone);

  const scrutinyTemplate = templates.templates['scrutiny-validator'];
  const userTestingTemplate = templates.templates['user-testing-validator'];

  if (!scrutinyTemplate || !userTestingTemplate) {
    return { injected: false, scrutinyId: null, userTestingId: null };
  }

  const scrutinyFeature = {
    id: scrutinyId,
    description: expand(scrutinyTemplate.description),
    skillName: scrutinyTemplate.skillName,
    preconditions: scrutinyTemplate.preconditions.map(expand),
    expectedBehavior: scrutinyTemplate.expectedBehavior.map(expand),
    verificationSteps: [...scrutinyTemplate.verificationSteps],
    fulfills: [],
    milestone,
    status: 'pending',
    workerSessionIds: [],
    currentWorkerSessionId: null,
    completedWorkerSessionId: null,
  };

  const userTestingFeature = {
    id: userTestingId,
    description: expand(userTestingTemplate.description),
    skillName: userTestingTemplate.skillName,
    preconditions: userTestingTemplate.preconditions.map(expand),
    expectedBehavior: userTestingTemplate.expectedBehavior.map(expand),
    verificationSteps: [...userTestingTemplate.verificationSteps],
    fulfills: [...msFulfills],
    milestone,
    status: 'pending',
    workerSessionIds: [],
    currentWorkerSessionId: null,
    completedWorkerSessionId: null,
  };

  features.push(scrutinyFeature, userTestingFeature);
  saveFeaturesDoc(missionDir, features);

  return { injected: true, scrutinyId, userTestingId };
}

module.exports = {
  findNextEligibleFeature,
  isMilestoneComplete,
  getMilestones,
  injectMilestoneValidators,
};
