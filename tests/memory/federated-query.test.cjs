#!/usr/bin/env node
// tests/memory/federated-query.test.cjs
// Tests for federated-query.cjs

'use strict';

const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { CrossRepoRegistry } = require('../../.claude/lib/memory/cross-repo-registry.cjs');
const { getProjectHash } = require('../../.claude/lib/memory/knowledge-exporter.cjs');
const { FederatedQuery } = require('../../.claude/lib/memory/federated-query.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(prefix = 'fq-test-') {
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
 * Write a fake export.json for a project inside the given knowledgeDir.
 */
function writeFakeExport(knowledgeDir, projectDir, content) {
  const hash = getProjectHash(projectDir);
  const exportDir = path.join(knowledgeDir, hash);
  fs.mkdirSync(exportDir, { recursive: true });
  const exportPath = path.join(exportDir, 'export.json');
  fs.writeFileSync(exportPath, JSON.stringify(content, null, 2), 'utf8');
  return exportPath;
}

// ---------------------------------------------------------------------------
// Fixture data — known entities across 3 mock projects
// ---------------------------------------------------------------------------

// Project A: agent-studio
const PROJ_A_ENTITIES = [
  {
    id: 'auth-service-a',
    type: 'service',
    name: 'AuthService',
    content: 'Handles authentication and token validation',
  },
  {
    id: 'router-a',
    type: 'pattern',
    name: 'Router',
    content: 'Routing pattern for agent dispatch',
  },
  {
    id: 'user-agent-a',
    type: 'agent',
    name: 'UserAgent',
    content: 'User interaction agent managing sessions',
  },
  {
    id: 'decision-a1',
    type: 'decision',
    name: 'ADR-001: Use SQLite',
    content: 'Use SQLite for local storage to avoid external dependencies',
  },
];

// Project B: backend-api
const PROJ_B_ENTITIES = [
  {
    id: 'auth-service-b',
    type: 'service',
    name: 'AuthService',
    content: 'API authentication service using JWT tokens',
  },
  {
    id: 'data-router-b',
    type: 'pattern',
    name: 'DataRouter',
    content: 'Routes data payloads to target destinations',
  },
  {
    id: 'db-conn-b',
    type: 'service',
    name: 'DatabaseConn',
    content: 'Database connection pool manager',
  },
];

// Project C: frontend-app
const PROJ_C_ENTITIES = [
  {
    id: 'user-agent-c',
    type: 'agent',
    name: 'UserAgent',
    content: 'Frontend user interaction handler for UI flows',
  },
  {
    id: 'login-comp-c',
    type: 'component',
    name: 'LoginComponent',
    content: 'Login form component with validation',
  },
  {
    id: 'auth-guard-c',
    type: 'service',
    name: 'AuthGuard',
    content: 'Route authentication guard for protected pages',
  },
];

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
// Shared fixture state
// ---------------------------------------------------------------------------

let knowledgeDir;
let projDirA;
let projDirB;
let projDirC;
let registry;
let fq;

before(() => {
  knowledgeDir = makeTempDir('fq-knowledge-');
  projDirA = makeTempDir('fq-projA-');
  projDirB = makeTempDir('fq-projB-');
  projDirC = makeTempDir('fq-projC-');

  registry = new CrossRepoRegistry(knowledgeDir);
  registry.registerProject('agent-studio', projDirA);
  registry.registerProject('backend-api', projDirB);
  registry.registerProject('frontend-app', projDirC);

  writeFakeExport(knowledgeDir, projDirA, makeExport('agent-studio', projDirA, PROJ_A_ENTITIES));
  writeFakeExport(knowledgeDir, projDirB, makeExport('backend-api', projDirB, PROJ_B_ENTITIES));
  writeFakeExport(knowledgeDir, projDirC, makeExport('frontend-app', projDirC, PROJ_C_ENTITIES));

  fq = new FederatedQuery(registry);
});

after(() => {
  cleanup(knowledgeDir);
  cleanup(projDirA);
  cleanup(projDirB);
  cleanup(projDirC);
});

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe('FederatedQuery — constructor', () => {
  it('stores registry reference', () => {
    const fq2 = new FederatedQuery(registry);
    assert.equal(fq2.registry, registry);
  });
});

// ---------------------------------------------------------------------------
// searchEntities — basic functionality
// ---------------------------------------------------------------------------

describe('FederatedQuery — searchEntities basics', () => {
  it('returns results annotated with {entity, project, score}', () => {
    const results = fq.searchEntities('auth');
    assert.ok(Array.isArray(results));
    assert.ok(results.length > 0, 'should find auth-related entities');
    for (const r of results) {
      assert.ok(typeof r.entity === 'object', 'result.entity should be object');
      assert.ok(typeof r.project === 'string', 'result.project should be string');
      assert.ok(typeof r.score === 'number', 'result.score should be number');
    }
  });

  it('finds matching entities across multiple projects', () => {
    // 'auth' matches AuthService (A, B) and AuthGuard (C)
    const results = fq.searchEntities('auth');
    const projects = results.map(r => r.project);
    assert.ok(projects.includes('agent-studio'), 'should find entity in agent-studio');
    assert.ok(projects.includes('backend-api'), 'should find entity in backend-api');
    assert.ok(projects.includes('frontend-app'), 'should find entity in frontend-app');
  });

  it('annotates each result with source project name', () => {
    const results = fq.searchEntities('Router');
    for (const r of results) {
      assert.ok(typeof r.project === 'string' && r.project.length > 0);
    }
  });

  it('score is between 0 and 1', () => {
    const results = fq.searchEntities('auth');
    for (const r of results) {
      assert.ok(r.score >= 0 && r.score <= 1, `score ${r.score} should be 0–1`);
    }
  });

  it('results sorted by score descending', () => {
    const results = fq.searchEntities('auth');
    for (let i = 1; i < results.length; i++) {
      assert.ok(
        results[i - 1].score >= results[i].score,
        'results should be sorted by score descending'
      );
    }
  });
});

// ---------------------------------------------------------------------------
// searchEntities — case-insensitive matching
// ---------------------------------------------------------------------------

describe('FederatedQuery — searchEntities case-insensitive', () => {
  it('lowercase query matches mixed-case entity names', () => {
    const results = fq.searchEntities('authservice');
    const names = results.map(r => r.entity.name);
    assert.ok(names.includes('AuthService'), 'should find AuthService with lowercase query');
  });

  it('uppercase query matches mixed-case entity names', () => {
    const results = fq.searchEntities('AUTHSERVICE');
    const names = results.map(r => r.entity.name);
    assert.ok(names.includes('AuthService'), 'should find AuthService with uppercase query');
  });

  it('mixed-case query returns same results as lowercase', () => {
    const lower = fq.searchEntities('authservice');
    const upper = fq.searchEntities('AUTHSERVICE');
    const mixed = fq.searchEntities('AuthService');
    assert.equal(lower.length, upper.length, 'lowercase and uppercase should return same count');
    assert.equal(lower.length, mixed.length, 'mixed-case should return same count');
  });
});

// ---------------------------------------------------------------------------
// searchEntities — projects filter
// ---------------------------------------------------------------------------

describe('FederatedQuery — searchEntities projects filter', () => {
  it('limits results to specified project', () => {
    const results = fq.searchEntities('auth', { projects: ['agent-studio'] });
    const projectsFound = new Set(results.map(r => r.project));
    assert.ok(projectsFound.has('agent-studio'), 'should include agent-studio');
    assert.ok(!projectsFound.has('backend-api'), 'should exclude backend-api');
    assert.ok(!projectsFound.has('frontend-app'), 'should exclude frontend-app');
  });

  it('limits results to multiple specified projects', () => {
    const results = fq.searchEntities('auth', { projects: ['agent-studio', 'backend-api'] });
    const projectsFound = new Set(results.map(r => r.project));
    assert.ok(projectsFound.has('agent-studio'));
    assert.ok(projectsFound.has('backend-api'));
    assert.ok(!projectsFound.has('frontend-app'), 'should exclude frontend-app');
  });

  it('returns results from all projects when no projects filter given', () => {
    const results = fq.searchEntities('auth');
    const projectsFound = new Set(results.map(r => r.project));
    assert.ok(projectsFound.size >= 2, 'should span multiple projects');
  });
});

// ---------------------------------------------------------------------------
// searchEntities — edge cases
// ---------------------------------------------------------------------------

describe('FederatedQuery — searchEntities edge cases', () => {
  it('returns empty array for empty query', () => {
    const results = fq.searchEntities('');
    assert.deepEqual(results, []);
  });

  it('returns empty array for no matching entities', () => {
    const results = fq.searchEntities('xxxxxxnonexistentxxxxxx');
    assert.deepEqual(results, []);
  });

  it('returns empty array for empty registry', () => {
    const emptyDir = makeTempDir('fq-empty-');
    try {
      const emptyRegistry = new CrossRepoRegistry(emptyDir);
      const emptyFq = new FederatedQuery(emptyRegistry);
      const results = emptyFq.searchEntities('auth');
      assert.deepEqual(results, []);
    } finally {
      cleanup(emptyDir);
    }
  });

  it('matches entity name by substring', () => {
    // 'router' should match 'Router' (in A) and 'DataRouter' (in B)
    const results = fq.searchEntities('router');
    const names = results.map(r => r.entity.name);
    assert.ok(
      names.some(n => n === 'Router'),
      'should find Router'
    );
    assert.ok(
      names.some(n => n === 'DataRouter'),
      'should find DataRouter'
    );
  });

  it('matches entity content/description by substring', () => {
    // 'JWT' is in content of auth-service-b
    const results = fq.searchEntities('JWT');
    const ids = results.map(r => r.entity.id);
    assert.ok(ids.includes('auth-service-b'), 'should find entity by content match');
  });
});

// ---------------------------------------------------------------------------
// findRelatedAcrossRepos
// ---------------------------------------------------------------------------

describe('FederatedQuery — findRelatedAcrossRepos', () => {
  it('returns empty array for missing entityId', () => {
    const results = fq.findRelatedAcrossRepos('', 'agent-studio');
    assert.deepEqual(results, []);
  });

  it('returns empty array for missing sourceProject', () => {
    const results = fq.findRelatedAcrossRepos('auth-service-a', '');
    assert.deepEqual(results, []);
  });

  it('finds entities in other projects sharing same name', () => {
    // auth-service-a (AuthService, service) exists in backend-api too
    const results = fq.findRelatedAcrossRepos('auth-service-a', 'agent-studio');
    const names = results.map(r => r.entity.name);
    const projects = results.map(r => r.project);
    assert.ok(names.includes('AuthService'), 'should find AuthService in other project');
    assert.ok(projects.includes('backend-api'), 'should find in backend-api');
  });

  it('does not include entities from sourceProject in results', () => {
    const results = fq.findRelatedAcrossRepos('auth-service-a', 'agent-studio');
    const projects = results.map(r => r.project);
    assert.ok(!projects.includes('agent-studio'), 'should not include source project in results');
  });

  it('finds entities sharing same type across repos', () => {
    // user-agent-a (UserAgent, type=agent) — frontend-app has user-agent-c (also type=agent)
    const results = fq.findRelatedAcrossRepos('user-agent-a', 'agent-studio');
    const types = results.map(r => r.entity.type);
    assert.ok(
      types.some(t => t === 'agent'),
      'should find entities with same type'
    );
  });

  it('returns results annotated with {entity, project, score}', () => {
    const results = fq.findRelatedAcrossRepos('auth-service-a', 'agent-studio');
    for (const r of results) {
      assert.ok(typeof r.entity === 'object');
      assert.ok(typeof r.project === 'string');
      assert.ok(typeof r.score === 'number');
    }
  });

  it('returns empty array when entity not found in sourceProject', () => {
    const results = fq.findRelatedAcrossRepos('nonexistent-entity-id', 'agent-studio');
    assert.deepEqual(results, []);
  });

  it('returns empty array for empty registry', () => {
    const emptyDir = makeTempDir('fq-empty2-');
    try {
      const emptyRegistry = new CrossRepoRegistry(emptyDir);
      const emptyFq = new FederatedQuery(emptyRegistry);
      const results = emptyFq.findRelatedAcrossRepos('auth-service-a', 'agent-studio');
      assert.deepEqual(results, []);
    } finally {
      cleanup(emptyDir);
    }
  });
});

// ---------------------------------------------------------------------------
// getSharedPatterns
// ---------------------------------------------------------------------------

describe('FederatedQuery — getSharedPatterns', () => {
  it('returns an array', () => {
    const patterns = fq.getSharedPatterns();
    assert.ok(Array.isArray(patterns));
  });

  it('each pattern has shape {name, type, projects, count}', () => {
    const patterns = fq.getSharedPatterns();
    assert.ok(patterns.length > 0, 'should have shared patterns');
    for (const p of patterns) {
      assert.ok(typeof p.name === 'string', 'name should be string');
      assert.ok(typeof p.type === 'string', 'type should be string');
      assert.ok(Array.isArray(p.projects), 'projects should be array');
      assert.ok(typeof p.count === 'number', 'count should be number');
    }
  });

  it('only includes entities appearing in 2+ projects', () => {
    const patterns = fq.getSharedPatterns();
    for (const p of patterns) {
      assert.ok(p.count >= 2, `"${p.name}" count ${p.count} should be >= 2`);
      assert.ok(p.projects.length >= 2, `"${p.name}" should appear in 2+ projects`);
    }
  });

  it('count matches projects array length', () => {
    const patterns = fq.getSharedPatterns();
    for (const p of patterns) {
      assert.equal(p.count, p.projects.length, 'count should equal projects.length');
    }
  });

  it('identifies AuthService (appears in agent-studio and backend-api)', () => {
    const patterns = fq.getSharedPatterns();
    const authPattern = patterns.find(
      p => p.name.toLowerCase() === 'authservice' && p.type === 'service'
    );
    assert.ok(authPattern, 'AuthService/service should be a shared pattern');
    assert.ok(authPattern.projects.includes('agent-studio'));
    assert.ok(authPattern.projects.includes('backend-api'));
  });

  it('identifies UserAgent (appears in agent-studio and frontend-app)', () => {
    const patterns = fq.getSharedPatterns();
    const userAgentPattern = patterns.find(
      p => p.name.toLowerCase() === 'useragent' && p.type === 'agent'
    );
    assert.ok(userAgentPattern, 'UserAgent/agent should be a shared pattern');
    assert.ok(userAgentPattern.projects.includes('agent-studio'));
    assert.ok(userAgentPattern.projects.includes('frontend-app'));
  });

  it('does not include DataRouter (only in 1 project)', () => {
    const patterns = fq.getSharedPatterns();
    const dataRouterPattern = patterns.find(p => p.name === 'DataRouter' && p.type === 'pattern');
    assert.equal(dataRouterPattern, undefined, 'DataRouter should not appear (only in 1 project)');
  });

  it('does not include LoginComponent (only in 1 project)', () => {
    const patterns = fq.getSharedPatterns();
    const loginPattern = patterns.find(p => p.name === 'LoginComponent');
    assert.equal(loginPattern, undefined, 'LoginComponent should not appear (only in 1 project)');
  });

  it('returns empty array for empty registry', () => {
    const emptyDir = makeTempDir('fq-empty3-');
    try {
      const emptyRegistry = new CrossRepoRegistry(emptyDir);
      const emptyFq = new FederatedQuery(emptyRegistry);
      const patterns = emptyFq.getSharedPatterns();
      assert.deepEqual(patterns, []);
    } finally {
      cleanup(emptyDir);
    }
  });
});
