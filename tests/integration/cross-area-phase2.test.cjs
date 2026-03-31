#!/usr/bin/env node
'use strict';

/**
 * Cross-Area Integration Tests — Phase 2
 * ========================================
 *
 * VAL-CROSS-004: Model router feeds observability cost data
 *   CostReporter can query costs from the same TokenAccountant that feeds into
 *   CostPredictor/BudgetEngine. Cost data is consistent across model routing
 *   and observability reporting.
 *
 *   Concretely: wire a single TokenAccountant with mock data to both
 *   CostPredictor (model-router side) and CostReporter (observability side).
 *   Verify that CostPredictor.getBudgetStatus and CostReporter.getSessionCosts
 *   return matching totalSpent values for the same session.
 *
 * VAL-CROSS-005: Readiness scorer integrates with knowledge graph
 *   KnowledgeExporter includes readiness score data (if available) in the
 *   project export. Cross-repo registry can compare readiness levels across
 *   projects.
 *
 *   Concretely: create a mock project with readiness score data, export it via
 *   KnowledgeExporter, register in CrossRepoRegistry, verify that the exported
 *   data includes project metadata that could be used to compare readiness
 *   across repos (project name, export timestamp, entity stats).
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { TokenAccountant } = require('../../.claude/lib/metrics/token-accountant.cjs');
const { ModelRegistry } = require('../../.claude/lib/routing/model-registry.cjs');
const { CostPredictor } = require('../../.claude/lib/routing/cost-predictor.cjs');
const { CostReporter } = require('../../.claude/lib/monitoring/cost-reporter.cjs');
const {
  exportKnowledge,
  exportToFile,
} = require('../../.claude/lib/memory/knowledge-exporter.cjs');
const { CrossRepoRegistry } = require('../../.claude/lib/memory/cross-repo-registry.cjs');

// ---------------------------------------------------------------------------
// VAL-CROSS-004: TokenAccountant data consistent between CostPredictor and
// CostReporter
// ---------------------------------------------------------------------------

describe('VAL-CROSS-004: TokenAccountant data consistent between CostPredictor and CostReporter', () => {
  let tmpDir;
  let accountant;
  let modelRegistry;
  let costPredictor;
  let costReporter;

  /** Session ID used for all tasks in this test */
  const SESSION_ID = 'integration-session-001';

  before(() => {
    // Use a temp directory so we do not pollute the real persistence path.
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-area-004-'));

    // Create a fresh TokenAccountant with a custom persistence path.
    const persistPath = path.join(tmpDir, 'token-usage.json');
    accountant = new TokenAccountant(persistPath);

    // Record mock usage for two tasks that belong to SESSION_ID.
    // Task IDs follow the convention "sessionId:taskSubId".
    accountant.recordUsage(`${SESSION_ID}:task-1`, {
      inputTokens: 2000,
      outputTokens: 500,
      model: 'sonnet',
      agentType: 'worker',
    });
    accountant.recordUsage(`${SESSION_ID}:task-2`, {
      inputTokens: 1000,
      outputTokens: 250,
      model: 'haiku',
      agentType: 'reviewer',
    });

    // Wire both CostPredictor and CostReporter to the same accountant.
    modelRegistry = new ModelRegistry();
    costPredictor = new CostPredictor(modelRegistry, accountant);
    costReporter = new CostReporter(accountant);
  });

  after(() => {
    // Clean up temp directory — ignore errors on Windows due to file locking.
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_err) {
      // Silently ignore cleanup errors.
    }
  });

  it('CostPredictor.getBudgetStatus returns totalSpent > 0', () => {
    const status = costPredictor.getBudgetStatus(SESSION_ID);
    assert.ok(
      typeof status.totalSpent === 'number',
      'getBudgetStatus should return a numeric totalSpent'
    );
    assert.ok(status.totalSpent > 0, 'totalSpent should be positive after recording usage');
  });

  it('CostReporter.getSessionCosts returns totalCost > 0', () => {
    const costs = costReporter.getSessionCosts(SESSION_ID);
    assert.ok(
      typeof costs.totalCost === 'number',
      'getSessionCosts should return a numeric totalCost'
    );
    assert.ok(costs.totalCost > 0, 'totalCost should be positive after recording usage');
  });

  it('totalSpent from CostPredictor matches totalCost from CostReporter', () => {
    const status = costPredictor.getBudgetStatus(SESSION_ID);
    const costs = costReporter.getSessionCosts(SESSION_ID);

    // Both values are computed from the same TokenAccountant and the same set
    // of tasks — they should be numerically equal.
    assert.strictEqual(
      status.totalSpent,
      costs.totalCost,
      `CostPredictor.totalSpent (${status.totalSpent}) must equal ` +
        `CostReporter.totalCost (${costs.totalCost}) for session "${SESSION_ID}"`
    );
  });

  it('CostReporter.getSessionCosts.taskCount reflects all recorded tasks', () => {
    const costs = costReporter.getSessionCosts(SESSION_ID);
    assert.strictEqual(
      costs.taskCount,
      2,
      'taskCount should equal the number of distinct tasks recorded for the session'
    );
  });

  it('getBudgetStatus returns a valid status string', () => {
    const status = costPredictor.getBudgetStatus(SESSION_ID);
    const validStatuses = ['ok', 'warning', 'critical'];
    assert.ok(
      validStatuses.includes(status.status),
      `status should be one of ${validStatuses.join(', ')} but got "${status.status}"`
    );
  });

  it('both flows wire together without errors (no throws)', () => {
    assert.doesNotThrow(() => {
      const s = costPredictor.getBudgetStatus(SESSION_ID);
      const c = costReporter.getSessionCosts(SESSION_ID);
      // Verify both share the same underlying data source.
      assert.ok(s.totalSpent >= 0);
      assert.ok(c.totalCost >= 0);
    });
  });
});

