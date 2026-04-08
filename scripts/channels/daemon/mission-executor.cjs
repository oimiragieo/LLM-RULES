/**
 * mission-executor.cjs — Mission-aware task executor for the channel daemon
 *
 * Wraps the existing TaskExecutor with Factory Droid-aligned features:
 * - Classifies coding requests via skill-router
 * - Builds mini feature specs from user requests
 * - Injects mission context into headless Claude sessions
 * - Captures structured handoff output
 * - Grades results against alignment rules
 *
 * Falls back to standard executor behavior for non-coding tasks.
 */
'use strict';

const path = require('node:path');
const { classify, getVerificationSteps } = require('./skill-router.cjs');
const { parseHandoff, writeHandoff, gradeHandoff } = require('./handoff-capture.cjs');

// Coding-specific system prompt (overrides task-executor-prompt.txt for coding tasks)
const CODING_TASK_PROMPT = path.join(__dirname, 'coding-task-prompt.txt');

// Channel handoffs storage directory
const DEFAULT_HANDOFFS_DIR = path.join(
  process.cwd(),
  '.claude',
  'context',
  'runtime',
  'channel-handoffs'
);

/**
 * Build a mini feature spec from a user request.
 *
 * @param {string} taskDescription - Raw user task description
 * @param {{ agentType: string, isCoding: boolean }} classification - From skill-router
 * @param {string} [projectRoot] - Project root directory
 * @returns {object} Feature spec aligned with feature.schema.json
 */
function buildFeatureSpec(taskDescription, classification, projectRoot) {
  const slug = taskDescription
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join('-');

  const id = `tg-${slug}-${Date.now().toString(36)}`;
  const verificationSteps = getVerificationSteps(classification.agentType);

  return {
    id,
    description: taskDescription,
    skillName: classification.agentType,
    preconditions: [],
    expectedBehavior: [`Task completed: ${taskDescription}`],
    verificationSteps,
    fulfills: [],
    milestone: 'telegram',
    status: 'pending',
    _meta: {
      source: 'telegram',
      agentType: classification.agentType,
      confidence: classification.confidence,
      projectRoot: projectRoot || process.cwd(),
    },
  };
}

/**
 * Build a mission-aware prompt for the headless Claude session.
 * Injects the feature spec as structured context.
 *
 * @param {string} taskDescription - Original user request
 * @param {object} featureSpec - Built feature spec
 * @param {string} [preResearchContext] - Optional pre-research context
 * @returns {string} Enhanced prompt for claude -p
 */
function buildMissionPrompt(taskDescription, featureSpec, preResearchContext) {
  const parts = [];

  parts.push('## Feature Spec\n');
  parts.push(`**ID:** ${featureSpec.id}`);
  parts.push(`**Agent Type:** ${featureSpec.skillName}`);
  parts.push(`**Description:** ${featureSpec.description}`);

  if (featureSpec.expectedBehavior.length > 0) {
    parts.push('\n**Expected Behavior:**');
    for (const b of featureSpec.expectedBehavior) {
      parts.push(`- ${b}`);
    }
  }

  if (featureSpec.verificationSteps.length > 0) {
    parts.push('\n**Verification Steps (MUST RUN ALL):**');
    for (const s of featureSpec.verificationSteps) {
      parts.push(`- \`${s}\``);
    }
  }

  if (preResearchContext) {
    parts.push('\n## Pre-Research Context\n');
    parts.push(preResearchContext);
  }

  parts.push('\n## Task\n');
  parts.push(taskDescription);

  return parts.join('\n');
}

/**
 * Create a mission-aware executor wrapper.
 *
 * @param {object} baseExecutor - The existing TaskExecutor instance
 * @param {object} [options] - Configuration options
 * @param {string} [options.handoffsDir] - Directory for handoff JSON files
 * @param {string} [options.projectRoot] - Project root directory
 * @returns {object} Mission executor with execute() method
 */
