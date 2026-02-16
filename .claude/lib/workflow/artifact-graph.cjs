'use strict';

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../utils/safe-json.cjs');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');

const DEFAULT_ARTIFACT_GRAPH_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'data',
  'artifact-graph.json'
);

/**
 * ArtifactGraph - CRUD operations and query API for artifact relationship graph
 *
 * Implements the artifact-graph.schema.json specification.
 * Provides graph operations, integration tracking, and impact analysis.
 */
class ArtifactGraph {
  /**
   * @param {string} graphPath - Path to artifact-graph.json file
   */
  constructor(graphPath) {
    this.graphPath = graphPath;
    this.graph = this._loadOrCreateGraph();
  }

  // === Private: Load/Create ===

  /**
   * Load graph from disk or create new empty graph
   * @private
   */
  _loadOrCreateGraph() {
    try {
      if (fs.existsSync(this.graphPath)) {
        const content = fs.readFileSync(this.graphPath, 'utf8');
        const parsed = safeParseJSON(content, null);
        if (
          parsed &&
          typeof parsed === 'object' &&
          !Array.isArray(parsed) &&
          parsed.nodes &&
          typeof parsed.nodes === 'object' &&
          !Array.isArray(parsed.nodes) &&
          Array.isArray(parsed.edges)
        ) {
          return parsed;
        }
      }
    } catch (_err) {
      // Fall through to create new graph
    }

    // Create new empty graph
    return {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      nodes: {},
      edges: [],
    };
  }

  /**
   * Validate node ID format (must be {type}:{name})
   * @private
   */
  _validateNodeId(id) {
    if (!id || typeof id !== 'string') return false;
    return /^[a-z-]+:[a-z0-9-]+$/i.test(id);
  }

  /**
   * Get integration checklist rules for artifact type
   * @private
   */
  _getIntegrationRules(type) {
    const rules = {
      skill: {
        mustHave: [
          { type: 'references', to: 'catalog:skill-catalog', description: 'Catalog entry' },
          {
            type: 'assigned-to',
            direction: 'outgoing',
            description: 'At least 1 agent assignment',
          },
        ],
        shouldHave: [
          { type: 'enforced-by', direction: 'incoming', description: 'Enforcement hook' },
          { type: 'invokes', direction: 'incoming', description: 'Workflow reference' },
        ],
      },
      agent: {
        mustHave: [
          { type: 'references', to: 'registry:agent-registry', description: 'Registry entry' },
          { description: 'Routing keywords (check routing-table.cjs)' },
        ],
        shouldHave: [
          { type: 'assigned-to', direction: 'incoming', description: 'Skills assigned' },
          { description: 'Model config in config.yaml' },
        ],
      },
      hook: {
        mustHave: [{ description: 'settings.json registration (special check)' }],
        shouldHave: [
          {
            type: 'references',
            to: 'catalog:enforcement-hooks',
            description: '@ENFORCEMENT_HOOKS.md entry',
          },
          { description: 'Agent awareness (documented in agent files)' },
        ],
      },
      workflow: {
        mustHave: [
          { type: 'references', to: 'registry:workflow-registry', description: 'Registry entry' },
          { description: 'Agent mapping (@WORKFLOW_AGENT_MAP.md)' },
        ],
        shouldHave: [
          {
            type: 'references',
            to: 'catalog:enterprise-workflows',
            description: '@ENTERPRISE_WORKFLOWS.md entry',
          },
        ],
      },
      template: {
        mustHave: [
          { type: 'references', to: 'catalog:template-catalog', description: 'Catalog entry' },
        ],
        shouldHave: [{ description: 'Agent/workflow consumer' }],
      },
      schema: {
        mustHave: [
          { type: 'references', to: 'catalog:schema-catalog', description: 'Catalog entry' },
        ],
        shouldHave: [{ description: 'Consumer wiring' }],
      },
    };

    return rules[type] || { mustHave: [], shouldHave: [] };
  }

  // === Node Operations ===

  /**
   * Add or update a node
   * @param {string} id - Node ID (format: {type}:{name})
   * @param {Object} nodeData - { type, path, created?, integrationStatus?, missingIntegrations?, metadata? }
   */
  addNode(id, nodeData) {
    if (!this._validateNodeId(id)) {
      return false;
    }

    const now = new Date().toISOString();
    const existingNode = this.graph.nodes[id];

    this.graph.nodes[id] = {
      type: nodeData.type,
      path: nodeData.path,
      created: existingNode?.created || nodeData.created || now,
      integrationStatus: nodeData.integrationStatus || 'created',
      ...(nodeData.missingIntegrations && { missingIntegrations: nodeData.missingIntegrations }),
      ...(nodeData.metadata && { metadata: nodeData.metadata }),
    };

    this.graph.lastUpdated = now;
    return true;
  }

  /**
   * Remove a node and all its edges
   * @param {string} id - Node ID
   */
  removeNode(id) {
    if (!this.graph.nodes[id]) {
      return false;
    }

    // Remove node
    delete this.graph.nodes[id];

    // Remove all edges to/from this node
    this.graph.edges = this.graph.edges.filter(edge => edge.from !== id && edge.to !== id);

    this.graph.lastUpdated = new Date().toISOString();
    return true;
  }