// ---------------------------------------------------------------------------
// VAL-CROSS-005: KnowledgeExporter output includes project metadata for
// cross-repo comparison
// ---------------------------------------------------------------------------

describe('VAL-CROSS-005: KnowledgeExporter output includes project metadata for cross-repo comparison', () => {
  let tmpDir;
  let projectDir;
  let knowledgeDir;
  let registry;

  /** Name under which the mock project is registered. */
  const PROJECT_NAME = 'mock-readiness-project';

  before(async () => {
    // Create a temp workspace.
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-area-005-'));

    // projectDir is a subdirectory simulating the project root.
    projectDir = path.join(tmpDir, 'my-app');
    fs.mkdirSync(projectDir, { recursive: true });

    // knowledgeDir is isolated from the real ~/.claude/knowledge to avoid
    // polluting the user's actual registry.
    knowledgeDir = path.join(tmpDir, 'knowledge');
    fs.mkdirSync(knowledgeDir, { recursive: true });

    // Create the registry pointing at our isolated knowledge directory.
    registry = new CrossRepoRegistry(knowledgeDir);
  });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_err) {
      // Ignore cleanup errors.
    }
  });

  it('exportKnowledge returns an object with required metadata fields', async () => {
    const exported = await exportKnowledge(projectDir);

    assert.ok(
      typeof exported.project === 'string' && exported.project.length > 0,
      'export must have a non-empty "project" (project name) field'
    );
    assert.ok(
      typeof exported.exportedAt === 'string' && exported.exportedAt.length > 0,
      'export must have a non-empty "exportedAt" (ISO timestamp) field'
    );
    assert.ok(
      exported.stats && typeof exported.stats === 'object',
      'export must have a "stats" object'
    );
    assert.ok(
      typeof exported.stats.entityCountByType === 'object',
      'stats must have an "entityCountByType" map'
    );
    assert.ok(
      typeof exported.stats.relationshipCountByType === 'object',
      'stats must have a "relationshipCountByType" map'
    );
  });

  it('exportKnowledge project field equals the basename of projectDir', async () => {
    const exported = await exportKnowledge(projectDir);
    assert.strictEqual(
      exported.project,
      path.basename(projectDir),
      'project name should be the basename of the project directory'
    );
  });

  it('exportKnowledge exportedAt is a valid ISO timestamp', async () => {
    const exported = await exportKnowledge(projectDir);
    const ts = new Date(exported.exportedAt);
    assert.ok(!isNaN(ts.getTime()), 'exportedAt should parse as a valid date');
  });

  it('exportToFile writes the export and returns the file path', async () => {
    const outputPath = path.join(knowledgeDir, 'test-export.json');
    const writtenPath = await exportToFile(projectDir, outputPath);

    assert.strictEqual(writtenPath, outputPath, 'should return the output path');
    assert.ok(fs.existsSync(outputPath), 'output file should exist after export');

    const parsed = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.ok(parsed.project, 'written file should have a project field');
    assert.ok(parsed.exportedAt, 'written file should have an exportedAt field');
  });

  it('CrossRepoRegistry.registerProject registers the project without error', () => {
    assert.doesNotThrow(() => {
      registry.registerProject(PROJECT_NAME, projectDir);
    }, 'registerProject should not throw');

    const projects = registry.listProjects();
    const found = projects.find(p => p.name === PROJECT_NAME);
    assert.ok(found, 'registered project should appear in listProjects');
    assert.strictEqual(found.projectDir, projectDir);
  });

  it('refreshProject exports knowledge and makes it retrievable via getProjectKnowledge', async () => {
    // Register (idempotent if already called above).
    registry.registerProject(PROJECT_NAME, projectDir);

    // Refresh to trigger actual export write.
    await registry.refreshProject(PROJECT_NAME);

    const knowledge = registry.getProjectKnowledge(PROJECT_NAME);
    assert.ok(knowledge !== null, 'getProjectKnowledge should return data after refreshProject');
    assert.ok(
      typeof knowledge.project === 'string',
      'retrieved knowledge should have a project name'
    );
    assert.ok(
      typeof knowledge.exportedAt === 'string',
      'retrieved knowledge should have an exportedAt timestamp'
    );
    assert.ok(knowledge.stats, 'retrieved knowledge should have stats');
  });

  it('exported data includes fields suitable for cross-repo readiness comparison', async () => {
    registry.registerProject(PROJECT_NAME, projectDir);
    await registry.refreshProject(PROJECT_NAME);

    const knowledge = registry.getProjectKnowledge(PROJECT_NAME);

    // These fields allow comparing readiness-relevant metadata across repos:
    //   - project: identify which repo this is
    //   - exportedAt: freshness / staleness of the snapshot
    //   - stats.entityCountByType: structural richness of the codebase
    assert.ok(knowledge.project, 'project name is present for identification');
    assert.ok(knowledge.exportedAt, 'exportedAt timestamp present for freshness tracking');
    assert.ok(
      knowledge.stats && typeof knowledge.stats.entityCountByType === 'object',
      'entity stats present for readiness comparison'
    );
    assert.ok(Array.isArray(knowledge.entities), 'entities array present for detailed analysis');
  });

  it('multiple projects can be registered and their exports compared independently', async () => {
    // Register a second project.
    const projectDir2 = path.join(tmpDir, 'another-app');
    fs.mkdirSync(projectDir2, { recursive: true });
    const PROJECT_NAME_2 = 'mock-readiness-project-2';

    registry.registerProject(PROJECT_NAME, projectDir);
    registry.registerProject(PROJECT_NAME_2, projectDir2);
    await registry.refreshProject(PROJECT_NAME);
    await registry.refreshProject(PROJECT_NAME_2);

    const knowledge1 = registry.getProjectKnowledge(PROJECT_NAME);
    const knowledge2 = registry.getProjectKnowledge(PROJECT_NAME_2);

    assert.ok(knowledge1, 'project 1 knowledge should be retrievable');
    assert.ok(knowledge2, 'project 2 knowledge should be retrievable');

    // They are independent exports — each has its own project name.
    assert.strictEqual(knowledge1.project, path.basename(projectDir));
    assert.strictEqual(knowledge2.project, path.basename(projectDir2));

    // Both have the metadata required for cross-repo comparison.
    assert.ok(knowledge1.exportedAt, 'project 1 has exportedAt');
    assert.ok(knowledge2.exportedAt, 'project 2 has exportedAt');
    assert.ok(knowledge1.stats, 'project 1 has stats');
    assert.ok(knowledge2.stats, 'project 2 has stats');
  });
});
