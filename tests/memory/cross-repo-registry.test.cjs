#!/usr/bin/env node
// tests/memory/cross-repo-registry.test.cjs
// Tests for cross-repo-registry.cjs

'use strict';

const assert = require('node:assert/strict');
const { describe, it, before, after, beforeEach } = require('node:test');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a temporary knowledge directory for testing.
 */
function makeTempKnowledgeDir(prefix = 'crr-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * Create a temporary project directory (no DB — empty project).
 */
function makeTempProjectDir(prefix = 'crr-proj-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
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

/**
 * Write a fake export.json for a project inside the given knowledgeDir.
 */
function writeFakeExport(knowledgeDir, projectDir, content) {
  const { getProjectHash } = require('../../.claude/lib/memory/knowledge-exporter.cjs');
  const hash = getProjectHash(projectDir);
  const exportDir = path.join(knowledgeDir, hash);
  fs.mkdirSync(exportDir, { recursive: true });
  const exportPath = path.join(exportDir, 'export.json');
  fs.writeFileSync(exportPath, JSON.stringify(content, null, 2), 'utf8');
  return exportPath;
}

// ---------------------------------------------------------------------------
// Load the module under test
// ---------------------------------------------------------------------------

const { CrossRepoRegistry } = require('../../.claude/lib/memory/cross-repo-registry.cjs');

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe('CrossRepoRegistry — constructor', () => {
  it('defaults knowledgeDir to ~/.claude/knowledge when not provided', () => {
    const registry = new CrossRepoRegistry();
    const expected = path.join(os.homedir(), '.claude', 'knowledge');
    assert.equal(registry.knowledgeDir, expected);
  });

  it('uses provided knowledgeDir', () => {
    const tempDir = makeTempKnowledgeDir('crr-ctor-');
    try {
      const registry = new CrossRepoRegistry(tempDir);
      assert.equal(registry.knowledgeDir, tempDir);
    } finally {
      cleanup(tempDir);
    }
  });
});

// ---------------------------------------------------------------------------
// Registry auto-creates if missing
// ---------------------------------------------------------------------------

describe('CrossRepoRegistry — registry auto-creates if missing', () => {
  let knowledgeDir;

  before(() => {
    knowledgeDir = makeTempKnowledgeDir('crr-autocreate-');
    // Remove the dir so it doesn't exist
    fs.rmSync(knowledgeDir, { recursive: true, force: true });
  });

  after(() => cleanup(knowledgeDir));

  it('listProjects returns empty array when registry does not exist', () => {
    const registry = new CrossRepoRegistry(knowledgeDir);
    const projects = registry.listProjects();
    assert.deepEqual(projects, []);
  });

  it('registerProject creates registry.json when it does not exist', () => {
    const registry = new CrossRepoRegistry(knowledgeDir);
    const projDir = makeTempProjectDir();
    try {
      registry.registerProject('myproject', projDir);
      const registryPath = path.join(knowledgeDir, 'registry.json');
      assert.ok(fs.existsSync(registryPath), 'registry.json should be created');
    } finally {
      cleanup(projDir);
    }
  });
});

// ---------------------------------------------------------------------------
// registerProject
// ---------------------------------------------------------------------------

describe('CrossRepoRegistry — registerProject', () => {
  let knowledgeDir;
  let projDir;

  before(() => {
    knowledgeDir = makeTempKnowledgeDir('crr-reg-');
    projDir = makeTempProjectDir();
  });

  after(() => {
    cleanup(knowledgeDir);
    cleanup(projDir);
  });

  it('adds entry to registry.json', () => {
    const registry = new CrossRepoRegistry(knowledgeDir);
    registry.registerProject('proj-a', projDir);

    const registryPath = path.join(knowledgeDir, 'registry.json');
    const raw = fs.readFileSync(registryPath, 'utf8');
    const data = JSON.parse(raw);

    assert.ok(Array.isArray(data.projects));
    assert.equal(data.projects.length, 1);
    assert.equal(data.projects[0].name, 'proj-a');
    assert.equal(data.projects[0].projectDir, projDir);
  });

  it('entry includes registeredAt ISO timestamp', () => {
    const registry = new CrossRepoRegistry(knowledgeDir);
    const projects = registry.listProjects();
    const entry = projects.find(p => p.name === 'proj-a');
    assert.ok(entry, 'entry should exist');
    assert.ok(entry.registeredAt, 'registeredAt should be set');
    assert.doesNotThrow(() => new Date(entry.registeredAt));
  });

  it('entry includes lastRefreshed field (null initially)', () => {
    const registry = new CrossRepoRegistry(knowledgeDir);
    const projects = registry.listProjects();
    const entry = projects.find(p => p.name === 'proj-a');
    assert.ok(entry, 'entry should exist');
    assert.equal(entry.lastRefreshed, null);
  });

  it('can register multiple projects', () => {
    const registry = new CrossRepoRegistry(knowledgeDir);
    const projDir2 = makeTempProjectDir();
    try {
      registry.registerProject('proj-b', projDir2);
      const projects = registry.listProjects();
      assert.equal(projects.length, 2);
      const names = projects.map(p => p.name);
      assert.ok(names.includes('proj-a'));
      assert.ok(names.includes('proj-b'));
    } finally {
      cleanup(projDir2);
    }
  });
});

// ---------------------------------------------------------------------------
// listProjects
// ---------------------------------------------------------------------------

describe('CrossRepoRegistry — listProjects', () => {
  let knowledgeDir;

  before(() => {
    knowledgeDir = makeTempKnowledgeDir('crr-list-');
  });

  after(() => cleanup(knowledgeDir));

  it('returns empty array when no projects registered', () => {
    const registry = new CrossRepoRegistry(knowledgeDir);
    assert.deepEqual(registry.listProjects(), []);
  });

  it('returns all registered projects', () => {
    const registry = new CrossRepoRegistry(knowledgeDir);
    const dir1 = makeTempProjectDir();
    const dir2 = makeTempProjectDir();
    const dir3 = makeTempProjectDir();
    try {
      registry.registerProject('alpha', dir1);
      registry.registerProject('beta', dir2);
      registry.registerProject('gamma', dir3);

      const projects = registry.listProjects();
      assert.equal(projects.length, 3);
      const names = projects.map(p => p.name);
      assert.ok(names.includes('alpha'));
      assert.ok(names.includes('beta'));
      assert.ok(names.includes('gamma'));
    } finally {
      cleanup(dir1);
      cleanup(dir2);
      cleanup(dir3);
    }
  });

  it('returns project entries with expected shape', () => {
    const registry = new CrossRepoRegistry(knowledgeDir);
    const projects = registry.listProjects();
    for (const p of projects) {
      assert.ok(typeof p.name === 'string');
      assert.ok(typeof p.projectDir === 'string');
      assert.ok(typeof p.registeredAt === 'string');
      assert.ok('lastRefreshed' in p);
    }
  });
});

// ---------------------------------------------------------------------------
// getProjectKnowledge
// ---------------------------------------------------------------------------

describe('CrossRepoRegistry — getProjectKnowledge', () => {
  let knowledgeDir;
  let projDir;

  before(() => {
    knowledgeDir = makeTempKnowledgeDir('crr-getkg-');
    projDir = makeTempProjectDir();
  });

  after(() => {
    cleanup(knowledgeDir);
    cleanup(projDir);
  });

  it('returns null for unregistered project', () => {
    const registry = new CrossRepoRegistry(knowledgeDir);
    const result = registry.getProjectKnowledge('nonexistent');
    assert.equal(result, null);
  });

  it('returns null for registered project with no export.json', () => {
    const registry = new CrossRepoRegistry(knowledgeDir);
    registry.registerProject('no-export', projDir);
    const result = registry.getProjectKnowledge('no-export');
    assert.equal(result, null);
  });

  it('reads export.json for named project', () => {
    const registry = new CrossRepoRegistry(knowledgeDir);
    const fakeProjDir = makeTempProjectDir('crr-fakeproj-');
    try {
      registry.registerProject('has-export', fakeProjDir);

      const fakeExport = {
        project: 'has-export',
        projectDir: fakeProjDir,
        entities: [{ id: 'e1', type: 'agent', name: 'AgentX' }],
        relationships: [],
        stats: { entityCountByType: { agent: 1 }, relationshipCountByType: {} },
        exportedAt: new Date().toISOString(),
      };
      writeFakeExport(knowledgeDir, fakeProjDir, fakeExport);

      const result = registry.getProjectKnowledge('has-export');
      assert.ok(result !== null, 'result should not be null');
      assert.equal(result.project, 'has-export');
      assert.equal(result.entities.length, 1);
      assert.equal(result.entities[0].name, 'AgentX');
    } finally {
      cleanup(fakeProjDir);
    }
  });

  it('returns parsed content from export.json', () => {
    const registry = new CrossRepoRegistry(knowledgeDir);
    const fakeProjDir = makeTempProjectDir('crr-parsed-');
    try {
      registry.registerProject('parsed-proj', fakeProjDir);

      const fakeExport = {
        project: 'parsed-proj',
        projectDir: fakeProjDir,
        entities: [],
        relationships: [],
        stats: { entityCountByType: {}, relationshipCountByType: {} },
        exportedAt: new Date().toISOString(),
      };
      writeFakeExport(knowledgeDir, fakeProjDir, fakeExport);

      const result = registry.getProjectKnowledge('parsed-proj');
      assert.ok(typeof result === 'object', 'result should be an object');
      assert.ok(Array.isArray(result.entities));
      assert.ok(result.stats);
    } finally {
      cleanup(fakeProjDir);
    }
  });
});

// ---------------------------------------------------------------------------
// refreshProject
// ---------------------------------------------------------------------------

describe('CrossRepoRegistry — refreshProject', () => {
  let knowledgeDir;

  before(() => {
    knowledgeDir = makeTempKnowledgeDir('crr-refresh-');
  });

  after(() => cleanup(knowledgeDir));

  it('throws for unregistered project', async () => {
    const registry = new CrossRepoRegistry(knowledgeDir);
    await assert.rejects(() => registry.refreshProject('unregistered'), /not registered/i);
  });

  it('updates lastRefreshed after refresh', async () => {
    const registry = new CrossRepoRegistry(knowledgeDir);
    const projDir = makeTempProjectDir('crr-refr-upd-');
    try {
      registry.registerProject('refresh-me', projDir);

      const before = registry.listProjects().find(p => p.name === 'refresh-me');
      assert.equal(before.lastRefreshed, null, 'lastRefreshed should start null');

      await registry.refreshProject('refresh-me');

      const after = registry.listProjects().find(p => p.name === 'refresh-me');
      assert.ok(after.lastRefreshed !== null, 'lastRefreshed should be set after refresh');
      assert.doesNotThrow(() => new Date(after.lastRefreshed));
    } finally {
      cleanup(projDir);
    }
  });

  it('writes export.json to knowledgeDir after refresh', async () => {
    const registry = new CrossRepoRegistry(knowledgeDir);
    const projDir = makeTempProjectDir('crr-refr-write-');
    try {
      registry.registerProject('export-written', projDir);
      await registry.refreshProject('export-written');

      const { getProjectHash } = require('../../.claude/lib/memory/knowledge-exporter.cjs');
      const hash = getProjectHash(projDir);
      const exportPath = path.join(knowledgeDir, hash, 'export.json');
      assert.ok(fs.existsSync(exportPath), 'export.json should be written');
    } finally {
      cleanup(projDir);
    }
  });

  it('export.json is readable JSON after refresh', async () => {
    const registry = new CrossRepoRegistry(knowledgeDir);
    const projDir = makeTempProjectDir('crr-refr-json-');
    try {
      registry.registerProject('json-check', projDir);
      await registry.refreshProject('json-check');

      const knowledge = registry.getProjectKnowledge('json-check');
      assert.ok(knowledge !== null, 'getProjectKnowledge should return data');
      assert.ok(typeof knowledge.exportedAt === 'string');
    } finally {
      cleanup(projDir);
    }
  });
});

// ---------------------------------------------------------------------------
// unregisterProject
// ---------------------------------------------------------------------------

describe('CrossRepoRegistry — unregisterProject', () => {
  let knowledgeDir;

  before(() => {
    knowledgeDir = makeTempKnowledgeDir('crr-unreg-');
  });

  after(() => cleanup(knowledgeDir));

  it('removes entry from registry', () => {
    const registry = new CrossRepoRegistry(knowledgeDir);
    const dir1 = makeTempProjectDir();
    const dir2 = makeTempProjectDir();
    try {
      registry.registerProject('to-remove', dir1);
      registry.registerProject('to-keep', dir2);

      assert.equal(registry.listProjects().length, 2);

      registry.unregisterProject('to-remove');

      const projects = registry.listProjects();
      assert.equal(projects.length, 1);
      assert.equal(projects[0].name, 'to-keep');
    } finally {
      cleanup(dir1);
      cleanup(dir2);
    }
  });

  it('is a no-op for unregistered project', () => {
    const registry = new CrossRepoRegistry(knowledgeDir);
    assert.doesNotThrow(() => registry.unregisterProject('ghost'));
  });

  it('unregistered project no longer appears in listProjects', () => {
    const registry = new CrossRepoRegistry(knowledgeDir);
    const dir = makeTempProjectDir();
    try {
      registry.registerProject('temp-proj', dir);
      registry.unregisterProject('temp-proj');
      const projects = registry.listProjects();
      const found = projects.find(p => p.name === 'temp-proj');
      assert.equal(found, undefined);
    } finally {
      cleanup(dir);
    }
  });

  it('getProjectKnowledge returns null after unregister', () => {
    const registry = new CrossRepoRegistry(knowledgeDir);
    const dir = makeTempProjectDir();
    try {
      registry.registerProject('unregister-kg', dir);
      writeFakeExport(knowledgeDir, dir, { project: 'test', entities: [] });
      registry.unregisterProject('unregister-kg');
      const result = registry.getProjectKnowledge('unregister-kg');
      assert.equal(result, null);
    } finally {
      cleanup(dir);
    }
  });
});

// ---------------------------------------------------------------------------
// Atomic writes
// ---------------------------------------------------------------------------

describe('CrossRepoRegistry — atomic writes', () => {
  let knowledgeDir;

  before(() => {
    knowledgeDir = makeTempKnowledgeDir('crr-atomic-');
  });

  after(() => cleanup(knowledgeDir));

  it('does not leave .tmp file after registerProject', () => {
    const registry = new CrossRepoRegistry(knowledgeDir);
    const dir = makeTempProjectDir();
    try {
      registry.registerProject('atomic-test', dir);
      const tmpPath = path.join(knowledgeDir, 'registry.json.tmp');
      assert.ok(!fs.existsSync(tmpPath), '.tmp file should not remain');
    } finally {
      cleanup(dir);
    }
  });

  it('does not leave .tmp file after unregisterProject', () => {
    const registry = new CrossRepoRegistry(knowledgeDir);
    const dir = makeTempProjectDir();
    try {
      registry.registerProject('atomic-unreg', dir);
      registry.unregisterProject('atomic-unreg');
      const tmpPath = path.join(knowledgeDir, 'registry.json.tmp');
      assert.ok(!fs.existsSync(tmpPath), '.tmp file should not remain');
    } finally {
      cleanup(dir);
    }
  });

  it('registry.json contains valid JSON after writes', () => {
    const registry = new CrossRepoRegistry(knowledgeDir);
    const dir = makeTempProjectDir();
    try {
      registry.registerProject('valid-json', dir);
      const raw = fs.readFileSync(path.join(knowledgeDir, 'registry.json'), 'utf8');
      let parsed;
      assert.doesNotThrow(() => {
        parsed = JSON.parse(raw);
      });
      assert.ok(parsed && Array.isArray(parsed.projects));
    } finally {
      cleanup(dir);
    }
  });
});
