'use strict';

/**
 * DAG-Based Memory Persistence
 *
 * In-memory directed acyclic graph for structured memory storage.
 * Nodes represent knowledge units (decisions, learnings, issues, patterns, gotchas).
 * Edges represent relationships between nodes.
 *
 * Supports:
 *   - Node CRUD with type and metadata
 *   - Directed edges with relation labels
 *   - Query by type, content search
 *   - Graph traversal (connected nodes)
 *
 * @module dag-store
 */

const { randomUUID } = require('node:crypto');

const NodeType = Object.freeze({
  DECISION: 'decision',
  LEARNING: 'learning',
  ISSUE: 'issue',
  PATTERN: 'pattern',
  GOTCHA: 'gotcha',
});

class DAGStore {
  constructor() {
    /** @type {Map<string, Object>} */
    this._nodes = new Map();
    /** @type {Array<{ from: string, to: string, relation: string }>} */
    this._edges = [];
  }

  /**
   * Add a node to the graph.
   * @param {{ type: string, content: string, metadata?: Object }} data
   * @returns {string} node ID
   */
  addNode(data) {
    const id = randomUUID();
    this._nodes.set(id, {
      id,
      type: data.type,
      content: data.content,
      metadata: data.metadata || {},
      timestamp: Date.now(),
    });
    return id;
  }

  /**
   * Get a node by ID.
   * @param {string} id
   * @returns {Object|null}
   */
  getNode(id) {
    return this._nodes.has(id) ? { ...this._nodes.get(id) } : null;
  }

  /**
   * Add a directed edge between two nodes.
   * @param {string} fromId
   * @param {string} toId
   * @param {string} relation
   */
  addEdge(fromId, toId, relation) {
    if (!this._nodes.has(fromId)) {
      throw new Error(`Source node not found: ${fromId}`);
    }
    if (!this._nodes.has(toId)) {
      throw new Error(`Target node not found: ${toId}`);
    }
    this._edges.push({ from: fromId, to: toId, relation });
  }

  /**
   * Get all edges from a node.
   * @param {string} fromId
   * @returns {Array<{ from: string, to: string, relation: string }>}
   */
  getEdgesFrom(fromId) {
    return this._edges.filter(e => e.from === fromId);
  }

  /**
   * Get all edges to a node.
   * @param {string} toId
   * @returns {Array<{ from: string, to: string, relation: string }>}
   */
  getEdgesTo(toId) {
    return this._edges.filter(e => e.to === toId);
  }

  /**
   * Query nodes by type.
   * @param {string} type
   * @returns {Array<Object>}
   */
  queryByType(type) {
    const results = [];
    for (const node of this._nodes.values()) {
      if (node.type === type) results.push({ ...node });
    }
    return results;
  }

  /**
   * Search nodes by content substring (case-insensitive).
   * @param {string} query
   * @returns {Array<Object>}
   */
  searchContent(query) {
    const lower = query.toLowerCase();
    const results = [];
    for (const node of this._nodes.values()) {
      if (node.content.toLowerCase().includes(lower)) {
        results.push({ ...node });
      }
    }
    return results;
  }

  /**
   * Get directly connected nodes (outgoing edges).
   * @param {string} nodeId
   * @returns {Array<Object>}
   */
  getConnectedNodes(nodeId) {
    const edges = this.getEdgesFrom(nodeId);
    return edges.map(e => this.getNode(e.to)).filter(n => n !== null);
  }

  /**
   * Get all nodes.
   * @returns {Array<Object>}
   */
  getAllNodes() {
    return [...this._nodes.values()].map(n => ({ ...n }));
  }

  /**
   * Get graph statistics.
   * @returns {{ nodeCount: number, edgeCount: number }}
   */
  getStats() {
    return {
      nodeCount: this._nodes.size,
      edgeCount: this._edges.length,
    };
  }

  /**
   * Remove a node and all its edges.
   * @param {string} nodeId
   */
  removeNode(nodeId) {
    this._nodes.delete(nodeId);
    this._edges = this._edges.filter(e => e.from !== nodeId && e.to !== nodeId);
  }
}

module.exports = {
  DAGStore,
  NodeType,
};
