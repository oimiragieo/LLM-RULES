'use strict';

const path = require('path');
const { ArtifactGraph } = require('./artifact-graph.cjs');

/**
 * Integration task generation logic for artifact types
 */
const INTEGRATION_RULES = {
  skill: [
    {
      gapType: 'catalog-entry',
      priority: 'must-have',
      taskSubject: (name) => `Add ${name} to skill-catalog.md`,
      taskAgent: 'technical-writer',
      taskCreator: null,
      taskPriority: 'P1'
    },
    {
      gapType: 'agent-assignment',
      priority: 'must-have',
      taskSubject: (name) => `Assign ${name} skill to relevant agent`,
      taskAgent: 'agent-creator',
      taskCreator: 'agent-creator',
      taskPriority: 'P1'
    },
    {
      gapType: 'enforcement-hook',
      priority: 'should-have',
      taskSubject: (name) => `Create enforcement hook for ${name}`,
      taskAgent: 'hook-creator',
      taskCreator: 'hook-creator',
      taskPriority: 'P2'
    }
  ],
  agent: [
    {
      gapType: 'registry-entry',
      priority: 'must-have',
      taskSubject: (name) => `Add ${name} to agent-registry.json`,
      taskAgent: 'technical-writer',
      taskCreator: null,
      taskPriority: 'P1'
    },
    {
      gapType: 'routing-keywords',
      priority: 'must-have',
      taskSubject: (name) => `Add routing keywords for ${name}`,
      taskAgent: 'router',
      taskCreator: null,
      taskPriority: 'P1'
    },
    {
      gapType: 'claude-md-entry',
      priority: 'should-have',
      taskSubject: (name) => `Update CLAUDE.md routing table for ${name}`,
      taskAgent: 'technical-writer',
      taskCreator: null,
      taskPriority: 'P2'
    }
  ],
  hook: [
    {
      gapType: 'settings-registration',
      priority: 'must-have',
      taskSubject: (name) => `Register ${name} hook in settings.json`,
      taskAgent: 'devops',
      taskCreator: null,
      taskPriority: 'P1'
    },
    {
      gapType: 'docs-entry',
      priority: 'should-have',
      taskSubject: (name) => `Document ${name} in @ENFORCEMENT_HOOKS.md`,
      taskAgent: 'technical-writer',
      taskCreator: null,
      taskPriority: 'P2'
    }
  ],
  workflow: [
    {
      gapType: 'registry-entry',
      priority: 'must-have',
      taskSubject: (name) => `Add ${name} to workflow registry`,
      taskAgent: 'technical-writer',
      taskCreator: null,
      taskPriority: 'P1'
    },
    {
      gapType: 'agent-mapping',
      priority: 'must-have',
      taskSubject: (name) => `Add agent mapping for ${name} workflow`,
      taskAgent: 'workflow-creator',
      taskCreator: 'workflow-creator',
      taskPriority: 'P1'
    }
  ],
  template: [
    {
      gapType: 'catalog-entry',
      priority: 'must-have',
      taskSubject: (name) => `Add ${name} to template-catalog.md`,
      taskAgent: 'technical-writer',
      taskCreator: null,
      taskPriority: 'P1'
    }
  ],
  schema: [
    {
      gapType: 'catalog-entry',
      priority: 'must-have',
      taskSubject: (name) => `Add ${name} to schema-catalog.md`,
      taskAgent: 'technical-writer',
      taskCreator: null,
      taskPriority: 'P1'
    }
  ]
};

/**
 * Map graph edge types to gap types
 */
const EDGE_TO_GAP_MAP = {
  skill: {
    references: 'catalog-entry',
    'assigned-to': 'agent-assignment',
    'enforced-by': 'enforcement-hook'
  },
  agent: {
    references: 'registry-entry',
    // routing-keywords is file-based, not edge-based
  },
  hook: {
    // settings-registration is file-based, not edge-based
    references: 'docs-entry'
  },
  workflow: {
    references: 'registry-entry',
    // agent-mapping is file-based
  },
  template: {
    references: 'catalog-entry'
  },
  schema: {
    references: 'catalog-entry'
  }
};

