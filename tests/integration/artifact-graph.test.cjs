/**
 * Artifact Graph Library Tests
 * ============================
 *
 * Tests for .claude/lib/workflow/artifact-graph.cjs
 *
 * Test coverage:
 * - Constructor (new and existing graph)
 * - Node operations (add, update, remove, get)
 * - Edge operations (add, update, remove, get)
 * - Query operations (getRelated, getMissingIntegrations, isFullyIntegrated, getImpactRadius)
 * - Persistence (save, reload)
 * - Statistics (getStats)
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { ArtifactGraph } = require('../../.claude/lib/workflow/artifact-graph.cjs');

describe('ArtifactGraph', () => {
  let tempDir;
  let graphPath;

  beforeEach(() => {
    // Create temp directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-graph-test-'));
    graphPath = path.join(tempDir, 'test-graph.json');
  });

  afterEach(() => {
    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Constructor', () => {
    it('should create empty graph when file does not exist', () => {
      const graph = new ArtifactGraph(graphPath);
      assert.strictEqual(graph.graph.version, '1.0.0');
      assert.ok(graph.graph.lastUpdated);
      assert.deepStrictEqual(graph.graph.nodes, {});
      assert.deepStrictEqual(graph.graph.edges, []);
    });

    it('should load existing graph from file', () => {
      const existingData = {
        version: '1.0.0',
        lastUpdated: '2026-02-07T10:00:00.000Z',
        nodes: {
          'skill:tdd': { type: 'skill', path: '.claude/skills/tdd/SKILL.md', created: '2026-01-01T00:00:00.000Z', integrationStatus: 'created' }
        },
        edges: []
      };

      fs.writeFileSync(graphPath, JSON.stringify(existingData), 'utf8');

      const graph = new ArtifactGraph(graphPath);
      assert.strictEqual(Object.keys(graph.graph.nodes).length, 1);
      assert.ok(graph.graph.nodes['skill:tdd']);
    });

    it('should handle malformed graph file gracefully', () => {
      fs.writeFileSync(graphPath, 'invalid json {', 'utf8');

      const graph = new ArtifactGraph(graphPath);
      // Should create new empty graph instead of throwing
      assert.strictEqual(graph.graph.version, '1.0.0');
      assert.deepStrictEqual(graph.graph.nodes, {});
    });
  });

  describe('addNode', () => {
    it('should add node with correct data', () => {
      const graph = new ArtifactGraph(graphPath);
      const result = graph.addNode('skill:tdd', {
        type: 'skill',
        path: '.claude/skills/tdd/SKILL.md',
        integrationStatus: 'created'
      });

      assert.strictEqual(result, true);
      assert.ok(graph.graph.nodes['skill:tdd']);
      assert.strictEqual(graph.graph.nodes['skill:tdd'].type, 'skill');
      assert.strictEqual(graph.graph.nodes['skill:tdd'].path, '.claude/skills/tdd/SKILL.md');
      assert.ok(graph.graph.nodes['skill:tdd'].created);
    });

    it('should update existing node data', () => {
      const graph = new ArtifactGraph(graphPath);
      const created1 = new Date('2026-01-01T00:00:00.000Z').toISOString();

      graph.addNode('skill:tdd', {
        type: 'skill',
        path: '.claude/skills/tdd/SKILL.md',
        created: created1,
        integrationStatus: 'created'
      });

      // Update same node
      graph.addNode('skill:tdd', {
        type: 'skill',
        path: '.claude/skills/tdd/SKILL.md',
        integrationStatus: 'integrated'
      });

      // Created timestamp should be preserved
      assert.strictEqual(graph.graph.nodes['skill:tdd'].created, created1);
      // Status should be updated
      assert.strictEqual(graph.graph.nodes['skill:tdd'].integrationStatus, 'integrated');
    });

    it('should reject invalid node IDs', () => {
      const graph = new ArtifactGraph(graphPath);

      // Missing colon
      assert.strictEqual(graph.addNode('invalid', { type: 'skill', path: '...' }), false);

      // Empty string
      assert.strictEqual(graph.addNode('', { type: 'skill', path: '...' }), false);

      // Null/undefined
      assert.strictEqual(graph.addNode(null, { type: 'skill', path: '...' }), false);
      assert.strictEqual(graph.addNode(undefined, { type: 'skill', path: '...' }), false);

      // Should have no nodes added
      assert.strictEqual(Object.keys(graph.graph.nodes).length, 0);
    });

    it('should accept metadata and missingIntegrations', () => {
      const graph = new ArtifactGraph(graphPath);
      graph.addNode('skill:tdd', {
        type: 'skill',
        path: '.claude/skills/tdd/SKILL.md',
        integrationStatus: 'created',
        metadata: { custom: 'value' },
        missingIntegrations: ['catalog-entry', 'agent-assignment']
      });

      assert.deepStrictEqual(graph.graph.nodes['skill:tdd'].metadata, { custom: 'value' });
      assert.deepStrictEqual(graph.graph.nodes['skill:tdd'].missingIntegrations, ['catalog-entry', 'agent-assignment']);
    });
  });

  describe('removeNode', () => {
    it('should remove node and all its edges', () => {
      const graph = new ArtifactGraph(graphPath);

      graph.addNode('skill:tdd', { type: 'skill', path: '...', integrationStatus: 'created' });
      graph.addNode('agent:developer', { type: 'agent', path: '...', integrationStatus: 'created' });
      graph.addEdge('skill:tdd', 'agent:developer', 'assigned-to');

      // Remove skill node
      const result = graph.removeNode('skill:tdd');

      assert.strictEqual(result, true);
      assert.strictEqual(graph.graph.nodes['skill:tdd'], undefined);
      assert.strictEqual(graph.graph.edges.length, 0); // Edge should be removed
    });

    it('should return false for unknown node', () => {
      const graph = new ArtifactGraph(graphPath);
      assert.strictEqual(graph.removeNode('unknown:node'), false);
    });
  });

  describe('getNode', () => {
    it('should return node data with id included', () => {
      const graph = new ArtifactGraph(graphPath);
      graph.addNode('skill:tdd', { type: 'skill', path: '.claude/skills/tdd/SKILL.md', integrationStatus: 'created' });

      const node = graph.getNode('skill:tdd');
      assert.ok(node);
      assert.strictEqual(node.id, 'skill:tdd');
      assert.strictEqual(node.type, 'skill');
      assert.strictEqual(node.path, '.claude/skills/tdd/SKILL.md');
    });

    it('should return null for unknown node', () => {
      const graph = new ArtifactGraph(graphPath);
      assert.strictEqual(graph.getNode('unknown:node'), null);
    });
  });

  describe('getAllNodes', () => {
    it('should return all nodes', () => {
      const graph = new ArtifactGraph(graphPath);
      graph.addNode('skill:tdd', { type: 'skill', path: '...', integrationStatus: 'created' });
      graph.addNode('agent:developer', { type: 'agent', path: '...', integrationStatus: 'created' });

      const nodes = graph.getAllNodes();
      assert.strictEqual(nodes.length, 2);
      assert.ok(nodes.find(n => n.id === 'skill:tdd'));
      assert.ok(nodes.find(n => n.id === 'agent:developer'));
    });

    it('should filter by type', () => {
      const graph = new ArtifactGraph(graphPath);
      graph.addNode('skill:tdd', { type: 'skill', path: '...', integrationStatus: 'created' });
      graph.addNode('agent:developer', { type: 'agent', path: '...', integrationStatus: 'created' });

      const skills = graph.getAllNodes('skill');
      assert.strictEqual(skills.length, 1);
      assert.strictEqual(skills[0].id, 'skill:tdd');
    });
  });

  describe('addEdge', () => {
    it('should add edge between existing nodes', () => {
      const graph = new ArtifactGraph(graphPath);
      graph.addNode('skill:tdd', { type: 'skill', path: '...', integrationStatus: 'created' });
      graph.addNode('agent:developer', { type: 'agent', path: '...', integrationStatus: 'created' });

      const result = graph.addEdge('skill:tdd', 'agent:developer', 'assigned-to');

      assert.strictEqual(result, true);
      assert.strictEqual(graph.graph.edges.length, 1);
      assert.strictEqual(graph.graph.edges[0].from, 'skill:tdd');
      assert.strictEqual(graph.graph.edges[0].to, 'agent:developer');
      assert.strictEqual(graph.graph.edges[0].type, 'assigned-to');
      assert.strictEqual(graph.graph.edges[0].status, 'active');
    });

    it('should update existing edge instead of creating duplicate', () => {
      const graph = new ArtifactGraph(graphPath);
      graph.addNode('skill:tdd', { type: 'skill', path: '...', integrationStatus: 'created' });
      graph.addNode('agent:developer', { type: 'agent', path: '...', integrationStatus: 'created' });

      graph.addEdge('skill:tdd', 'agent:developer', 'assigned-to', 'active');
      graph.addEdge('skill:tdd', 'agent:developer', 'assigned-to', 'inactive');

      // Should have only 1 edge with updated status
      assert.strictEqual(graph.graph.edges.length, 1);
      assert.strictEqual(graph.graph.edges[0].status, 'inactive');
    });

    it('should return false for non-existent nodes', () => {
      const graph = new ArtifactGraph(graphPath);
      graph.addNode('skill:tdd', { type: 'skill', path: '...', integrationStatus: 'created' });

      // 'to' node missing
      assert.strictEqual(graph.addEdge('skill:tdd', 'agent:unknown', 'assigned-to'), false);

      // 'from' node missing
      assert.strictEqual(graph.addEdge('skill:unknown', 'skill:tdd', 'assigned-to'), false);

      // No edges created
      assert.strictEqual(graph.graph.edges.length, 0);
    });
  });

  describe('removeEdge', () => {
    it('should remove specific edge', () => {
      const graph = new ArtifactGraph(graphPath);
      graph.addNode('skill:tdd', { type: 'skill', path: '...', integrationStatus: 'created' });
      graph.addNode('agent:developer', { type: 'agent', path: '...', integrationStatus: 'created' });
      graph.addEdge('skill:tdd', 'agent:developer', 'assigned-to');

      const result = graph.removeEdge('skill:tdd', 'agent:developer', 'assigned-to');

      assert.strictEqual(result, true);
      assert.strictEqual(graph.graph.edges.length, 0);
    });

    it('should return false if edge does not exist', () => {
      const graph = new ArtifactGraph(graphPath);
      graph.addNode('skill:tdd', { type: 'skill', path: '...', integrationStatus: 'created' });
      graph.addNode('agent:developer', { type: 'agent', path: '...', integrationStatus: 'created' });

      assert.strictEqual(graph.removeEdge('skill:tdd', 'agent:developer', 'assigned-to'), false);
    });
  });

  describe('getEdges', () => {
    it('should get incoming edges', () => {
      const graph = new ArtifactGraph(graphPath);
      graph.addNode('skill:tdd', { type: 'skill', path: '...', integrationStatus: 'created' });
      graph.addNode('agent:developer', { type: 'agent', path: '...', integrationStatus: 'created' });
      graph.addEdge('skill:tdd', 'agent:developer', 'assigned-to');

      const incoming = graph.getEdges('agent:developer', 'incoming');
      assert.strictEqual(incoming.length, 1);
      assert.strictEqual(incoming[0].from, 'skill:tdd');
    });

    it('should get outgoing edges', () => {
      const graph = new ArtifactGraph(graphPath);
      graph.addNode('skill:tdd', { type: 'skill', path: '...', integrationStatus: 'created' });
      graph.addNode('agent:developer', { type: 'agent', path: '...', integrationStatus: 'created' });
      graph.addEdge('skill:tdd', 'agent:developer', 'assigned-to');

      const outgoing = graph.getEdges('skill:tdd', 'outgoing');
      assert.strictEqual(outgoing.length, 1);
      assert.strictEqual(outgoing[0].to, 'agent:developer');
    });

    it('should get both edges by default', () => {
      const graph = new ArtifactGraph(graphPath);
      graph.addNode('skill:tdd', { type: 'skill', path: '...', integrationStatus: 'created' });
      graph.addNode('agent:developer', { type: 'agent', path: '...', integrationStatus: 'created' });
      graph.addNode('workflow:feature-dev', { type: 'workflow', path: '...', integrationStatus: 'created' });

      graph.addEdge('skill:tdd', 'agent:developer', 'assigned-to');
      graph.addEdge('workflow:feature-dev', 'skill:tdd', 'invokes');

      const both = graph.getEdges('skill:tdd', 'both');
      assert.strictEqual(both.length, 2);
    });

    it('should return empty array for unknown node', () => {
      const graph = new ArtifactGraph(graphPath);
      assert.deepStrictEqual(graph.getEdges('unknown:node'), []);
    });
  });

  describe('getRelated', () => {
    it('should find related nodes through edge type (outgoing)', () => {
      const graph = new ArtifactGraph(graphPath);
      graph.addNode('skill:tdd', { type: 'skill', path: '...', integrationStatus: 'created' });
      graph.addNode('agent:developer', { type: 'agent', path: '...', integrationStatus: 'created' });
      graph.addNode('agent:qa', { type: 'agent', path: '...', integrationStatus: 'created' });

      graph.addEdge('skill:tdd', 'agent:developer', 'assigned-to');
      graph.addEdge('skill:tdd', 'agent:qa', 'assigned-to');

      const related = graph.getRelated('skill:tdd', 'assigned-to', 'outgoing');
      assert.strictEqual(related.length, 2);
      assert.ok(related.includes('agent:developer'));
      assert.ok(related.includes('agent:qa'));
    });

    it('should find related nodes (incoming)', () => {
      const graph = new ArtifactGraph(graphPath);
      graph.addNode('skill:tdd', { type: 'skill', path: '...', integrationStatus: 'created' });
      graph.addNode('workflow:feature-dev', { type: 'workflow', path: '...', integrationStatus: 'created' });

      graph.addEdge('workflow:feature-dev', 'skill:tdd', 'invokes');

      const related = graph.getRelated('skill:tdd', 'invokes', 'incoming');
      assert.strictEqual(related.length, 1);
      assert.strictEqual(related[0], 'workflow:feature-dev');
    });

    it('should remove duplicates', () => {
      const graph = new ArtifactGraph(graphPath);
      graph.addNode('skill:tdd', { type: 'skill', path: '...', integrationStatus: 'created' });
      graph.addNode('agent:developer', { type: 'agent', path: '...', integrationStatus: 'created' });

      // Add multiple edges to same target (shouldn't happen in practice, but test handles it)
      graph.addEdge('skill:tdd', 'agent:developer', 'assigned-to');
      // Manually add duplicate (bypassing addEdge dedup logic)
      graph.graph.edges.push({ from: 'skill:tdd', to: 'agent:developer', type: 'assigned-to', status: 'active' });

      const related = graph.getRelated('skill:tdd', 'assigned-to', 'outgoing');
      assert.strictEqual(related.length, 1); // Duplicates removed
    });

    it('should return empty array for unknown node', () => {
      const graph = new ArtifactGraph(graphPath);
      assert.deepStrictEqual(graph.getRelated('unknown:node', 'assigned-to'), []);
    });
  });

  describe('getMissingIntegrations', () => {
    it('should return gaps for skill without agent assignment', () => {
      const graph = new ArtifactGraph(graphPath);
      graph.addNode('skill:tdd', { type: 'skill', path: '...', integrationStatus: 'created' });

      const gaps = graph.getMissingIntegrations('skill:tdd');
      assert.ok(gaps.length > 0);

      const catalogGap = gaps.find(g => g.item === 'Catalog entry');
      assert.ok(catalogGap);
      assert.strictEqual(catalogGap.required, true);
      assert.strictEqual(catalogGap.status, 'missing');

      const agentGap = gaps.find(g => g.item === 'At least 1 agent assignment');
      assert.ok(agentGap);
      assert.strictEqual(agentGap.required, true);
      assert.strictEqual(agentGap.status, 'missing');
    });

    it('should return gaps for agent without registry', () => {
      const graph = new ArtifactGraph(graphPath);
      graph.addNode('agent:developer', { type: 'agent', path: '...', integrationStatus: 'created' });

      const gaps = graph.getMissingIntegrations('agent:developer');

      const registryGap = gaps.find(g => g.item === 'Registry entry');
      assert.ok(registryGap);
      assert.strictEqual(registryGap.required, true);
      assert.strictEqual(registryGap.status, 'missing');
    });

    it('should return satisfied status when edges exist', () => {
      const graph = new ArtifactGraph(graphPath);
      graph.addNode('skill:tdd', { type: 'skill', path: '...', integrationStatus: 'created' });
      graph.addNode('catalog:skill-catalog', { type: 'catalog', path: '...', integrationStatus: 'created' });
      graph.addNode('agent:developer', { type: 'agent', path: '...', integrationStatus: 'created' });

      graph.addEdge('skill:tdd', 'catalog:skill-catalog', 'references');
      graph.addEdge('skill:tdd', 'agent:developer', 'assigned-to');

      const gaps = graph.getMissingIntegrations('skill:tdd');

      const catalogGap = gaps.find(g => g.item === 'Catalog entry');
      assert.strictEqual(catalogGap.status, 'satisfied');

      const agentGap = gaps.find(g => g.item === 'At least 1 agent assignment');
      assert.strictEqual(agentGap.status, 'satisfied');
    });

    it('should return empty array for unknown node', () => {
      const graph = new ArtifactGraph(graphPath);
      assert.deepStrictEqual(graph.getMissingIntegrations('unknown:node'), []);
    });
  });

  describe('isFullyIntegrated', () => {
    it('should return score 0 for orphan artifact', () => {
      const graph = new ArtifactGraph(graphPath);
      graph.addNode('skill:orphan', { type: 'skill', path: '...', integrationStatus: 'created' });

      const result = graph.isFullyIntegrated('skill:orphan');
      assert.strictEqual(result.integrated, false);
      assert.strictEqual(result.score, 0);
      assert.ok(result.missing.length > 0);
    });

    it('should return score between 0 and 1 for partial integration', () => {
      const graph = new ArtifactGraph(graphPath);
      graph.addNode('skill:tdd', { type: 'skill', path: '...', integrationStatus: 'created' });
      graph.addNode('catalog:skill-catalog', { type: 'catalog', path: '...', integrationStatus: 'created' });

      // Satisfy only catalog entry (1 of 2 must-have)
      graph.addEdge('skill:tdd', 'catalog:skill-catalog', 'references');

      const result = graph.isFullyIntegrated('skill:tdd');
      assert.strictEqual(result.integrated, false);
      assert.strictEqual(result.score, 0.5); // 1 of 2 satisfied
      assert.ok(result.missing.includes('At least 1 agent assignment'));
    });

    it('should return score 1.0 when fully integrated', () => {
      const graph = new ArtifactGraph(graphPath);
      graph.addNode('skill:tdd', { type: 'skill', path: '...', integrationStatus: 'created' });
      graph.addNode('catalog:skill-catalog', { type: 'catalog', path: '...', integrationStatus: 'created' });
      graph.addNode('agent:developer', { type: 'agent', path: '...', integrationStatus: 'created' });

      graph.addEdge('skill:tdd', 'catalog:skill-catalog', 'references');
      graph.addEdge('skill:tdd', 'agent:developer', 'assigned-to');

      const result = graph.isFullyIntegrated('skill:tdd');
      assert.strictEqual(result.integrated, true);
      assert.strictEqual(result.score, 1.0);
      assert.strictEqual(result.missing.length, 0);
    });
  });

  describe('getImpactRadius', () => {
    it('should perform BFS traversal to depth 2', () => {
      const graph = new ArtifactGraph(graphPath);

      // Create chain: skill -> agent -> workflow
      graph.addNode('skill:tdd', { type: 'skill', path: '...', integrationStatus: 'created' });
      graph.addNode('agent:developer', { type: 'agent', path: '...', integrationStatus: 'created' });
      graph.addNode('workflow:feature-dev', { type: 'workflow', path: '...', integrationStatus: 'created' });

      graph.addEdge('skill:tdd', 'agent:developer', 'assigned-to');
      graph.addEdge('agent:developer', 'workflow:feature-dev', 'invokes');

      const impacted = graph.getImpactRadius('skill:tdd', { depth: 2 });

      assert.strictEqual(impacted.length, 2);
      assert.ok(impacted.includes('agent:developer')); // Depth 1
      assert.ok(impacted.includes('workflow:feature-dev')); // Depth 2
    });

    it('should limit depth correctly', () => {
      const graph = new ArtifactGraph(graphPath);

      graph.addNode('skill:tdd', { type: 'skill', path: '...', integrationStatus: 'created' });
      graph.addNode('agent:developer', { type: 'agent', path: '...', integrationStatus: 'created' });
      graph.addNode('workflow:feature-dev', { type: 'workflow', path: '...', integrationStatus: 'created' });

      graph.addEdge('skill:tdd', 'agent:developer', 'assigned-to');
      graph.addEdge('agent:developer', 'workflow:feature-dev', 'invokes');

      const impacted = graph.getImpactRadius('skill:tdd', { depth: 1 });

      assert.strictEqual(impacted.length, 1);
      assert.ok(impacted.includes('agent:developer')); // Depth 1 only
      assert.ok(!impacted.includes('workflow:feature-dev')); // Depth 2 excluded
    });

    it('should exclude starting node from results', () => {
      const graph = new ArtifactGraph(graphPath);
      graph.addNode('skill:tdd', { type: 'skill', path: '...', integrationStatus: 'created' });
      graph.addNode('agent:developer', { type: 'agent', path: '...', integrationStatus: 'created' });

      graph.addEdge('skill:tdd', 'agent:developer', 'assigned-to');

      const impacted = graph.getImpactRadius('skill:tdd');
      assert.ok(!impacted.includes('skill:tdd')); // Starting node excluded
    });

    it('should return empty array for unknown node', () => {
      const graph = new ArtifactGraph(graphPath);
      assert.deepStrictEqual(graph.getImpactRadius('unknown:node'), []);
    });
  });

  describe('getIntegrationChecklist', () => {
    it('should return typed checklist for each artifact type', () => {
      const graph = new ArtifactGraph(graphPath);
      graph.addNode('skill:tdd', { type: 'skill', path: '...', integrationStatus: 'created' });

      const checklist = graph.getIntegrationChecklist('skill:tdd');

      assert.strictEqual(checklist.nodeId, 'skill:tdd');
      assert.strictEqual(checklist.type, 'skill');
      assert.ok(Array.isArray(checklist.mustHave));
      assert.ok(Array.isArray(checklist.shouldHave));
      assert.ok(checklist.mustHave.length > 0);
    });

    it('should return null for unknown node', () => {
      const graph = new ArtifactGraph(graphPath);
      assert.strictEqual(graph.getIntegrationChecklist('unknown:node'), null);
    });
  });

  describe('save and reload', () => {
    it('should persist graph and reload with identical data', () => {
      const graph1 = new ArtifactGraph(graphPath);
      graph1.addNode('skill:tdd', { type: 'skill', path: '.claude/skills/tdd/SKILL.md', integrationStatus: 'created' });
      graph1.addNode('agent:developer', { type: 'agent', path: '.claude/agents/core/developer.md', integrationStatus: 'created' });
      graph1.addEdge('skill:tdd', 'agent:developer', 'assigned-to');

      // Save
      const saveResult = graph1.save();
      assert.strictEqual(saveResult, true);
      assert.ok(fs.existsSync(graphPath));

      // Reload in new instance
      const graph2 = new ArtifactGraph(graphPath);
      assert.strictEqual(Object.keys(graph2.graph.nodes).length, 2);
      assert.strictEqual(graph2.graph.edges.length, 1);
      assert.ok(graph2.graph.nodes['skill:tdd']);
      assert.ok(graph2.graph.nodes['agent:developer']);
    });

    it('should handle save errors gracefully', () => {
      const graph = new ArtifactGraph('/invalid/readonly/path/graph.json');
      graph.addNode('skill:tdd', { type: 'skill', path: '...', integrationStatus: 'created' });

      const result = graph.save();
      assert.strictEqual(result, false);
    });

    it('should update lastUpdated on save', () => {
      const graph = new ArtifactGraph(graphPath);
      graph.addNode('skill:tdd', { type: 'skill', path: '...', integrationStatus: 'created' });

      const before = graph.graph.lastUpdated;
      // Small delay to ensure timestamp changes
      setTimeout(() => {
        graph.save();
        assert.notStrictEqual(graph.graph.lastUpdated, before);
      }, 10);
    });
  });

  describe('getStats', () => {
    it('should return accurate counts and health score', () => {
      const graph = new ArtifactGraph(graphPath);

      // Create 2 skills: 1 fully integrated, 1 orphan
      graph.addNode('skill:tdd', { type: 'skill', path: '...', integrationStatus: 'created' });
      graph.addNode('skill:orphan', { type: 'skill', path: '...', integrationStatus: 'created' });
      graph.addNode('catalog:skill-catalog', { type: 'catalog', path: '...', integrationStatus: 'created' });
      graph.addNode('agent:developer', { type: 'agent', path: '...', integrationStatus: 'created' });

      // Fully integrate skill:tdd
      graph.addEdge('skill:tdd', 'catalog:skill-catalog', 'references');
      graph.addEdge('skill:tdd', 'agent:developer', 'assigned-to');

      const stats = graph.getStats();

      assert.strictEqual(stats.nodeCount, 4);
      assert.strictEqual(stats.edgeCount, 2);
      assert.strictEqual(stats.byType.skill, 2);
      assert.strictEqual(stats.byType.catalog, 1);
      assert.strictEqual(stats.byType.agent, 1);

      // Health should be average of integration scores
      // skill:tdd = 1.0 (2/2), skill:orphan = 0.0 (0/2), catalog/agent have different rules
      assert.ok(stats.integrationHealth >= 0);
      assert.ok(stats.integrationHealth <= 1);
    });

    it('should return 0 health for empty graph', () => {
      const graph = new ArtifactGraph(graphPath);
      const stats = graph.getStats();

      assert.strictEqual(stats.nodeCount, 0);
      assert.strictEqual(stats.edgeCount, 0);
      assert.strictEqual(stats.integrationHealth, 0);
    });
  });
});
