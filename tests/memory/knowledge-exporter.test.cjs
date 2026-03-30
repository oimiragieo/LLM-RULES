#!/usr/bin/env node
// tests/memory/knowledge-exporter.test.cjs
// Tests for knowledge-exporter.cjs
// Uses temp SQLite DB with fixture entities/relationships (no real entity-extractor)

'use strict';

const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a temp project directory with an initialized SQLite entity DB.
 * Returns { projectDir, dbPath, db }
 */
function makeTempProject(prefix = 'kg-test-') {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const dbDir = path.join(projectDir, '.claude', 'context', 'data');
  fs.mkdirSync(dbDir, { recursive: true });
  const dbPath = path.join(dbDir, 'memory.db');

  const { initializeDatabase } = require('../../.claude/tools/cli/init-memory-db.cjs');
  const db = initializeDatabase(dbPath);

  return { projectDir, dbPath, db };
}

/**
 * Insert a fixture entity into the DB.
 */
function insertEntity(db, { id, type, name, content = null, quality_score = 0.8 }) {
  db.prepare(
    `INSERT INTO entities (id, type, name, content, quality_score) VALUES (?, ?, ?, ?, ?)`
  ).run(id, type, name, content, quality_score);
}

/**
 * Insert a fixture relationship into the DB.
 */
function insertRelationship(db, { from_entity_id, to_entity_id, relationship_type, weight = 1.0 }) {
  db.prepare(
    `INSERT INTO entity_relationships (from_entity_id, to_entity_id, relationship_type, weight)
     VALUES (?, ?, ?, ?)`
  ).run(from_entity_id, to_entity_id, relationship_type, weight);
}

/**
 * Clean up a temp directory (ignore errors on Windows EBUSY).
 */
function cleanup(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_e) {
    // ignore EBUSY on Windows
  }
}

// ---------------------------------------------------------------------------
// Load the module under test
// ---------------------------------------------------------------------------

const {
  exportKnowledge,
  exportToFile,
  getProjectHash,
  getDefaultOutputPath,
} = require('../../.claude/lib/memory/knowledge-exporter.cjs');

// ---------------------------------------------------------------------------
// getProjectHash
// ---------------------------------------------------------------------------

describe('getProjectHash', () => {
  it('returns 12-character hex string', () => {
    const hash = getProjectHash('/some/project/dir');
    assert.equal(typeof hash, 'string');
    assert.equal(hash.length, 12);
    assert.match(hash, /^[0-9a-f]{12}$/);
  });

  it('returns consistent hash for same input', () => {
    const hash1 = getProjectHash('/some/project/dir');
    const hash2 = getProjectHash('/some/project/dir');
    assert.equal(hash1, hash2);
  });

  it('returns different hashes for different inputs', () => {
    const hash1 = getProjectHash('/project/a');
    const hash2 = getProjectHash('/project/b');
    assert.notEqual(hash1, hash2);
  });

  it('matches expected MD5 slice', () => {
    const dir = '/my/test/project';
    const expected = crypto.createHash('md5').update(dir).digest('hex').slice(0, 12);
    assert.equal(getProjectHash(dir), expected);
  });
});

// ---------------------------------------------------------------------------
// getDefaultOutputPath
// ---------------------------------------------------------------------------

describe('getDefaultOutputPath', () => {
  it('returns path under ~/.claude/knowledge/<hash>/export.json', () => {
    const projectDir = '/my/project';
    const outputPath = getDefaultOutputPath(projectDir);
    const hash = getProjectHash(projectDir);
    const expected = path.join(os.homedir(), '.claude', 'knowledge', hash, 'export.json');
    assert.equal(outputPath, expected);
  });
});

// ---------------------------------------------------------------------------
// exportKnowledge — missing entity DB
// ---------------------------------------------------------------------------

describe('exportKnowledge — missing entity DB', () => {
  let projectDir;

  before(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-noDb-'));
  });

  after(() => cleanup(projectDir));

  it('returns empty export when entity DB does not exist', async () => {
    const result = await exportKnowledge(projectDir);

    assert.equal(result.project, path.basename(projectDir));
    assert.equal(result.projectDir, projectDir);
    assert.deepEqual(result.entities, []);
    assert.deepEqual(result.relationships, []);
    assert.deepEqual(result.stats.entityCountByType, {});
    assert.deepEqual(result.stats.relationshipCountByType, {});
    assert.ok(result.exportedAt, 'exportedAt should be set');
    // Validate ISO timestamp format
    assert.ok(new Date(result.exportedAt).toISOString() === result.exportedAt);
  });
});

// ---------------------------------------------------------------------------
// exportKnowledge — correct shape
// ---------------------------------------------------------------------------

