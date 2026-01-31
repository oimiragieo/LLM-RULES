/**
 * Feature Interaction Validator
 *
 * Validates bidirectional interactions between SPEC features.
 * Ensures no state contamination and metadata consistency.
 *
 * SPEC-012: Multi-Feature Integration Testing
 */

/**
 * Validate interaction between two SPEC features
 *
 * @param {string} spec1 - First SPEC identifier (e.g., 'SPEC-001')
 * @param {string} spec2 - Second SPEC identifier (e.g., 'SPEC-002')
 * @param {object} testData - Test data for validation
 * @returns {object} Validation result with {valid, issues}
 */
function validateFeaturePair(spec1, spec2, testData = {}) {
  if (!spec1 || !spec2) {
    throw new Error('Both spec1 and spec2 must be provided');
  }

  const issues = [];

  // Check for known interaction patterns
  const interactionKey = `${spec1}_${spec2}`;
  const interactionValidator = getInteractionValidator(interactionKey);

  if (interactionValidator) {
    const result = interactionValidator(testData);
    if (!result.valid) {
      issues.push(...result.issues);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    spec1,
    spec2,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Get interaction validator for a specific SPEC pair
 *
 * @param {string} interactionKey - Key for the interaction (e.g., 'SPEC-001_SPEC-002')
 * @returns {Function|null} Validator function or null if no validator exists
 * @private
 */
function getInteractionValidator(interactionKey) {
  const validators = {
    'SPEC-001_SPEC-002': validateSpecInitGitNotes,
    'SPEC-001_SPEC-007': validateSpecInitMetadata,
    'SPEC-001_SPEC-009': validateSpecInitAdaptive,
    'SPEC-002_SPEC-010': validateGitNotesRevert,
    'SPEC-003_SPEC-004': validateCheckpointPhaseGate,
    'SPEC-005_SPEC-006': validateBrownfieldStyleguides,
    'SPEC-005_SPEC-009': validateBrownfieldAdaptive,
    'SPEC-007_SPEC-008': validateMetadataAnalytics,
  };

  return validators[interactionKey] || null;
}

// ============================================================================
// Individual Interaction Validators
// ============================================================================

function validateSpecInitGitNotes(testData) {
  const issues = [];
  // SPEC-001 creates spec, SPEC-002 should add git notes
  if (!testData.gitNotesCreated) {
    issues.push('Git notes not created after spec initialization');
  }
  return { valid: issues.length === 0, issues };
}

function validateSpecInitMetadata(testData) {
  const issues = [];
  // SPEC-001 creates spec, SPEC-007 should create track metadata
  if (!testData.trackMetadataCreated) {
    issues.push('Track metadata not created after spec initialization');
  }
  if (!testData.trackId) {
    issues.push('Track ID missing in metadata');
  }
  return { valid: issues.length === 0, issues };
}

function validateSpecInitAdaptive(testData) {
  const issues = [];
  // SPEC-001 invokes SPEC-009 for progressive disclosure
  if (!testData.adaptiveQuestioningUsed) {
    issues.push('Adaptive questioning not used during spec-init');
  }
  if (testData.questionsAsked > 10) {
    issues.push(`Too many questions asked (${testData.questionsAsked}), adaptive should skip more`);
  }
  return { valid: issues.length === 0, issues };
}

function validateGitNotesRevert(testData) {
  const issues = [];
  // SPEC-002 provides notes, SPEC-010 uses them for smart revert
  if (!testData.gitNotesPresent) {
    issues.push('Git notes not present for smart revert');
  }
  if (!testData.taskIdInNotes) {
    issues.push('Task ID not found in git notes');
  }
  return { valid: issues.length === 0, issues };
}

function validateCheckpointPhaseGate(testData) {
  const issues = [];
  // SPEC-004 must pass before SPEC-003 creates checkpoint
  if (testData.checkpointCreated && !testData.phaseGatePassed) {
    issues.push('Checkpoint created before phase gate approval');
  }
  return { valid: issues.length === 0, issues };
}

function validateBrownfieldStyleguides(testData) {
  const issues = [];
  // SPEC-005 detects tech stack, SPEC-006 selects styleguides
  if (!testData.techStackDetected) {
    issues.push('Tech stack not detected by brownfield');
  }
  if (!testData.styleguidesSelected) {
    issues.push('Styleguides not selected based on tech stack');
  }
  return { valid: issues.length === 0, issues };
}

function validateBrownfieldAdaptive(testData) {
  const issues = [];
  // SPEC-005 provides context, SPEC-009 uses it to skip questions
  if (!testData.brownfieldContextUsed) {
    issues.push('Brownfield context not used by adaptive questioning');
  }
  if (testData.questionsSkipped === 0 && testData.techStackDetected) {
    issues.push('No questions skipped despite tech stack being detected');
  }
  return { valid: issues.length === 0, issues };
}

function validateMetadataAnalytics(testData) {
  const issues = [];
  // SPEC-007 provides metadata, SPEC-008 queries it
  if (!testData.metadataExists) {
    issues.push('Metadata does not exist for analytics query');
  }
  if (testData.analyticsQueryTime > 500) {
    issues.push(`Analytics query too slow (${testData.analyticsQueryTime}ms > 500ms target)`);
  }
  return { valid: issues.length === 0, issues };
}

// ============================================================================
// State Contamination Detection
// ============================================================================

/**
 * Detect state contamination between features
 *
 * @param {object} beforeState - State before feature execution
 * @param {object} afterState - State after feature execution
 * @param {string} modifiedSPEC - SPEC that modified state
 * @returns {object} Contamination result with {contaminated, differences}
 */
function detectStateContamination(beforeState, afterState, modifiedSPEC) {
  if (!beforeState || !afterState || !modifiedSPEC) {
    throw new Error('beforeState, afterState, and modifiedSPEC are required');
  }

  const differences = [];
  const allowedKeys = getAllowedStateKeys(modifiedSPEC);

  // Check for unexpected state modifications
  for (const key of Object.keys(afterState)) {
    if (!Object.prototype.hasOwnProperty.call(beforeState, key)) {
      // New key added
      if (!allowedKeys.includes(key)) {
        differences.push({
          type: 'added',
          key,
          value: afterState[key],
          reason: `${modifiedSPEC} added unexpected key`,
        });
      }
    } else if (beforeState[key] !== afterState[key]) {
      // Existing key modified
      if (!allowedKeys.includes(key)) {
        differences.push({
          type: 'modified',
          key,
          before: beforeState[key],
          after: afterState[key],
          reason: `${modifiedSPEC} modified unexpected key`,
        });
      }
    }
  }

  return {
    contaminated: differences.length > 0,
    differences,
    modifiedSPEC,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Get allowed state keys for a SPEC
 *
 * @param {string} spec - SPEC identifier
 * @returns {Array<string>} Array of allowed state keys
 * @private
 */
function getAllowedStateKeys(spec) {
  const allowedKeys = {
    'SPEC-001': ['spec', 'trackId', 'specPath'],
    'SPEC-002': ['gitNotes', 'commitHash', 'auditTrail'],
    'SPEC-003': ['workflowState', 'checkpoint', 'currentPhase'],
    'SPEC-004': ['phaseStatus', 'gateApproval', 'verificationResult'],
    'SPEC-005': ['techStack', 'brownfieldContext', 'detectionConfidence'],
    'SPEC-006': ['styleguides', 'styleConfig'],
    'SPEC-007': ['trackMetadata', 'metadataPath'],
    'SPEC-008': ['analyticsReport', 'metrics'],
    'SPEC-009': ['adaptiveContext', 'questionsAsked', 'questionsSkipped'],
    'SPEC-010': ['revertResult', 'revertedCommits'],
  };

  return allowedKeys[spec] || [];
}

// ============================================================================
// Metadata Consistency Validation
// ============================================================================

/**
 * Validate metadata consistency across features
 *
 * @param {object} metadata - Metadata object to validate
 * @returns {object} Validation result with {consistent, inconsistencies}
 */
function validateMetadataConsistency(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    throw new Error('metadata must be an object');
  }

  const inconsistencies = [];

  // Check trackId consistency
  if (metadata.trackId) {
    const trackIdPattern = /^[a-z0-9_-]+_[0-9]{8}$/;
    if (!trackIdPattern.test(metadata.trackId)) {
      inconsistencies.push({
        field: 'trackId',
        issue: 'Invalid trackId format',
        expected: '<name>_<YYYYMMDD>',
        actual: metadata.trackId,
      });
    }
  }

  // Check timestamp consistency (all timestamps should be ISO 8601)
  const timestampFields = ['created_at', 'updated_at', 'startedAt', 'completedAt'];
  for (const field of timestampFields) {
    if (metadata[field]) {
      const iso8601Pattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
      if (!iso8601Pattern.test(metadata[field])) {
        inconsistencies.push({
          field,
          issue: 'Invalid timestamp format',
          expected: 'ISO 8601 (YYYY-MM-DDTHH:mm:ss)',
          actual: metadata[field],
        });
      }
    }
  }

  // Check effort tracking consistency
  if (metadata.estimatedEffort && metadata.actualEffort) {
    const estTotal = metadata.estimatedEffort.days || 0;
    const actTotal = metadata.actualEffort.days || 0;

    if (actTotal > estTotal * 3) {
      inconsistencies.push({
        field: 'effort',
        issue: 'Actual effort significantly exceeds estimate',
        expected: `<${estTotal * 3} days`,
        actual: `${actTotal} days`,
      });
    }
  }

  return {
    consistent: inconsistencies.length === 0,
    inconsistencies,
    checkedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Memory Boundary Validation
// ============================================================================

/**
 * Validate memory boundaries (no context leakage)
 *
 * @param {object} memoryBefore - Memory state before operation
 * @param {object} memoryAfter - Memory state after operation
 * @returns {object} Validation result with {withinBounds, leaks}
 */
function validateMemoryBoundaries(memoryBefore, memoryAfter) {
  if (!memoryBefore || !memoryAfter) {
    throw new Error('memoryBefore and memoryAfter are required');
  }

  const leaks = [];
  const heapDelta = (memoryAfter.heapUsed - memoryBefore.heapUsed) / 1024 / 1024; // MB
  const externalDelta = (memoryAfter.external - memoryBefore.external) / 1024 / 1024; // MB

  // Check for memory leaks (>50MB growth)
  if (heapDelta > 50) {
    leaks.push({
      type: 'heap',
      growth: `${heapDelta.toFixed(2)}MB`,
      threshold: '50MB',
      severity: 'warning',
    });
  }

  // Check for external memory leaks
  if (externalDelta > 100) {
    leaks.push({
      type: 'external',
      growth: `${externalDelta.toFixed(2)}MB`,
      threshold: '100MB',
      severity: 'warning',
    });
  }

  // Check for total memory threshold (200MB)
  const totalMemory = memoryAfter.heapUsed / 1024 / 1024;
  if (totalMemory > 200) {
    leaks.push({
      type: 'total',
      usage: `${totalMemory.toFixed(2)}MB`,
      threshold: '200MB',
      severity: 'error',
    });
  }

  return {
    withinBounds: leaks.length === 0,
    leaks,
    heapDelta: `${heapDelta.toFixed(2)}MB`,
    externalDelta: `${externalDelta.toFixed(2)}MB`,
    checkedAt: new Date().toISOString(),
  };
}

module.exports = {
  validateFeaturePair,
  detectStateContamination,
  validateMetadataConsistency,
  validateMemoryBoundaries,
};
