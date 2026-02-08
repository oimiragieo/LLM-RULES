/**
 * Phase-Advance Signal Reader (Task 3.3)
 * =======================================
 *
 * Reads phase-advance signals written by post-completion-chain hook
 * and provides Router utility functions for phase advancement.
 *
 * API:
 * - checkForAdvance(filePath?) - Read signal or return null
 * - clearAdvance(filePath?) - Delete the signal file
 * - getNextPhaseAgents(phase, complexity) - Get agent types for phase
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Default phase-advance signal file
 */
const DEFAULT_PHASE_ADVANCE_FILE = path.join(__dirname, '../../context/runtime/phase-advance.json');

/**
 * Agent routing table by phase
 * Maps workflow phases to agent types needed
 */
const PHASE_AGENT_ROUTING = {
  PHASE_1_DESIGN: {
    LOW: ['planner', 'architect'],
    MEDIUM: ['planner', 'architect'],
    HIGH: ['planner', 'architect', 'security-architect'],
    EPIC: ['planner', 'architect', 'security-architect'],
  },
  PHASE_2_IMPLEMENT: {
    // All complexities use developer (domain specialist added dynamically)
    LOW: ['developer'],
    MEDIUM: ['developer'],
    HIGH: ['developer'],
    EPIC: ['developer'],
  },
  PHASE_3_REVIEW: {
    LOW: ['code-reviewer', 'qa'],
    MEDIUM: ['code-reviewer', 'qa'],
    HIGH: ['code-reviewer', 'qa'],
    EPIC: ['code-reviewer', 'qa'],
  },
  PHASE_4_DEPLOY: {
    LOW: ['devops'],
    MEDIUM: ['devops'],
    HIGH: ['devops'],
    EPIC: ['devops'],
  },
  PHASE_5_DOCUMENT: {
    LOW: ['technical-writer'],
    MEDIUM: ['technical-writer'],
    HIGH: ['technical-writer'],
    EPIC: ['technical-writer'],
  },
  PHASE_6_REFLECT: {
    LOW: ['reflection-agent'],
    MEDIUM: ['reflection-agent'],
    HIGH: ['reflection-agent'],
    EPIC: ['reflection-agent'],
  },
};

/**
 * Check if a phase-advance signal exists and read it
 * @param {string} filePath - Optional custom file path
 * @returns {object|null} Signal object or null if no signal/corrupted
 */
function checkForAdvance(filePath = DEFAULT_PHASE_ADVANCE_FILE) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const signal = JSON.parse(content);
    return signal;
  } catch (_err) {
    // Corrupted file or invalid JSON
    return null;
  }
}

/**
 * Clear the phase-advance signal file
 * @param {string} filePath - Optional custom file path
 */
function clearAdvance(filePath = DEFAULT_PHASE_ADVANCE_FILE) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (_err) {
    // Ignore errors (file may have been deleted already)
  }
}

/**
 * Get the list of agent types needed for a given phase
 * @param {string} phase - Workflow phase (e.g., 'PHASE_2_IMPLEMENT')
 * @param {string} complexity - Complexity level (TRIVIAL|LOW|MEDIUM|HIGH|EPIC)
 * @returns {string[]} Array of agent type names
 */
function getNextPhaseAgents(phase, complexity) {
  // Normalize complexity for lookup
  const normalizedComplexity = complexity.toUpperCase();

  // Check if phase exists in routing table
  if (!PHASE_AGENT_ROUTING[phase]) {
    return [];
  }

  // Get agents for this phase and complexity
  const agentsByComplexity = PHASE_AGENT_ROUTING[phase];

  // Fallback to MEDIUM if complexity not found
  const agents = agentsByComplexity[normalizedComplexity] || agentsByComplexity.MEDIUM || [];

  return agents;
}

module.exports = {
  checkForAdvance,
  clearAdvance,
  getNextPhaseAgents,
  DEFAULT_PHASE_ADVANCE_FILE,
};