describe('exportKnowledge — correct shape', () => {
  let projectDir, db;

  before(() => {
    ({ projectDir, db } = makeTempProject('kg-shape-'));

    insertEntity(db, { id: 'e1', type: 'agent', name: 'AgentAlpha' });
    insertEntity(db, { id: 'e2', type: 'skill', name: 'SearchSkill' });
    insertEntity(db, { id: 'e3', type: 'agent', name: 'AgentBeta' });
    insertEntity(db, { id: 'e4', type: 'task', name: 'TaskOne' });

    insertRelationship(db, {
      from_entity_id: 'e1',
      to_entity_id: 'e2',
      relationship_type: 'depends_on',
    });
    insertRelationship(db, {
      from_entity_id: 'e3',
      to_entity_id: 'e4',
      relationship_type: 'references',
    });
    insertRelationship(db, {
      from_entity_id: 'e1',
      to_entity_id: 'e4',
      relationship_type: 'depends_on',
    });
    db.close();
  });

  after(() => cleanup(projectDir));

  it('returns the correct project name', async () => {
    const result = await exportKnowledge(projectDir);
    assert.equal(result.project, path.basename(projectDir));
  });

  it('returns the correct projectDir', async () => {
    const result = await exportKnowledge(projectDir);
    assert.equal(result.projectDir, projectDir);
  });

  it('returns all entities', async () => {
    const result = await exportKnowledge(projectDir);
    assert.equal(result.entities.length, 4);
  });

  it('entities have expected fields', async () => {
    const result = await exportKnowledge(projectDir);
    const agentAlpha = result.entities.find(e => e.id === 'e1');
    assert.ok(agentAlpha, 'entity e1 should be in results');
    assert.equal(agentAlpha.type, 'agent');
    assert.equal(agentAlpha.name, 'AgentAlpha');
  });

  it('returns all relationships', async () => {
    const result = await exportKnowledge(projectDir);
    assert.equal(result.relationships.length, 3);
  });

  it('relationships have expected fields', async () => {
    const result = await exportKnowledge(projectDir);
    const rel = result.relationships.find(
      r => r.from_entity_id === 'e1' && r.relationship_type === 'depends_on'
    );
    assert.ok(rel, 'relationship should exist');
    assert.ok(rel.weight !== undefined);
  });

  it('exportedAt is a valid ISO timestamp', async () => {
    const result = await exportKnowledge(projectDir);
    assert.ok(result.exportedAt, 'exportedAt should be set');
    assert.ok(new Date(result.exportedAt).toISOString() === result.exportedAt);
  });
});

// ---------------------------------------------------------------------------
// exportKnowledge — stats
// ---------------------------------------------------------------------------

describe('exportKnowledge — stats', () => {
  let projectDir, db;

  before(() => {
    ({ projectDir, db } = makeTempProject('kg-stats-'));

    insertEntity(db, { id: 's1', type: 'agent', name: 'A1' });
    insertEntity(db, { id: 's2', type: 'agent', name: 'A2' });
    insertEntity(db, { id: 's3', type: 'skill', name: 'Sk1' });
    insertEntity(db, { id: 's4', type: 'task', name: 'T1' });
    insertEntity(db, { id: 's5', type: 'task', name: 'T2' });

    insertRelationship(db, {
      from_entity_id: 's1',
      to_entity_id: 's2',
      relationship_type: 'relates_to',
    });
    insertRelationship(db, {
      from_entity_id: 's1',
      to_entity_id: 's3',
      relationship_type: 'depends_on',
    });
    insertRelationship(db, {
      from_entity_id: 's2',
      to_entity_id: 's4',
      relationship_type: 'depends_on',
    });
    db.close();
  });

  after(() => cleanup(projectDir));

  it('stats.entityCountByType counts entities per type', async () => {
    const result = await exportKnowledge(projectDir);
    assert.equal(result.stats.entityCountByType.agent, 2);
    assert.equal(result.stats.entityCountByType.skill, 1);
    assert.equal(result.stats.entityCountByType.task, 2);
  });

  it('stats.relationshipCountByType counts relationships per type', async () => {
    const result = await exportKnowledge(projectDir);
    assert.equal(result.stats.relationshipCountByType.relates_to, 1);
    assert.equal(result.stats.relationshipCountByType.depends_on, 2);
  });

  it('stats do not include undefined keys for missing types', async () => {
    const result = await exportKnowledge(projectDir);
    assert.equal(result.stats.entityCountByType.concept, undefined);
    assert.equal(result.stats.relationshipCountByType.blocks, undefined);
  });
});

// ---------------------------------------------------------------------------
// exportKnowledge — empty DB (schema exists, no rows)
// ---------------------------------------------------------------------------

describe('exportKnowledge — empty DB with schema', () => {
  let projectDir, db;

  before(() => {
    ({ projectDir, db } = makeTempProject('kg-empty-'));
    db.close();
  });

  after(() => cleanup(projectDir));

  it('returns empty arrays and zero stats when no entities or relationships', async () => {
    const result = await exportKnowledge(projectDir);
    assert.deepEqual(result.entities, []);
    assert.deepEqual(result.relationships, []);
    assert.deepEqual(result.stats.entityCountByType, {});
    assert.deepEqual(result.stats.relationshipCountByType, {});
  });
});

