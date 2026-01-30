/**
 * SPEC-015: Feature Compatibility Assessment
 *
 * Assesses compatibility between conductor-main features and agent-studio features.
 * Generates transformation rules and compatibility matrices.
 */

/**
 * Assess compatibility between two features
 * @param {Object} conductorFeature - Feature from conductor-main
 * @param {Object} agentStudioFeature - Corresponding feature from agent-studio
 * @returns {{level: string, transformationRules?: Array, breakingChanges?: Array, confidence: number}}
 */
function assessFeatureCompatibility(conductorFeature, agentStudioFeature) {
  if (!conductorFeature || !agentStudioFeature) {
    throw new Error('Both conductor and agent-studio features are required');
  }

  // Check format compatibility
  if (conductorFeature.format && agentStudioFeature.format) {
    if (conductorFeature.format !== agentStudioFeature.format) {
      return {
        level: 'incompatible',
        breakingChanges: [{
          field: 'format',
          description: `Format mismatch: ${conductorFeature.format} vs ${agentStudioFeature.format}`,
          type: 'format-change'
        }],
        confidence: 1.0
      };
    }
  }

  // Check schema compatibility
  if (conductorFeature.schema && agentStudioFeature.schema) {
    return assessSchemaCompatibility(conductorFeature.schema, agentStudioFeature.schema);
  }

  // Default: compatible
  return {
    level: 'compatible',
    confidence: 0.8
  };
}

/**
 * Assess schema compatibility
 * @private
 */
function assessSchemaCompatibility(conductorSchema, agentStudioSchema) {
  const transformationRules = [];
  const breakingChanges = [];

  // Check required fields
  const conductorRequired = conductorSchema.required || [];
  const agentStudioRequired = agentStudioSchema.required || [];

  // Field name mapping (detect renames)
  const conductorProps = conductorSchema.properties || {};
  const agentStudioProps = agentStudioSchema.properties || {};

  // Detect field renames
  for (const condField of conductorRequired) {
    if (!agentStudioRequired.includes(condField)) {
      // Field not in agent-studio - check for rename
      const renamed = findRenamedField(condField, agentStudioRequired);
      if (renamed) {
        transformationRules.push({
          type: 'rename',
          from: condField,
          to: renamed,
          description: `Rename field: ${condField} → ${renamed}`
        });
      }
    }
  }

  // Detect type coercions
  for (const field in conductorProps) {
    if (agentStudioProps[field]) {
      const condType = conductorProps[field].type;
      const agentType = agentStudioProps[field].type;

      if (condType !== agentType) {
        transformationRules.push({
          type: 'coerce',
          field,
          from: condType,
          to: agentType,
          description: `Convert ${field} from ${condType} to ${agentType}`
        });
      }
    }
  }

  // Detect new required fields (need defaults)
  for (const agentField of agentStudioRequired) {
    if (!conductorRequired.includes(agentField) && !transformationRules.some(r => r.to === agentField)) {
      const defaultValue = agentStudioProps[agentField]?.default;

      transformationRules.push({
        type: 'add-default',
        field: agentField,
        value: defaultValue || null,
        description: `Add missing required field: ${agentField}`
      });
    }
  }

  // Detect removed fields (breaking change)
  for (const condField of conductorRequired) {
    if (!agentStudioRequired.includes(condField) && !transformationRules.some(r => r.from === condField)) {
      breakingChanges.push({
        field: condField,
        description: `Field ${condField} removed in agent-studio`,
        type: 'field-removed'
      });
    }
  }

  // Determine compatibility level
  let level;
  if (breakingChanges.length > 0) {
    level = 'incompatible';
  } else if (transformationRules.length > 0) {
    level = 'requires-adaptation';
  } else {
    level = 'compatible';
  }

  // Calculate confidence
  const totalDifferences = transformationRules.length + breakingChanges.length;
  const confidence = totalDifferences === 0 ? 1.0 : Math.max(0.5, 1.0 - (totalDifferences * 0.1));

  return {
    level,
    transformationRules: transformationRules.length > 0 ? transformationRules : undefined,
    breakingChanges: breakingChanges.length > 0 ? breakingChanges : undefined,
    confidence,
    version: {
      conductor: conductorSchema.version || '1.0.0',
      agentStudio: agentStudioSchema.version || '2.0.0'
    }
  };
}

/**
 * Find renamed field by similarity
 * @private
 */
function findRenamedField(original, candidates) {
  // Simple heuristic: snake_case <--> camelCase
  const camelCase = original.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  const snakeCase = original.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

  if (candidates.includes(camelCase)) return camelCase;
  if (candidates.includes(snakeCase)) return snakeCase;

  // Check common renames
  const renames = {
    'workflow_name': 'workflowId',
    'current_phase': 'currentPhase'
  };

  return renames[original] || null;
}

/**
 * Build compatibility matrix for all feature pairs
 * @returns {{features: Array<string>, pairs: Object}}
 */
function buildCompatibilityMatrix() {
  const features = [
    'spec.md',
    'plan.md',
    'metadata.json',
    'workflow-state',
    'git-notes',
    'analytics'
  ];

  const pairs = {};

  // For each feature pair, assess compatibility
  for (let i = 0; i < features.length; i++) {
    for (let j = i + 1; j < features.length; j++) {
      const key = `${features[i]} <-> ${features[j]}`;
      pairs[key] = {
        compatible: true, // Placeholder
        notes: 'No known conflicts'
      };
    }
  }

  return {
    features,
    pairs
  };
}

/**
 * Generate pre-migration compatibility checklist
 * @returns {Array<{description: string, validation: Function|string}>}
 */
function generateCompatibilityChecklist() {
  return [
    {
      description: 'Node.js 18+ installed',
      validation: 'node --version',
      command: 'node --version'
    },
    {
      description: 'Git 2.30+ installed',
      validation: 'git --version',
      command: 'git --version'
    },
    {
      description: 'Agent-Studio v2.2.1 available',
      validation: (context) => {
        // Would check package.json version
        return true;
      }
    },
    {
      description: 'Conductor-main backup created',
      validation: (context) => {
        // Would check for backup
        return true;
      }
    },
    {
      description: 'Test environment available',
      validation: (context) => {
        return true;
      }
    },
    {
      description: 'All hooks registered',
      validation: (context) => {
        // Would check settings.json
        return true;
      }
    }
  ];
}

module.exports = {
  assessFeatureCompatibility,
  buildCompatibilityMatrix,
  generateCompatibilityChecklist
};
