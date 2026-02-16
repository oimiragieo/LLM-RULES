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
const { readPhaseAdvanceFile } = require('../runtime/state-contracts.cjs');

/**
 * Default phase-advance signal file
 */
const DEFAULT_PHASE_ADVANCE_FILE = path.join(__dirname, '../../context/runtime/phase-advance.json');

/**
 * Domain specialist resolution map
 * Maps task context keywords to specialist agent types
 */
const DOMAIN_SPECIALIST_MAP = {
  // Language specialists (order matters: check specific frameworks before general languages)
  fastapi: 'fastapi-pro', // MUST be before 'python'
  django: 'python-pro',
  python: 'python-pro',
  typescript: 'typescript-pro',
  golang: 'golang-pro',
  'go ': 'golang-pro',
  rust: 'rust-pro',
  java: 'java-pro',
  'spring boot': 'java-pro',
  php: 'php-pro',
  laravel: 'php-pro',
  'node.js': 'nodejs-pro',
  express: 'nodejs-pro',
  nestjs: 'nodejs-pro',
  // Framework specialists (order matters: check longer phrases first)
  'react native': 'expo-mobile-developer', // MUST be before 'react'
  'next.js': 'nextjs-pro',
  nextjs: 'nextjs-pro',
  react: 'frontend-pro',
  vue: 'frontend-pro',
  frontend: 'frontend-pro',
  css: 'frontend-pro',
  svelte: 'sveltekit-expert',
  graphql: 'graphql-pro',
  // Mobile/Desktop
  ios: 'ios-pro',
  swift: 'ios-pro',
  android: 'android-pro',
  kotlin: 'android-pro',
  expo: 'expo-mobile-developer',
  tauri: 'tauri-desktop-developer',
  // Specialist domains
  'machine learning': 'ai-ml-specialist',
  'ml model': 'ai-ml-specialist',
  pytorch: 'ai-ml-specialist',
  tensorflow: 'ai-ml-specialist',
  'hugging face': 'ai-ml-specialist',
  solidity: 'web3-blockchain-expert',
  'smart contract': 'web3-blockchain-expert',
  blockchain: 'web3-blockchain-expert',
  defi: 'web3-blockchain-expert',
  nft: 'web3-blockchain-expert',
  game: 'gamedev-pro',
  unity: 'gamedev-pro',
  unreal: 'gamedev-pro',
  godot: 'gamedev-pro',
  'game engine': 'gamedev-pro',
  'data pipeline': 'data-engineer',
  etl: 'data-engineer',
  'apache spark': 'data-engineer',
  airflow: 'data-engineer',
  genomics: 'scientific-research-expert',
  proteomics: 'scientific-research-expert',
  cheminformatics: 'scientific-research-expert',
  'computational biology': 'scientific-research-expert',
};

/**
 * Resolve domain specialist based on task context
 * @param {string} taskContext - Task description or context string
 * @returns {string|null} Specialist agent type or null
 */
function resolveDomainSpecialist(taskContext) {
  if (!taskContext || typeof taskContext !== 'string') return null;
  const lower = taskContext.toLowerCase();
  for (const [keyword, specialist] of Object.entries(DOMAIN_SPECIALIST_MAP)) {
    if (lower.includes(keyword)) return specialist;
  }
  return null;
}

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
    return readPhaseAdvanceFile(filePath, null);
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
 * @param {object} taskContext - Optional task context for specialist resolution
 * @param {string} taskContext.taskDescription - Task description for domain specialist matching
 * @returns {string[]} Array of agent type names
 */
function getNextPhaseAgents(phase, complexity, taskContext) {
  // Normalize complexity for lookup
  const normalizedComplexity = complexity.toUpperCase();

  // Check if phase exists in routing table
  if (!PHASE_AGENT_ROUTING[phase]) {
    return [];
  }

  // Get agents for this phase and complexity
  const agentsByComplexity = PHASE_AGENT_ROUTING[phase];

  // Fallback to MEDIUM if complexity not found
  let agents = agentsByComplexity[normalizedComplexity] || agentsByComplexity.MEDIUM || [];

  // For PHASE_2_IMPLEMENT, try to resolve domain specialist
  if (phase === 'PHASE_2_IMPLEMENT' && taskContext && taskContext.taskDescription) {
    const specialist = resolveDomainSpecialist(taskContext.taskDescription);
    if (specialist) {
      // Replace developer with specialist
      agents = [specialist];
    }
  }

  return agents;
}

module.exports = {
  checkForAdvance,
  clearAdvance,
  getNextPhaseAgents,
  resolveDomainSpecialist,
  DOMAIN_SPECIALIST_MAP,
  DEFAULT_PHASE_ADVANCE_FILE,
};
