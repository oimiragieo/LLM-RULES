'use strict';

const fs = require('fs');
const path = require('path');

const { PROJECT_ROOT } = require('../utils/project-root.cjs');

const AGENT_SKILL_MATRIX_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'config',
  'agent-skill-matrix.json'
);
const SKILL_INDEX_PATH = path.join(PROJECT_ROOT, '.claude', 'config', 'skill-index.json');

/**
 * Load skill matrix + index for tool aggregation.
 * @returns {{ matrix: Object, skillIndex: Object }}
 */
function loadAgentSkillMatrixAndSkillIndex() {
  let matrix = { agents: {} };
  let skillIndex = { skills: {} };
  try {
    if (fs.existsSync(AGENT_SKILL_MATRIX_PATH)) {
      matrix = JSON.parse(fs.readFileSync(AGENT_SKILL_MATRIX_PATH, 'utf8'));
    }
  } catch (_error) {
    // ignore bad/partial matrix file
  }
  try {
    if (fs.existsSync(SKILL_INDEX_PATH)) {
      skillIndex = JSON.parse(fs.readFileSync(SKILL_INDEX_PATH, 'utf8'));
    }
  } catch (_error) {
    // ignore bad/partial index file
  }
  return { matrix, skillIndex };
}

/**
 * Build possible skill index keys for a skill name.
 * @param {string} skillName
 * @returns {string[]}
 */
function getSkillEntryVariants(skillName) {
  const variants = new Set();
  if (typeof skillName !== 'string' || skillName.length === 0) {
    return [];
  }
  variants.add(skillName);
  if (skillName.startsWith('creators/')) {
    const parts = skillName.split('/');
    variants.add(parts[parts.length - 1]);
  } else {
    variants.add('creators/' + skillName);
  }
  return [...variants];
}

function collectMatrixSkillsForAgent(agentId, matrix) {
  const matrixSkills = new Set();
  const agents = matrix.agents || {};

  for (const categoryAgents of Object.values(agents)) {
    if (typeof categoryAgents !== 'object') continue;
    const config = categoryAgents[agentId];
    if (!config) continue;
    const primary = Array.isArray(config.primary) ? config.primary : [];
    const secondary = Array.isArray(config.secondary) ? config.secondary : [];
    const always = Array.isArray(config.always) ? config.always : [];
    const contextual =
      config.contextual && typeof config.contextual === 'object'
        ? Object.values(config.contextual).flat()
        : [];
    [...primary, ...secondary, ...always, ...contextual].forEach(s => matrixSkills.add(s));
  }

  return matrixSkills;
}

/**
 * Compute required tools union for agent's assigned skills.
 * @param {string} agentId
 * @param {Object} matrix
 * @param {Object} skillIndex
 * @returns {string[]}
 */
function getRequiredToolsUnionForAgent(agentId, matrix, skillIndex) {
  const skills = collectMatrixSkillsForAgent(agentId, matrix);
  const tools = new Set();
  const indexSkills = skillIndex.skills || {};
  for (const skillName of skills) {
    for (const variant of getSkillEntryVariants(skillName)) {
      const skill = indexSkills[variant];
      if (skill && Array.isArray(skill.requiredTools)) {
        skill.requiredTools.forEach(t => tools.add(t));
      }
    }
  }
  return [...tools];
}

/**
 * Consolidate assigned skills from frontmatter + matrix.
 * @param {string} agentId
 * @param {Object} matrix
 * @param {Object} skillIndex
 * @param {string[]} [frontmatterSkills]
 * @returns {string[]}
 */
function getAssignedSkillsForAgent(agentId, matrix, skillIndex, frontmatterSkills = []) {
  const assigned = [];
  const seen = new Set();
  const push = value => {
    if (typeof value !== 'string' || value.length === 0) return;
    if (seen.has(value)) return;
    seen.add(value);
    assigned.push(value);
  };

  for (const skill of Array.isArray(frontmatterSkills) ? frontmatterSkills : []) {
    push(skill);
  }

  const matrixSkills = collectMatrixSkillsForAgent(agentId, matrix);
  const indexSkills = skillIndex.skills || {};
  for (const skillName of matrixSkills) {
    const variants = getSkillEntryVariants(skillName);
    const resolved = variants.find(name => Object.prototype.hasOwnProperty.call(indexSkills, name));
    push(resolved || skillName);
  }

  return assigned;
}

module.exports = {
  loadAgentSkillMatrixAndSkillIndex,
  getSkillEntryVariants,
  getRequiredToolsUnionForAgent,
  getAssignedSkillsForAgent,
};