  /**
   * Get node by ID
   * @param {string} id - Node ID
   * @returns {Object|null} Node data with id included, or null if not found
   */
  getNode(id) {
    const node = this.graph.nodes[id];
    if (!node) return null;
    return { id, ...node };
  }

  /**
   * Get all nodes, optionally filtered by type
   * @param {string?} typeFilter - Optional type filter
   * @returns {Array<Object>} Array of nodes with id included
   */
  getAllNodes(typeFilter) {
    const nodes = Object.entries(this.graph.nodes).map(([id, data]) => ({
      id,
      ...data,
    }));

    if (typeFilter) {
      return nodes.filter(node => node.type === typeFilter);
    }

    return nodes;
  }

  // === Edge Operations ===

  /**
   * Add an edge between two nodes
   * @param {string} from - Source node ID
   * @param {string} to - Target node ID
   * @param {string} type - Edge type
   * @param {string} status - Edge status (default: 'active')
   */
  addEdge(from, to, type, status = 'active') {
    if (!this.graph.nodes[from] || !this.graph.nodes[to]) {
      return false;
    }

    // Check for duplicate edge
    const existingIndex = this.graph.edges.findIndex(
      edge => edge.from === from && edge.to === to && edge.type === type
    );

    if (existingIndex >= 0) {
      // Update existing edge
      this.graph.edges[existingIndex].status = status;
    } else {
      // Add new edge
      this.graph.edges.push({ from, to, type, status });
    }

    this.graph.lastUpdated = new Date().toISOString();
    return true;
  }

  /**
   * Remove a specific edge
   * @param {string} from - Source node ID
   * @param {string} to - Target node ID
   * @param {string} type - Edge type
   */
  removeEdge(from, to, type) {
    const initialLength = this.graph.edges.length;
    this.graph.edges = this.graph.edges.filter(
      edge => !(edge.from === from && edge.to === to && edge.type === type)
    );

    if (this.graph.edges.length < initialLength) {
      this.graph.lastUpdated = new Date().toISOString();
      return true;
    }

    return false;
  }

  /**
   * Get edges for a node
   * @param {string} nodeId - Node ID
   * @param {string} direction - 'outgoing' | 'incoming' | 'both' (default: 'both')
   * @returns {Array<Object>} Array of edges
   */
  getEdges(nodeId, direction = 'both') {
    if (!this.graph.nodes[nodeId]) {
      return [];
    }

    if (direction === 'outgoing') {
      return this.graph.edges.filter(edge => edge.from === nodeId);
    } else if (direction === 'incoming') {
      return this.graph.edges.filter(edge => edge.to === nodeId);
    } else {
      return this.graph.edges.filter(edge => edge.from === nodeId || edge.to === nodeId);
    }
  }

  // === Query Operations ===

  /**
   * Find related nodes through specific edge type and direction
   * @param {string} nodeId - Node ID
   * @param {string} edgeType - Edge type to follow
   * @param {string} direction - 'outgoing' | 'incoming' (default: 'outgoing')
   * @returns {Array<string>} Array of related node IDs
   */
  getRelated(nodeId, edgeType, direction = 'outgoing') {
    if (!this.graph.nodes[nodeId]) {
      return [];
    }

    const edges = this.getEdges(nodeId, direction);
    const related = edges
      .filter(edge => edge.type === edgeType)
      .map(edge => (direction === 'outgoing' ? edge.to : edge.from));

    return [...new Set(related)]; // Remove duplicates
  }

  /**
   * Return integration checklist with status for an artifact
   * @param {string} nodeId - Node ID
   * @returns {Array<Object>} Array of { item, required, status }
   */
  getMissingIntegrations(nodeId) {
    const node = this.getNode(nodeId);
    if (!node) return [];

    const rules = this._getIntegrationRules(node.type);
    const checklist = [];

    // Check must-have items
    for (const rule of rules.mustHave) {
      const status = this._checkIntegrationRule(nodeId, rule);
      checklist.push({
        item: rule.description,
        required: true,
        status,
      });
    }

    // Check should-have items
    for (const rule of rules.shouldHave) {
      const status = this._checkIntegrationRule(nodeId, rule);
      checklist.push({
        item: rule.description,
        required: false,
        status,
      });
    }

    return checklist;
  }

  /**
   * Check if a specific integration rule is satisfied
   * @private
   */
  _checkIntegrationRule(nodeId, rule) {
    // Special case: text-only rules (no edge to check)
    if (!rule.type) {
      return 'unknown'; // Cannot verify without checking actual files
    }

    // Check for edge existence
    if (rule.direction === 'incoming') {
      const edges = this.getEdges(nodeId, 'incoming').filter(e => e.type === rule.type);
      if (rule.to) {
        return edges.some(e => e.from === rule.to) ? 'satisfied' : 'missing';
      }
      return edges.length > 0 ? 'satisfied' : 'missing';
    } else {
      // Outgoing (default)
      const edges = this.getEdges(nodeId, 'outgoing').filter(e => e.type === rule.type);
      if (rule.to) {
        return edges.some(e => e.to === rule.to) ? 'satisfied' : 'missing';
      }
      return edges.length > 0 ? 'satisfied' : 'missing';
    }
  }

