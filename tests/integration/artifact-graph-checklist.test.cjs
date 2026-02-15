const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { ArtifactGraph } = require('../../.claude/lib/workflow/artifact-graph.cjs');

describe('ArtifactGraph integration checklist', () => {
  let tempDir;
  let graphPath;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-graph-checklist-test-'));
    graphPath = path.join(tempDir, 'graph.json');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

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
