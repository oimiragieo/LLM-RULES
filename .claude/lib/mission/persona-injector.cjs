'use strict';

/**
 * Persona Injector
 *
 * Composes 3-layer worker system prompts for the mission engine.
 *
 * Layer 1: Base worker boilerplate (role definition, strict mandates from PRD)
 * Layer 2: Skill template loaded from .factory/skills/{skillName}/SKILL.md or fallback
 * Layer 3: Mission context from mission.md objectives + features.json node
 *
 * Token budget cap: configurable maxPromptChars (default 12000), truncates with [TRUNCATED] marker.
 * Returned persona object is Object.freeze()'d - immutable after creation.
 */

const fs = require('node:fs');
const path = require('node:path');

// Default maximum prompt characters
const DEFAULT_MAX_PROMPT_CHARS = 12000;

// Fallback string for missing skill templates
const SKILL_FALLBACK = 'Generic worker - no skill template available.';

/**
 * Base worker boilerplate from PRD
 * This is the Layer 1 content that never changes across workers.
 */
const BASE_WORKER_BOILERPLATE = `# Role Definition
You are the General Worker Agent. You do not ideate business logic. You do not re-plan the ecosystem architecture. You strictly execute the low-level implementation for the single feature node assigned to you in the features.json queue.

# Strict Mandates
1. COGNITIVE ENGINE: You MUST include your chain of thought inside \`<thought>\` XML blocks for every single operational step before acting.
2. SOURCE CONTROL: You MUST execute \`git status\` before touching files to ensure a clean worktree.
3. CONTRACTUAL EXIT: You MUST format your exit payload exactly matching the validation specification. If you fail to do so, your task will be rejected aggressively by the validation hook and your thread will be terminated.

# Operational Constraints
- Do not add complexity beyond what is specified
- Follow existing code patterns and conventions
- All changes must be atomic and reversible
- Run tests before declaring completion`;

/**
 * Load skill template from file system
 * Searches through provided paths in order until SKILL.md is found.
 *
 * @param {string} skillName - Name of the skill to load
 * @param {string[]} skillSearchPaths - Array of directories to search for skills
 * @returns {string} - Skill template content or fallback string
 */
function loadSkillTemplate(skillName, skillSearchPaths) {
  if (!skillName || !skillSearchPaths || skillSearchPaths.length === 0) {
    return SKILL_FALLBACK;
  }

  // Normalize skill name (remove any path components for security)
  const safeSkillName = path.basename(skillName);

  // Search each path in order
  for (const searchPath of skillSearchPaths) {
    const skillDir = path.join(searchPath, safeSkillName);
    const skillPath = path.join(skillDir, 'SKILL.md');

    try {
      const normalizedPath = path.normalize(skillPath);
      if (fs.existsSync(normalizedPath)) {
        const content = fs.readFileSync(normalizedPath, 'utf8');
        return content.trim();
      }
    } catch (_err) {
      // Continue to next path on error
      continue;
    }
  }

  // No skill found, return fallback
  return SKILL_FALLBACK;
}

/**
 * Parse mission.md to extract objectives using the mission-parser module
 *
 * @param {string} missionPath - Path to mission.md file
 * @returns {Object} - Parsed mission data with objectives array
 */
function parseMissionObjectives(missionPath) {
  // Use the existing mission-parser module
  const { parseMission } = require('./mission-parser.cjs');

  try {
    const normalizedPath = path.normalize(missionPath);
    return parseMission(normalizedPath);
  } catch (_err) {
    // Return default structure on error
    return {
      objectives: [],
      antiGoals: [],
      architecturalDecisions: [],
      rawContent: '',
    };
  }
}

/**
 * Build Layer 3: Mission Context section
 *
 * @param {Object} parsedMission - Parsed mission data from mission-parser
 * @param {Object} feature - Feature node from features.json
 * @returns {string} - Formatted mission context section
 */
