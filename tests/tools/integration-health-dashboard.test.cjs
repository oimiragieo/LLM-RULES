#!/usr/bin/env node
/**
 * Tests for integration-health-dashboard.cjs
 */

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const CLI_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'tools',
  'cli',
  'integration-health-dashboard.cjs'
);
const TEST_DATA_DIR = path.join(__dirname, 'test-data');
const TEST_GRAPH_PATH = path.join(TEST_DATA_DIR, 'test-artifact-graph.json');
const TEST_QUEUE_PATH = path.join(TEST_DATA_DIR, 'test-integration-queue.jsonl');

describe('Integration Health Dashboard', () => {
  before(() => {
    // Create test data directory
    if (!fs.existsSync(TEST_DATA_DIR)) {
      fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
    }

    // Create test graph
    const testGraph = {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      nodes: {
        'skill:tdd': {
          type: 'skill',
          path: '.claude/skills/tdd/SKILL.md',
          created: '2026-01-01T00:00:00.000Z',
          integrationStatus: 'fully-integrated',
        },
        'skill:orphan': {
          type: 'skill',
          path: '.claude/skills/orphan/SKILL.md',
          created: '2026-01-01T00:00:00.000Z',
          integrationStatus: 'created',
        },
        'agent:developer': {
          type: 'agent',
          path: '.claude/agents/core/developer.md',
          created: '2026-01-01T00:00:00.000Z',
          integrationStatus: 'fully-integrated',
        },
        'catalog:skill-catalog': {
          type: 'catalog',
          path: '.claude/context/artifacts/catalogs/skill-catalog.md',
          created: '2026-01-01T00:00:00.000Z',
          integrationStatus: 'fully-integrated',
        },
      },
      edges: [
        { from: 'skill:tdd', to: 'catalog:skill-catalog', type: 'references', status: 'active' },
        { from: 'agent:developer', to: 'skill:tdd', type: 'assigned-to', status: 'active' },
        {
          from: 'agent:developer',
          to: 'catalog:skill-catalog',
          type: 'references',
          status: 'active',
        },
      ],
    };

    fs.writeFileSync(TEST_GRAPH_PATH, JSON.stringify(testGraph, null, 2));

    // Create test queue
    const queueEntries = [
      { timestamp: '2026-02-07T00:00:00.000Z', artifactId: 'skill:new-skill', processed: false },
      { timestamp: '2026-02-07T01:00:00.000Z', artifactId: 'skill:old-skill', processed: true },
    ];
    fs.writeFileSync(TEST_QUEUE_PATH, queueEntries.map(e => JSON.stringify(e)).join('\n') + '\n');
  });

  after(() => {
    // Clean up test data
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  it('should display text format with test graph', () => {
    const output = execFileSync(
      'node',
      [CLI_PATH, `--graph=${TEST_GRAPH_PATH}`, `--queue=${TEST_QUEUE_PATH}`],
      {
        encoding: 'utf8',
        cwd: PROJECT_ROOT,
      }
    );

    assert.match(output, /Artifact Integration Health Dashboard/);
    assert.match(output, /Total artifacts: 4/);
    assert.match(output, /skill:orphan/); // Should list orphaned node
  });

  it('should output JSON format', () => {
    const output = execFileSync(
      'node',
      [CLI_PATH, `--graph=${TEST_GRAPH_PATH}`, `--queue=${TEST_QUEUE_PATH}`, '--json'],
      {
        encoding: 'utf8',
        cwd: PROJECT_ROOT,
      }
    );

    const data = JSON.parse(output);
    assert.strictEqual(typeof data.summary, 'object');
    assert.strictEqual(typeof data.summary.total, 'number');
    assert.ok(Array.isArray(data.byType));
    assert.ok(Array.isArray(data.topConnected));
  });

  it('should output Mermaid diagram format', () => {
    const output = execFileSync(
      'node',
      [CLI_PATH, `--graph=${TEST_GRAPH_PATH}`, `--queue=${TEST_QUEUE_PATH}`, '--mermaid'],
      {
        encoding: 'utf8',
        cwd: PROJECT_ROOT,
      }
    );

    assert.match(output, /graph TD/);
    assert.match(output, /classDef/);
  });

  it('should handle missing graph file gracefully', () => {
    try {
      execFileSync(
        'node',
        [CLI_PATH, '--graph=/nonexistent/graph.json', `--queue=${TEST_QUEUE_PATH}`],
        {
          encoding: 'utf8',
          cwd: PROJECT_ROOT,
        }
      );
      assert.fail('Should have thrown error');
    } catch (_err) {
      assert.match(_err.stderr || _err.stdout || _err.message, /Error: Graph file not found/);
    }
  });

  it('should handle empty graph', () => {
    const emptyGraphPath = path.join(TEST_DATA_DIR, 'empty-graph.json');
    fs.writeFileSync(emptyGraphPath, JSON.stringify({ version: '1.0.0', nodes: {}, edges: [] }));

    const output = execFileSync(
      'node',
      [CLI_PATH, `--graph=${emptyGraphPath}`, `--queue=${TEST_QUEUE_PATH}`],
      {
        encoding: 'utf8',
        cwd: PROJECT_ROOT,
      }
    );

    assert.match(output, /Total artifacts: 0/);
  });
});
