'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { PROJECT_ROOT } = require('../../../.claude/lib/utils/project-root.cjs');
const {
  runExtractionPipeline,
} = require('../../../.claude/lib/memory/run-extraction-pipeline.cjs');
const memoryTiers = require('../../../.claude/lib/memory/memory-tiers.cjs');

function createTempProjectRoot() {
  const base = path.join(PROJECT_ROOT, 'tests', '.claude');
  fs.mkdirSync(base, { recursive: true });
  return fs.mkdtempSync(path.join(base, 'extraction-'));
}

function writeMtmSession(projectRoot, data) {
  const mtmDir = memoryTiers.getTierPath('MTM', projectRoot);
  fs.mkdirSync(mtmDir, { recursive: true });
  const fileName = 'session_2026-02-03T00-00-00.json';
  fs.writeFileSync(path.join(mtmDir, fileName), JSON.stringify(data, null, 2));
  return fileName;
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

test('runExtractionPipeline writes extracted memories', async () => {
  const projectRoot = createTempProjectRoot();
  const sessionData = {
    session_id: 'session-test',
    timestamp: new Date().toISOString(),
    summary: 'Worked on routing and memory.',
  };
  writeMtmSession(projectRoot, sessionData);

  const modelClient = {
    generateText: async () =>
      JSON.stringify({
        memories: [
          {
            category: 'patterns',
            abstract: 'Routing patterns',
            overview: 'Routing table usage',
            content: 'Use routing-table.cjs for intent routing.',
          },
        ],
      }),
  };

  const result = await runExtractionPipeline(projectRoot, {
    modelClient,
    deduplicate: false,
    maxMtmSessions: 1,
  });

  assert.equal(result.processedSessions, 1);
  assert.equal(result.written, 1);

  const memoriesDir = path.join(
    projectRoot,
    '.claude',
    'context',
    'memory',
    'memories',
    'patterns'
  );
  const files = fs.existsSync(memoriesDir) ? fs.readdirSync(memoriesDir) : [];
  assert.equal(files.length, 1);

  cleanup(projectRoot);
});

test('runExtractionPipeline passes tools_used from MTM sessions to writer and links memory to skills', async () => {
  const projectRoot = createTempProjectRoot();
  const sessionData = {
    session_id: 'session-tools',
    timestamp: new Date().toISOString(),
    summary: 'Used skill for extraction.',
    tools_used: ['TestSkill', 'AnotherTool'],
  };
  writeMtmSession(projectRoot, sessionData);

  const modelClient = {
    generateText: async () =>
      JSON.stringify({
        memories: [
          {
            category: 'cases',
            abstract: 'Test case',
            overview: 'Overview',
            content: 'Content for test.',
          },
        ],
      }),
  };

  const result = await runExtractionPipeline(projectRoot, {
    modelClient,
    deduplicate: false,
    maxMtmSessions: 1,
  });

  assert.equal(result.processedSessions, 1);
  assert.equal(result.written, 1);

  const dbPath = path.join(projectRoot, '.claude', 'data', 'memory.db');
  if (fs.existsSync(dbPath)) {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(dbPath);
    const memoryCount = db
      .prepare("SELECT COUNT(*) AS c FROM entities WHERE type = 'memory'")
      .get();
    const skillCount = db.prepare("SELECT COUNT(*) AS c FROM entities WHERE type = 'skill'").get();
    const relCount = db
      .prepare(
        "SELECT COUNT(*) AS c FROM entity_relationships WHERE relationship_type = 'references'"
      )
      .get();
    db.close();
    assert.ok(memoryCount.c >= 1, 'expected at least one memory entity');
    assert.ok(skillCount.c >= 1, 'expected at least one skill entity from tools_used');
    assert.ok(relCount.c >= 1, 'expected at least one memory→skill relationship');
  }

  cleanup(projectRoot);
});
