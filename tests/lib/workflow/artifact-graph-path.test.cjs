'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { DEFAULT_ARTIFACT_GRAPH_PATH } = require('../../../.claude/lib/workflow/artifact-graph.cjs');

test('artifact graph default path uses context/data', () => {
  assert.equal(
    DEFAULT_ARTIFACT_GRAPH_PATH,
    path.join(process.cwd(), '.claude', 'context', 'data', 'artifact-graph.json')
  );
});

test('bootstrap and integration dashboard use shared artifact graph path constant', () => {
  const bootstrap = fs.readFileSync(
    path.join(process.cwd(), '.claude', 'tools', 'cli', 'bootstrap-artifact-graph.cjs'),
    'utf8'
  );
  const dashboard = fs.readFileSync(
    path.join(process.cwd(), '.claude', 'tools', 'cli', 'integration-health-dashboard.cjs'),
    'utf8'
  );
  const postCreation = fs.readFileSync(
    path.join(process.cwd(), '.claude', 'hooks', 'workflow', 'post-creation-integration.cjs'),
    'utf8'
  );

  assert.match(bootstrap, /DEFAULT_ARTIFACT_GRAPH_PATH/);
  assert.match(dashboard, /DEFAULT_ARTIFACT_GRAPH_PATH/);
  assert.match(postCreation, /DEFAULT_ARTIFACT_GRAPH_PATH/);
});