/**
 * Analyze the integration impact of an artifact change.
 *
 * @param {Object} options
 * @param {string} options.artifactId - e.g., 'skill:rate-limiter'
 * @param {string} options.changeType - 'created' | 'updated' | 'deleted'
 * @param {string} options.graphPath - path to artifact-graph.json
 * @returns {Object} impact analysis
 */
function analyzeImpact({ artifactId, changeType, graphPath }) {
  // Graceful degradation for missing graph
  let graph;
  try {
    graph = new ArtifactGraph(graphPath);
  } catch (_err) {
    return {
      artifactId,
      changeType,
      directDependents: [],
      missingIntegrations: [],
      proposedTasks: [],
      impactScore: 0
    };
  }

  const node = graph.getNode(artifactId);
  if (!node) {
    // Node not in graph - return empty results
    return {
      artifactId,
      changeType,
      directDependents: [],
      missingIntegrations: [],
      proposedTasks: [],
      impactScore: 0
    };
  }

  const artifactType = node.type;
  const artifactName = artifactId.split(':')[1];

  // Get direct dependents (edges pointing TO this node)
  const incomingEdges = graph.getEdges(artifactId, 'incoming');
  const outgoingEdges = graph.getEdges(artifactId, 'outgoing');

  // For updated/deleted: find dependents (nodes that use this artifact)
  const directDependents = [...new Set([
    ...incomingEdges.map(e => e.from),
    ...outgoingEdges.map(e => e.to)
  ])];

  let missingIntegrations = [];
  let proposedTasks = [];
  let impactScore = 0;

  if (changeType === 'created') {
    // Analyze missing integrations for created artifacts
    const integrationResult = _analyzeCreatedArtifact(artifactId, artifactType, artifactName, graph);
    missingIntegrations = integrationResult.missingIntegrations;
    proposedTasks = integrationResult.proposedTasks;
    impactScore = integrationResult.impactScore;

  } else if (changeType === 'updated') {
    // Propose review tasks for each dependent
    proposedTasks = directDependents.map(dependentId => ({
      subject: `Review ${dependentId} for compatibility with updated ${artifactName}`,
      agent: 'code-reviewer',
      priority: 'P2',
      creator: null
    }));
    impactScore = 0; // Updates don't have integration gaps

  } else if (changeType === 'deleted') {
    // Propose migration tasks for consumers
    proposedTasks = directDependents.map(dependentId => ({
      subject: `Migrate ${dependentId} away from deleted ${artifactName}`,
      agent: 'developer',
      priority: 'P1',
      creator: null
    }));
    impactScore = 0; // Deletions don't have integration gaps
  }

  return {
    artifactId,
    changeType,
    directDependents,
    missingIntegrations,
    proposedTasks,
    impactScore
  };
}

/**
 * Analyze integration gaps for a created artifact
 * @private
 */
function _analyzeCreatedArtifact(artifactId, artifactType, artifactName, graph) {
  const rules = INTEGRATION_RULES[artifactType] || [];
  const edgeMap = EDGE_TO_GAP_MAP[artifactType] || {};
  const outgoingEdges = graph.getEdges(artifactId, 'outgoing');
  const incomingEdges = graph.getEdges(artifactId, 'incoming');

  const missingIntegrations = [];
  const proposedTasks = [];

  for (const rule of rules) {
    const { gapType, priority, taskSubject, taskAgent, taskCreator, taskPriority } = rule;

    // Check if this gap is satisfied
    let status = 'missing';

    // Check outgoing edges
    for (const [edgeType, mappedGapType] of Object.entries(edgeMap)) {
      if (mappedGapType === gapType) {
        const hasEdge = outgoingEdges.some(e => e.type === edgeType);
        if (hasEdge) {
          status = 'satisfied';
          break;
        }
      }
    }

    // Check incoming edges (for enforcement-hook)
    if (status === 'missing' && gapType === 'enforcement-hook') {
      const hasEnforcement = incomingEdges.some(e => e.type === 'enforced-by');
      if (hasEnforcement) {
        status = 'satisfied';
      }
    }

    // Special handling for file-based checks (always unknown from graph alone)
    if (['routing-keywords', 'settings-registration', 'agent-mapping', 'claude-md-entry'].includes(gapType)) {
      // These require file inspection, mark as unknown (treated as missing for now)
      status = 'missing';
    }

    missingIntegrations.push({
      type: gapType,
      target: null, // Could be enhanced to detect specific target
      priority,
      status
    });

    // Generate proposed task if missing
    if (status === 'missing') {
      proposedTasks.push({
        subject: taskSubject(artifactName),
        agent: taskAgent,
        priority: taskPriority,
        creator: taskCreator
      });
    }
  }

  // Calculate impact score
  const impactScore = _calculateImpactScore(missingIntegrations);

  return {
    missingIntegrations,
    proposedTasks,
    impactScore
  };
}

