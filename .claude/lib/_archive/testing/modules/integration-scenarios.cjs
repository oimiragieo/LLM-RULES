/**
 * Integration Test Scenarios
 *
 * Defines predefined integration scenarios for SPEC-001 through SPEC-009.
 * Each scenario represents a realistic multi-feature workflow.
 *
 * SPEC-012: Multi-Feature Integration Testing
 */

/**
 * Scenario 1: Full Spec Flow
 *
 * Tests the complete spec creation pipeline:
 * Spec-Init (SPEC-001) → Progressive Disclosure (SPEC-009) → Track Metadata (SPEC-008) → Phase Verification (SPEC-004)
 *
 * @returns {object} Scenario definition
 */
function getFullSpecFlowScenario() {
  return {
    scenarioId: 'full-spec-flow',
    description: 'Complete spec creation workflow with adaptive questioning',
    steps: [
      {
        spec: 'SPEC-001',
        action: 'spec-init',
        description: 'Initialize new specification',
      },
      {
        spec: 'SPEC-009',
        action: 'progressive-disclosure',
        description: 'Adaptive questioning based on context',
      },
      {
        spec: 'SPEC-008',
        action: 'track-metadata',
        description: 'Create track metadata',
      },
      {
        spec: 'SPEC-004',
        action: 'phase-verification',
        description: 'Verify phase gate compliance',
      },
    ],
    expectedOutcome: {
      status: 'completed',
      specCreated: true,
      metadataCreated: true,
      phaseVerified: true,
    },
  };
}

/**
 * Scenario 2: Revert & Audit
 *
 * Tests workflow recovery:
 * Workflow Checkpointing (SPEC-003) → Smart Revert (SPEC-010) → Git Notes Audit (SPEC-002)
 *
 * @returns {object} Scenario definition
 */
function getRevertAuditScenario() {
  return {
    scenarioId: 'revert-audit',
    description: 'Workflow recovery with checkpointing and smart revert',
    steps: [
      {
        spec: 'SPEC-003',
        action: 'workflow-checkpointing',
        description: 'Create workflow checkpoint',
      },
      {
        spec: 'SPEC-010',
        action: 'smart-revert',
        description: 'Revert changes by task ID',
      },
      {
        spec: 'SPEC-002',
        action: 'git-notes-audit',
        description: 'Verify audit trail',
      },
    ],
    expectedOutcome: {
      status: 'completed',
      checkpointCreated: true,
      revertSuccessful: true,
      auditTrailComplete: true,
    },
  };
}

/**
 * Scenario 3: Brownfield Setup
 *
 * Tests project onboarding:
 * Brownfield Detection (SPEC-005) → Code Styleguides (SPEC-006) → Onboarding Orchestration
 *
 * @returns {object} Scenario definition
 */
function getBrownfieldSetupScenario() {
  return {
    scenarioId: 'brownfield-setup',
    description: 'Brownfield project detection and onboarding',
    steps: [
      {
        spec: 'SPEC-005',
        action: 'brownfield-detection',
        description: 'Detect project tech stack',
      },
      {
        spec: 'SPEC-006',
        action: 'code-styleguides',
        description: 'Auto-inject styleguides',
      },
      {
        spec: 'SPEC-001',
        action: 'onboarding-orchestration',
        description: 'Complete onboarding workflow',
      },
    ],
    expectedOutcome: {
      status: 'completed',
      techStackDetected: true,
      styleguidesInjected: true,
      onboardingComplete: true,
    },
  };
}

/**
 * Scenario 4: Complex Workflow
 *
 * Tests full integration of all 9 SPECs in realistic order:
 * SPEC-005 → SPEC-001 → SPEC-009 → SPEC-007 → SPEC-004 → SPEC-003 → SPEC-002 → SPEC-008 → SPEC-010
 *
 * @returns {object} Scenario definition
 */
function getComplexWorkflowScenario() {
  return {
    scenarioId: 'complex-workflow',
    description: 'All 9 SPECs working together in realistic workflow',
    steps: [
      {
        spec: 'SPEC-005',
        action: 'brownfield-detection',
        description: 'Detect project context',
      },
      {
        spec: 'SPEC-001',
        action: 'spec-init',
        description: 'Initialize specification',
      },
      {
        spec: 'SPEC-009',
        action: 'progressive-disclosure',
        description: 'Adaptive questioning',
      },
      {
        spec: 'SPEC-007',
        action: 'create-track-metadata',
        description: 'Create track metadata',
      },
      {
        spec: 'SPEC-004',
        action: 'phase-verification',
        description: 'Verify phase gate',
      },
      {
        spec: 'SPEC-003',
        action: 'workflow-checkpointing',
        description: 'Create checkpoint',
      },
      {
        spec: 'SPEC-002',
        action: 'git-notes-audit',
        description: 'Add audit trail',
      },
      {
        spec: 'SPEC-008',
        action: 'analytics-report',
        description: 'Generate analytics',
      },
      {
        spec: 'SPEC-010',
        action: 'smart-revert',
        description: 'Smart revert capability',
      },
    ],
    expectedOutcome: {
      status: 'completed',
      allSPECsExecuted: true,
      noStateContamination: true,
    },
  };
}

/**
 * Scenario 5: Error Recovery
 *
 * Tests failure handling and recovery:
 * SPEC-001 (success) → SPEC-009 (injected failure) → SPEC-003 (recovery)
 *
 * @returns {object} Scenario definition
 */
function getErrorRecoveryScenario() {
  return {
    scenarioId: 'error-recovery',
    description: 'Failure in one SPEC should not cascade to others',
    steps: [
      {
        spec: 'SPEC-001',
        action: 'spec-init',
        description: 'Initialize spec (should succeed)',
      },
      {
        spec: 'SPEC-009',
        action: 'progressive-disclosure',
        description: 'Adaptive questioning (simulated failure)',
      },
      {
        spec: 'SPEC-003',
        action: 'workflow-checkpointing',
        description: 'Create checkpoint (should still work)',
      },
    ],
    expectedOutcome: {
      status: 'completed',
      isolatedFailure: true,
      recoverySuccessful: true,
    },
    continueOnFailure: true, // Continue even if SPEC-009 fails
  };
}

/**
 * Get all predefined scenarios
 *
 * @returns {Array<object>} Array of all scenario definitions
 */
function getAllScenarios() {
  return [
    getFullSpecFlowScenario(),
    getRevertAuditScenario(),
    getBrownfieldSetupScenario(),
    getComplexWorkflowScenario(),
    getErrorRecoveryScenario(),
  ];
}

/**
 * Load scenarios into a test framework
 *
 * @param {object} framework - IntegrationTestFramework instance
 * @returns {number} Number of scenarios loaded
 */
function loadScenariosIntoFramework(framework) {
  const scenarios = getAllScenarios();
  let count = 0;

  for (const scenario of scenarios) {
    framework.addScenario(scenario.scenarioId, scenario.steps, scenario.expectedOutcome);
    count++;
  }

  return count;
}

module.exports = {
  getFullSpecFlowScenario,
  getRevertAuditScenario,
  getBrownfieldSetupScenario,
  getComplexWorkflowScenario,
  getErrorRecoveryScenario,
  getAllScenarios,
  loadScenariosIntoFramework,
};
