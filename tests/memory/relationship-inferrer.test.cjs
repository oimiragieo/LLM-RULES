#!/usr/bin/env node
// tests/memory/relationship-inferrer.test.cjs
// Tests for relationship-inferrer.cjs

'use strict';

const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  inferFromDependencies,
  inferFromImports,
  inferCrossRepoLinks,
} = require('../../.claude/lib/memory/relationship-inferrer.cjs');
const { CrossRepoRegistry } = require('../../.claude/lib/memory/cross-repo-registry.cjs');
const { getProjectHash } = require('../../.claude/lib/memory/knowledge-exporter.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(prefix = 'ri-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanup(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_e) {
    // ignore EBUSY on Windows
  }
}

/**
 * Write a package.json in the given directory.
 */
function writePackageJson(dir, content) {
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(content, null, 2), 'utf8');
}

/**
 * Write a fake export.json for a project into knowledgeDir.
 */
function writeFakeExport(knowledgeDir, projectDir, content) {
  const hash = getProjectHash(projectDir);
  const exportDir = path.join(knowledgeDir, hash);
  fs.mkdirSync(exportDir, { recursive: true });
  const exportPath = path.join(exportDir, 'export.json');
  fs.writeFileSync(exportPath, JSON.stringify(content, null, 2), 'utf8');
  return exportPath;
}

/**
 * Build a minimal knowledge export object.
 */