/**
 * Calculate impact score based on missing integrations
 * @private
 */
function _calculateImpactScore(missingIntegrations) {
  const mustHaveGaps = missingIntegrations.filter(
    m => m.priority === 'must-have' && m.status === 'missing'
  ).length;

  const shouldHaveGaps = missingIntegrations.filter(
    m => m.priority === 'should-have' && m.status === 'missing'
  ).length;

  const niceToHaveGaps = missingIntegrations.filter(
    m => m.priority === 'nice-to-have' && m.status === 'missing'
  ).length;

  const score = Math.min(1.0, mustHaveGaps * 0.3 + shouldHaveGaps * 0.1 + niceToHaveGaps * 0.05);
  return score;
}

/**
 * Batch analyze multiple artifacts (e.g., from queue).
 *
 * @param {Array<Object>} entries - Array of { artifactId, changeType }
 * @param {string} graphPath - path to artifact-graph.json
 * @returns {Object} { results: [...], summary: { total, fullyIntegrated, needsWork, avgScore } }
 */
function analyzeBatch(entries, graphPath) {
  if (!entries || entries.length === 0) {
    return {
      results: [],
      summary: {
        total: 0,
        fullyIntegrated: 0,
        needsWork: 0,
        avgScore: 0
      }
    };
  }

  const results = entries.map(entry =>
    analyzeImpact({
      artifactId: entry.artifactId,
      changeType: entry.changeType,
      graphPath
    })
  );

  const total = results.length;
  const fullyIntegrated = results.filter(r => r.impactScore === 0).length;
  const needsWork = total - fullyIntegrated;
  const avgScore = total > 0
    ? results.reduce((sum, r) => sum + r.impactScore, 0) / total
    : 0;

  return {
    results,
    summary: {
      total,
      fullyIntegrated,
      needsWork,
      avgScore
    }
  };
}

/**
 * Generate a human-readable integration report.
 *
 * @param {Object} impactResult - Result from analyzeImpact()
 * @returns {string} Markdown string
 */
function generateReport(impactResult) {
  const { artifactId, changeType, missingIntegrations, proposedTasks, impactScore } = impactResult;

  let report = `## Integration Impact: ${artifactId} (${changeType})\n\n`;

  // Impact score
  const scoreLabel = impactScore === 0 ? 'fully integrated' : 'needs integration';
  report += `**Impact Score:** ${impactScore.toFixed(1)} / 1.0 (${scoreLabel})\n\n`;

  // Missing integrations
  report += `### Missing Integrations\n`;
  if (missingIntegrations.length === 0 || missingIntegrations.every(m => m.status === 'satisfied')) {
    report += `None - artifact is fully integrated.\n\n`;
  } else {
    report += `| # | Integration | Priority | Status |\n`;
    report += `|---|-------------|----------|--------|\n`;
    let index = 1;
    for (const gap of missingIntegrations) {
      if (gap.status === 'missing') {
        report += `| ${index++} | ${gap.type.replace(/-/g, ' ')} | ${gap.priority} | ${gap.status} |\n`;
      }
    }
    report += `\n`;
  }

  // Proposed tasks
  report += `### Proposed Tasks (ordered by priority)\n`;
  if (proposedTasks.length === 0) {
    report += `None - no integration tasks needed.\n\n`;
  } else {
    // Sort by priority (P1 before P2)
    const sortedTasks = [...proposedTasks].sort((a, b) => a.priority.localeCompare(b.priority));
    let index = 1;
    for (const task of sortedTasks) {
      report += `${index++}. **[${task.priority}]** ${task.subject}\n`;
    }
    report += `\n`;
  }

  return report;
}

module.exports = { analyzeImpact, analyzeBatch, generateReport };