function buildMissionContext(parsedMission, feature) {
  const lines = [];

  // Add objectives
  lines.push('### Objectives');
  if (parsedMission.objectives && parsedMission.objectives.length > 0) {
    for (const obj of parsedMission.objectives) {
      lines.push(`- ${obj}`);
    }
  } else {
    lines.push('[WARNING] No objectives found in mission.md');
  }
  lines.push('');

  // Add feature information
  lines.push('### Feature Assignment');
  lines.push(`**Feature ID:** ${feature.id || 'unknown'}`);
  lines.push(`**Description:** ${feature.description || 'No description provided'}`);
  lines.push('');

  // Add expected behaviors
  if (feature.expectedBehavior && feature.expectedBehavior.length > 0) {
    lines.push('### Expected Behavior');
    for (const behavior of feature.expectedBehavior) {
      lines.push(`- ${behavior}`);
    }
    lines.push('');
  }

  // Add verification steps
  if (feature.verificationSteps && feature.verificationSteps.length > 0) {
    lines.push('### Verification Steps');
    for (const step of feature.verificationSteps) {
      lines.push(`- ${step}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Compose the full 3-layer prompt
 *
 * @param {Object} options - Configuration options
 * @param {string} options.skillName - Name of the skill to load
 * @param {string[]} options.skillSearchPaths - Paths to search for skills
 * @param {string} options.missionPath - Path to mission.md
 * @param {Object} options.feature - Feature node from features.json
 * @param {number} [options.maxPromptChars] - Maximum prompt characters (default 12000)
 * @returns {Object} - Frozen persona object with prompt and metadata
 */
function composePersona(options) {
  const {
    skillName,
    skillSearchPaths,
    missionPath,
    feature,
    maxPromptChars = DEFAULT_MAX_PROMPT_CHARS,
  } = options;

  // Load skill template (Layer 2)
  const skillTemplate = loadSkillTemplate(skillName, skillSearchPaths);

  // Parse mission for objectives (Layer 3)
  const parsedMission = parseMissionObjectives(missionPath);

  // Build mission context
  const missionContext = buildMissionContext(parsedMission, feature || {});

  // Assemble all layers with delimiters
  const sections = [];

  // Layer 1: Base Worker Boilerplate
  sections.push('=== LAYER 1: BASE WORKER BOILERPLATE ===');
  sections.push(BASE_WORKER_BOILERPLATE);
  sections.push('');

  // Layer 2: Skill Template
  sections.push('=== LAYER 2: SKILL TEMPLATE ===');
  sections.push(`Skill: ${skillName || 'unknown'}`);
  sections.push('');
  sections.push(skillTemplate);
  sections.push('');

  // Layer 3: Mission Context
  sections.push('=== LAYER 3: MISSION CONTEXT ===');
  sections.push(missionContext);

  // Combine into full prompt
  let fullPrompt = sections.join('\n');

  // Track original length before truncation
  const originalLength = fullPrompt.length;

  // Apply token budget cap
  let truncated = false;
  if (fullPrompt.length > maxPromptChars) {
    // Truncate and add marker
    fullPrompt = fullPrompt.substring(0, maxPromptChars);
    // Ensure we end cleanly (not mid-line) and add marker
    const lastNewline = fullPrompt.lastIndexOf('\n');
    if (lastNewline > maxPromptChars - 100) {
      // If we have room, truncate at last newline for cleaner output
      fullPrompt = fullPrompt.substring(0, lastNewline);
    }
    fullPrompt += '\n\n[TRUNCATED]';
    truncated = true;
  }

  // Build persona object
  const persona = {
    prompt: fullPrompt,
    skillName: skillName || 'unknown',
    featureId: feature?.id || 'unknown',
    createdAt: new Date().toISOString(),
    layerCount: 3,
    truncated,
    originalLength,
  };

  // Freeze the persona object to make it immutable
  return Object.freeze(persona);
}

module.exports = {
  composePersona,
  loadSkillTemplate,
  buildMissionContext,
  BASE_WORKER_BOILERPLATE,
  SKILL_FALLBACK,
  DEFAULT_MAX_PROMPT_CHARS,
};