// ---------------------------------------------------------------------------
// exportToFile — writes to default path with project hash
// ---------------------------------------------------------------------------

describe('exportToFile — default path', () => {
  let projectDir, db, knowledgeDir;

  before(() => {
    ({ projectDir, db } = makeTempProject('kg-file-'));
    insertEntity(db, { id: 'f1', type: 'concept', name: 'ConceptA' });
    db.close();
  });

  after(() => {
    cleanup(projectDir);
    if (knowledgeDir) cleanup(knowledgeDir);
  });

  it('writes export to correct path based on project hash', async () => {
    // Calculate the expected path
    const hash = getProjectHash(projectDir);
    knowledgeDir = path.join(os.homedir(), '.claude', 'knowledge', hash);

    const writtenPath = await exportToFile(projectDir);

    assert.equal(writtenPath, path.join(knowledgeDir, 'export.json'));
    assert.ok(fs.existsSync(writtenPath), 'export.json should exist');
  });

  it('written file contains valid JSON with correct shape', async () => {
    const hash = getProjectHash(projectDir);
    const exportPath = path.join(os.homedir(), '.claude', 'knowledge', hash, 'export.json');
    const content = JSON.parse(fs.readFileSync(exportPath, 'utf8'));

    assert.equal(content.project, path.basename(projectDir));
    assert.equal(content.projectDir, projectDir);
    assert.ok(Array.isArray(content.entities));
    assert.ok(Array.isArray(content.relationships));
    assert.ok(content.stats);
    assert.ok(content.exportedAt);
  });
});

// ---------------------------------------------------------------------------
// exportToFile — custom output path
// ---------------------------------------------------------------------------

describe('exportToFile — custom output path', () => {
  let projectDir, db, outputDir;

  before(() => {
    ({ projectDir, db } = makeTempProject('kg-custom-'));
    insertEntity(db, { id: 'c1', type: 'skill', name: 'SkillX' });
    db.close();
    outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-out-'));
  });

  after(() => {
    cleanup(projectDir);
    cleanup(outputDir);
  });

  it('writes export to the specified output path', async () => {
    const outputPath = path.join(outputDir, 'custom-export.json');
    const writtenPath = await exportToFile(projectDir, outputPath);

    assert.equal(writtenPath, outputPath);
    assert.ok(fs.existsSync(outputPath), 'custom-export.json should exist');
  });

  it('written file contains correct entities', async () => {
    const outputPath = path.join(outputDir, 'custom-export.json');
    const content = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.equal(content.entities.length, 1);
    assert.equal(content.entities[0].name, 'SkillX');
  });
});

// ---------------------------------------------------------------------------
// exportToFile — creates parent directories
// ---------------------------------------------------------------------------

describe('exportToFile — creates parent directories', () => {
  let projectDir, db, outputDir;

  before(() => {
    ({ projectDir, db } = makeTempProject('kg-mkdir-'));
    insertEntity(db, { id: 'd1', type: 'file', name: 'src/index.js' });
    db.close();
    outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-mkdirout-'));
  });

  after(() => {
    cleanup(projectDir);
    cleanup(outputDir);
  });

  it('creates nested output directories automatically', async () => {
    const outputPath = path.join(outputDir, 'nested', 'deep', 'export.json');
    assert.ok(!fs.existsSync(path.dirname(outputPath)), 'nested dir should not exist yet');

    await exportToFile(projectDir, outputPath);

    assert.ok(fs.existsSync(outputPath), 'export.json should be created in nested dirs');
  });
});

// ---------------------------------------------------------------------------
// exportToFile — atomic write (no partial files)
// ---------------------------------------------------------------------------

describe('exportToFile — atomic write', () => {
  let projectDir, db, outputDir;

  before(() => {
    ({ projectDir, db } = makeTempProject('kg-atomic-'));
    db.close();
    outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-atomicout-'));
  });

  after(() => {
    cleanup(projectDir);
    cleanup(outputDir);
  });

  it('does not leave a .tmp file after successful write', async () => {
    const outputPath = path.join(outputDir, 'export.json');
    await exportToFile(projectDir, outputPath);

    assert.ok(fs.existsSync(outputPath), 'export.json should exist');
    assert.ok(!fs.existsSync(outputPath + '.tmp'), '.tmp file should not remain');
  });

  it('writes valid JSON (not a partial write)', async () => {
    const outputPath = path.join(outputDir, 'export.json');
    const raw = fs.readFileSync(outputPath, 'utf8');
    let parsed;
    assert.doesNotThrow(() => {
      parsed = JSON.parse(raw);
    });
    assert.ok(parsed, 'parsed should be truthy');
  });
});
