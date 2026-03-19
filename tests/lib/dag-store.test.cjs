'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { DAGStore, NodeType } = require('../../.claude/lib/memory/dag-store.cjs');

// ─── NodeType ───────────────────────────────────────────────────────────────

describe('NodeType', () => {
  it('exports node types', () => {
    assert.equal(NodeType.DECISION, 'decision');
    assert.equal(NodeType.LEARNING, 'learning');
    assert.equal(NodeType.ISSUE, 'issue');
    assert.equal(NodeType.PATTERN, 'pattern');
    assert.equal(NodeType.GOTCHA, 'gotcha');
  });
});

// ─── DAGStore ───────────────────────────────────────────────────────────────

describe('DAGStore', () => {
  let store;

  beforeEach(() => {
    store = new DAGStore(); // in-memory mode
  });

  // --- Node operations ---

  it('adds a node', () => {
    const id = store.addNode({ type: NodeType.DECISION, content: 'Use Redis for caching' });
    assert.equal(typeof id, 'string');
    assert.ok(id.length > 0);
  });

  it('gets a node by id', () => {
    const id = store.addNode({ type: NodeType.LEARNING, content: 'BM25 supports lazy IDF' });
    const node = store.getNode(id);
    assert.equal(node.type, NodeType.LEARNING);
    assert.equal(node.content, 'BM25 supports lazy IDF');
  });

  it('returns null for unknown node', () => {
    assert.equal(store.getNode('nonexistent'), null);
  });

  it('node has timestamp', () => {
    const id = store.addNode({ type: NodeType.ISSUE, content: 'test' });
    const node = store.getNode(id);
    assert.equal(typeof node.timestamp, 'number');
    assert.ok(node.timestamp > 0);
  });

  it('node has metadata', () => {
    const id = store.addNode({
      type: NodeType.DECISION,
      content: 'test',
      metadata: { area: 'auth', priority: 'high' },
    });
    const node = store.getNode(id);
    assert.equal(node.metadata.area, 'auth');
  });

  // --- Edge operations ---

  it('adds an edge between nodes', () => {
    const a = store.addNode({ type: NodeType.DECISION, content: 'A' });
    const b = store.addNode({ type: NodeType.LEARNING, content: 'B' });
    store.addEdge(a, b, 'leads_to');
    const edges = store.getEdgesFrom(a);
    assert.equal(edges.length, 1);
    assert.equal(edges[0].to, b);
    assert.equal(edges[0].relation, 'leads_to');
  });

  it('gets edges to a node', () => {
    const a = store.addNode({ type: NodeType.DECISION, content: 'A' });
    const b = store.addNode({ type: NodeType.LEARNING, content: 'B' });
    store.addEdge(a, b, 'causes');
    const edges = store.getEdgesTo(b);
    assert.equal(edges.length, 1);
    assert.equal(edges[0].from, a);
  });

  it('rejects edge to nonexistent node', () => {
    const a = store.addNode({ type: NodeType.ISSUE, content: 'A' });
    assert.throws(() => store.addEdge(a, 'bad-id', 'rel'), /not found/i);
  });

  it('rejects edge from nonexistent node', () => {
    const b = store.addNode({ type: NodeType.ISSUE, content: 'B' });
    assert.throws(() => store.addEdge('bad-id', b, 'rel'), /not found/i);
  });

  // --- Query operations ---

  it('queries nodes by type', () => {
    store.addNode({ type: NodeType.DECISION, content: 'D1' });
    store.addNode({ type: NodeType.LEARNING, content: 'L1' });
    store.addNode({ type: NodeType.DECISION, content: 'D2' });
    const decisions = store.queryByType(NodeType.DECISION);
    assert.equal(decisions.length, 2);
  });

  it('searches nodes by content substring', () => {
    store.addNode({ type: NodeType.LEARNING, content: 'Redis caching strategy' });
    store.addNode({ type: NodeType.LEARNING, content: 'PostgreSQL indexing' });
    store.addNode({ type: NodeType.GOTCHA, content: 'Redis connection pooling' });
    const results = store.searchContent('Redis');
    assert.equal(results.length, 2);
  });

  it('search is case-insensitive', () => {
    store.addNode({ type: NodeType.PATTERN, content: 'JWT authentication' });
    const results = store.searchContent('jwt');
    assert.equal(results.length, 1);
  });

  it('returns empty for no matches', () => {
    store.addNode({ type: NodeType.LEARNING, content: 'test' });
    assert.deepEqual(store.searchContent('nonexistent'), []);
  });

  // --- Graph traversal ---

  it('getConnectedNodes returns directly connected', () => {
    const a = store.addNode({ type: NodeType.DECISION, content: 'A' });
    const b = store.addNode({ type: NodeType.LEARNING, content: 'B' });
    const c = store.addNode({ type: NodeType.ISSUE, content: 'C' });
    store.addEdge(a, b, 'causes');
    store.addEdge(a, c, 'relates');
    const connected = store.getConnectedNodes(a);
    assert.equal(connected.length, 2);
  });

  it('getAllNodes returns all nodes', () => {
    store.addNode({ type: NodeType.DECISION, content: 'A' });
    store.addNode({ type: NodeType.LEARNING, content: 'B' });
    assert.equal(store.getAllNodes().length, 2);
  });

  it('getStats returns counts', () => {
    store.addNode({ type: NodeType.DECISION, content: 'A' });
    store.addNode({ type: NodeType.LEARNING, content: 'B' });
    const a = store.addNode({ type: NodeType.ISSUE, content: 'C' });
    const b = store.addNode({ type: NodeType.GOTCHA, content: 'D' });
    store.addEdge(a, b, 'rel');
    const stats = store.getStats();
    assert.equal(stats.nodeCount, 4);
    assert.equal(stats.edgeCount, 1);
  });

  // --- Delete ---

  it('removes a node and its edges', () => {
    const a = store.addNode({ type: NodeType.DECISION, content: 'A' });
    const b = store.addNode({ type: NodeType.LEARNING, content: 'B' });
    store.addEdge(a, b, 'rel');
    store.removeNode(a);
    assert.equal(store.getNode(a), null);
    assert.equal(store.getEdgesFrom(a).length, 0);
    assert.equal(store.getEdgesTo(b).length, 0);
  });
});
