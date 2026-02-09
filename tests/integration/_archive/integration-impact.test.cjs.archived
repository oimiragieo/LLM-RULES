'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  analyzeImpact,
  analyzeBatch,
  generateReport,
} = require('../../.claude/lib/workflow/integration-impact.cjs');
const { ArtifactGraph } = require('../../.claude/lib/workflow/artifact-graph.cjs');

/**
 * Setup function for each test
 */
function setupTest() {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-impact-test-'));
  const graphPath = path.join(testDir, 'artifact-graph.json');
  const graph = new ArtifactGraph(graphPath);

  return { testDir, graphPath, graph };
}

/**
 * Cleanup function for each test
 */
function cleanupTest(testDir) {
  if (testDir && fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

// === analyzeImpact Tests ===

test('analyzeImpact - created skill with no edges (orphan)', () => {
  const { testDir, graphPath, graph } = setupTest();

  // Add orphan skill
  graph.addNode('skill:rate-limiter', {
    type: 'skill',
    path: '.claude/skills/rate-limiter/SKILL.md',
  });
  graph.save();

  const result = analyzeImpact({
    artifactId: 'skill:rate-limiter',
    changeType: 'created',
    graphPath,
  });

  assert.strictEqual(result.artifactId, 'skill:rate-limiter');
  assert.strictEqual(result.changeType, 'created');
  assert.strictEqual(result.directDependents.length, 0);

  // Should have 2 must-have gaps: catalog + agent assignment
  const mustHaveGaps = result.missingIntegrations.filter(g => g.priority === 'must-have');
  assert.strictEqual(mustHaveGaps.length, 2);
  assert.ok(mustHaveGaps.some(g => g.type === 'catalog-entry'));
  assert.ok(mustHaveGaps.some(g => g.type === 'agent-assignment'));

  // Should have 2 proposed tasks
  assert.ok(result.proposedTasks.length >= 2);
  assert.ok(result.proposedTasks.some(t => t.subject.includes('skill-catalog')));
  assert.ok(result.proposedTasks.some(t => t.subject.includes('Assign')));

  // High impact score (orphan)
  assert.ok(result.impactScore > 0.5);

  cleanupTest(testDir);
});

test('analyzeImpact - created skill with catalog entry (partial integration)', () => {
  const { testDir, graphPath, graph } = setupTest();

  // Add skill + catalog + edge
  graph.addNode('skill:rate-limiter', {
    type: 'skill',
    path: '.claude/skills/rate-limiter/SKILL.md',
  });
  graph.addNode('catalog:skill-catalog', {
    type: 'catalog',
    path: '.claude/context/artifacts/catalogs/skill-catalog.md',
  });
  graph.addEdge('skill:rate-limiter', 'catalog:skill-catalog', 'references');
  graph.save();

  const result = analyzeImpact({
    artifactId: 'skill:rate-limiter',
    changeType: 'created',
    graphPath,
  });

  // Catalog satisfied, agent assignment missing
  const mustHaveGaps = result.missingIntegrations.filter(
    g => g.priority === 'must-have' && g.status === 'missing'
  );
  assert.strictEqual(mustHaveGaps.length, 1); // Only agent assignment
  assert.strictEqual(mustHaveGaps[0].type, 'agent-assignment');

  // Lower impact than orphan
  assert.ok(result.impactScore < 0.6);
  assert.ok(result.impactScore > 0);

  cleanupTest(testDir);
});

test('analyzeImpact - created skill fully integrated (score 0)', () => {
  const { testDir, graphPath, graph } = setupTest();

  // Add skill + catalog + agent + edges
  graph.addNode('skill:rate-limiter', {
    type: 'skill',
    path: '.claude/skills/rate-limiter/SKILL.md',
  });
  graph.addNode('catalog:skill-catalog', {
    type: 'catalog',
    path: '.claude/context/artifacts/catalogs/skill-catalog.md',
  });
  graph.addNode('agent:developer', { type: 'agent', path: '.claude/agents/core/developer.md' });

  graph.addEdge('skill:rate-limiter', 'catalog:skill-catalog', 'references');
  graph.addEdge('skill:rate-limiter', 'agent:developer', 'assigned-to');
  graph.save();

  const result = analyzeImpact({
    artifactId: 'skill:rate-limiter',
    changeType: 'created',
    graphPath,
  });

  // No must-have gaps
  const mustHaveGaps = result.missingIntegrations.filter(
    g => g.priority === 'must-have' && g.status === 'missing'
  );
  assert.strictEqual(mustHaveGaps.length, 0);

  // Impact score should be low (only should-have gaps remain)
  // skill has 1 should-have (enforcement-hook) = 0.1
  assert.ok(result.impactScore <= 0.1);
  assert.strictEqual(result.proposedTasks.filter(t => t.priority === 'P1').length, 0); // No P1 tasks

  cleanupTest(testDir);
});

test('analyzeImpact - created agent with gaps', () => {
  const { testDir, graphPath, graph } = setupTest();

  // Add orphan agent
  graph.addNode('agent:python-expert', {
    type: 'agent',
    path: '.claude/agents/domain/python-expert.md',
  });
  graph.save();

  const result = analyzeImpact({
    artifactId: 'agent:python-expert',
    changeType: 'created',
    graphPath,
  });

  // Agent must-haves: registry + routing keywords
  const mustHaveGaps = result.missingIntegrations.filter(g => g.priority === 'must-have');
  assert.strictEqual(mustHaveGaps.length, 2);
  assert.ok(mustHaveGaps.some(g => g.type === 'registry-entry'));
  assert.ok(mustHaveGaps.some(g => g.type === 'routing-keywords'));

  // Proposed tasks for agent
  assert.ok(result.proposedTasks.some(t => t.subject.includes('agent-registry')));
  assert.ok(result.proposedTasks.some(t => t.subject.includes('routing keywords')));

  cleanupTest(testDir);
});

test('analyzeImpact - created hook with gaps', () => {
  const { testDir, graphPath, graph } = setupTest();

  // Add orphan hook
  graph.addNode('hook:rate-limiter', {
    type: 'hook',
    path: '.claude/hooks/safety/rate-limiter.cjs',
  });
  graph.save();

  const result = analyzeImpact({
    artifactId: 'hook:rate-limiter',
    changeType: 'created',
    graphPath,
  });

  // Hook must-haves: settings.json registration
  const mustHaveGaps = result.missingIntegrations.filter(g => g.priority === 'must-have');
  assert.strictEqual(mustHaveGaps.length, 1);
  assert.ok(mustHaveGaps.some(g => g.type === 'settings-registration'));

  // Proposed task to register hook
  assert.ok(result.proposedTasks.some(t => t.subject.includes('settings.json')));

  cleanupTest(testDir);
});

test('analyzeImpact - updated skill with dependents', () => {
  const { testDir, graphPath, graph } = setupTest();

  // Add skill with dependents
  graph.addNode('skill:tdd', { type: 'skill', path: '.claude/skills/tdd/SKILL.md' });
  graph.addNode('agent:developer', { type: 'agent', path: '.claude/agents/core/developer.md' });
  graph.addNode('agent:qa', { type: 'agent', path: '.claude/agents/core/qa.md' });
  graph.addNode('workflow:feature-dev', {
    type: 'workflow',
    path: '.claude/workflows/enterprise/feature-development.md',
  });

  // skill:tdd → agents (assigned-to)
  graph.addEdge('skill:tdd', 'agent:developer', 'assigned-to');
  graph.addEdge('skill:tdd', 'agent:qa', 'assigned-to');

  // workflow → skill:tdd (invokes)
  graph.addEdge('workflow:feature-dev', 'skill:tdd', 'invokes');

  graph.save();

  const result = analyzeImpact({
    artifactId: 'skill:tdd',
    changeType: 'updated',
    graphPath,
  });

  // Should find direct dependents (agents + workflow)
  assert.strictEqual(result.directDependents.length, 3);
  assert.ok(result.directDependents.includes('agent:developer'));
  assert.ok(result.directDependents.includes('agent:qa'));
  assert.ok(result.directDependents.includes('workflow:feature-dev'));

  // Should propose review tasks for each dependent
  assert.ok(result.proposedTasks.length >= 3);
  assert.ok(
    result.proposedTasks.some(
      t => t.subject.includes('developer') && t.subject.includes('compatibility')
    )
  );
  assert.ok(
    result.proposedTasks.some(t => t.subject.includes('qa') && t.subject.includes('compatibility'))
  );
  assert.ok(
    result.proposedTasks.some(
      t => t.subject.includes('feature-dev') && t.subject.includes('compatibility')
    )
  );

  cleanupTest(testDir);
});

test('analyzeImpact - deleted artifact with consumers', () => {
  const { testDir, graphPath, graph } = setupTest();

  // Add skill being deleted + consumers
  graph.addNode('skill:old-pattern', {
    type: 'skill',
    path: '.claude/skills/old-pattern/SKILL.md',
  });
  graph.addNode('agent:developer', { type: 'agent', path: '.claude/agents/core/developer.md' });
  graph.addNode('workflow:legacy', { type: 'workflow', path: '.claude/workflows/legacy.md' });

  graph.addEdge('skill:old-pattern', 'agent:developer', 'assigned-to');
  graph.addEdge('workflow:legacy', 'skill:old-pattern', 'invokes');
  graph.save();

  const result = analyzeImpact({
    artifactId: 'skill:old-pattern',
    changeType: 'deleted',
    graphPath,
  });

  // Should find consumers (edges TO this node)
  assert.strictEqual(result.directDependents.length, 2);

  // Should propose migration tasks
  assert.ok(
    result.proposedTasks.some(t => t.subject.includes('Migrate') && t.subject.includes('developer'))
  );
  assert.ok(
    result.proposedTasks.some(t => t.subject.includes('Migrate') && t.subject.includes('legacy'))
  );

  cleanupTest(testDir);
});

test('analyzeImpact - missing graph file (graceful degradation)', () => {
  const { testDir } = setupTest();

  const result = analyzeImpact({
    artifactId: 'skill:test',
    changeType: 'created',
    graphPath: path.join(testDir, 'nonexistent.json'),
  });

  // Should return empty results, not throw
  assert.strictEqual(result.artifactId, 'skill:test');
  assert.strictEqual(result.directDependents.length, 0);
  assert.strictEqual(result.missingIntegrations.length, 0);
  assert.strictEqual(result.proposedTasks.length, 0);
  assert.strictEqual(result.impactScore, 0);

  cleanupTest(testDir);
});

test('analyzeImpact - unknown artifact in graph (graceful degradation)', () => {
  const { testDir, graphPath, graph } = setupTest();

  graph.save(); // Empty graph

  const result = analyzeImpact({
    artifactId: 'skill:nonexistent',
    changeType: 'created',
    graphPath,
  });

  // Should return empty results for unknown node
  assert.strictEqual(result.directDependents.length, 0);
  assert.strictEqual(result.impactScore, 0);

  cleanupTest(testDir);
});

// === analyzeBatch Tests ===

test('analyzeBatch - multiple artifacts', () => {
  const { testDir, graphPath, graph } = setupTest();

  // Add 2 orphan skills
  graph.addNode('skill:skill1', { type: 'skill', path: '.claude/skills/skill1/SKILL.md' });
  graph.addNode('skill:skill2', { type: 'skill', path: '.claude/skills/skill2/SKILL.md' });
  graph.save();

  const entries = [
    { artifactId: 'skill:skill1', changeType: 'created' },
    { artifactId: 'skill:skill2', changeType: 'created' },
  ];

  const result = analyzeBatch(entries, graphPath);

  assert.strictEqual(result.results.length, 2);
  assert.strictEqual(result.summary.total, 2);
  assert.strictEqual(result.summary.needsWork, 2);
  assert.strictEqual(result.summary.fullyIntegrated, 0);
  assert.ok(result.summary.avgScore > 0);

  cleanupTest(testDir);
});

test('analyzeBatch - mixed integration states', () => {
  const { testDir, graphPath, graph } = setupTest();

  // skill1: orphan
  graph.addNode('skill:skill1', { type: 'skill', path: '.claude/skills/skill1/SKILL.md' });

  // skill2: fully integrated
  graph.addNode('skill:skill2', { type: 'skill', path: '.claude/skills/skill2/SKILL.md' });
  graph.addNode('catalog:skill-catalog', {
    type: 'catalog',
    path: '.claude/context/artifacts/catalogs/skill-catalog.md',
  });
  graph.addNode('agent:developer', { type: 'agent', path: '.claude/agents/core/developer.md' });
  graph.addEdge('skill:skill2', 'catalog:skill-catalog', 'references');
  graph.addEdge('skill:skill2', 'agent:developer', 'assigned-to');

  graph.save();

  const entries = [
    { artifactId: 'skill:skill1', changeType: 'created' },
    { artifactId: 'skill:skill2', changeType: 'created' },
  ];

  const result = analyzeBatch(entries, graphPath);

  assert.strictEqual(result.summary.total, 2);
  // Fully integrated means impactScore === 0, but skill2 still has should-have gaps (0.1)
  assert.strictEqual(result.summary.fullyIntegrated, 0); // Neither is score 0
  assert.strictEqual(result.summary.needsWork, 2);

  // Average score should be around 0.3 (0.6 + 0.0) / 2
  assert.ok(result.summary.avgScore < 0.4);

  cleanupTest(testDir);
});

test('analyzeBatch - empty batch', () => {
  const { testDir, graphPath } = setupTest();

  const result = analyzeBatch([], graphPath);

  assert.strictEqual(result.results.length, 0);
  assert.strictEqual(result.summary.total, 0);
  assert.strictEqual(result.summary.fullyIntegrated, 0);
  assert.strictEqual(result.summary.needsWork, 0);
  assert.strictEqual(result.summary.avgScore, 0);

  cleanupTest(testDir);
});

// === generateReport Tests ===

test('generateReport - orphan skill', () => {
  const { testDir, graphPath, graph } = setupTest();

  graph.addNode('skill:rate-limiter', {
    type: 'skill',
    path: '.claude/skills/rate-limiter/SKILL.md',
  });
  graph.save();

  const impact = analyzeImpact({
    artifactId: 'skill:rate-limiter',
    changeType: 'created',
    graphPath,
  });

  const report = generateReport(impact);

  // Check report structure
  assert.ok(report.includes('## Integration Impact: skill:rate-limiter (created)'));
  assert.ok(report.includes('**Impact Score:**'));
  assert.ok(report.includes('### Missing Integrations'));
  assert.ok(report.includes('### Proposed Tasks'));
  assert.ok(report.includes('must-have'));
  assert.ok(report.includes('[P1]'));

  cleanupTest(testDir);
});

test('generateReport - fully integrated artifact', () => {
  const { testDir, graphPath, graph } = setupTest();

  graph.addNode('skill:tdd', { type: 'skill', path: '.claude/skills/tdd/SKILL.md' });
  graph.addNode('catalog:skill-catalog', {
    type: 'catalog',
    path: '.claude/context/artifacts/catalogs/skill-catalog.md',
  });
  graph.addNode('agent:developer', { type: 'agent', path: '.claude/agents/core/developer.md' });
  graph.addEdge('skill:tdd', 'catalog:skill-catalog', 'references');
  graph.addEdge('skill:tdd', 'agent:developer', 'assigned-to');
  graph.save();

  const impact = analyzeImpact({
    artifactId: 'skill:tdd',
    changeType: 'created',
    graphPath,
  });

  const report = generateReport(impact);

  // Skill has should-have gap (enforcement-hook) so score is 0.1
  assert.ok(report.includes('**Impact Score:** 0.1'));
  assert.ok(report.includes('### Missing Integrations'));
  assert.ok(report.includes('enforcement hook')); // Should-have is listed

  cleanupTest(testDir);
});

test('generateReport - updated artifact with dependents', () => {
  const { testDir, graphPath, graph } = setupTest();

  graph.addNode('skill:tdd', { type: 'skill', path: '.claude/skills/tdd/SKILL.md' });
  graph.addNode('agent:developer', { type: 'agent', path: '.claude/agents/core/developer.md' });
  graph.addEdge('skill:tdd', 'agent:developer', 'assigned-to');
  graph.save();

  const impact = analyzeImpact({
    artifactId: 'skill:tdd',
    changeType: 'updated',
    graphPath,
  });

  const report = generateReport(impact);

  assert.ok(report.includes('(updated)'));
  assert.ok(report.includes('### Proposed Tasks'));
  assert.ok(report.includes('compatibility'));

  cleanupTest(testDir);
});

// === Impact Score Calculation Tests ===

test('impact score calculation - orphan (all must-haves missing)', () => {
  const { testDir, graphPath, graph } = setupTest();

  graph.addNode('skill:orphan', { type: 'skill', path: '.claude/skills/orphan/SKILL.md' });
  graph.save();

  const result = analyzeImpact({
    artifactId: 'skill:orphan',
    changeType: 'created',
    graphPath,
  });

  // Skill has 2 must-haves: catalog (0.3) + agent assignment (0.3) + 1 should-have (0.1) = 0.7
  assert.strictEqual(result.impactScore, 0.7);

  cleanupTest(testDir);
});

test('impact score calculation - partial integration (1/2 must-haves)', () => {
  const { testDir, graphPath, graph } = setupTest();

  graph.addNode('skill:partial', { type: 'skill', path: '.claude/skills/partial/SKILL.md' });
  graph.addNode('catalog:skill-catalog', {
    type: 'catalog',
    path: '.claude/context/artifacts/catalogs/skill-catalog.md',
  });
  graph.addEdge('skill:partial', 'catalog:skill-catalog', 'references');
  graph.save();

  const result = analyzeImpact({
    artifactId: 'skill:partial',
    changeType: 'created',
    graphPath,
  });

  // Only 1 must-have missing: agent assignment (0.3) + 1 should-have (0.1) = 0.4
  assert.strictEqual(result.impactScore, 0.4);

  cleanupTest(testDir);
});

test('impact score calculation - should-have gaps only', () => {
  const { testDir, graphPath, graph } = setupTest();

  // Fully integrated must-haves, but missing should-haves
  graph.addNode('skill:almost', { type: 'skill', path: '.claude/skills/almost/SKILL.md' });
  graph.addNode('catalog:skill-catalog', {
    type: 'catalog',
    path: '.claude/context/artifacts/catalogs/skill-catalog.md',
  });
  graph.addNode('agent:developer', { type: 'agent', path: '.claude/agents/core/developer.md' });
  graph.addEdge('skill:almost', 'catalog:skill-catalog', 'references');
  graph.addEdge('skill:almost', 'agent:developer', 'assigned-to');
  graph.save();

  const result = analyzeImpact({
    artifactId: 'skill:almost',
    changeType: 'created',
    graphPath,
  });

  // No must-haves missing, but 1 should-have: enforcement-hook (0.1)
  // (workflow invocation is not in skill rules)
  assert.ok(result.impactScore < 0.3);
  assert.ok(result.impactScore >= 0.1); // At least enforcement-hook

  cleanupTest(testDir);
});
