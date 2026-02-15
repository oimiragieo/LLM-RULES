const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { ArtifactGraph } = require('../../.claude/lib/workflow/artifact-graph.cjs');

describe('ArtifactGraph persistence and stats', () => {
  let tempDir;
  let graphPath;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-graph-persist-test-'));
    graphPath = path.join(tempDir, 'test-graph.json');
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('save and reload', () => {
    it('should persist graph and reload with identical data', () => {
      const graph1 = new ArtifactGraph(graphPath);
      graph1.addNode('skill:tdd', {
        type: 'skill',
        path: '.claude/skills/tdd/SKILL.md',
        integrationStatus: 'created',
      });
      graph1.addNode('agent:developer', {
        type: 'agent',
        path: '.claude/agents/core/developer.md',
        integrationStatus: 'created',
      });
      graph1.addEdge('skill:tdd', 'agent:developer', 'assigned-to');

      const saveResult = graph1.save();
      assert.strictEqual(saveResult, true);
      assert.ok(fs.existsSync(graphPath));

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
      setTimeout(() => {
        graph.save();
        assert.notStrictEqual(graph.graph.lastUpdated, before);
      }, 10);
    });
  });

  describe('getStats', () => {
    it('should return accurate counts and health score', () => {
      const graph = new ArtifactGraph(graphPath);

      graph.addNode('skill:tdd', { type: 'skill', path: '...', integrationStatus: 'created' });
      graph.addNode('skill:orphan', { type: 'skill', path: '...', integrationStatus: 'created' });
      graph.addNode('catalog:skill-catalog', {
        type: 'catalog',
        path: '...',
        integrationStatus: 'created',
      });
      graph.addNode('agent:developer', {
        type: 'agent',
        path: '...',
        integrationStatus: 'created',
      });

      graph.addEdge('skill:tdd', 'catalog:skill-catalog', 'references');
      graph.addEdge('skill:tdd', 'agent:developer', 'assigned-to');

      const stats = graph.getStats();
      assert.strictEqual(stats.nodeCount, 4);
      assert.strictEqual(stats.edgeCount, 2);
      assert.strictEqual(stats.byType.skill, 2);
      assert.strictEqual(stats.byType.catalog, 1);
      assert.strictEqual(stats.byType.agent, 1);
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