  /**
   * Find all nodes affected within depth (BFS traversal)
   * @param {string} nodeId - Starting node ID
   * @param {Object} options - { depth: number (default 2), direction: 'both'|'outgoing'|'incoming' }
   * @returns {Array<string>} Array of affected node IDs (excluding starting node)
   */
  getImpactRadius(nodeId, options = {}) {
    const { depth = 2, direction = 'both' } = options;

    if (!this.graph.nodes[nodeId]) {
      return [];
    }

    const visited = new Set();
    const queue = [{ id: nodeId, level: 0 }];
    const result = [];

    while (queue.length > 0) {
      const { id, level } = queue.shift();

      if (visited.has(id)) continue;
      visited.add(id);

      if (level > 0) {
        result.push(id);
      }

      if (level < depth) {
        const edges = this.getEdges(id, direction);
        for (const edge of edges) {
          const nextId = edge.from === id ? edge.to : edge.from;
          if (!visited.has(nextId)) {
            queue.push({ id: nextId, level: level + 1 });
          }
        }
      }
    }

    return result;
  }

  /**
   * Check if artifact is fully integrated
   * @param {string} nodeId - Node ID
   * @returns {Object} { integrated: bool, score: 0-1, missing: string[] }
   */
  isFullyIntegrated(nodeId) {
    const checklist = this.getMissingIntegrations(nodeId);

    // Only count must-have items for integration status
    const mustHaveItems = checklist.filter(item => item.required);

    if (mustHaveItems.length === 0) {
      return { integrated: false, score: 0, missing: ['No must-have integrations defined'] };
    }

    const satisfied = mustHaveItems.filter(item => item.status === 'satisfied').length;
    const score = satisfied / mustHaveItems.length;
    const missing = mustHaveItems
      .filter(item => item.status !== 'satisfied')
      .map(item => item.item);

    return {
      integrated: score === 1.0,
      score,
      missing,
    };
  }

  /**
   * Full integration checklist based on artifact type
   * @param {string} nodeId - Node ID
   * @returns {Object} Typed checklist with must-have and should-have sections
   */
  getIntegrationChecklist(nodeId) {
    const node = this.getNode(nodeId);
    if (!node) return null;

    const rules = this._getIntegrationRules(node.type);

    return {
      nodeId,
      type: node.type,
      mustHave: rules.mustHave.map(rule => ({
        ...rule,
        status: this._checkIntegrationRule(nodeId, rule),
      })),
      shouldHave: rules.shouldHave.map(rule => ({
        ...rule,
        status: this._checkIntegrationRule(nodeId, rule),
      })),
    };
  }

  // === Persistence ===

  /**
   * Write graph to disk atomically (write to .tmp, then rename)
   */
  save() {
    const tmpPath = `${this.graphPath}.tmp`;

    try {
      // Update lastUpdated timestamp
      this.graph.lastUpdated = new Date().toISOString();

      // Write to temp file
      const content = JSON.stringify(this.graph, null, 2);
      fs.writeFileSync(tmpPath, content, 'utf8');

      // Atomic rename
      fs.renameSync(tmpPath, this.graphPath);

      return true;
    } catch (_err) {
      // Clean up temp file if it exists
      try {
        if (fs.existsSync(tmpPath)) {
          fs.unlinkSync(tmpPath);
        }
      } catch (_cleanupErr) {
        // Ignore cleanup errors
      }
      return false;
    }
  }

  /**
   * Re-read graph from disk
   */
  reload() {
    this.graph = this._loadOrCreateGraph();
    return this.graph !== null;
  }

  // === Statistics ===

  /**
   * Get graph stats
   * @returns {Object} { nodeCount, edgeCount, byType: {}, integrationHealth: 0-1 }
   */
  getStats() {
    const nodeCount = Object.keys(this.graph.nodes).length;
    const edgeCount = this.graph.edges.length;

    // Count nodes by type
    const byType = {};
    for (const [_id, node] of Object.entries(this.graph.nodes)) {
      byType[node.type] = (byType[node.type] || 0) + 1;
    }

    // Calculate integration health (percentage of fully integrated nodes)
    let totalScore = 0;
    let nodesCounted = 0;

    for (const id of Object.keys(this.graph.nodes)) {
      const result = this.isFullyIntegrated(id);
      totalScore += result.score;
      nodesCounted++;
    }

    const integrationHealth = nodesCounted > 0 ? totalScore / nodesCounted : 0;

    return {
      nodeCount,
      edgeCount,
      byType,
      integrationHealth,
    };
  }
}

module.exports = { ArtifactGraph, DEFAULT_ARTIFACT_GRAPH_PATH };