function createMissionExecutor(baseExecutor, options = {}) {
  const handoffsDir = options.handoffsDir || DEFAULT_HANDOFFS_DIR;
  const projectRoot = options.projectRoot || process.cwd();

  return {
    /**
     * Classify a task description.
     *
     * @param {string} taskDescription - User request
     * @returns {{ isCoding: boolean, agentType: string, confidence: string }}
     */
    classify(taskDescription) {
      return classify(taskDescription);
    },

    /**
     * Execute a coding task with mission awareness.
     * Returns a handle compatible with TaskPool.spawn().
     *
     * @param {string} taskDescription - User request
     * @param {string} [context] - Optional pre-gathered context
     * @returns {{ promise: Promise<object>, cancel: Function }}
     */
    executeAsync(taskDescription, context) {
      const classification = classify(taskDescription);
      const featureSpec = buildFeatureSpec(taskDescription, classification, projectRoot);
      const missionPrompt = buildMissionPrompt(taskDescription, featureSpec, context);

      // Use the base executor's async method but with coding prompt override
      const handle = baseExecutor._claudeAsync(missionPrompt, {
        model: baseExecutor.model || 'sonnet',
        maxTurns: 15,
        timeout: 300000,
        useWorkspace: true,
        projectRoot,
        appendSystemPromptFile: CODING_TASK_PROMPT,
      });

      const resultPromise = handle.promise.then(rawOutput => {
        // Parse handoff from output
        const { structured, handoff: handoffData } = parseHandoff(rawOutput || '');

        // Grade the result
        const gradeResult = gradeHandoff(handoffData, featureSpec);

        // Write handoff document
        let handoffPath = null;
        try {
          handoffPath = writeHandoff(handoffsDir, handoffData, featureSpec);
        } catch {
          // Non-fatal — handoff storage failed
        }

        return {
          rawOutput: rawOutput || '',
          handoff: handoffData,
          structured,
          grade: gradeResult,
          featureSpec,
          handoffPath,
        };
      });

      return {
        promise: resultPromise,
        cancel: handle.cancel || (() => {}),
      };
    },

    /**
     * Format a mission execution result for display in Telegram.
     *
     * @param {object} result - Result from executeAsync()
     * @returns {string} Formatted message for user
     */
    formatResult(result) {
      const { grade, handoff, structured } = result;
      const parts = [];

      // Grade header
      const gradeIcon = grade.passed ? (grade.grade === 'excellent' ? '🏆' : '✅') : '⚠️';
      parts.push(
        `${gradeIcon} Task Complete (Score: ${grade.score}/100 ${grade.grade.toUpperCase()})\n`
      );

      // Summary
      if (handoff.summary) {
        parts.push(handoff.summary);
      }

      // Files changed
      if (handoff.filesModified && handoff.filesModified.length > 0) {
        parts.push(`\nFiles: ${handoff.filesModified.slice(0, 5).join(', ')}`);
        if (handoff.filesModified.length > 5) {
          parts.push(`  (+${handoff.filesModified.length - 5} more)`);
        }
      }

      // Verification results
      const commands = handoff.commandsRun || [];
      if (commands.length > 0) {
        const passed = commands.filter(c => c.exitCode === 0).length;
        const failed = commands.filter(c => c.exitCode !== null && c.exitCode !== 0).length;
        parts.push(`\nVerification: ${passed} passed${failed > 0 ? `, ${failed} failed` : ''}`);
      }

      // Issues
      const issues = handoff.discoveredIssues || [];
      if (issues.length > 0) {
        const blockers = issues.filter(i => i.severity === 'blocking');
        const warnings = issues.filter(i => i.severity === 'non_blocking');
        if (blockers.length > 0) {
          parts.push(`\n⛔ ${blockers.length} blocking issue(s)`);
        }
        if (warnings.length > 0) {
          parts.push(`⚠️ ${warnings.length} non-blocking issue(s)`);
        }
      }

      if (!structured) {
        parts.push('\n(Unstructured output — handoff not emitted by agent)');
      }

      return parts.join('\n');
    },

    /**
     * Get the coding task prompt path (for external use by executor).
     * @returns {string}
     */
    getCodingPromptPath() {
      return CODING_TASK_PROMPT;
    },
  };
}

module.exports = {
  createMissionExecutor,
  buildFeatureSpec,
  buildMissionPrompt,
  CODING_TASK_PROMPT,
  DEFAULT_HANDOFFS_DIR,
};
