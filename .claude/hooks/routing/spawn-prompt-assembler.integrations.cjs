'use strict';

/**
 * Feature-flagged integrations for spawn-prompt-assembler.
 * Extracted to stay within max-lines budget for the core module.
 * @module spawn-prompt-assembler.integrations
 */

/** Feature-flagged: advisory readiness gate for developer spawns. */
function checkDeveloperReadiness(agentType, basePrompt) {
  if (process.env.READINESS_GATE !== 'true' || agentType !== 'developer') return;
  try {
    const { checkReadiness } = require('../../lib/utils/readiness-checker.cjs');
    const t = (basePrompt || '').toLowerCase();
    const r = checkReadiness({
      hasRequirements: /requirement|task|implement/.test(t),
      hasTechnicalDesign: /design|architecture|plan/.test(t),
      hasDependenciesResolved: true,
      hasTestStrategy: /test|verify|tdd/.test(t),
      hasAcceptanceCriteria: /accept|done when|criteria|expect/.test(t),
    });
    if (!r.ready) {
      const failed = r.gates.filter(g => !g.passed).map(g => g.name);
      process.stderr.write(`[readiness-gate] ADVISORY: Missing: ${failed.join(', ')}\n`);
    }
  } catch {
    /* fail-open */
  }
}

/** Feature-flagged: resolve $task-N.key output references in spawn prompts. */
function resolveTaskOutputReferences(prompt) {
  if (process.env.TASK_OUTPUT_CHAIN !== 'true') return prompt;
  if (!prompt || typeof prompt !== 'string' || !prompt.includes('$task-')) return prompt;
  try {
    return require('../../lib/orchestration/task-output-chain.cjs').resolveAllRefs(prompt);
  } catch {
    return prompt;
  }
}

module.exports = { checkDeveloperReadiness, resolveTaskOutputReferences };
