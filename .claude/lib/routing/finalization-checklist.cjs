'use strict';

/**
 * Finalization Checklist
 *
 * Provides pipeline finalization steps, detection logic, and
 * spawn prompt generation for finalization subagents.
 *
 * @module finalization-checklist
 */

const FINALIZATION_STEPS = [
  'pnpm lint:fix',
  'pnpm format',
  'pnpm test',
  'git status review',
  'git commit with conventional message',
];

/**
 * Determines if a finalization subagent phase is required based on the current
 * pipeline state.
 *
 * @param {object} pipelineState - Current pipeline state
 * @param {boolean} [pipelineState.allPhasesComplete] - True when all implementation phases done
 * @param {string[]} [pipelineState.completedPhases] - List of completed phase names
 * @param {boolean} [pipelineState.finalizationDone] - True if finalization already ran
 * @returns {boolean} True if finalization is required
 */
function isFinalizationRequired(pipelineState) {
  if (!pipelineState || typeof pipelineState !== 'object') return false;

  // If finalization already done, not required
  if (pipelineState.finalizationDone === true) return false;

  // If all phases complete and finalization not yet done, it's required
  if (pipelineState.allPhasesComplete === true) return true;

  // If completed phases include devops but not finalization, it's required
  const completedPhases = Array.isArray(pipelineState.completedPhases)
    ? pipelineState.completedPhases
    : [];
  const hasImplementationPhases = completedPhases.some(phase =>
    ['implement', 'devops', 'deploy', 'review'].includes(phase.toLowerCase())
  );
  const hasFinalization = completedPhases.some(phase =>
    ['finalization', 'finalize'].includes(phase.toLowerCase())
  );

  return hasImplementationPhases && !hasFinalization;
}

/**
 * Returns the checklist prompt text for spawning finalization subagents.
 * This can be included in spawn prompts to guide finalization agents.
 *
 * @returns {string} Finalization checklist prompt
 */
function getFinalizationPrompt() {
  return [
    '## Finalization Checklist',
    '',
    'You are running the finalization phase. Complete ALL steps before marking complete:',
    '',
    ...FINALIZATION_STEPS.map((step, i) => `${i + 1}. \`${step}\``),
    '',
    'All commands must pass with zero errors. Report pass/fail for each step.',
    'Only then call TaskUpdate({ status: "completed" }).',
  ].join('\n');
}

module.exports = {
  FINALIZATION_STEPS,
  isFinalizationRequired,
  getFinalizationPrompt,
};
