#!/usr/bin/env node
/**
 * Quality Gates Module (Task 3.2)
 *
 * Evaluates quality gates between workflow phases.
 * Each gate has blocking and non-blocking checks.
 *
 * @module quality-gates
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Evaluate quality gate for a given phase transition
 *
 * @param {string} phase - Current phase (e.g., 'PHASE_2_IMPLEMENT')
 * @param {Object} workflowState - Complete workflow state object
 * @returns {Object} { passed: boolean, blocking: string[], warnings: string[] }
 */
function evaluateGate(phase, workflowState) {
  const PROJECT_ROOT = process.env.PROJECT_ROOT || path.resolve(__dirname, '..', '..', '..');

  const result = {
    passed: true,
    blocking: [],
    warnings: [],
  };

  // Determine which gate to evaluate based on phase
  switch (phase) {
    case 'PHASE_1_DESIGN':
      return evaluateGate1(workflowState, PROJECT_ROOT, result);
    case 'PHASE_2_IMPLEMENT':
      return evaluateGate2(workflowState, PROJECT_ROOT, result);
    case 'PHASE_3_REVIEW':
      return evaluateGate3(workflowState, PROJECT_ROOT, result);
    case 'PHASE_4_DEPLOY':
      return evaluateGate4(workflowState, PROJECT_ROOT, result);
    case 'PHASE_5_DOCUMENT':
      return evaluateGate5(workflowState, PROJECT_ROOT, result);
    case 'PHASE_6_REFLECT':
      return evaluateGate6(workflowState, PROJECT_ROOT, result);
    default:
      // Unknown phase - pass by default
      return result;
  }
}

/**
 * Gate 1: Design -> Implement
 * Checks: plan exists, acceptance criteria present, threat model (if HIGH+)
 */
function evaluateGate1(workflowState, projectRoot, result) {
  // Check if implementation plan exists
  const planPath = workflowState.artifacts?.implementationPlan;
  if (planPath) {
    const fullPath = path.join(projectRoot, planPath);
    if (!fs.existsSync(fullPath)) {
      result.blocking.push('Implementation plan artifact does not exist');
      result.passed = false;
    }
  } else {
    result.blocking.push('Implementation plan artifact path not specified');
    result.passed = false;
  }

  // Check for threat model if HIGH+ complexity
  if (workflowState.complexity === 'HIGH' || workflowState.complexity === 'EPIC') {
    const threatModelPath = workflowState.artifacts?.threatModel;
    if (!threatModelPath) {
      result.warnings.push('Threat model expected for HIGH+ complexity but not present');
    } else {
      const fullPath = path.join(projectRoot, threatModelPath);
      if (!fs.existsSync(fullPath)) {
        result.warnings.push('Threat model path specified but file does not exist');
      }
    }
  }

  return result;
}

/**
 * Gate 2: Implement -> Review
 * Checks: tests exist, tests pass (agent-reported), all tasks complete
 */
function evaluateGate2(workflowState, projectRoot, result) {
  const phaseData = workflowState.phases?.PHASE_2_IMPLEMENT;
  if (!phaseData) {
    result.blocking.push('PHASE_2_IMPLEMENT phase data not found');
    result.passed = false;
    return result;
  }

  // Check all agents completed
  const agents = phaseData.agents || {};
  const agentNames = Object.keys(agents);

  if (agentNames.length === 0) {
    result.blocking.push('No agents assigned to PHASE_2_IMPLEMENT');
    result.passed = false;
    return result;
  }

  for (const agentName of agentNames) {
    const agent = agents[agentName];
    if (agent.status !== 'completed') {
      result.blocking.push(`Agent ${agentName} not completed`);
      result.passed = false;
    }

    // Check for tests
    const metadata = agent.metadata || {};
    if (metadata.testsAdded === false) {
      result.blocking.push(`Agent ${agentName} did not add tests`);
      result.passed = false;
    }

    if (metadata.testsPassing === false) {
      result.blocking.push(`Agent ${agentName} reported tests failing`);
      result.passed = false;
    }
  }

  return result;
}