function makeExport(projectName, projectDir, entities) {
  return {
    project: projectName,
    projectDir,
    entities,
    relationships: [],
    stats: {
      entityCountByType: entities.reduce((acc, e) => {
        acc[e.type] = (acc[e.type] || 0) + 1;
        return acc;
      }, {}),
      relationshipCountByType: {},
    },
    exportedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// inferFromDependencies
// ---------------------------------------------------------------------------

describe('inferFromDependencies — basic', () => {
  let knowledgeDir;
  let projDirA;
  let projDirB;
  let registry;

  before(() => {
    knowledgeDir = makeTempDir('ri-dep-');
    projDirA = makeTempDir('ri-projA-');
    projDirB = makeTempDir('ri-projB-');

    registry = new CrossRepoRegistry(knowledgeDir);
    // Register projB under the npm package name "my-lib"
    registry.registerProject('my-lib', projDirB);
  });

  after(() => {
    cleanup(knowledgeDir);
    cleanup(projDirA);
    cleanup(projDirB);
  });

  it('finds matching registered project in dependencies', () => {
    writePackageJson(projDirA, { name: 'proj-a', dependencies: { 'my-lib': '^1.0.0' } });
    const results = inferFromDependencies(projDirA, registry);
    assert.ok(Array.isArray(results));
    assert.ok(results.length > 0, 'should find at least one relationship');
    const rel = results.find(r => r.target === 'my-lib');
    assert.ok(rel, 'should find my-lib as a dependency');
  });

  it('returns object with {source, target, type, evidence} shape', () => {
    writePackageJson(projDirA, { name: 'proj-a', dependencies: { 'my-lib': '^1.0.0' } });
    const results = inferFromDependencies(projDirA, registry);
    const rel = results.find(r => r.target === 'my-lib');
    assert.ok(rel, 'should have relationship for my-lib');
    assert.ok(typeof rel.source === 'string', 'source should be string');
    assert.equal(rel.target, 'my-lib');
    assert.equal(rel.type, 'depends_on');
    assert.equal(rel.evidence, 'package.json');
  });

  it('source is the project directory basename', () => {
    writePackageJson(projDirA, { name: 'proj-a', dependencies: { 'my-lib': '^1.0.0' } });
    const results = inferFromDependencies(projDirA, registry);
    const rel = results.find(r => r.target === 'my-lib');
    assert.ok(rel, 'should have relationship for my-lib');
    assert.equal(rel.source, path.basename(projDirA));
  });

  it('returns empty array when package.json has no matching registered deps', () => {
    writePackageJson(projDirA, {
      name: 'proj-a',
      dependencies: { lodash: '^4.0.0', chalk: '^5.0.0' },
    });
    const results = inferFromDependencies(projDirA, registry);
    assert.deepEqual(results, []);
  });

  it('checks devDependencies as well as dependencies', () => {
    writePackageJson(projDirA, {
      name: 'proj-a',
      dependencies: {},
      devDependencies: { 'my-lib': '^1.0.0' },
    });
    const results = inferFromDependencies(projDirA, registry);
    assert.ok(
      results.some(r => r.target === 'my-lib'),
      'should find dep in devDependencies'
    );
  });

  it('checks peerDependencies as well as dependencies', () => {
    writePackageJson(projDirA, {
      name: 'proj-a',
      dependencies: {},
      peerDependencies: { 'my-lib': '^1.0.0' },
    });
    const results = inferFromDependencies(projDirA, registry);
    assert.ok(
      results.some(r => r.target === 'my-lib'),
      'should find dep in peerDependencies'
    );
  });

  it('does not duplicate when dep appears in multiple fields', () => {
    writePackageJson(projDirA, {
      name: 'proj-a',
      dependencies: { 'my-lib': '^1.0.0' },
      devDependencies: { 'my-lib': '^1.0.0' },
    });
    const results = inferFromDependencies(projDirA, registry);
    const matches = results.filter(r => r.target === 'my-lib');
    assert.equal(matches.length, 1, 'should not duplicate for same dep in multiple fields');
  });
});

describe('inferFromDependencies — missing file', () => {
  let knowledgeDir;
  let emptyDir;
  let registry;

  before(() => {
    knowledgeDir = makeTempDir('ri-dep-miss-');
    emptyDir = makeTempDir('ri-empty-proj-');
    registry = new CrossRepoRegistry(knowledgeDir);
    registry.registerProject('some-project', emptyDir);
  });

  after(() => {
    cleanup(knowledgeDir);
    cleanup(emptyDir);
  });

  it('returns empty array when package.json is missing', () => {
    // emptyDir has no package.json
    const results = inferFromDependencies(emptyDir, registry);
    assert.deepEqual(results, []);
  });

  it('returns empty array when projectDir is falsy', () => {
    assert.deepEqual(inferFromDependencies('', registry), []);
    assert.deepEqual(inferFromDependencies(null, registry), []);
    assert.deepEqual(inferFromDependencies(undefined, registry), []);
  });

  it('returns empty array when package.json contains invalid JSON', () => {
    const badDir = makeTempDir('ri-bad-json-');
    try {
      fs.writeFileSync(path.join(badDir, 'package.json'), 'NOT JSON', 'utf8');
      const results = inferFromDependencies(badDir, registry);
      assert.deepEqual(results, []);
    } finally {
      cleanup(badDir);
    }
  });

  it('returns empty array when registry has no projects', () => {
    const emptyKnowledgeDir = makeTempDir('ri-empty-kg-');
    const projDir = makeTempDir('ri-proj-noreg-');
    try {
      const emptyRegistry = new CrossRepoRegistry(emptyKnowledgeDir);
      writePackageJson(projDir, { name: 'proj', dependencies: { 'some-lib': '^1.0.0' } });
      const results = inferFromDependencies(projDir, emptyRegistry);
      assert.deepEqual(results, []);
    } finally {
      cleanup(emptyKnowledgeDir);
      cleanup(projDir);
    }
  });
});

// ---------------------------------------------------------------------------
// inferFromImports
// ---------------------------------------------------------------------------

describe('inferFromImports — basic', () => {
  let tmpDir;
  let testFile;

  before(() => {
    tmpDir = makeTempDir('ri-imp-');
    testFile = path.join(tmpDir, 'sample.cjs');
    fs.writeFileSync(
      testFile,
      [
        "const fs = require('fs');",
        "const path = require('path');",
        "const { foo } = require('./local-module');",
        'const bar = require("../utils/bar");',
      ].join('\n'),
      'utf8'
    );
  });

  after(() => cleanup(tmpDir));

  it('returns an array', () => {
    const results = inferFromImports(testFile);
    assert.ok(Array.isArray(results));
  });

  it('extracts all unique require() paths', () => {
    const results = inferFromImports(testFile);
    const targets = results.map(r => r.target);
    assert.ok(targets.includes('fs'), 'should find fs');
    assert.ok(targets.includes('path'), 'should find path');
    assert.ok(targets.includes('./local-module'), 'should find ./local-module');
    assert.ok(targets.includes('../utils/bar'), 'should find ../utils/bar');
  });

  it('returns objects with {source, target, type} shape', () => {
    const results = inferFromImports(testFile);
    for (const r of results) {
      assert.ok(typeof r.source === 'string', 'source should be string');
      assert.ok(typeof r.target === 'string', 'target should be string');
      assert.equal(r.type, 'imports');
    }
  });

  it('source is the provided filePath', () => {
    const results = inferFromImports(testFile);
    for (const r of results) {
      assert.equal(r.source, testFile);
    }
  });

  it('deduplicates duplicate require() calls', () => {
    const dupFile = path.join(tmpDir, 'dup.cjs');
    fs.writeFileSync(
      dupFile,
      ["const a = require('fs');", "const b = require('fs');"].join('\n'),
      'utf8'
    );
    const results = inferFromImports(dupFile);
    const fsMatches = results.filter(r => r.target === 'fs');
    assert.equal(fsMatches.length, 1, 'should deduplicate require paths');
  });

  it('handles files with no require() calls', () => {
    const emptyFile = path.join(tmpDir, 'no-requires.cjs');
    fs.writeFileSync(emptyFile, 'const x = 42;\n', 'utf8');
    const results = inferFromImports(emptyFile);
    assert.deepEqual(results, []);
  });

  it('handles double-quoted and single-quoted require paths', () => {
    const mixedFile = path.join(tmpDir, 'mixed-quotes.cjs');
    fs.writeFileSync(
      mixedFile,
      ["const a = require('single');", 'const b = require("double");'].join('\n'),
      'utf8'
    );
    const results = inferFromImports(mixedFile);
    const targets = results.map(r => r.target);
    assert.ok(targets.includes('single'));
    assert.ok(targets.includes('double'));
  });
});

describe('inferFromImports — missing file', () => {
  it('returns empty array when file does not exist', () => {
    const results = inferFromImports('/nonexistent/path/to/file.cjs');
    assert.deepEqual(results, []);
  });

  it('returns empty array when filePath is empty string', () => {
    assert.deepEqual(inferFromImports(''), []);
  });

  it('returns empty array when filePath is null', () => {
    assert.deepEqual(inferFromImports(null), []);
  });

  it('returns empty array when filePath is undefined', () => {
    assert.deepEqual(inferFromImports(undefined), []);
  });
});

// ---------------------------------------------------------------------------
// inferCrossRepoLinks
// ---------------------------------------------------------------------------

describe('inferCrossRepoLinks — basic', () => {
  let knowledgeDir;
  let projDirA;
  let projDirB;
  let projDirC;
  let registry;

  // Shared entity fixtures
  const ENTITIES_A = [
    { id: 'auth-a', type: 'service', name: 'AuthService', content: 'Auth in project A' },
    { id: 'router-a', type: 'pattern', name: 'Router', content: 'Routing pattern A' },
    { id: 'util-a', type: 'util', name: 'StringUtils', content: 'String helpers' },
  ];

  const ENTITIES_B = [
    { id: 'auth-b', type: 'service', name: 'AuthService', content: 'Auth in project B' },
    { id: 'logger-b', type: 'service', name: 'Logger', content: 'Logging service' },
    { id: 'util-b', type: 'util', name: 'NumberUtils', content: 'Number helpers' },
  ];

  const ENTITIES_C = [
    { id: 'router-c', type: 'pattern', name: 'EventRouter', content: 'Event routing C' },
    { id: 'helper-c', type: 'util', name: 'ArrayUtils', content: 'Array helpers' },
  ];

  before(() => {
    knowledgeDir = makeTempDir('ri-crl-');
    projDirA = makeTempDir('ri-crl-projA-');
    projDirB = makeTempDir('ri-crl-projB-');
    projDirC = makeTempDir('ri-crl-projC-');

    registry = new CrossRepoRegistry(knowledgeDir);
    registry.registerProject('proj-a', projDirA);
    registry.registerProject('proj-b', projDirB);
    registry.registerProject('proj-c', projDirC);

    writeFakeExport(knowledgeDir, projDirA, makeExport('proj-a', projDirA, ENTITIES_A));
    writeFakeExport(knowledgeDir, projDirB, makeExport('proj-b', projDirB, ENTITIES_B));
    writeFakeExport(knowledgeDir, projDirC, makeExport('proj-c', projDirC, ENTITIES_C));
  });

  after(() => {
    cleanup(knowledgeDir);
    cleanup(projDirA);
    cleanup(projDirB);
    cleanup(projDirC);
  });

  it('returns an array', () => {
    const results = inferCrossRepoLinks(registry);
    assert.ok(Array.isArray(results));
  });

  it('finds shared_name links for entities with matching names', () => {
    // AuthService exists in both proj-a and proj-b
    const results = inferCrossRepoLinks(registry);
    const authLink = results.find(
      r =>
        r.entityA.name === 'AuthService' &&
        r.entityB.name === 'AuthService' &&
        r.type === 'shared_name'
    );
    assert.ok(authLink, 'should find shared_name link for AuthService');
  });

  it('result objects have {entityA, projectA, entityB, projectB, type} shape', () => {
    const results = inferCrossRepoLinks(registry);
    assert.ok(results.length > 0, 'should have at least one link');
    for (const r of results) {
      assert.ok(typeof r.entityA === 'object', 'entityA should be object');
      assert.ok(typeof r.projectA === 'string', 'projectA should be string');
      assert.ok(typeof r.entityB === 'object', 'entityB should be object');
      assert.ok(typeof r.projectB === 'string', 'projectB should be string');
      assert.ok(
        r.type === 'shared_name' || r.type === 'shared_type',
        `type should be shared_name or shared_type, got: ${r.type}`
      );
    }
  });

  it('finds shared_type links for entities with matching types but different names', () => {
    // proj-a has Router (pattern), proj-c has EventRouter (pattern) — shared type but different name
    const results = inferCrossRepoLinks(registry);
    const typeLinks = results.filter(r => r.type === 'shared_type');
    assert.ok(typeLinks.length > 0, 'should find shared_type links');
    // Both util-type entities from different projects
    const utilLink = typeLinks.find(
      r =>
        (r.projectA === 'proj-a' && r.projectB === 'proj-b') ||
        (r.projectA === 'proj-b' && r.projectA === 'proj-a')
    );
    assert.ok(utilLink !== undefined || typeLinks.length > 0, 'should find at least one type link');
  });

  it('uses shared_name (not shared_type) when both name and type match', () => {
    // AuthService has both same name AND same type (service) in A and B
    const results = inferCrossRepoLinks(registry);
    const authLinks = results.filter(
      r => r.entityA.name === 'AuthService' && r.entityB.name === 'AuthService'
    );
    assert.ok(authLinks.length > 0, 'should have auth links');
    for (const link of authLinks) {
      assert.equal(link.type, 'shared_name', 'should prefer shared_name over shared_type');
    }
  });

  it('projectA and projectB are different', () => {
    const results = inferCrossRepoLinks(registry);
    for (const r of results) {
      assert.notEqual(r.projectA, r.projectB, 'projectA and projectB must be different projects');
    }
  });

  it('does not duplicate pairs', () => {
    const results = inferCrossRepoLinks(registry);
    const pairSet = new Set();
    for (const r of results) {
      const key = `${r.projectA}:${r.entityA.id || r.entityA.name}:${r.projectB}:${r.entityB.id || r.entityB.name}`;
      assert.ok(!pairSet.has(key), `duplicate pair found: ${key}`);
      pairSet.add(key);
    }
  });
});

describe('inferCrossRepoLinks — edge cases', () => {
  it('returns empty array when registry is null', () => {
    assert.deepEqual(inferCrossRepoLinks(null), []);
  });

  it('returns empty array when registry is undefined', () => {
    assert.deepEqual(inferCrossRepoLinks(undefined), []);
  });

  it('returns empty array for empty registry (no projects)', () => {
    const emptyDir = makeTempDir('ri-crl-empty-');
    try {
      const emptyRegistry = new CrossRepoRegistry(emptyDir);
      const results = inferCrossRepoLinks(emptyRegistry);
      assert.deepEqual(results, []);
    } finally {
      cleanup(emptyDir);
    }
  });

  it('returns empty array when only one project registered', () => {
    const knowledgeDir = makeTempDir('ri-crl-one-');
    const projDir = makeTempDir('ri-crl-one-proj-');
    try {
      const registry = new CrossRepoRegistry(knowledgeDir);
      registry.registerProject('only-project', projDir);
      writeFakeExport(
        knowledgeDir,
        projDir,
        makeExport('only-project', projDir, [
          { id: 'e1', type: 'service', name: 'MyService', content: '' },
        ])
      );
      const results = inferCrossRepoLinks(registry);
      assert.deepEqual(results, []);
    } finally {
      cleanup(knowledgeDir);
      cleanup(projDir);
    }
  });

  it('returns empty array when no projects have knowledge exports', () => {
    const knowledgeDir = makeTempDir('ri-crl-noexp-');
    const projDirA = makeTempDir('ri-crl-noexp-a-');
    const projDirB = makeTempDir('ri-crl-noexp-b-');
    try {
      const registry = new CrossRepoRegistry(knowledgeDir);
      registry.registerProject('proj-a', projDirA);
      registry.registerProject('proj-b', projDirB);
      // No exports written
      const results = inferCrossRepoLinks(registry);
      assert.deepEqual(results, []);
    } finally {
      cleanup(knowledgeDir);
      cleanup(projDirA);
      cleanup(projDirB);
    }
  });

  it('returns empty array when no entities match across projects', () => {
    const knowledgeDir = makeTempDir('ri-crl-nomatch-');
    const projDirA = makeTempDir('ri-crl-nomatch-a-');
    const projDirB = makeTempDir('ri-crl-nomatch-b-');
    try {
      const registry = new CrossRepoRegistry(knowledgeDir);
      registry.registerProject('proj-a', projDirA);
      registry.registerProject('proj-b', projDirB);

      writeFakeExport(
        knowledgeDir,
        projDirA,
        makeExport('proj-a', projDirA, [
          { id: 'e1', type: 'service', name: 'UniqueServiceA', content: '' },
        ])
      );
      writeFakeExport(
        knowledgeDir,
        projDirB,
        makeExport('proj-b', projDirB, [
          { id: 'e2', type: 'component', name: 'UniqueComponentB', content: '' },
        ])
      );

      const results = inferCrossRepoLinks(registry);
      assert.deepEqual(results, []);
    } finally {
      cleanup(knowledgeDir);
      cleanup(projDirA);
      cleanup(projDirB);
    }
  });
});