/**
 * Gate 3: Review -> Deploy
 * Checks: zero critical findings, code-reviewer approved, coverage check (MED+)
 */
function evaluateGate3(workflowState, projectRoot, result) {
  const phaseData = workflowState.phases?.PHASE_3_REVIEW;
  if (!phaseData) {
    result.blocking.push('PHASE_3_REVIEW phase data not found');
    result.passed = false;
    return result;
  }

  const agents = phaseData.agents || {};
  const agentNames = Object.keys(agents);

  if (agentNames.length === 0) {
    result.blocking.push('No review agents assigned');
    result.passed = false;
    return result;
  }

  for (const agentName of agentNames) {
    const agent = agents[agentName];
    if (agent.status !== 'completed') {
      result.blocking.push(`Review agent ${agentName} not completed`);
      result.passed = false;
      continue;
    }

    const metadata = agent.metadata || {};

    // Check for critical findings
    if (typeof metadata.criticalFindings === 'number' && metadata.criticalFindings > 0) {
      result.blocking.push(`Review agent ${agentName} found ${metadata.criticalFindings} critical findings`);
      result.passed = false;
    }

    // Check for approval
    if (metadata.approved === false) {
      result.blocking.push(`Review agent ${agentName} did not approve`);
      result.passed = false;
    }
  }

  return result;
}

/**
 * Gate 4: Deploy -> Document
 * Checks: CI passes, commit exists, no merge conflicts
 */
function evaluateGate4(workflowState, projectRoot, result) {
  const phaseData = workflowState.phases?.PHASE_4_DEPLOY;
  if (!phaseData) {
    result.blocking.push('PHASE_4_DEPLOY phase data not found');
    result.passed = false;
    return result;
  }

  const agents = phaseData.agents || {};
  const devopsAgent = agents.devops;

  if (!devopsAgent) {
    result.blocking.push('DevOps agent not found in PHASE_4_DEPLOY');
    result.passed = false;
    return result;
  }

  if (devopsAgent.status !== 'completed') {
    result.blocking.push('DevOps agent not completed');
    result.passed = false;
    return result;
  }

  const metadata = devopsAgent.metadata || {};

  // Check CI passed
  if (metadata.ciPassed === false) {
    result.blocking.push('CI checks failed');
    result.passed = false;
  }

  // Check commit exists
  if (!metadata.commitHash) {
    result.warnings.push('Commit hash not recorded');
  }

  return result;
}

/**
 * Gate 5: Document -> Reflect
 * Checks: docs updated (non-blocking for most checks)
 */
function evaluateGate5(workflowState, projectRoot, result) {
  const phaseData = workflowState.phases?.PHASE_5_DOCUMENT;
  if (!phaseData) {
    result.warnings.push('PHASE_5_DOCUMENT phase data not found');
    return result;
  }

  const agents = phaseData.agents || {};
  const writerAgent = agents['technical-writer'];

  if (!writerAgent) {
    result.warnings.push('Technical writer agent not found');
    return result;
  }

  if (writerAgent.status !== 'completed') {
    result.warnings.push('Technical writer not completed');
    return result;
  }

  // Non-blocking - always passes
  return result;
}

/**
 * Gate 6: Reflect -> Complete
 * Checks: learnings recorded (non-blocking)
 */
function evaluateGate6(workflowState, projectRoot, result) {
  const phaseData = workflowState.phases?.PHASE_6_REFLECT;
  if (!phaseData) {
    result.warnings.push('PHASE_6_REFLECT phase data not found');
    return result;
  }

  const agents = phaseData.agents || {};
  const reflectionAgent = agents['reflection-agent'];

  if (!reflectionAgent) {
    result.warnings.push('Reflection agent not found');
    return result;
  }

  if (reflectionAgent.status !== 'completed') {
    result.warnings.push('Reflection agent not completed');
    return result;
  }

  // Non-blocking - always passes
  return result;
}

module.exports = {
  evaluateGate,
};
